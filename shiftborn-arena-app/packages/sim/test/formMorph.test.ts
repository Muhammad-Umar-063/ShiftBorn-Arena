import {
  AimSource,
  BALANCE,
  DERIVED,
  Form,
  GREYBOX_V1,
  InputButton,
  MorphDenialReason,
  Phase,
  type InputFrame,
  type MapData,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { formStats } from '../src/formStats.js';
import { createMapRuntime } from '../src/map/collisionIndex.js';
import { integrateCircleMotion } from '../src/movement.js';
import {
  cancelMorphOnDeath,
  dueMorphCompletion,
  evaluateMorphRequest,
  morphCost,
  morphKnockbackImmune,
  resetMorphForRespawn,
} from '../src/morph.js';
import { resetPlayerForMatch } from '../src/player.js';
import { step } from '../src/step.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';

const openMap: MapData = {
  ...GREYBOX_V1,
  id: 'morph_open',
  walls: [],
  cover: [],
};
const firstSeat = { id: 'first', name: 'First', isBot: false, seat: 0 };
const secondSeat = { id: 'second', name: 'Second', isBot: false, seat: 1 };

function input(buttons: number, seq: number, moveX = 0): InputFrame {
  return { seq, moveX, moveY: 0, aim: 0, buttons, aimSource: AimSource.Mouse };
}

function playingWorld(players = [firstSeat]) {
  const world = makeTestWorld({ seed: 14, map: openMap, players });
  world.tick = DERIVED.match.countdownTicks;
  step(world, [], {});
  expect(world.phase).toBe(Phase.Playing);
  const player = world.players[0];
  if (player === null || player === undefined)
    throw new Error('missing player');
  player.pos = { x: 0, y: 0 };
  return { world, player };
}

describe('GR-4.1 form statistics', () => {
  it('AT-FORM-01 uses the BALANCE-backed values without changing shared data', () => {
    const before = structuredClone(BALANCE);
    for (const form of [Form.Runner, Form.Beast, Form.Turret]) {
      expect(formStats(form)).toBe(BALANCE.forms[form]);
      expect(formStats(form)).toMatchObject({
        maxHp: BALANCE.forms[form].maxHp,
        speedMps: BALANCE.forms[form].speedMps,
        radiusM: BALANCE.forms[form].radiusM,
        knockbackMult: BALANCE.forms[form].knockbackMult,
        zonePointsMult: BALANCE.forms[form].zonePointsMult,
        cameraZoom: BALANCE.forms[form].cameraZoom,
      });
    }
    expect([
      formStats(Form.Runner).maxHp,
      formStats(Form.Beast).maxHp,
      formStats(Form.Turret).maxHp,
    ]).toEqual([80, 140, 110]);
    expect([
      formStats(Form.Runner).radiusM,
      formStats(Form.Beast).radiusM,
      formStats(Form.Turret).radiusM,
    ]).toEqual([0.6, 1, 0.9]);
    expect([
      formStats(Form.Runner).speedMps,
      formStats(Form.Beast).speedMps,
      formStats(Form.Turret).speedMps,
    ]).toEqual([8.5, 6, 0]);
    expect(BALANCE).toEqual(before);
  });
});

describe('GR-5 morphing', () => {
  it('AT-MORPH-01 spends immediately and completes on the exact duration tick', () => {
    const { world, player } = playingWorld();
    const balanceBefore = structuredClone(BALANCE);
    const startTick = world.tick;
    const started = [...step(world, [input(InputButton.MorphBeast, 1)], {})];
    const endTick = startTick + DERIVED.morph.durationTicks;
    expect(morphCost(Form.Beast)).toBe(BALANCE.morph.costBeast);
    expect(started).toEqual([
      {
        type: 'morphStart',
        seat: 0,
        from: Form.Runner,
        to: Form.Beast,
        endTick,
      },
    ]);
    expect(player.flux).toBe(BALANCE.flux.start - BALANCE.morph.costBeast);
    expect(player.form).toBe(Form.Runner);
    expect(player.morph).toEqual({ target: Form.Beast, endTick });
    while (world.tick < endTick) {
      expect(step(world, [input(InputButton.MorphBeast, 1)], {})).toEqual([]);
      expect(player.form).toBe(Form.Runner);
    }
    const ended = [...step(world, [input(InputButton.MorphBeast, 1)], {})];
    expect(ended).toEqual([{ type: 'morphEnd', seat: 0, form: Form.Beast }]);
    expect(player.form).toBe(Form.Beast);
    expect(player.morph).toBeNull();
    expect(player.morphReadyTick).toBe(endTick + DERIVED.morph.cooldownTicks);
    expect(BALANCE).toEqual(balanceBefore);
  });

  it('AT-MORPH-02 returning to Runner costs no Flux', () => {
    const { world, player } = playingWorld();
    player.form = Form.Beast;
    player.flux = 0;
    expect(morphCost(Form.Runner)).toBe(BALANCE.morph.costRunner);
    expect(step(world, [input(InputButton.MorphRunner, 1)], {})).toEqual([
      {
        type: 'morphStart',
        seat: 0,
        from: Form.Beast,
        to: Form.Runner,
        endTick: world.tick - 1 + DERIVED.morph.durationTicks,
      },
    ]);
    expect(player.flux).toBe(0);
  });

  it('AT-MORPH-03 preserves hpFrac exactly across a max-HP change', () => {
    const { world, player } = playingWorld();
    player.hpFrac = 0.5;
    step(world, [input(InputButton.MorphBeast, 1)], {});
    expect(player.hpFrac).toBe(0.5);
    const endTick = player.morph?.endTick;
    if (endTick === undefined) throw new Error('morph missing');
    world.tick = endTick;
    step(world, [input(0, 2)], {});
    expect(player.form).toBe(Form.Beast);
    expect(player.hpFrac).toBe(0.5);
    expect(player.hpFrac * formStats(player.form).maxHp).toBe(70);
  });

  it('AT-MORPH-04 keeps a small fraction bit-for-bit over ten full cycles', () => {
    const { world, player } = playingWorld();
    const fraction = 1 / BALANCE.forms.runner.maxHp;
    player.hpFrac = fraction;
    let seq = 1;
    for (let cycle = 0; cycle < 10; cycle += 1) {
      player.flux = BALANCE.flux.max;
      step(world, [input(InputButton.MorphBeast, seq++)], {});
      const beastEnd = player.morph?.endTick;
      if (beastEnd === undefined) throw new Error('Beast morph missing');
      world.tick = beastEnd;
      step(world, [input(0, seq++)], {});
      expect(player.form).toBe(Form.Beast);
      expect(player.hpFrac).toBe(fraction);
      expect(Math.ceil(player.hpFrac * formStats(player.form).maxHp)).toBe(2);
      world.tick = player.morphReadyTick;
      step(world, [input(InputButton.MorphRunner, seq++)], {});
      const runnerEnd = player.morph?.endTick;
      if (runnerEnd === undefined) throw new Error('Runner morph missing');
      world.tick = runnerEnd;
      step(world, [input(0, seq++)], {});
      expect(player.form).toBe(Form.Runner);
      expect(player.hpFrac).toBe(fraction);
      expect(Math.ceil(player.hpFrac * formStats(player.form).maxHp)).toBe(1);
      world.tick = player.morphReadyTick;
    }
  });

  it('AT-MORPH-05 denies tick 89 and allows tick 90 after morph end', () => {
    const { world, player } = playingWorld();
    step(world, [input(InputButton.MorphBeast, 1)], {});
    const endTick = player.morph?.endTick;
    if (endTick === undefined) throw new Error('morph missing');
    world.tick = endTick;
    step(world, [input(0, 2)], {});
    player.flux = BALANCE.flux.max;
    world.tick = endTick + DERIVED.morph.cooldownTicks - 1;
    expect(step(world, [input(InputButton.MorphTurret, 3)], {})).toEqual([
      {
        type: 'morphDenied',
        seat: 0,
        target: Form.Turret,
        reason: MorphDenialReason.Cooldown,
      },
    ]);
    expect(player.morph).toBeNull();
    world.tick = endTick + DERIVED.morph.cooldownTicks;
    expect(step(world, [input(InputButton.MorphRunner, 4)], {})).toEqual([
      {
        type: 'morphStart',
        seat: 0,
        from: Form.Beast,
        to: Form.Runner,
        endTick: world.tick - 1 + DERIVED.morph.durationTicks,
      },
    ]);
  });

  it('AT-MORPH-06 distinguishes Flux 34.9 from 35', () => {
    const { world, player } = playingWorld();
    player.flux = BALANCE.morph.costTurret - 0.1;
    expect(step(world, [input(InputButton.MorphTurret, 1)], {})).toEqual([
      {
        type: 'morphDenied',
        seat: 0,
        target: Form.Turret,
        reason: MorphDenialReason.Flux,
      },
    ]);
    step(world, [input(0, 2)], {});
    player.flux = BALANCE.morph.costTurret;
    expect(step(world, [input(InputButton.MorphTurret, 3)], {})[0]?.type).toBe(
      'morphStart',
    );
    expect(player.flux).toBe(0);
  });

  it('AT-MORPH-07 keeps old-form stats, movement, knockback immunity, and cooldown state', () => {
    const { world, player } = playingWorld();
    player.hpFrac = 0.5;
    player.abilityReadyTick = { runner: 23, beast: 456, turret: 789 };
    player.weapon.runner.nextShotIn = 1.5;
    player.weapon.beast.nextShotIn = 2.5;
    player.weapon.turret.nextShotIn = 3.5;
    const abilityBefore = structuredClone(player.abilityReadyTick);
    const weaponsBefore = structuredClone(player.weapon);
    step(world, [input(InputButton.MorphBeast, 1, 127)], {});
    expect(player.form).toBe(Form.Runner);
    expect(formStats(player.form).maxHp).toBe(BALANCE.forms.runner.maxHp);
    expect(formStats(player.form).radiusM).toBe(BALANCE.forms.runner.radiusM);
    expect(formStats(player.form).knockbackMult).toBe(
      BALANCE.forms.runner.knockbackMult,
    );
    expect(morphKnockbackImmune(player)).toBe(true);
    const wallMap = createMapRuntime({
      ...openMap,
      walls: [{ id: 'morph-wall', box: [0, -10, 1, 10] }],
    });
    const touching = integrateCircleMotion(
      { ...player, pos: { x: -BALANCE.forms.runner.radiusM - 0.01, y: 0 } },
      { x: DERIVED.movement.accelMpsPerTick, y: 0 },
      wallMap,
      [],
    );
    expect(touching.pos.x).toBeCloseTo(-BALANCE.forms.runner.radiusM, 12);
    player.knockback = { vel: { x: -20, y: 0 }, endTick: world.tick + 10 };
    for (let seq = 2; seq <= 4; seq += 1) step(world, [input(0, seq, 127)], {});
    expect(player.vel.x).toBe(
      BALANCE.forms.runner.speedMps * BALANCE.morph.moveMult,
    );
    expect(player.pos.x).toBeGreaterThan(0);
    expect(player.hpFrac).toBe(0.5);
    expect(player.abilityReadyTick).toEqual(abilityBefore);
    expect(player.weapon).toEqual(weaponsBefore);
    const endTick = player.morph?.endTick;
    if (endTick === undefined) throw new Error('morph missing');
    world.tick = endTick;
    player.knockback = null;
    step(world, [input(0, 5)], {});
    expect(morphKnockbackImmune(player)).toBe(false);
    expect(player.abilityReadyTick).toEqual(abilityBefore);
    expect(player.weapon).toEqual(weaponsBefore);
  });

  it('AT-MORPH-08 roots Turret through morph, then Runner accelerates', () => {
    const { world, player } = playingWorld();
    player.form = Form.Turret;
    player.vel = { x: BALANCE.forms.runner.speedMps, y: 0 };
    step(world, [input(InputButton.MorphRunner, 1, 127)], {});
    expect(player.vel).toEqual({ x: 0, y: 0 });
    const endTick = player.morph?.endTick;
    if (endTick === undefined) throw new Error('morph missing');
    let seq = 2;
    while (world.tick < endTick) {
      step(world, [input(InputButton.MorphRunner, seq++, 127)], {});
      expect(player.pos).toEqual({ x: 0, y: 0 });
      expect(player.vel).toEqual({ x: 0, y: 0 });
    }
    step(world, [input(InputButton.MorphRunner, seq++, 127)], {});
    expect(player.form).toBe(Form.Runner);
    expect(player.vel.x).toBe(DERIVED.movement.accelMpsPerTick);
  });

  it('AT-MORPH-09 cancels on death without refund and exposes a Runner respawn seam', () => {
    const { world, player } = playingWorld();
    step(world, [input(InputButton.MorphBeast, 1)], {});
    const spentFlux = player.flux;
    const before = structuredClone(player);
    cancelMorphOnDeath(player);
    expect(player.morph).toBeNull();
    expect(player.flux).toBe(spentFlux);
    expect(before.morph).not.toBeNull();
    player.form = Form.Beast;
    resetMorphForRespawn(player, world.tick + DERIVED.match.respawnTicks);
    expect(player.form).toBe(Form.Runner);
    expect(player.morphReadyTick).toBe(world.tick + DERIVED.match.respawnTicks);
    expect(player.flux).toBe(spentFlux);
    player.morph = { target: Form.Turret, endTick: world.tick + 1 };
    player.alive = false;
    step(world, [], {});
    expect(player.morph).toBeNull();
    expect(player.flux).toBe(spentFlux);
  });

  it('AT-MORPH-10 makes current-form requests silent before every validation', () => {
    const { world, player } = playingWorld();
    player.alive = false;
    player.flux = 0;
    player.morphReadyTick = world.tick + 100;
    player.stunEndTick = world.tick + 100;
    player.knockback = { vel: { x: 1, y: 0 }, endTick: world.tick + 100 };
    player.ability = {};
    const same = evaluateMorphRequest(
      player,
      Form.Runner,
      Phase.Results,
      world.tick,
    );
    expect(same).toEqual({ kind: 'sameForm' });
    expect(step(world, [input(InputButton.MorphRunner, 1)], {})).toEqual([]);
    expect(player.flux).toBe(0);
  });

  it('AT-MORPH-11 denies COUNTDOWN and RESULTS requests by phase', () => {
    const world = makeTestWorld({
      seed: 41,
      map: openMap,
      players: [firstSeat],
    });
    const player = world.players[0];
    if (player === null || player === undefined)
      throw new Error('missing player');
    expect(step(world, [input(InputButton.MorphBeast, 1)], {})).toEqual([
      {
        type: 'morphDenied',
        seat: 0,
        target: Form.Beast,
        reason: MorphDenialReason.Phase,
      },
    ]);
    step(world, [input(0, 2)], {});
    world.phase = Phase.Results;
    world.phaseEndTick = world.tick + 100;
    const lastAppliedSeq = player.lastInputSeq;
    expect(step(world, [input(InputButton.MorphTurret, 3)], {})).toEqual([
      {
        type: 'morphDenied',
        seat: 0,
        target: Form.Turret,
        reason: MorphDenialReason.Phase,
      },
    ]);
    expect(player.lastInputSeq).toBe(lastAppliedSeq);
    expect(player.morph).toBeNull();
    expect(step(world, [input(InputButton.MorphRunner, 4)], {})).toEqual([]);
  });

  it('GR-5.2 gives Busy for each blocked state in documented order', () => {
    const { world, player } = playingWorld();
    const target = Form.Beast;
    const decide = () =>
      evaluateMorphRequest(player, target, world.phase, world.tick);
    player.alive = false;
    expect(decide()).toEqual({
      kind: 'denied',
      reason: MorphDenialReason.Busy,
    });
    player.alive = true;
    player.morph = { target: Form.Turret, endTick: world.tick + 10 };
    expect(decide()).toEqual({
      kind: 'denied',
      reason: MorphDenialReason.Busy,
    });
    player.morph = null;
    player.morphReadyTick = world.tick + 1;
    player.stunEndTick = world.tick + 10;
    expect(decide()).toEqual({
      kind: 'denied',
      reason: MorphDenialReason.Cooldown,
    });
    player.morphReadyTick = world.tick;
    expect(decide()).toEqual({
      kind: 'denied',
      reason: MorphDenialReason.Busy,
    });
    player.stunEndTick = world.tick;
    player.knockback = { vel: { x: 1, y: 0 }, endTick: world.tick + 10 };
    expect(decide()).toEqual({
      kind: 'denied',
      reason: MorphDenialReason.Busy,
    });
    player.knockback = null;
    player.ability = {};
    expect(decide()).toEqual({
      kind: 'denied',
      reason: MorphDenialReason.Busy,
    });
    player.ability = null;
    player.flux = 0;
    expect(decide()).toEqual({
      kind: 'denied',
      reason: MorphDenialReason.Flux,
    });
    expect(
      evaluateMorphRequest(player, target, Phase.Countdown, world.tick),
    ).toEqual({ kind: 'denied', reason: MorphDenialReason.Phase });
  });

  it('GR-5.2 emits Busy denial events for dead, morphing, stun, knockback, and ability', () => {
    for (const blocked of [
      'dead',
      'morph',
      'stun',
      'knockback',
      'ability',
    ] as const) {
      const { world, player } = playingWorld();
      switch (blocked) {
        case 'dead':
          player.alive = false;
          break;
        case 'morph':
          player.morph = { target: Form.Turret, endTick: world.tick + 10 };
          break;
        case 'stun':
          player.stunEndTick = world.tick + 10;
          break;
        case 'knockback':
          player.knockback = { vel: { x: 1, y: 0 }, endTick: world.tick + 10 };
          break;
        case 'ability':
          player.ability = {};
          break;
      }
      expect(step(world, [input(InputButton.MorphBeast, 1)], {})).toEqual([
        {
          type: 'morphDenied',
          seat: 0,
          target: Form.Beast,
          reason: MorphDenialReason.Busy,
        },
      ]);
    }
  });

  it('GR-5.1 creates edges on press and repress, never on hold, duplicate, or stale input', () => {
    const { world, player } = playingWorld();
    player.flux = BALANCE.flux.max;
    expect(step(world, [input(InputButton.MorphBeast, 1)], {})[0]?.type).toBe(
      'morphStart',
    );
    expect(step(world, [input(InputButton.MorphBeast, 1)], {})).toEqual([]);
    expect(step(world, [input(InputButton.MorphBeast, 2)], {})).toEqual([]);
    expect(step(world, [input(InputButton.MorphTurret, 2)], {})).toEqual([]);
    expect(step(world, [input(InputButton.MorphTurret, 1)], {})).toEqual([]);
    expect(player.lastHeldButtons).toBe(InputButton.MorphBeast);
    expect(step(world, [input(0, 3)], {})).toEqual([]);
    expect(step(world, [input(InputButton.MorphTurret, 4)], {})).toEqual([
      {
        type: 'morphDenied',
        seat: 0,
        target: Form.Turret,
        reason: MorphDenialReason.Busy,
      },
    ]);
    expect(step(world, [input(InputButton.MorphTurret, 5)], {})).toEqual([]);
    expect(player.lastButtonInputSeq).toBe(5);
  });

  it('GR-5.4 completes all seats before processing new requests in seat order', () => {
    const { world } = playingWorld([firstSeat, secondSeat]);
    const first = world.players[0];
    const second = world.players[1];
    if (
      first === null ||
      first === undefined ||
      second === null ||
      second === undefined
    )
      throw new Error('missing players');
    first.flux = BALANCE.flux.max;
    second.flux = BALANCE.flux.max;
    expect(
      step(
        world,
        [input(InputButton.MorphBeast, 1), input(InputButton.MorphTurret, 1)],
        {},
      ),
    ).toEqual([
      {
        type: 'morphStart',
        seat: 0,
        from: Form.Runner,
        to: Form.Beast,
        endTick: world.tick - 1 + DERIVED.morph.durationTicks,
      },
      {
        type: 'morphStart',
        seat: 1,
        from: Form.Runner,
        to: Form.Turret,
        endTick: world.tick - 1 + DERIVED.morph.durationTicks,
      },
    ]);
    const due = first.morph?.endTick;
    if (due === undefined) throw new Error('morph missing');
    world.tick = due - 1;
    step(world, [input(0, 2), input(0, 2)], {});
    expect(dueMorphCompletion(first, world.tick)).not.toBeNull();
    world.tick = due;
    expect(
      step(
        world,
        [input(InputButton.MorphTurret, 3), input(InputButton.MorphRunner, 3)],
        {},
      ),
    ).toEqual([
      { type: 'morphEnd', seat: 0, form: Form.Beast },
      { type: 'morphEnd', seat: 1, form: Form.Turret },
      {
        type: 'morphDenied',
        seat: 0,
        target: Form.Turret,
        reason: MorphDenialReason.Cooldown,
      },
      {
        type: 'morphDenied',
        seat: 1,
        target: Form.Runner,
        reason: MorphDenialReason.Cooldown,
      },
    ]);
  });

  it('GR-5.8 drops an unfinished morph at RESULTS without an end event or refund', () => {
    const { world, player } = playingWorld();
    step(world, [input(InputButton.MorphBeast, 1)], {});
    const spentFlux = player.flux;
    world.tick = world.phaseEndTick;
    expect(step(world, [], {})).toEqual([{ type: 'phase' }]);
    expect(world.phase).toBe(Phase.Results);
    expect(player.morph).toBeNull();
    expect(player.form).toBe(Form.Runner);
    expect(player.flux).toBe(spentFlux);
    resetPlayerForMatch(player, world.tick);
    expect(player.form).toBe(Form.Runner);
    expect(player.morph).toBeNull();
  });

  it('GR-5.1 keeps held-button history across match reset', () => {
    const { world, player } = playingWorld();
    step(world, [input(InputButton.MorphBeast, 1)], {});
    world.tick = world.phaseEndTick;
    step(world, [], {});
    world.tick = world.phaseEndTick;
    step(world, [], {});
    expect(world.phase).toBe(Phase.Countdown);
    expect(player.form).toBe(Form.Runner);
    expect(player.lastHeldButtons).toBe(InputButton.MorphBeast);
    world.tick = world.phaseEndTick;
    expect(step(world, [input(InputButton.MorphBeast, 2)], {})).toEqual([
      { type: 'phase' },
    ]);
    expect(player.morph).toBeNull();
  });

  it('OQ-014 isolates simultaneous targets without choosing a form', () => {
    const { world, player } = playingWorld();
    const flux = player.flux;
    expect(
      step(
        world,
        [input(InputButton.MorphBeast | InputButton.MorphTurret, 1)],
        {},
      ),
    ).toEqual([]);
    expect(player.morph).toBeNull();
    expect(player.flux).toBe(flux);
    step(world, [input(0, 2)], {});
    expect(step(world, [input(InputButton.MorphBeast, 3)], {})[0]?.type).toBe(
      'morphStart',
    );
  });
});
