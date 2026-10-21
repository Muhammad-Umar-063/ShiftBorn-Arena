import { expect, test, type Page } from '@playwright/test';

async function withWebGL2(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fetchNow = window.fetch.bind(window);
    window.fetch = (input, init) => String(input).includes('/matchmake/')
      ? new Promise<Response>(() => undefined) : fetchNow(input, init);
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: (kind: string) => kind === 'webgl2' ? {} : null,
    });
  });
}

test.describe('AT-UI-01: client shell without a server', () => {
  test.beforeEach(async ({ page }) => { await withWebGL2(page); });

  test('landing, quick play, cancel, create and join work as local intents', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Shiftborn');
    await expect(page.getByText('Prototype', { exact: true })).toBeVisible();
    const name = page.getByRole('textbox', { name: 'Player name' });
    await expect(name).not.toBeEmpty();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused();
    await name.fill('Test_Player');
    await name.press('Enter');
    await expect(page.getByRole('heading', { name: 'Connecting...' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused();
    await expect(name).toHaveValue('Test_Player');

    await page.getByRole('button', { name: 'Create room' }).click();
    const generatedCode = await page.getByText(/^Room code: /).textContent();
    expect(generatedCode).toMatch(/^Room code: [ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    await page.getByRole('button', { name: 'Cancel' }).click();

    const code = page.getByRole('textbox', { name: 'Room code' });
    await code.fill('abc234');
    await expect(code).toHaveValue('ABC234');
    await page.getByRole('button', { name: 'Join room' }).click();
    await expect(page.getByRole('heading', { name: 'Connecting...' })).toBeVisible();
    await expect(page.getByText('Room code: ABC234')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/Build dev/)).toBeVisible();
    await expect(page.getByText('Prototype build: greybox visuals')).toBeVisible();
  });

  test('invalid join stays on landing with an inline error; help is keyboard accessible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Room code' }).fill('abci10');
    await page.getByRole('button', { name: 'Join room' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Shiftborn');
    await expect(page.getByText('Enter a valid six-character room code.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Room code' })).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'How to play' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'How to play' })).toBeFocused();
  });

  test('room URL shows one primary join action and never connects automatically', async ({ page }) => {
    await page.goto('/?room=abc234');
    await expect(page.getByText('Joining room ABC234')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create room' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Connecting...' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByText('Room code: ABC234')).toBeVisible();
  });

  test('unsafe room URL renders as text and cannot initiate its code', async ({ page }) => {
    await page.goto('/?room=%3Csvg%3E');
    await expect(page.getByText('Enter a valid six-character room code.')).toBeVisible();
    await expect(page.locator('svg')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
  });

  test('a 10-second timeout exposes a focused retry action', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.clock.fastForward(10_000);
    await expect(page.getByRole('heading', { name: 'Could not connect. Try again.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Connecting...' })).toBeVisible();
  });
});

test.describe('AT-UI-10: settings persistence and blocked storage', () => {
  test.beforeEach(async ({ page }) => { await withWebGL2(page); });

  test('a changed setting and edited name survive reload', async ({ page }) => {
    await page.goto('/');
    const name = page.getByRole('textbox', { name: 'Player name' });
    await name.fill('Saved_Player');
    await name.blur();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const volume = page.getByRole('slider', { name: 'Master volume' });
    await volume.fill('42');
    await expect(page.getByText('42%')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Reduced motion' }).check();
    await page.getByRole('radio', { name: 'FPP' }).check();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
    await page.reload();
    await expect(name).toHaveValue('Saved_Player');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(volume).toHaveValue('42');
    await expect(page.getByRole('checkbox', { name: 'Reduced motion' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'FPP' })).toBeChecked();
  });

  test('blocked localStorage leaves defaults and settings usable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => { throw new DOMException('blocked', 'SecurityError'); },
      });
    });
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Player name' })).not.toBeEmpty();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('slider', { name: 'Master volume' })).toHaveValue('80');
    await page.getByRole('slider', { name: 'Master volume' }).fill('37');
    await expect(page.getByText('37%')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('slider', { name: 'Master volume' })).toHaveValue('37');
  });
});

test('WebGL 2 failure blocks the normal shell with an accessible message', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('WebGL 2 is required');
  await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
});
