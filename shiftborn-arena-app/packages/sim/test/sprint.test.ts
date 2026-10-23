import { AimSource, BALANCE, DERIVED, Form, GREYBOX_V1, InputButton, Phase, encodeFacingMove, integrateAimDistance, integrateKeyboardTurn } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { canSprint } from '../src/movement.js';
import { step } from '../src/step.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

function setup() {
  const world = makeTestWorld({ seed: 49, map: { ...TEST_OPEN, spawnPoints: GREYBOX_V1.spawnPoints },
    players: [{ id: 'p', name: 'P', seat: 0, isBot: false }] });
  const player = world.players[0]; if (!player) throw new Error('missing player');
  world.phase = Phase.Playing; world.loot = []; player.pos = { x: 0, y: 0 };
  return { world, player };
}
describe('T-049 movement and aim models', () => {
  it('AT-MOV-09 normalized sprint reaches Runner 11.05 and Beast 7.8, with no diagonal boost', () => {
    for (const form of [Form.Runner, Form.Beast]) for (const diagonal of [false, true]) {
      const { world, player } = setup(); player.form = form; const aim = diagonal ? Math.PI / 4 : 0;
      for (let seq = 1; seq <= 12; seq++) step(world, [{ seq, ...encodeFacingMove(1, 0, aim),
        aim: diagonal ? 8192 : 0, aimDist: 180, aimSource: AimSource.Keys, buttons: InputButton.Sprint }], {});
      expect(Math.hypot(player.vel.x, player.vel.y)).toBeCloseTo(BALANCE.forms[form].speedMps * BALANCE.sprint.speedMult, 8);
      expect(player.sprinting).toBe(true); expect(player.aimDistM).toBe(18);
    }
  });
  it('AT-MOV-10 AT-MOV-11 sprint cone, fire priority, rooting and action exclusions', () => {
    const { player } = setup();
    const eligible = (angle = 0, buttons = InputButton.Sprint) => canSprint(player,
      { x: Math.cos(angle), y: Math.sin(angle) }, buttons, Phase.Playing, 0);
    expect(eligible(DERIVED.sprint.maxForwardAngleRad)).toBe(true);
    expect(eligible(DERIVED.sprint.maxForwardAngleRad + 0.001)).toBe(false);
    expect(eligible(0, InputButton.Sprint | InputButton.Fire)).toBe(false);
    player.form = Form.Turret; expect(eligible()).toBe(false); player.form = Form.Runner;
    player.reload = { gun: 'pulsePistol', endTick: 10 }; expect(eligible()).toBe(true);
    player.swapReadyTick = 10; expect(eligible()).toBe(true);
    player.melee = { startTick: 0, strikeTick: 3, endTick: 18 }; expect(eligible()).toBe(false); player.melee = null;
    player.stunEndTick = 1; expect(eligible()).toBe(false); player.stunEndTick = 0;
    player.knockback = { vel: { x: 1, y: 0 }, endTick: 1 }; expect(eligible()).toBe(false); player.knockback = null;
    player.morph = { target: Form.Beast, endTick: 15 }; expect(eligible()).toBe(false);
  });
  it('AT-CTRL-12 facing axes and diagonals rotate into world input', () => {
    expect(encodeFacingMove(1, 0, 0)).toEqual({ moveX: 127, moveY: 0 });
    expect(encodeFacingMove(0, 1, 0)).toEqual({ moveX: 0, moveY: -127 });
    expect(encodeFacingMove(1, 0, Math.PI / 2)).toEqual({ moveX: 0, moveY: 127 });
    expect(encodeFacingMove(1, 1, 0)).toEqual({ moveX: 90, moveY: -90 });
    expect(encodeFacingMove(0, 0, 1)).toEqual({ moveX: 0, moveY: 0 });
  });
  it('AT-CTRL-04 exact turn integral is independent of FPS; aim distance clamps', () => {
    for (const fps of [30, 60, 144]) {
      let angle = 0;
      for (let i = 0; i < 2 * fps; i++) angle += integrateKeyboardTurn(i / fps, 1 / fps);
      expect(angle).toBeCloseTo(integrateKeyboardTurn(0, 2), 10);
    }
    expect(integrateAimDistance(12, 1, 10)).toBe(24);
    expect(integrateAimDistance(12, -1, 10)).toBe(2);
    expect(integrateAimDistance(12, 0, 10)).toBe(12);
  });
});
