import { expect, test } from '@playwright/test';

test.skip(process.env.SHIFTBORN_LIVE_SERVER !== '1',
  'Run with SHIFTBORN_LIVE_SERVER=1 while pnpm dev serves the real room');

test('T-031 live shell joins and keeps rendering ticks at the AT-NET-17 URL', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await page.goto('http://localhost:5173/?lag=150&loss=2');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const canvas = page.locator('.arena-canvas');
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  const tick = page.locator('[data-server-tick]');
  const readTick = async (): Promise<number> => {
    const match = (await tick.textContent())?.match(/^Server tick (\d+)$/);
    return match === undefined || match === null ? -1 : Number(match[1]);
  };
  await expect.poll(readTick, { timeout: 10_000 }).toBeGreaterThan(0);
  const firstTick = await readTick();
  await page.keyboard.press('v');
  await expect(page.locator('[data-camera-view]'))
    .toHaveText('View: FPP (V) · mouse aim off');
  await page.keyboard.press('v');
  await expect(page.locator('[data-camera-view]')).toHaveText('View: TPP (V)');
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error('arena canvas has no bounds');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator('.game-reticle')).toBeVisible();
  await page.keyboard.down('w');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.keyboard.up('w');
  await expect.poll(readTick, { timeout: 10_000 }).toBeGreaterThan(firstTick + 3);
  expect(browserErrors).toEqual([]);
});
