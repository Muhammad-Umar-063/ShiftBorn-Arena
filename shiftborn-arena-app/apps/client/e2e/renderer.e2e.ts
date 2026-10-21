import { expect, test } from '@playwright/test';

test('match screen owns and releases its live canvas across home and rejoin', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const root = document.createElement('div');
    root.id = 'integration-app';
    root.style.cssText = 'position:fixed;inset:0;z-index:5';
    document.body.append(root);
    const { App } = await import('/src/app/App.ts');
    let joined: (() => void) | null = null;
    const app = new App(root, {
      launch: (_intent, attempt) => { joined = () => attempt.joined(); },
    });
    app.controller.start({ kind: 'quick', name: 'Tester', code: '' });
    if (joined === null) throw new Error('join callback missing');
    (joined as () => void)();
    app.setLocalPlayerId('p');
    app.showAuthoritativeState({ tick: 12, phase: 1, matchId: 'fixture',
      players: { p: { id: 'p', name: 'Tester', seat: 0, isBot: false,
        controller: 0, connected: true, alive: true, x: 0, y: 0,
        aim: 0, form: 0, hpFrac: 1, flux: 0, kos: 0, deaths: 0,
        assists: 0, points: 0, damageDealt: 0, lastInputSeq: 0 } },
      full: { mode: 0, cover: [] } });
    Object.assign(window, { __integrationApp: app,
      __completeJoin: () => { if (joined !== null) (joined as () => void)(); } });
  });
  await expect(page.locator('#integration-app .arena-canvas')).toHaveCount(1);
  await expect(page.locator('#integration-app [data-server-tick]'))
    .toHaveText('Server tick 12');
  const viewButton = page.locator('#integration-app [data-camera-view]');
  await expect(viewButton).toHaveText('View: TPP (V)');
  await page.keyboard.press('v');
  await expect(viewButton).toHaveText('View: FPP (V) · mouse aim off');
  await viewButton.click();
  await expect(viewButton).toHaveText('View: TPP (V)');
  await page.screenshot({ path: '/tmp/shiftborn-camera-match-ui.png' });
  await page.locator('#integration-app button').getByText('Back to menu').click();
  await expect(page.locator('#integration-app .arena-canvas')).toHaveCount(0);
  await page.evaluate(() => {
    const holder = window as unknown as { __integrationApp: {
      controller: { start(intent: unknown): void }; dispose(): void };
      __completeJoin(): void };
    const app = holder.__integrationApp;
    app.controller.start({ kind: 'quick', name: 'Tester', code: '' });
    holder.__completeJoin();
  });
  await expect(page.locator('#integration-app .arena-canvas')).toHaveCount(1);
  await page.evaluate(() =>
    (window as unknown as { __integrationApp: { dispose(): void } })
      .__integrationApp.dispose());
});

test('AT-MAP-04 and AT-UI-13 static scene: size, budget, resize and remount', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.evaluate(async () => {
    const root = document.querySelector('#app');
    if (root === null) throw new Error('missing mount');
    const stage = document.createElement('div');
    stage.className = 'arena-stage';
    stage.style.position = 'fixed';
    root.replaceChildren(stage);
    const { ArenaRenderer } = await import('/src/render/Renderer.ts');
    const { readEntitySnapshot } = await import('/src/render/entityState.ts');
    const renderer = new ArenaRenderer(stage, () => { throw new Error('render failed'); });
    renderer.setView({
      camera: { player: { x: 0, y: 0 }, aimRadians: Math.PI / 4,
        form: 'runner', inputScheme: 'mouse', cursorDistanceM: 12,
        reducedMotion: false, perspective: 'tpp' },
      visiblePlayers: [{ x: 0, y: 0 }, { x: 8, y: 5 }],
    });
    renderer.setZoneMarkersVisible(true);
    renderer.setCoverIntact('DC-1', false);
    const fixture = { tick: 12, phase: 1, matchId: 'render-test',
      players: { p: { id: 'p', name: 'Tester', seat: 0, isBot: false,
        controller: 0, connected: true, alive: true, x: 0, y: 0,
        aim: 0, form: 0, hpFrac: 1, flux: 0, kos: 0, deaths: 0,
        assists: 0, points: 0, damageDealt: 0, lastInputSeq: 0 },
        q: { id: 'q', name: 'Remote', seat: 1, isBot: false,
          controller: 0, connected: true, alive: true, x: 14.5, y: 18.5,
          aim: 0, form: 0, hpFrac: 1, flux: 0, kos: 0, deaths: 0,
          assists: 0, points: 0, damageDealt: 0, lastInputSeq: 0 } },
      full: { players: { p: { vx: 0, vy: 0 }, q: { vx: 0, vy: 0 } }, cover: [] } };
    renderer.setEntities(readEntitySnapshot(fixture, 'p'));
    Object.assign(window, { __arenaRenderer: renderer, __arenaStage: stage,
      __rendererFixture: fixture });
  });
  await page.waitForTimeout(200);
  const first = await page.evaluate(() => {
    const renderer = (window as unknown as { __arenaRenderer: {
      statistics: { calls: number; triangles: number; pixelRatio: number;
        width: number; height: number };
      map: { boxes: readonly unknown[]; coverIsVisible(id: string): boolean | undefined };
      scene: { getObjectByName(name: string): { visible: boolean } | undefined };
    } }).__arenaRenderer;
    return { ...renderer.statistics, boxes: renderer.map.boxes.length,
      cover: renderer.map.coverIsVisible('DC-1'),
      localPlayerVisible: renderer.scene.getObjectByName('player-p')?.visible,
      canvases: document.querySelectorAll('.arena-canvas').length };
  });
  console.log('T-032 1280x720 renderer stats:', first);
  expect(first).toMatchObject({ width: 1280, height: 720, boxes: 48,
    cover: false, localPlayerVisible: true, canvases: 1 });
  expect(first.pixelRatio).toBeLessThanOrEqual(2);
  expect(first.calls).toBeLessThan(100);
  expect(first.triangles).toBeLessThan(100_000);
  await page.screenshot({ path: '/tmp/shiftborn-t032-1280x720.png' });

  await page.setViewportSize({ width: 821, height: 462 });
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __arenaRenderer: { statistics: { width: number } } })
      .__arenaRenderer.statistics.width)).toBe(821);
  const second = await page.evaluate(() =>
    (window as unknown as { __arenaRenderer: { statistics: {
      width: number; height: number; calls: number; triangles: number; pixelRatio: number;
    } } }).__arenaRenderer.statistics);
  console.log('T-032 821x462 renderer stats:', second);
  expect(second).toMatchObject({ width: 821, height: 462 });
  expect(second.calls).toBeLessThan(100);
  expect(second.triangles).toBeLessThan(100_000);
  await page.screenshot({ path: '/tmp/shiftborn-t032-821x462.png' });
  await page.evaluate(() => {
    const renderer = (window as unknown as { __arenaRenderer: {
      setView(view: unknown): void;
    } }).__arenaRenderer;
    renderer.setView({ camera: { player: { x: 0, y: 0 }, aimRadians: 0,
      form: 'runner', inputScheme: 'mouse', cursorDistanceM: 0,
      reducedMotion: true, perspective: 'fpp' },
    visiblePlayers: [{ x: 14.5, y: 18.5 }] });
  });
  await expect.poll(() => page.evaluate(() => {
    const renderer = (window as unknown as { __arenaRenderer: {
      camera: { camera: { position: { y: number } } };
    } }).__arenaRenderer;
    return renderer.camera.camera.position.y;
  })).toBeCloseTo(1.6, 2);
  expect(await page.evaluate(() => {
    const renderer = (window as unknown as { __arenaRenderer: {
      scene: { getObjectByName(name: string): { visible: boolean } | undefined };
    } }).__arenaRenderer;
    return renderer.scene.getObjectByName('player-p')?.visible;
  })).toBe(false);
  await page.screenshot({ path: '/tmp/shiftborn-camera-fpp-821x462.png' });
  await expect.poll(() => page.evaluate(() => {
    const renderer = (window as unknown as { __arenaRenderer: {
      map: { occluders: readonly { id: string; material: { opacity: number } }[] };
    } }).__arenaRenderer;
    return renderer.map.occluders.find((item) => item.id === 'DC-2')?.material.opacity;
  })).toBe(1);
  await page.evaluate(() => {
    const renderer = (window as unknown as { __arenaRenderer: {
      setView(view: unknown): void;
    } }).__arenaRenderer;
    renderer.setView({ camera: { player: { x: 0, y: 0 }, aimRadians: 0,
      form: 'turret', inputScheme: 'mouse', cursorDistanceM: 0,
      reducedMotion: true, perspective: 'tpp' },
      visiblePlayers: [{ x: 14.5, y: 18.5 }] });
  });
  await expect.poll(() => page.evaluate(() => {
    const renderer = (window as unknown as { __arenaRenderer: {
      camera: { currentZoom: number };
    } }).__arenaRenderer;
    return renderer.camera.currentZoom;
  })).toBeCloseTo(1.3, 2);
  await expect.poll(() => page.evaluate(() => {
    const renderer = (window as unknown as { __arenaRenderer: {
      map: { occluders: readonly { id: string; material: { opacity: number } }[] };
    } }).__arenaRenderer;
    return renderer.map.occluders.find((item) => item.id === 'DC-2')?.material.opacity;
  })).toBeCloseTo(0.3, 2);
  await page.evaluate(async () => {
    const renderer = (window as unknown as { __arenaRenderer: {
      setView(view: unknown): void; setEntities(snapshot: unknown): void;
    } }).__arenaRenderer;
    renderer.setView({ camera: { player: { x: 0, y: 0 }, aimRadians: 0,
      form: 'turret', inputScheme: 'mouse', cursorDistanceM: 0,
      reducedMotion: true, perspective: 'tpp' }, visiblePlayers: [] });
    const fixture = (window as unknown as { __rendererFixture: {
      tick: number; players: Record<string, unknown>;
      full: { players: Record<string, unknown> };
    } }).__rendererFixture;
    fixture.tick = 13;
    delete fixture.players.q;
    delete fixture.full.players.q;
    const { readEntitySnapshot } = await import('/src/render/entityState.ts');
    renderer.setEntities(readEntitySnapshot(
      fixture as unknown as Parameters<typeof readEntitySnapshot>[0], 'p'));
  });
  await expect.poll(() => page.evaluate(() => {
    const renderer = (window as unknown as { __arenaRenderer: {
      map: { occluders: readonly { id: string; material: { opacity: number } }[] };
    } }).__arenaRenderer;
    return renderer.map.occluders.find((item) => item.id === 'DC-2')?.material.opacity;
  })).toBe(1);
  await page.evaluate(async () => {
    const holder = window as unknown as { __arenaRenderer: {
      dispose(): void }; __arenaStage: HTMLElement };
    holder.__arenaRenderer.dispose();
    holder.__arenaRenderer.dispose();
    const { ArenaRenderer } = await import('/src/render/Renderer.ts');
    const next = new ArenaRenderer(holder.__arenaStage, () => {
      throw new Error('remount render failed');
    });
    next.dispose();
  });
  await expect(page.locator('.arena-canvas')).toHaveCount(0);
});
