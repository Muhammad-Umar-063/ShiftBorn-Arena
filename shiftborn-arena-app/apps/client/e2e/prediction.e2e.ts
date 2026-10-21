import { expect, test, type Page } from '@playwright/test';

test.skip(process.env.SHIFTBORN_LIVE_SERVER !== '1',
  'Run with SHIFTBORN_LIVE_SERVER=1 against a real server');
test.describe.configure({ mode: 'serial' });
const port = Number(process.env.SHIFTBORN_TEST_SERVER_PORT ?? 2567);

async function join(page: Page, search: string): Promise<void> {
  await page.goto(`http://localhost:5173/${search}`);
  await page.evaluate(async (serverPort) => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:10';
    document.body.append(root);
    const { App } = await import('/src/app/App.ts');
    const { Connection } = await import('/src/net/Connection.ts');
    const connection = new Connection({ endpoint: `ws://127.0.0.1:${serverPort}`,
      search: location.search });
    const app = new App(root, { launch: connection.launch,
      inputTransport: connection, onDispose: () => connection.dispose() });
    const metrics = { movementM: 0, dashStarts: 0, morphStarts: 0,
      lastPosition: null as { x: number; y: number } | null };
    let localId = '';
    let localSeat = -1;
    const recordPosition = (state: { players: Readonly<Record<string,
      { x: number; y: number }>> }): void => {
      const current = state.players[localId];
      if (current === undefined) return;
      if (metrics.lastPosition !== null) {
        const distance = Math.hypot(current.x - metrics.lastPosition.x,
          current.y - metrics.lastPosition.y);
        if (distance < 5) metrics.movementM += distance;
      }
      metrics.lastPosition = { x: current.x, y: current.y };
    };
    connection.subscribe((event) => {
      if (event.kind === 'ready' || event.kind === 'recovered') {
        if (event.kind === 'recovered') {
          app.controller.recovered(); app.resetPrediction();
        }
        localId = event.welcome.playerId;
        localSeat = event.welcome.seat;
        app.setLocalPlayerId(event.welcome.playerId);
        app.showAuthoritativeState(event.state);
        recordPosition(event.state);
        app.recoverInput(event.state.players[event.welcome.playerId]?.lastInputSeq ?? 0);
      } else if (event.kind === 'state') {
        app.showAuthoritativeState(event.state); recordPosition(event.state);
      }
      else if (event.kind === 'resync') {
        app.resetPrediction(); app.showAuthoritativeState(event.state);
        recordPosition(event.state);
        app.recoverInput(event.lastInputSeq);
      } else if (event.kind === 'events') {
        app.showEventBatch(event.batch);
        for (const entry of event.batch.events) {
          if (entry[1] !== localSeat) continue;
          if (entry[0] === 9) metrics.dashStarts += 1;
          if (entry[0] === 6) metrics.morphStarts += 1;
        }
      }
      else if (event.kind === 'reconnecting') {
        app.suspendInput(); app.resetPrediction(); app.controller.showReconnecting();
      }
    });
    app.controller.start({ kind: 'quick', name: 'PredictTester', code: '' });
    Object.assign(window, { __predictionLive: { app, connection, metrics,
      getLocalId: () => localId } });
  }, port);
  await expect.poll(() => page.evaluate(() => {
    const h = (window as unknown as { __predictionLive: {
      app: { state: { kind: string }; isPredictionUnavailable: boolean;
        prediction: { state: unknown } };
      connection: { authoritativeState: { phase: number } | null } } }).__predictionLive;
    return h.app.state.kind === 'inMatch' &&
      h.connection.authoritativeState?.phase === 1 &&
      h.app.prediction.state !== null && !h.app.isPredictionUnavailable;
  }), { timeout: 15_000 }).toBe(true);
}

test('AT-NET-06 local input appears on the next rendered frame at 150 ms RTT',
  async ({ page }) => {
    test.setTimeout(45_000);
    await join(page, '?lag=150');
    await page.evaluate(() => new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())));
    await page.evaluate(() => {
      const h = (window as unknown as { __predictionLive: {
        app: { prediction: { presentation(at: number): { x: number; y: number } | null };
          arenaRenderer: { scene: { getObjectByName(name: string): {
            position: { x: number; z: number } } | undefined }; camera: {
            camera: { position: { x: number; z: number } } } } | null };
        getLocalId(): string } }).__predictionLive;
      const app = h.app;
      const initial = app.prediction.presentation(performance.now());
      const scenePosition = (): { x: number; y: number; cx: number; cz: number } | null => {
        const renderer = app.arenaRenderer;
        const player = renderer?.scene.getObjectByName(`player-${h.getLocalId()}`);
        return renderer === null || player === undefined ? null : {
          x: player.position.x, y: -player.position.z,
          cx: renderer.camera.camera.position.x,
          cz: renderer.camera.camera.position.z };
      };
      const initialScene = scenePosition();
      const result = new Promise<{ frame: number; distance: number;
        renderDistance: number; cameraDistance: number }>((resolve) => {
        document.addEventListener('keydown', (event) => {
          if (event.code !== 'KeyW') return;
          if (initial === null || initialScene === null) {
            resolve({ frame: -1, distance: 0, renderDistance: 0, cameraDistance: 0 });
            return;
          }
          let frame = 0;
          const measure = (): void => {
            frame += 1;
            const current = app.prediction.presentation(performance.now());
            const distance = current === null ? 0 : Math.hypot(current.x - initial.x,
              current.y - initial.y);
            const scene = scenePosition();
            const renderDistance = scene === null ? 0 : Math.hypot(scene.x - initialScene.x,
              scene.y - initialScene.y);
            const cameraDistance = scene === null ? 0 : Math.hypot(scene.cx - initialScene.cx,
              scene.cz - initialScene.cz);
            if (renderDistance > 0.001 || frame >= 6)
              resolve({ frame, distance, renderDistance, cameraDistance });
            else requestAnimationFrame(measure);
          };
          requestAnimationFrame(measure);
        }, { once: true });
      });
      Object.assign(window, { __predictionResponse: result });
    });
    await page.keyboard.down('w');
    const result = await page.evaluate(() =>
      (window as unknown as { __predictionResponse: Promise<{
        frame: number; distance: number; renderDistance: number;
        cameraDistance: number }> }).__predictionResponse);
    await page.keyboard.up('w');
    expect(result.distance).toBeGreaterThan(0.001);
    expect(result.renderDistance).toBeGreaterThan(0.001);
    expect(result.cameraDistance).toBeGreaterThan(0.001);
    expect(result.frame).toBe(1);
    await page.evaluate(() => (window as unknown as { __predictionLive: {
      app: { dispose(): void } } }).__predictionLive.app.dispose());
  });

test('AT-NET-07 60-second walking, Dash and morph correction rate at 150 ms RTT',
  async ({ page }) => {
    test.setTimeout(110_000);
    await join(page, '?lag=150');
    const starting = await page.evaluate(() => (window as unknown as {
      __predictionLive: { app: { prediction: { correctionCount: number } } }
    }).__predictionLive.app.prediction.correctionCount);
    const startedAt = Date.now();
    await page.keyboard.down('w');
    await page.waitForTimeout(5_000);
    await page.keyboard.press('e');
    await page.waitForTimeout(10_000);
    await page.keyboard.press('2');
    await page.waitForTimeout(15_000);
    await page.keyboard.up('w');
    await page.keyboard.down('d');
    await page.waitForTimeout(15_000);
    await page.keyboard.press('1');
    await page.waitForTimeout(15_000);
    await page.keyboard.up('d');
    if (Date.now() - startedAt < 60_000)
      await page.waitForTimeout(60_000 - (Date.now() - startedAt));
    const result = await page.evaluate((initial) => {
      const h = (window as unknown as { __predictionLive: {
        app: { prediction: { correctionCount: number }; isPredictionUnavailable: boolean;
          dispose(): void };
        metrics: { movementM: number; dashStarts: number; morphStarts: number };
        connection: { authoritativeState: { tick: number } | null } } }).__predictionLive;
      const outcome = { corrections: h.app.prediction.correctionCount - initial,
        unavailable: h.app.isPredictionUnavailable,
        tick: h.connection.authoritativeState?.tick ?? -1,
        movementM: h.metrics.movementM,
        dashStarts: h.metrics.dashStarts,
        morphStarts: h.metrics.morphStarts };
      h.app.dispose();
      return outcome;
    }, starting);
    const elapsedS = (Date.now() - startedAt) / 1000;
    console.log('AT-NET-07 measurement', { elapsedS, ...result });
    expect(elapsedS).toBeGreaterThanOrEqual(60);
    expect(result.unavailable).toBe(false);
    expect(result.tick).toBeGreaterThan(0);
    expect(result.movementM).toBeGreaterThan(1);
    expect(result.dashStarts).toBeGreaterThan(0);
    expect(result.morphStarts).toBeGreaterThan(0);
    expect(result.corrections / (elapsedS / 60)).toBeLessThan(1);
  });

for (const search of ['', '?lag=100', '?lag=200',
  '?lag=150&loss=2', '?lag=150&jitter=20&loss=2']) {
  test(`T-035 production stress smoke ${search || 'normal'}`, async ({ page }) => {
    test.setTimeout(30_000);
    await join(page, search);
    await page.keyboard.down('w');
    await page.waitForTimeout(2_000);
    await page.keyboard.up('w');
    const result = await page.evaluate(() => {
      const h = (window as unknown as { __predictionLive: {
        app: { prediction: { correctionCount: number }; isPredictionUnavailable: boolean;
          dispose(): void };
        connection: { authoritativeState: { tick: number } | null } } }).__predictionLive;
      const outcome = { corrections: h.app.prediction.correctionCount,
        unavailable: h.app.isPredictionUnavailable,
        tick: h.connection.authoritativeState?.tick ?? -1 };
      h.app.dispose();
      return outcome;
    });
    console.log('T-035 stress smoke', search || 'normal', result);
    expect(result.unavailable).toBe(false);
    expect(result.tick).toBeGreaterThan(0);
  });
}
