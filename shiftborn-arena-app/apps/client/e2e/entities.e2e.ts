import { expect, test } from '@playwright/test';

test('T-033 scripted visual harness renders every form, effect and authoritative fixture', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/visuals.html?scenario=all');
  await expect(page.locator('.arena-canvas')).toHaveCount(1);
  await expect(page.locator('[data-scenario="all"]')).toBeVisible();
  await page.waitForTimeout(100);
  const first = await page.evaluate(() => {
    const holder = window as unknown as { __visualHarness: { renderer: {
      statistics: { calls: number; triangles: number; width: number; height: number };
      entities: { size: number }; effects: { shardCount: number; clusterCount: number };
    } } };
    const renderer = holder.__visualHarness.renderer;
    return { ...renderer.statistics, players: renderer.entities.size,
      shards: renderer.effects.shardCount, clusters: renderer.effects.clusterCount };
  });
  console.log('T-033 1280x720 fixture scene:', first);
  expect(first.players).toBe(3);
  expect(first.shards).toBe(2);
  expect(first.clusters).toBe(1);
  expect(first.calls).toBeLessThan(100);
  expect(first.triangles).toBeLessThan(100_000);
  await page.locator('[data-scenario="fullRoom"]').click();
  await page.waitForTimeout(100);
  const fullRoom = await page.evaluate(() => {
    const renderer = (window as unknown as { __visualHarness: { renderer: {
      statistics: { calls: number; triangles: number }; entities: { size: number };
    } } }).__visualHarness.renderer;
    return { ...renderer.statistics, players: renderer.entities.size };
  });
  console.log('T-033 eight-player fixture scene:', fullRoom);
  expect(fullRoom.players).toBe(8);
  expect(fullRoom.calls).toBeLessThan(100);
  expect(fullRoom.triangles).toBeLessThan(100_000);
  await page.locator('[data-scenario="all"]').click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: '/tmp/shiftborn-t033-1280x720.png' });
  await page.setViewportSize({ width: 821, height: 462 });
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __visualHarness: { renderer: {
      statistics: { width: number } } } }).__visualHarness.renderer.statistics.width)).toBe(821);
  await page.screenshot({ path: '/tmp/shiftborn-t033-821x462.png' });
  for (const scenario of ['morph', 'protection', 'stun', 'dash', 'knockback',
    'ramWindup', 'ramCharge', 'ramImpact', 'railCharge', 'railRelease',
    'shards', 'cluster', 'rubble', 'rebuildPulse']) {
    await page.locator(`[data-scenario="${scenario}"]`).click();
    await expect(page.locator('.arena-canvas')).toHaveCount(1);
  }
  const effects = await page.evaluate(() => {
    const renderer = (window as unknown as { __visualHarness: { renderer: {
      effects: { shardCount: number; clusterCount: number; flashCount: number };
      map: { coverIsVisible(id: string): boolean | undefined };
      scene: { getObjectByName(name: string): { visible: boolean } | undefined };
    } } }).__visualHarness.renderer;
    return { shards: renderer.effects.shardCount,
      clusters: renderer.effects.clusterCount,
      flashes: renderer.effects.flashCount,
      cover: renderer.map.coverIsVisible('DC-1'),
      turret: renderer.scene.getObjectByName('turret-barrel')?.visible };
  });
  expect(effects).toMatchObject({ shards: 0, clusters: 0, flashes: 0, cover: false });
  await page.locator('[data-scenario="railCharge"]').click();
  expect(await page.evaluate(() => (window as unknown as { __visualHarness: {
    renderer: { effects: { flashCount: number } } } }).__visualHarness.renderer.effects.flashCount)).toBe(0);
  await page.locator('[data-scenario="railRelease"]').click();
  expect(await page.evaluate(() => (window as unknown as { __visualHarness: {
    renderer: { effects: { flashCount: number } } } }).__visualHarness.renderer.effects.flashCount)).toBe(1);
  await page.locator('[data-scenario="live"]').click();
  await expect(page.locator('#visuals')).toContainText('LIVE SIM');
  await page.evaluate(() => (window as unknown as { __visualHarness: {
    dispose(): void } }).__visualHarness.dispose());
  await expect(page.locator('.arena-canvas')).toHaveCount(0);
});

test('T-033 effects use state lifetimes, release events and authoritative cover', async ({ page }) => {
  await page.goto('/visuals.html?scenario=all');
  const inspect = (scenario: string) => page.evaluate(async (name) => {
    const h = (window as unknown as { __visualHarness: { select(kind: string): void;
      renderer: { entities: { size: number; get(id: string): { root: { rotation: { y: number } } } | undefined };
        effects: { getPlayerEffects(id: string): { morph: { visible: boolean };
          protection: { visible: boolean }; trail: { visible: boolean };
          rail: { visible: boolean }; stars: readonly { visible: boolean }[] } | undefined;
          flashCount: number; shardCount: number; clusterCount: number };
        map: { coverIsVisible(id: string): boolean | undefined; updateRubble(tick: number): void };
      } } }).__visualHarness;
    h.select(name);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const local = h.renderer.effects.getPlayerEffects('local');
    const beast = h.renderer.effects.getPlayerEffects('beast');
    const turret = h.renderer.effects.getPlayerEffects('turret');
    return { players: h.renderer.entities.size,
      morph: local?.morph.visible, protection: local?.protection.visible,
      dashTrail: local?.trail.visible, stun: beast?.stars.every((star) => star.visible),
      knockbackTrail: beast?.trail.visible, rail: turret?.rail.visible,
      flashes: h.renderer.effects.flashCount, shards: h.renderer.effects.shardCount,
      clusters: h.renderer.effects.clusterCount,
      cover: h.renderer.map.coverIsVisible('DC-1') };
  }, scenario);
  expect(await inspect('morph')).toMatchObject({ morph: true, protection: false });
  expect(await inspect('protection')).toMatchObject({ morph: false, protection: true });
  expect(await inspect('stun')).toMatchObject({ stun: true });
  expect(await inspect('dash')).toMatchObject({ dashTrail: true });
  expect(await inspect('knockback')).toMatchObject({ knockbackTrail: true });
  expect(await inspect('railCharge')).toMatchObject({ rail: true, flashes: 0 });
  expect(await inspect('railRelease')).toMatchObject({ rail: false, flashes: 1 });
  expect(await inspect('shards')).toMatchObject({ shards: 2, clusters: 0 });
  expect(await inspect('cluster')).toMatchObject({ shards: 0, clusters: 1 });
  expect(await inspect('rubble')).toMatchObject({ cover: false });
  await page.evaluate(() => {
    const renderer = (window as unknown as { __visualHarness: { renderer: {
      map: { updateRubble(tick: number): void; coverIsVisible(id: string): boolean | undefined };
    } } }).__visualHarness.renderer;
    renderer.map.updateRubble(10_000);
    if (renderer.map.coverIsVisible('DC-1') !== false)
      throw new Error('cover rebuilt without authoritative intact state');
  });
  expect(await inspect('all')).toMatchObject({ players: 3, shards: 2, clusters: 1 });
});
