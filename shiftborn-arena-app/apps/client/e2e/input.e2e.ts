import { expect, test } from '@playwright/test';

test('AT-CTRL-09 browser rules, reticle, latching and packet history', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    document.body.style.height = '2500px';
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;z-index:100;left:100px;top:100px;width:500px;height:350px';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%';
    stage.append(canvas); document.body.append(stage);
    const { InputManager } = await import('/src/input/InputManager.ts');
    let mode: 'hold' | 'toggle' = 'hold';
    let perspective: 'tpp' | 'fpp' = 'tpp';
    const packets: number[][] = [];
    const manager = new InputManager({
      transport: { sendInput(packet) { packets.push([...packet]); return true; } },
      fireMode: () => mode, player: () => ({ x: 0, y: 0, aim: 0 }),
      camera: () => ({ groundAtNdc(x: number, y: number) { return { x: x * 10, y: y * 10 }; } }),
      perspective: () => perspective,
    });
    manager.attach(canvas, stage); manager.setActive(true);
    Object.assign(window, { __inputHarness: { manager, stage, canvas, packets,
      setMode(value: 'hold' | 'toggle') { mode = value; },
      setPerspective(value: 'tpp' | 'fpp') {
        perspective = value;
        manager.refreshPointerPresentation();
      } } });
  });
  const canvas = page.locator('canvas').last();
  await page.mouse.move(500, 275);
  await expect(page.locator('.game-reticle')).toBeVisible();
  await expect(canvas).toHaveCSS('cursor', 'none');
  const initial = await page.evaluate(() => {
    const h = (window as unknown as { __inputHarness: {
      manager: { tick(): { aim: number; seq: number } | null } } }).__inputHarness;
    return h.manager.tick();
  });
  expect(initial?.aim).toBe(0);
  await page.evaluate(() => (window as unknown as { __inputHarness: {
    setPerspective(value: 'tpp' | 'fpp'): void } }).__inputHarness.setPerspective('fpp'));
  await expect(page.locator('.game-reticle')).toBeHidden();
  await expect(canvas).toHaveCSS('cursor', 'auto');
  await page.mouse.move(200, 170);
  const fppAim = await page.evaluate(() => (window as unknown as { __inputHarness: {
    manager: { tick(): { aim: number } | null } } }).__inputHarness.manager.tick()?.aim);
  expect(fppAim).toBe(initial?.aim);
  await page.evaluate(() => (window as unknown as { __inputHarness: {
    setPerspective(value: 'tpp' | 'fpp'): void } }).__inputHarness.setPerspective('tpp'));
  await expect(page.locator('.game-reticle')).toBeVisible();
  await expect(canvas).toHaveCSS('cursor', 'none');
  const tppAim = await page.evaluate(() => (window as unknown as { __inputHarness: {
    manager: { tick(): { aim: number } | null } } }).__inputHarness.manager.tick()?.aim);
  expect(tppAim).not.toBe(initial?.aim);
  const beforeScroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Backquote');
  expect(await page.evaluate(() => scrollY)).toBe(beforeScroll);
  const latched = await page.evaluate(() => {
    const h = (window as unknown as { __inputHarness: {
      manager: { tick(): { buttons: number; seq: number } | null } } }).__inputHarness;
    return h.manager.tick();
  });
  expect(latched?.buttons).toBe(1);
  const neutral = await page.evaluate(() => {
    const h = (window as unknown as { __inputHarness: {
      manager: { tick(): { buttons: number } | null } } }).__inputHarness;
    return h.manager.tick();
  });
  expect(neutral?.buttons).toBe(0);
  await page.keyboard.down('w');
  await canvas.click({ button: 'left', position: { x: 250, y: 175 } });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const afterBlur = await page.evaluate(() => {
    const h = (window as unknown as { __inputHarness: {
      manager: { tick(): { moveY: number; buttons: number } | null } } }).__inputHarness;
    return h.manager.tick();
  });
  expect(afterBlur).toMatchObject({ moveY: 0, buttons: 0 });
  await page.keyboard.up('w');
  expect(await page.evaluate(() => {
    const h = (window as unknown as { __inputHarness: { canvas: HTMLCanvasElement } }).__inputHarness;
    return !h.canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
      cancelable: true }));
  })).toBe(true);
  await page.evaluate(() => {
    const input = document.createElement('input'); input.id = 'editable-test';
    document.body.append(input); input.focus();
  });
  await page.keyboard.type('hello world');
  await expect(page.locator('#editable-test')).toHaveValue('hello world');
  const recovered = await page.evaluate(() => {
    const manager = (window as unknown as { __inputHarness: { manager: {
      recover(seq: number): void; suspend(): void;
      tick(): { seq: number } | null;
    }; packets: number[][] } }).__inputHarness.manager;
    const packets = (window as unknown as { __inputHarness: {
      packets: number[][] } }).__inputHarness.packets;
    manager.suspend();
    const suspended = manager.tick();
    manager.recover(100);
    const first = manager.tick();
    const width = packets.at(-1)?.length;
    manager.recover(50);
    const next = manager.tick();
    return { suspended, firstSeq: first?.seq, nextSeq: next?.seq, packetWidth: width };
  });
  expect(recovered).toEqual({ suspended: null, firstSeq: 101,
    nextSeq: 102, packetWidth: 14 });
  const packetCheck = await page.evaluate(() => {
    const h = (window as unknown as { __inputHarness: {
      packets: number[][]; manager: { dispose(): void }; canvas: HTMLCanvasElement;
    } }).__inputHarness;
    const latest = h.packets.at(-1) ?? [];
    const seqs = Array.from({ length: latest.length / 15 }, (_, index) => latest[index * 15] ?? -1);
    h.manager.dispose();
    return { valid: latest.length > 0 && latest.length % 15 === 0, seqs,
      cursor: h.canvas.style.cursor,
      reticles: document.querySelectorAll('.game-reticle').length };
  });
  expect(packetCheck.valid).toBe(true);
  expect(packetCheck.seqs.length).toBe(1);
  expect(packetCheck.seqs).toEqual([...packetCheck.seqs].sort((a, b) => b - a));
  expect(packetCheck).toMatchObject({ cursor: '', reticles: 0 });
  const remount = await page.evaluate(async () => {
    const h = (window as unknown as { __inputHarness: {
      manager: { actions: { held(action: string): boolean } };
      canvas: HTMLCanvasElement; stage: HTMLElement } }).__inputHarness;
    const { InputManager } = await import('/src/input/InputManager.ts');
    const packets: number[][] = [];
    const next = new InputManager({
      transport: { sendInput(packet) { packets.push([...packet]); return true; } },
      fireMode: () => 'hold', player: () => ({ x: 0, y: 0, aim: 0 }),
      camera: () => null, perspective: () => 'tpp',
    });
    next.attach(h.canvas, h.stage); next.setActive(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    const frame = next.tick();
    const oldHeld = h.manager.actions.held('moveNorth');
    next.dispose();
    return { frameMove: frame?.moveY, packets: packets.length,
      oldHeld, reticles: document.querySelectorAll('.game-reticle').length };
  });
  expect(remount).toEqual({ frameMove: 127, packets: 1,
    oldHeld: false, reticles: 0 });
});

test('T-037 carries ordered shot intents until acknowledgement or input reset', async ({ page }) => {
  await page.goto('/');
  const packets = await page.evaluate(async () => {
    const { InputManager } = await import('/src/input/InputManager.ts');
    const sent: number[][] = [];
    const manager = new InputManager({
      transport: { sendInput(packet) { sent.push([...packet]); return true; } },
      fireMode: () => 'hold', player: () => ({ x: 0, y: 0, aim: 0 }),
      camera: () => null, perspective: () => 'tpp',
    });
    manager.setActive(true);
    manager.tick();
    manager.rememberShotIntents([{ inputSeq: 1 }], performance.now());
    manager.tick();
    manager.rememberShotIntents([{ inputSeq: 2 }], performance.now());
    manager.tick();
    manager.confirmShotIntent(1);
    manager.tick();
    manager.clearInput();
    manager.tick();
    manager.dispose();
    return sent.map((packet) => packet.slice(7, 15));
  });
  expect(packets).toEqual([
    Array(8).fill(0),
    [1, ...Array(7).fill(0)],
    [1, 2, ...Array(6).fill(0)],
    [2, ...Array(7).fill(0)],
    Array(8).fill(0),
  ]);
});
