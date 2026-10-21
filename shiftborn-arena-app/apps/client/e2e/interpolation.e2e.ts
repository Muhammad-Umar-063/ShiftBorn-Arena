import { expect, test, type Page } from '@playwright/test';

test.skip(process.env.SHIFTBORN_LIVE_SERVER !== '1',
  'Run with SHIFTBORN_LIVE_SERVER=1 against a real server');

const port = Number(process.env.SHIFTBORN_TEST_SERVER_PORT ?? 2567);

interface Frame {
  at: number;
  tick: number;
  renderTick: number | null;
  x: number;
  y: number;
}
interface Patch { at: number; tick: number; x: number; y: number }

async function join(page: Page, search: string, code: string,
  name: string, kind: 'create' | 'join'): Promise<void> {
  await page.goto(`http://localhost:5173/${search}`);
  await page.evaluate(async ({ serverPort, roomCode, playerName, intentKind }) => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:10';
    document.body.append(root);
    const { App } = await import('/src/app/App.ts');
    const { Connection } = await import('/src/net/Connection.ts');
    const connection = new Connection({ endpoint: `ws://127.0.0.1:${serverPort}`,
      search: location.search });
    const app = new App(root, { launch: connection.launch,
      inputTransport: connection,
      serverTickEstimate: () => connection.clock.estimatedTick(),
      onDispose: () => connection.dispose() });
    let localId = '';
    const patches: Patch[] = [];
    const frames: Frame[] = [];
    let remoteId = '';
    let recorder: number | null = null;
    const record = (): void => {
      const renderer = app.arenaRenderer;
      const object = renderer?.scene.getObjectByName(`player-${remoteId}`);
      const state = connection.authoritativeState;
      if (object !== undefined && state !== null) frames.push({
        at: performance.now(), tick: state.tick,
        renderTick: renderer?.displayedRenderTick ?? null,
        x: object.position.x, y: -object.position.z });
      recorder = requestAnimationFrame(record);
    };
    recorder = requestAnimationFrame(record);
    connection.subscribe((event) => {
      if (event.kind === 'ready' || event.kind === 'recovered') {
        if (event.kind === 'recovered') {
          app.controller.recovered(); app.resetPrediction();
          app.resetPresentationTimeline();
        }
        localId = event.welcome.playerId;
        app.setLocalPlayerId(localId);
        app.showAuthoritativeState(event.state);
        app.recoverInput(event.state.players[localId]?.lastInputSeq ?? 0);
      } else if (event.kind === 'state' || event.kind === 'resync') {
        if (event.kind === 'resync') {
          app.resetPrediction(); app.resetPresentationTimeline();
          app.recoverInput(event.lastInputSeq);
        }
        app.showAuthoritativeState(event.state);
        const player = event.state.players[remoteId];
        if (player !== undefined) patches.push({ at: performance.now(),
          tick: event.state.tick, x: player.x, y: player.y });
      } else if (event.kind === 'events') app.showEventBatch(event.batch);
      else if (event.kind === 'reconnecting') {
        app.suspendInput(); app.resetPrediction();
        app.resetPresentationTimeline(); app.controller.showReconnecting();
      }
    });
    app.controller.start({ kind: intentKind, name: playerName, code: roomCode });
    Object.assign(window, { __interpolationLive: { app, connection, frames,
      patches, getLocalId: () => localId,
      setRemoteId: (id: string) => { remoteId = id; },
      clear: () => { frames.length = 0; patches.length = 0; },
      dispose: () => { if (recorder !== null) cancelAnimationFrame(recorder);
        app.dispose(); } } });
  }, { serverPort: port, roomCode: code, playerName: name, intentKind: kind });
  await expect.poll(() => page.evaluate(() => {
    const h = (window as unknown as { __interpolationLive: {
      app: { state: { kind: string } }; getLocalId(): string } }).__interpolationLive;
    return h.app.state.kind === 'inMatch' && h.getLocalId() !== '';
  }), { timeout: 20_000 }).toBe(true);
}

const cases = [
  { label: '0 ms', search: '', code: 'ARNA23' },
  { label: '100 ms', search: '?lag=100', code: 'ARNA24' },
  { label: '200 ms', search: '?lag=200', code: 'ARNA25' },
  { label: '150 ms + 2% HOL loss', search: '?lag=150&loss=2', code: 'ARNA26' },
  { label: '150 ms + jitter + 2% HOL loss',
    search: '?lag=150&jitter=20&loss=2', code: 'ARNA27' },
] as const;

for (const condition of cases) test(`AT-NET-08 ${condition.label}`, async ({ page, browser },
  testInfo) => {
  test.setTimeout(60_000);
  const observerContext = await browser.newContext();
  const observer = await observerContext.newPage();
  try {
    await page.setViewportSize({ width: 480, height: 270 });
    await observer.setViewportSize({ width: 480, height: 270 });
    await join(page, condition.search, condition.code, 'Mover', 'create');
    await join(observer, condition.search, condition.code, 'Observer', 'join');
    const moverId = await page.evaluate(() => (window as unknown as {
      __interpolationLive: { getLocalId(): string }
    }).__interpolationLive.getLocalId());
    await observer.evaluate((id) => (window as unknown as {
      __interpolationLive: { setRemoteId(id: string): void }
    }).__interpolationLive.setRemoteId(id), moverId);
    await expect.poll(() => observer.evaluate(() => {
      const h = (window as unknown as { __interpolationLive: {
        connection: { authoritativeState: { players: Record<string, unknown> } | null };
        frames: Frame[] } }).__interpolationLive;
      return h.frames.length > 0;
    }), { timeout: 15_000 }).toBe(true);
    await observer.evaluate(() => (window as unknown as {
      __interpolationLive: { clear(): void }
    }).__interpolationLive.clear());
    const start = await page.evaluate(() => {
      const h = (window as unknown as { __interpolationLive: {
        connection: { authoritativeState: { players: Record<string,
          { x: number; y: number }> } | null }; getLocalId(): string }
      }).__interpolationLive;
      return h.connection.authoritativeState?.players[h.getLocalId()] ?? null;
    });
    expect(start).not.toBeNull();
    const key = Math.abs(start!.x) > 20 ? (start!.x < 0 ? 'd' : 'a')
      : (start!.y > 0 ? 's' : 'w');
    await page.keyboard.down(key);
    await page.waitForTimeout(3_000);
    await page.keyboard.up(key);
    await page.waitForTimeout(500);
    const measurements = await observer.evaluate(() => {
      const h = (window as unknown as { __interpolationLive: {
        frames: Frame[]; patches: Patch[] } }).__interpolationLive;
      return { frames: h.frames, patches: h.patches };
    });
    await testInfo.attach(`AT-NET-08 ${condition.label}`, {
      body: JSON.stringify(measurements), contentType: 'application/json' });
    const { frames, patches } = measurements;
    const distinctWithinPatch = new Map<number, Set<string>>();
    let maxJumpM = 0;
    let movementM = 0;
    for (let index = 1; index < frames.length; index += 1) {
      const previous = frames[index - 1];
      const current = frames[index];
      if (previous === undefined || current === undefined) continue;
      const distance = Math.hypot(current.x - previous.x,
        current.y - previous.y);
      maxJumpM = Math.max(maxJumpM, distance);
      movementM += distance;
      const positions = distinctWithinPatch.get(current.tick) ?? new Set<string>();
      positions.add(`${current.x.toFixed(4)},${current.y.toFixed(4)}`);
      distinctWithinPatch.set(current.tick, positions);
    }
    const intermediatePatches = [...distinctWithinPatch.values()]
      .filter((positions) => positions.size >= 2).length;
    const patchSpanMs = patches.length > 1
      ? (patches.at(-1)!.at - patches[0]!.at) / (patches.length - 1) : 0;
    console.log('AT-NET-08 measurement', condition.label, {
      frames: frames.length, patches: patches.length, patchSpanMs,
      movementM, maxJumpM, intermediatePatches,
      firstFrame: frames[0], lastFrame: frames.at(-1),
    });
    expect(patches.length).toBeGreaterThan(20);
    expect(frames.length).toBeGreaterThan(40);
    expect(movementM).toBeGreaterThan(1);
    expect(intermediatePatches).toBeGreaterThan(10);
    expect(maxJumpM).toBeLessThanOrEqual(0.6);
  } finally {
    await page.evaluate(() => (window as unknown as {
      __interpolationLive?: { dispose(): void }
    }).__interpolationLive?.dispose()).catch(() => {});
    await observer.evaluate(() => (window as unknown as {
      __interpolationLive?: { dispose(): void }
    }).__interpolationLive?.dispose()).catch(() => {});
    await observerContext.close();
  }
});
