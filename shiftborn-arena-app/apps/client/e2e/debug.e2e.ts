import { expect, test, type Page } from '@playwright/test';

test('T-038 console text is safe, bounded, and F3/F4 obey dev-build gating', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { DevConsole } = await import('/src/debug/DevConsole.ts');
    const { DebugOverlay } = await import('/src/debug/DebugOverlay.ts');
    const { InputManager } = await import('/src/input/InputManager.ts');
    const stage = document.createElement('div');
    const canvas = document.createElement('canvas');
    stage.append(canvas); document.body.append(stage);
    const overlay = new DebugOverlay(stage);
    overlay.toggle();
    overlay.updateFrame(0, null, { rttMs: null, serverTick: null,
      localTick: null, lastErrorM: null, averageErrorM: null,
      correctionsPerMinute: null, bufferDepthTicks: null, players: null,
      shards: null, projectiles: null, inputScheme: null,
      hpFrac: 0.123456789, flux: 17.123456 });
    const exactVitals = overlay.element.textContent?.includes(
      'hpFrac 0.123456789 · Flux 17.123456') === true &&
      overlay.element.textContent?.includes('RTT unavailable') === true;
    const sent: string[] = [];
    const transport = { canUseDevConsole: false,
      sendDevCommand: (cmd: string) => { sent.push(cmd); return true; } };
    const consoleUi = new DevConsole(stage, transport, () => undefined);
    consoleUi.toggle();
    const denied = consoleUi.open;
    transport.canUseDevConsole = true;
    consoleUi.toggle();
    consoleUi.result({ ok: true, text: '<img src=x onerror=alert(1)>' });
    const escaped = consoleUi.output.querySelector('img') === null &&
      consoleUi.output.textContent?.includes('<img') === true;
    for (let index = 0; index < 45; index += 1)
      consoleUi.result({ ok: true, text: `result ${index}` });
    const safe = escaped && consoleUi.output.querySelector('img') === null &&
      consoleUi.output.children.length === 40;
    consoleUi.input.value = '/flux 11';
    consoleUi.input.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Enter', bubbles: true }));
    const focused = document.activeElement === consoleUi.input;
    consoleUi.input.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Escape', bubbles: true }));
    const closed = !consoleUi.open;
    const actions: string[] = [];
    const manager = new InputManager({ transport: { sendInput: () => true },
      fireMode: () => 'hold', player: () => ({ x: 0, y: 0, aim: 0 }),
      camera: () => null, perspective: () => 'tpp', devBuild: false,
      serverCheatsAllowed: () => false,
      onAction: (action) => actions.push(action) });
    manager.attach(canvas, stage); manager.setActive(true);
    for (const code of ['F3', 'F4', 'Backquote'])
      document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    const gated = actions.length === 0;
    for (const code of ['KeyW', 'Space'])
      document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    manager.setModalOpen(true);
    const neutral = manager.tick();
    const neutralModal = neutral?.moveY === 0 && neutral.buttons === 0 &&
      manager.actions.held('moveNorth') === false;
    manager.dispose(); consoleUi.dispose(); overlay.dispose(); stage.remove();
    return { denied, safe, sent, focused, closed, gated, neutralModal,
      exactVitals };
  });
  expect(result).toEqual({ denied: false, safe: true, sent: ['/flux 11'],
    focused: true, closed: true, gated: true, neutralModal: true,
    exactVitals: true });
});

const port = Number(process.env.SHIFTBORN_TEST_SERVER_PORT ?? 2567);
async function join(page: Page, name: string, kind: 'create' | 'join'): Promise<void> {
  await page.goto('http://localhost:5173/?devCheats=1&DEV_CHEATS=1');
  await page.evaluate(async ({ serverPort, name, kind }) => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:10';
    document.body.append(root);
    const { App } = await import('/src/app/App.ts');
    const { Connection } = await import('/src/net/Connection.ts');
    const connection = new Connection({ endpoint: `ws://127.0.0.1:${serverPort}` });
    const app = new App(root, { launch: connection.launch,
      inputTransport: connection, debugConnection: connection,
      serverTickEstimate: () => connection.clock.estimatedTick(),
      onDispose: () => connection.dispose() });
    connection.subscribe((event) => {
      if (event.kind === 'ready' || event.kind === 'recovered') {
        if (event.kind === 'recovered') app.controller.recovered();
        app.setLocalPlayerId(event.welcome.playerId);
        app.showAuthoritativeState(event.state);
        app.recoverInput(event.state.players[event.welcome.playerId]?.lastInputSeq ?? 0);
      } else if (event.kind === 'state') app.showAuthoritativeState(event.state);
      else if (event.kind === 'events') app.showEventBatch(event.batch);
      else if (event.kind === 'devResult') app.showDevResult(event.result);
      else if (event.kind === 'reconnecting') {
        app.suspendInput(); app.controller.showReconnecting();
      }
    });
    app.controller.start({ kind, name, code: 'DEB234' });
    Object.assign(window, { __debugHarness: { app, connection } });
  }, { serverPort: port, name, kind });
  await expect(page.locator('.arena-canvas').last()).toBeVisible();
}

test('T-038 live overlay and F4 geometry track server state', async ({ page }) => {
  test.skip(process.env.SHIFTBORN_LIVE_SERVER !== '1',
    'Run against a real local server with SHIFTBORN_LIVE_SERVER=1');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await join(page, 'DebugOne', 'create');
  await page.keyboard.press('F3');
  const overlay = page.locator('[data-debug-overlay]').last();
  await expect(overlay).toBeVisible();
  await expect.poll(async () => overlay.textContent(), { timeout: 10_000 })
    .toMatch(/RTT \d/);
  const before = await overlay.textContent();
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  const after = await overlay.textContent();
  expect(after).toMatch(/FPS \d/);
  expect(after).toMatch(/Frame \d/);
  expect(after).toMatch(/Server tick \d/);
  expect(after).toMatch(/Local tick \d/);
  expect(after).toMatch(/Prediction error last \d/);
  expect(after).toMatch(/Prediction error avg \d/);
  expect(after).toMatch(/Corrections\/min \d/);
  expect(after).toMatch(/Interpolation buffer \d/);
  expect(after).toMatch(/Entities players \d+ · shards \d+ · projectiles \d+/);
  expect(after).toMatch(/Input mouse/);
  expect(after).toMatch(/hpFrac \d+(?:\.\d+)? · Flux \d+(?:\.\d+)?/);
  expect(after).not.toBe(before);
  await page.keyboard.press('F4');
  const hitboxes = await page.evaluate(() => {
    const h = (window as unknown as { __debugHarness: { app: { arenaRenderer: {
      hitboxes: { visible: boolean; group: { getObjectByName(name: string):
        { visible: boolean; scale: { x: number }; position: { x: number } } | undefined } };
      map: { boxes: readonly { id: string }[] } } | null } } }).__debugHarness;
    const r = h.app.arenaRenderer;
    if (r === null) return null;
    return { visible: r.hitboxes.visible,
      player: r.hitboxes.group.getObjectByName('hitbox-player')?.visible,
      radius: r.hitboxes.group.getObjectByName('hitbox-player')?.scale.x,
      wall: r.hitboxes.group.getObjectByName(`hitbox-${r.map.boxes[0]?.id}`)?.visible };
  });
  expect(hitboxes).toMatchObject({ visible: true, player: true, radius: 0.6,
    wall: true });
  expect(pageErrors).toEqual([]);
  await page.evaluate(() => (window as unknown as { __debugHarness: {
    app: { dispose(): void } } }).__debugHarness.app.dispose());
});

test('T-038 server-authorized console and private results', async ({ page, browser }) => {
  test.setTimeout(90_000);
  test.skip(process.env.SHIFTBORN_LIVE_SERVER !== '1',
    'Run against a real local server with SHIFTBORN_LIVE_SERVER=1');
  const cheats = process.env.SHIFTBORN_DEV_CHEATS === '1';
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await join(page, 'DebugOne', 'create');
  const second = await browser.newPage();
  try {
    await join(second, 'DebugTwo', 'join');
    await page.keyboard.press('F3');
    await page.keyboard.press('Backquote');
    const consoleUi = page.locator('[data-dev-console]').last();
    if (!cheats) {
      await expect(consoleUi).toBeHidden();
      const blocked = await page.evaluate(() => {
        const c = (window as unknown as { __debugHarness: { connection: {
          canUseDevConsole: boolean; sendDevCommand(cmd: string): boolean } } })
          .__debugHarness.connection;
        return { capability: c.canUseDevConsole, sent: c.sendDevCommand('/flux 0') };
      });
      expect(blocked).toEqual({ capability: false, sent: false });
      return;
    }
    await expect(consoleUi).toBeVisible();
    const input = consoleUi.locator('input');
    await expect(input).toBeFocused();
    await input.fill('/flux 11');
    await input.press('Enter');
    await expect(consoleUi.locator('.dev-console-ok')).toHaveCount(1);
    await expect(second.locator('.dev-console-output p')).toHaveCount(0);
    await expect(page.locator('[data-debug-overlay]')).toContainText(/Flux 1[1-3](?:\.|\b)/);
    const flux = await page.evaluate(() => {
      const h = (window as unknown as { __debugHarness: { connection: {
        authoritativeState: { players: Record<string, { flux: number }> } | null;
        activeRoom: { sessionId: string } | null } } }).__debugHarness;
      const id = h.connection.activeRoom?.sessionId ?? '';
      return h.connection.authoritativeState?.players[id]?.flux ?? null;
    });
    expect(flux).toBeGreaterThanOrEqual(11);
    expect(flux).toBeLessThan(13);
    // The input manager continues to send neutral frames while text has focus.
    const neutral = await page.evaluate(() => {
      const h = (window as unknown as { __debugHarness: { app: { input: {
        sampledFrame: { moveX: number; moveY: number; buttons: number } | null } | null } } })
        .__debugHarness;
      return h.app.input?.sampledFrame;
    });
    expect(neutral).toMatchObject({ moveX: 0, moveY: 0, buttons: 0 });
    await input.fill('/hp .5'); await input.press('Enter');
    await expect(consoleUi.locator('.dev-console-ok')).toHaveCount(2);
    await expect(page.locator('[data-debug-overlay]')).toContainText('hpFrac 0.5');
    for (const command of ['/form beast', '/tp 0 0',
      '/difficulty hard', '/mode zone', '/bots 2', '/freeze', '/kill']) {
      const count = await consoleUi.locator('.dev-console-ok').count();
      await input.fill(command); await input.press('Enter');
      await expect(consoleUi.locator('.dev-console-ok')).toHaveCount(count + 1);
    }
    await expect.poll(() => page.evaluate(() => {
      const h = (window as unknown as { __debugHarness: { connection: {
        authoritativeState: { phase: number } | null } } }).__debugHarness;
      return h.connection.authoritativeState?.phase;
    })).toBe(1);
    await input.fill('/endmatch'); await input.press('Enter');
    await expect(consoleUi.locator('.dev-console-ok')).toHaveCount(10);
    await input.press('Escape');
    await expect(consoleUi).toBeHidden();
    expect(pageErrors).toEqual([]);
  } finally {
    await second.close();
    if (!page.isClosed()) await page.evaluate(() => (window as unknown as {
      __debugHarness: { app: { dispose(): void } } }).__debugHarness.app.dispose());
  }
});
