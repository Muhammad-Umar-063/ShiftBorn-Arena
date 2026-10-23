import { AimSource, InputButton, decodeInputPacket, encodeInputPacket,
  type ClientInputFrame } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { aimFromGround, angleToUint16, pointerGroundPoint } from '../src/input/aim.js';
import { actionsForCode, RESERVED_CODES } from '../src/input/bindings.js';
import { InputState } from '../src/input/InputState.js';
import { advanceFixedSteps, INPUT_STEP_MS } from '../src/input/fixedSteps.js';

describe('AT-CTRL-01 bindings and reserved actions', () => {
  it('maps every documented gameplay and extension binding', () => {
    const cases: Record<string, string> = {
      KeyW: 'moveNorth', KeyA: 'moveWest', KeyS: 'moveSouth', KeyD: 'moveEast',
      ArrowUp: 'aimNorth', ArrowDown: 'aimSouth', ArrowLeft: 'aimWest',
      ArrowRight: 'aimEast', Mouse0: 'fire', Space: 'fire',
      Digit1: 'morphRunner', Digit2: 'morphBeast', Digit3: 'morphTurret',
      KeyE: 'ability', KeyQ: 'swap', KeyR: 'reload', ShiftLeft: 'sprint', ShiftRight: 'sprint', Tab: 'scoreboard',
      Escape: 'menu', KeyP: 'menu', KeyC: 'cameraView', KeyV: 'dagger',
      F3: 'debugOverlay', F4: 'hitboxView', Backquote: 'devConsole',
    };
    for (const [code, action] of Object.entries(cases))
      expect(actionsForCode(code)).toContain(action);
    for (const code of RESERVED_CODES) expect(actionsForCode(code)).toEqual([]);
    expect(actionsForCode('ArrowUp', 'menu')).toContain('menuPrevious');
    expect(actionsForCode('KeyS', 'menu')).toContain('menuNext');
    expect(actionsForCode('Enter', 'menu')).toContain('menuConfirm');
    expect(actionsForCode('Space', 'menu')).toContain('menuConfirm');
    expect(actionsForCode('Escape', 'menu')).toContain('menuBack');
  });
});

describe('AT-CTRL-02 / AT-CTRL-11 held input and latching', () => {
  it('samples sub-tick presses once without clearing a physically held source', () => {
    const state = new InputState();
    state.press('ability', 'KeyE', 'hold');
    state.release('ability', 'KeyE');
    expect(state.sampleButtons('hold')).toBe(InputButton.Ability);
    expect(state.sampleButtons('hold')).toBe(0);
    state.press('fire', 'Space', 'hold');
    expect(state.sampleButtons('hold')).toBe(InputButton.Fire);
    expect(state.sampleButtons('hold')).toBe(InputButton.Fire);
    state.release('fire', 'Space');
    expect(state.sampleButtons('hold')).toBe(0);
  });
  it('keeps LMB firing when Space is released and cancels opposite movement', () => {
    const state = new InputState();
    state.press('fire', 'Space', 'hold');
    state.press('fire', 'Mouse0', 'hold');
    state.release('fire', 'Space');
    expect(state.sampleButtons('hold')).toBe(InputButton.Fire);
    state.release('fire', 'Mouse0');
    expect(state.sampleButtons('hold')).toBe(0);
    state.press('moveNorth', 'KeyW', 'hold');
    state.press('moveSouth', 'KeyS', 'hold');
    state.press('moveEast', 'KeyD', 'hold');
    expect(state.sampleMovement()).toEqual({ moveX: 127, moveY: 0 });
  });
  it('toggles on genuine presses, not repeat source presses or releases, and clears', () => {
    const state = new InputState();
    expect(state.press('fire', 'Space', 'toggle')).toBe(true);
    expect(state.press('fire', 'Space', 'toggle')).toBe(false);
    state.release('fire', 'Space');
    expect(state.sampleButtons('toggle')).toBe(InputButton.Fire);
    state.press('fire', 'Mouse0', 'toggle');
    state.release('fire', 'Mouse0');
    expect(state.sampleButtons('toggle')).toBe(0);
    state.press('fire', 'Space', 'toggle');
    state.clear();
    expect(state.sampleButtons('toggle')).toBe(0);
  });
  it('preserves simultaneous morph request bits for existing server handling (OQ-014)', () => {
    const state = new InputState();
    state.press('morphBeast', 'Digit2', 'hold');
    state.press('morphTurret', 'Digit3', 'hold');
    state.release('morphBeast', 'Digit2');
    state.release('morphTurret', 'Digit3');
    expect(state.sampleButtons('hold')).toBe(InputButton.MorphBeast |
      InputButton.MorphTurret);
  });
  it('keeps UI and extension actions out of network button bits', () => {
    const state = new InputState();
    for (const action of ['cameraView', 'menu', 'scoreboard', 'debugOverlay',
      'hitboxView', 'devConsole', 'lockToggle', 'aimNorth'] as const)
      state.press(action, action, 'hold');
    expect(state.sampleButtons('hold')).toBe(0);
  });
});

describe('AT-CTRL-03 TPP ground-plane aim', () => {
  it('computes eight directions and uint16 encoding from sim coordinates', () => {
    const directions: Array<readonly [number, number]> = [[1, 0], [1, 1], [0, 1], [-1, 1],
      [-1, 0], [-1, -1], [0, -1], [1, -1]];
    for (const [x, y] of directions) {
      const result = aimFromGround({ x, y }, { x: 0, y: 0 }, 0);
      expect(result.radians).toBeCloseTo(Math.atan2(y, x));
      expect(angleToUint16(result.radians)).toBeGreaterThanOrEqual(0);
      expect(angleToUint16(result.radians)).toBeLessThanOrEqual(65535);
    }
    expect(angleToUint16(Math.PI / 2)).toBe(16384);
    expect(angleToUint16(Math.PI)).toBe(32768);
    expect(angleToUint16(-Math.PI / 2)).toBe(49152);
  });
  it('retains previous aim within 0.75 m and handles invalid intersections', () => {
    const previous = 1.3;
    expect(aimFromGround({ x: 10.74, y: 20 }, { x: 10, y: 20 }, previous).radians)
      .toBe(previous);
    expect(aimFromGround({ x: 10.75, y: 20 }, { x: 10, y: 20 }, previous).radians)
      .toBe(0);
    expect(aimFromGround(null, { x: 0, y: 0 }, previous).radians).toBe(previous);
    expect(aimFromGround({ x: NaN, y: 0 }, { x: 0, y: 0 }, previous).radians)
      .toBe(previous);
  });
  it('uses CSS canvas offsets and dimensions before ground projection', () => {
    const points: number[][] = [];
    const camera = { groundAtNdc(x: number, y: number) {
      points.push([x, y]); return { x, y };
    } };
    expect(pointerGroundPoint(250, 175,
      { left: 100, top: 50, width: 300, height: 250 }, camera))
      .toEqual({ x: 0, y: 0 });
    expect(points).toEqual([[0, 0]]);
    expect(pointerGroundPoint(1, 1,
      { left: 0, top: 0, width: 0, height: 2 }, camera)).toBeNull();
  });
});

describe('T-034 fixed-rate and shared input packet contract', () => {
  it('runs at 30 Hz with at most four catch-up steps per animation frame', () => {
    let count = 0;
    let remaining = advanceFixedSteps(0, INPUT_STEP_MS / 2, () => { count += 1; });
    expect(count).toBe(0);
    remaining = advanceFixedSteps(remaining, INPUT_STEP_MS / 2, () => { count += 1; });
    expect(count).toBe(1);
    expect(remaining).toBeCloseTo(0);
    remaining = advanceFixedSteps(remaining, 500, () => { count += 1; });
    expect(count).toBe(5);
    expect(remaining).toBeLessThan(INPUT_STEP_MS);
  });
  it('encodes newest first through shared encode/decode with no reserved bits', () => {
    const frames: ClientInputFrame[] = [3, 2, 1].map((seq) => ({ aimDist: 120, seq,
      moveX: 127, moveY: -127, aim: 49152,
      buttons: InputButton.Fire | InputButton.Ability, aimSource: AimSource.Mouse }));
    const packet = encodeInputPacket(frames);
    expect(packet).not.toBeNull();
    const decoded = decodeInputPacket(packet);
    expect(decoded.packetValid).toBe(true);
    expect(decoded.frames).toEqual(frames);
  });
});
