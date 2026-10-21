import { expect, test } from '@playwright/test';

test.skip(process.env.SHIFTBORN_LIVE_SERVER !== '1',
  'Run with SHIFTBORN_LIVE_SERVER=1 while pnpm dev serves the real room');

for (const search of ['', '?lag=150&jitter=20&loss=2', '?lag=150&loss=2']) {
  test(`T-034 production Connection sends moving input to real server ${search || 'normal'}`,
    async ({ page }) => {
      const browserErrors: string[] = [];
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text());
      });
      await page.goto(`http://localhost:5173/${search}`);
      await page.evaluate(async () => {
        const root = document.createElement('div');
        root.style.cssText = 'position:fixed;inset:0;z-index:10';
        document.body.append(root);
        const { App } = await import('/src/app/App.ts');
        const { Connection } = await import('/src/net/Connection.ts');
        const connection = new Connection({ endpoint: 'ws://127.0.0.1:2567',
          search: location.search });
        const app = new App(root, { launch: connection.launch,
          inputTransport: connection, onDispose: () => connection.dispose() });
        connection.subscribe((event) => {
          if (event.kind === 'ready' || event.kind === 'recovered') {
            if (event.kind === 'recovered') app.controller.recovered();
            app.setLocalPlayerId(event.welcome.playerId);
            app.showAuthoritativeState(event.state);
            app.recoverInput(event.state.players[event.welcome.playerId]?.lastInputSeq ?? 0);
          } else if (event.kind === 'state') app.showAuthoritativeState(event.state);
          else if (event.kind === 'resync') {
            app.showAuthoritativeState(event.state);
            app.recoverInput(event.lastInputSeq);
          } else if (event.kind === 'events') app.showEventBatch(event.batch);
          else if (event.kind === 'reconnecting') {
            app.suspendInput(); app.controller.showReconnecting();
          }
        });
        app.controller.start({ kind: 'quick', name: 'InputTester', code: '' });
        Object.assign(window, { __liveInput: { app, connection } });
      });
      await expect.poll(() => page.evaluate(() => {
        const h = (window as unknown as { __liveInput: { app: { state: { kind: string } } } }).__liveInput;
        return h.app.state.kind;
      }), { timeout: 10_000 }).toBe('inMatch');
      await expect(page.locator('[data-server-tick]').last())
        .toContainText(/^Server tick \d+$/);
      await expect(page.locator('.arena-canvas').last()).toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const connection = (window as unknown as { __liveInput: { connection: {
          authoritativeState: { phase: number } | null } } }).__liveInput.connection;
        return connection.authoritativeState?.phase;
      }), { timeout: 10_000 }).toBe(1);
      const start = await page.evaluate(() => {
        const h = (window as unknown as { __liveInput: {
          connection: { authoritativeState: { players: Record<string,
            { x: number; y: number; lastInputSeq: number }> } | null;
            activeRoom: { sessionId: string } | null } } }).__liveInput;
        const id = h.connection.activeRoom?.sessionId ?? '';
        return h.connection.authoritativeState?.players[id] ?? null;
      });
      expect(start).not.toBeNull();
      const moveKey = (start?.y ?? 0) >= 0 ? 's' : 'w';
      await page.keyboard.down(moveKey);
      await expect.poll(() => page.evaluate((initial) => {
        const h = (window as unknown as { __liveInput: {
          connection: { authoritativeState: { players: Record<string,
            { y: number; lastInputSeq: number }> } | null;
            activeRoom: { sessionId: string } | null } } }).__liveInput;
        const id = h.connection.activeRoom?.sessionId ?? '';
        const player = h.connection.authoritativeState?.players[id];
        return player !== undefined && Math.abs(player.y - initial.y) > 0.2 &&
          player.lastInputSeq > initial.lastInputSeq;
      }, { y: start?.y ?? 0, lastInputSeq: start?.lastInputSeq ?? 0 }),
      { timeout: 8_000 }).toBe(true);
      await page.keyboard.up(moveKey);
      const result = await page.evaluate(() => {
        const h = (window as unknown as { __liveInput: {
          app: { input: { nextSeq: number } | null; dispose(): void };
          connection: { authoritativeState: { tick: number } | null };
        } }).__liveInput;
        const result = { nextSeq: h.app.input?.nextSeq ?? 0,
          tick: h.connection.authoritativeState?.tick ?? -1 };
        h.app.dispose();
        return result;
      });
      expect(result.nextSeq).toBeGreaterThan(1);
      expect(result.tick).toBeGreaterThan(0);
      expect(browserErrors).toEqual([]);
    });
}
