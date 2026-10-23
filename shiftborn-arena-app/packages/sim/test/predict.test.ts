import {
  AimSource,
  BALANCE,
  DERIVED,
  Form,
  GREYBOX_V1,
  GUN_IDS,
  InputButton,
  Phase,
  type InputFrame,
  type MapData,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import {
  localPredictStateFromPlayer,
  predictStep,
  type LocalPredictState,
} from '../src/predict.js';
import { step } from '../src/step.js';
import type { PlayerRecord } from '../src/player.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

const playerSpec = { id: 'local', name: 'Local', isBot: false, seat: 0 };
const map: MapData = {
  ...TEST_OPEN,
  id: 'prediction_open',
  spawnPoints: GREYBOX_V1.spawnPoints,
};
const wallMap: MapData = {
  ...map,
  id: 'prediction_wall',
  walls: [
    ...map.walls,
    { id: 'inner', box: [0, -10, 1, 10] },
  ],
  cover: [{ id: 'cover', box: [-8, -2, -7, 2] }],
};

function setup(seed: number, selectedMap = map) {
  const world = makeTestWorld({
    seed,
    map: selectedMap,
    players: [playerSpec],
    unlockAllForms: true,
    armAllGuns: true,
  });
  // D-068 conditional equivalence excludes exogenous pickups; loot tests cover authority.
  world.loot = [];
  world.phase = Phase.Playing;
  world.phaseEndTick = world.tick + DERIVED.match.durationTicks;
  const player = world.players[0];
  if (player === null || player === undefined) throw new Error('missing player');
  player.protectedEndTick = world.tick;
  return { world, player };
}

function frame(seq: number, buttons = 0, moveX = 0, moveY = 0, aim = 0): InputFrame {
  return { aimDist: 120, seq, buttons, moveX, moveY, aim, aimSource: AimSource.Mouse };
}

function predictable(player: PlayerRecord | LocalPredictState) {
  return {
    alive: player.alive,
    pos: player.pos,
    vel: player.vel,
    aim: player.aim,
    aimDistM: player.aimDistM, sprinting: player.sprinting,
    form: player.form,
    morph: player.morph,
    morphReadyTick: player.morphReadyTick,
    ability: player.ability,
    abilityReadyTick: player.abilityReadyTick,
    unlocked: player.unlocked,
    guns: player.guns,
    selectedTier: player.selectedTier,
    gunTimers: player.gunTimers,
    reload: player.reload,
    swapReadyTick: player.swapReadyTick,
    melee: player.melee,
    heat: player.heat,
    overheatEndTick: player.overheatEndTick,
    stunEndTick: player.stunEndTick,
    ccImmuneEndTick: player.ccImmuneEndTick,
    knockback: player.knockback,
    protectedEndTick: player.protectedEndTick,
    lastInputSeq: player.lastInputSeq,
    lastButtonInputSeq: player.lastButtonInputSeq,
    lastHeldButtons: player.lastHeldButtons,
    lastShotInputSeq: player.lastShotInputSeq,
    nextShotIdx: player.nextShotIdx,
    aimSource: player.aimSource,
  };
}

function predicted(local: LocalPredictState): ReturnType<typeof predictable> {
  return predictable(local);
}

function assertSame(
  local: LocalPredictState,
  player: PlayerRecord,
  detail: string,
): void {
  const expected = predictable(player);
  const actual = predicted(local);
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
      throw new Error(
        `${detail}; field=${key}; predicted=${JSON.stringify(actual[key])}; server=${JSON.stringify(expected[key])}`,
      );
    }
  }
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

describe('T-040 GR-15 local prediction equivalence', () => {
  it('AT-NET-21 matches the full server step on 1,000 distinct seeded persistent sequences, every tick', () => {
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const selectedMap = seed % 2 === 0 ? wallMap : map;
      const { world, player } = setup(seed, selectedMap);
      const random = rng(seed);
      player.pos = { x: (random() - 0.5) * 58, y: (random() - 0.5) * 58 };
      player.form = [Form.Runner, Form.Beast, Form.Turret][seed % 3] ?? Form.Runner;
      player.flux = [0, BALANCE.morph.costBeast, BALANCE.flux.max][seed % 3] ?? 0;
      player.fluxRegenAnchor = player.flux;
      player.fluxRegenTicks = 0;
      if (player.form === Form.Turret) player.vel = { x: 0, y: 0 };
      if (seed % 11 === 0) player.stunEndTick = 4;
      // D-075/D-076 loadouts: tier 1, unarmed (dagger), tier 2, nearly empty magazines.
      const loadout = seed % 4;
      if (loadout === 1) {
        for (const gun of GUN_IDS) player.guns[gun] = { owned: false, mag: 0, reserve: 0 };
        player.selectedTier = { runner: 0, beast: 0, turret: 0 };
      } else if (loadout === 2) {
        player.selectedTier = { runner: 2, beast: 2, turret: 2 };
      } else if (loadout === 3) {
        for (const gun of GUN_IDS)
          player.guns[gun] = { owned: true, mag: 1 + (seed % 2), reserve: 3 };
      }
      let local = localPredictStateFromPlayer(player);
      let previous = frame(0);
      for (let sequence = 0; sequence < 48; sequence += 1) {
        const tick = world.tick;
        const repeat = sequence > 0 && random() < 0.12;
        const morphRoll = random();
        const morph =
          morphRoll < 0.045
            ? InputButton.MorphRunner
            : morphRoll < 0.09
              ? InputButton.MorphBeast
              : morphRoll < 0.135
                ? InputButton.MorphTurret
                : morphRoll < 0.15
                  ? InputButton.MorphRunner | InputButton.MorphTurret
                  : 0;
        const buttons =
          morph |
          (random() < 0.17 ? InputButton.Ability : 0) |
          (random() < 0.38 ? InputButton.Fire : 0) |
          (random() < 0.06 ? InputButton.Reload : 0) |
          (random() < 0.06 ? InputButton.Swap : 0) |
          (random() < 0.05 ? InputButton.Dagger : 0) |
          (random() < 0.3 ? InputButton.Sprint : 0);
        const axis = [-127, -90, 0, 90, 127];
        const input = repeat
          ? previous
          : frame(
              previous.seq + 1,
              buttons,
              axis[Math.floor(random() * axis.length)] ?? 0,
              axis[Math.floor(random() * axis.length)] ?? 0,
              Math.floor(random() * 65536),
            );
        previous = input;
        // The reference has regenerated Flux; this is an explicit exogenous
        // authority feed, while every predicted transition stays persistent.
        local = { ...local, authoritativeFlux: player.flux, provisionalMorphCost: 0 };
        const pressed = !repeat && random() < 0.02
          ? InputButton.MorphBeast | InputButton.MorphTurret
          : undefined;
        const context = { tick, phase: world.phase, cover: world.cover, pressedButtons: pressed };
        const next = predictStep(local, input, world.map, context);
        const events = step(world, [input], {
          inputPressedButtonsBySeat: pressed === undefined ? undefined : [pressed],
        });
        const detail = `seed=${seed} sequence=${sequence} tick=${tick} input=${JSON.stringify(input)} pressed=${pressed}`;
        assertSame(next, player, detail);
        const serverShots = events.filter((event) => event.type === 'projectileSpawn');
        expect(next.shotsThisTick, detail).toEqual(
          serverShots.map((event) => ({
            inputSeq: event.inputSeq,
            shotIdx: event.shotIdx,
            form: player.form,
            weapon: event.weapon,
            angle: event.angle,
          })),
        );
        local = next;
      }
    }
  // The 48,000-tick deterministic sweep can exceed the 5 s default under suite load.
  }, 30_000);

  it('GR-10.2 keeps Flux gains authoritative and exposes an affordability boundary', () => {
    const { world, player } = setup(5001);
    player.flux = BALANCE.morph.costBeast - DERIVED.flux.regenPerTick;
    player.fluxRegenAnchor = player.flux;
    let local = localPredictStateFromPlayer(player);
    local = predictStep(local, frame(1), world.map, {
      tick: world.tick,
      phase: world.phase,
      cover: world.cover,
    });
    step(world, [frame(1)], {});
    expect(local.authoritativeFlux).toBeLessThan(BALANCE.morph.costBeast);
    expect(player.flux).toBeGreaterThanOrEqual(BALANCE.morph.costBeast);
    const request = frame(2, InputButton.MorphBeast);
    const predictedWithoutPatch = predictStep(local, request, world.map, {
      tick: world.tick,
      phase: world.phase,
      cover: world.cover,
    });
    step(world, [request], {});
    expect(predictedWithoutPatch.morph).toBeNull();
    expect(player.morph?.target).toBe(Form.Beast);
  });

  it('GR-5.4 uses old-form aim on completion and GR-8.2 resumes movement after Dash', () => {
    const { world, player } = setup(5003);
    player.flux = BALANCE.flux.max;
    player.fluxRegenAnchor = player.flux;
    player.pos = { x: 0, y: 0 };
    let local = localPredictStateFromPlayer(player);
    const advance = (input: InputFrame) => {
      local = {
        ...local,
        authoritativeFlux: player.flux,
        provisionalMorphCost: 0,
      };
      local = predictStep(local, input, world.map, {
        tick: world.tick,
        phase: world.phase,
        cover: world.cover,
      });
      step(world, [input], {});
      assertSame(local, player, `targeted tick=${world.tick} input=${JSON.stringify(input)}`);
    };
    advance(frame(1, InputButton.MorphTurret));
    for (let tick = 1; tick <= DERIVED.morph.durationTicks; tick += 1)
      advance(frame(tick + 1, 0, 0, 0, 32768));
    expect(player.form).toBe(Form.Turret);
    expect(local.aim).toBe(Math.PI);
    advance(frame(DERIVED.morph.durationTicks + 2, 0, 0, 0, 0));
    expect(local.aim - Math.PI).toBeCloseTo(
      DERIVED.forms.turret.turnRateRadPerTick,
      12,
    );

    const dash = setup(5004);
    dash.player.pos = { x: 0, y: 0 };
    let dashLocal = localPredictStateFromPlayer(dash.player);
    for (let tick = 0; tick <= DERIVED.abilities.dash.durationTicks; tick += 1) {
      const input = frame(tick + 1, tick === 0 ? InputButton.Ability : 0, 127);
      dashLocal = predictStep(dashLocal, input, dash.world.map, {
        tick: dash.world.tick,
        phase: dash.world.phase,
        cover: dash.world.cover,
      });
      step(dash.world, [input], {});
      assertSame(dashLocal, dash.player, `dash tick=${tick}`);
    }
    expect(dashLocal.ability).toBeNull();
    expect(dashLocal.pos.x).toBeGreaterThan(BALANCE.abilities.dash.distanceM);
  });

  it('GR-7.14 suppresses firing on the overheat tick and uses current cover flags', () => {
    const hot = setup(5005);
    hot.player.form = Form.Turret;
    hot.player.heat = BALANCE.weapons.railRepeater.heatMaxS - DERIVED.tick.secondsPerTick;
    hot.player.pos = { x: 0, y: 0 };
    const hotLocal = predictStep(
      localPredictStateFromPlayer(hot.player),
      frame(1, InputButton.Fire),
      hot.world.map,
      { tick: hot.world.tick, phase: hot.world.phase, cover: hot.world.cover },
    );
    const events = step(hot.world, [frame(1, InputButton.Fire)], {});
    assertSame(hotLocal, hot.player, 'overheat boundary');
    expect(events.some((event) => event.type === 'overheat')).toBe(true);
    expect(events.some((event) => event.type === 'projectileSpawn')).toBe(false);
    expect(hotLocal.shotsThisTick).toEqual([]);

    for (const intact of [true, false]) {
      const collision = setup(5006, wallMap);
      collision.player.pos = { x: -9, y: 0 };
      const cover = collision.world.cover[0];
      if (cover === undefined) throw new Error('missing cover');
      cover.intact = intact;
      let local = localPredictStateFromPlayer(collision.player);
      for (let tick = 0; tick < DERIVED.abilities.dash.durationTicks; tick += 1) {
        const input = frame(tick + 1, tick === 0 ? InputButton.Ability : 0, 127);
        local = predictStep(local, input, collision.world.map, {
          tick: collision.world.tick,
          phase: collision.world.phase,
          cover: collision.world.cover,
        });
        step(collision.world, [input], {});
        assertSame(local, collision.player, `cover intact=${intact} tick=${tick}`);
      }
      expect(local.pos.x).toBe(intact ? -8 - BALANCE.forms.runner.radiusM : -3);
    }
  });

  it('D-064 preserves held edges and applies a merged ambiguity without stopping other controls', () => {
    const { world, player } = setup(5007);
    player.flux = BALANCE.flux.max;
    player.fluxRegenAnchor = player.flux;
    let local = localPredictStateFromPlayer(player);
    const inputs = [
      frame(1, InputButton.MorphRunner, 127),
      frame(1, InputButton.MorphRunner, 127),
      frame(2, InputButton.MorphRunner | InputButton.MorphBeast | InputButton.Fire, 127),
      frame(3, 0),
      frame(4, InputButton.MorphBeast),
    ];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      if (input === undefined) throw new Error('missing input');
      const pressed = index === 2
        ? InputButton.MorphBeast | InputButton.MorphTurret
        : undefined;
      local = { ...local, authoritativeFlux: player.flux, provisionalMorphCost: 0 };
      local = predictStep(local, input, world.map, {
        tick: world.tick,
        phase: world.phase,
        cover: world.cover,
        pressedButtons: pressed,
      });
      const events = step(world, [input], {
        inputPressedButtonsBySeat: pressed === undefined ? undefined : [pressed],
      });
      assertSame(local, player, `merged index=${index}`);
      if (index === 2) {
        expect(events.some((event) => event.type === 'morphStart')).toBe(false);
        expect(events.some((event) => event.type === 'projectileSpawn')).toBe(true);
      }
    }
    expect(local.morph?.target).toBe(Form.Beast);
  });

  it('GR-4.8/4.10 and GR-9.2 follow walls, bounds and authoritative forced movement', () => {
    const { world, player } = setup(5008, wallMap);
    player.pos = { x: -2, y: -3 };
    let local = localPredictStateFromPlayer(player);
    for (let tick = 0; tick < 30; tick += 1) {
      if (tick === 12) {
        // A server-applied knockback is an exogenous status, not a client hit.
        player.knockback = {
          vel: { x: -BALANCE.forms.runner.speedMps, y: 0 },
          endTick: world.tick + DERIVED.abilities.ramCharge.knockbackDurationTicks,
        };
        local = {
          ...local,
          knockback: {
            vel: { ...player.knockback.vel },
            endTick: player.knockback.endTick,
          },
        };
      }
      const input = frame(tick + 1, 0, 127, 127);
      local = predictStep(local, input, world.map, {
        tick: world.tick,
        phase: world.phase,
        cover: world.cover,
      });
      step(world, [input], {});
      assertSame(local, player, `wall/forced tick=${tick}`);
      if (tick === 11) {
        expect(local.pos.x).toBeLessThanOrEqual(-BALANCE.forms.runner.radiusM);
        expect(local.pos.y).toBeGreaterThan(-3);
      }
    }
    player.pos = { x: map.playable.maxX - BALANCE.forms.runner.radiusM, y: 0 };
    local = { ...local, pos: { ...player.pos } };
    const boundaryInput = frame(31, 0, 127);
    local = predictStep(local, boundaryInput, world.map, {
      tick: world.tick,
      phase: world.phase,
      cover: world.cover,
    });
    step(world, [boundaryInput], {});
    assertSame(local, player, 'bounds');
    expect(local.pos.x).toBe(map.playable.maxX - BALANCE.forms.runner.radiusM);
  });

  it('GR-8.2 cancels Dash on an authoritative stun without predicting its cause', () => {
    const { world, player } = setup(5011);
    player.pos = { x: 0, y: 0 };
    const start = frame(1, InputButton.Ability, 127);
    let local = predictStep(localPredictStateFromPlayer(player), start, world.map, {
      tick: world.tick,
      phase: world.phase,
      cover: world.cover,
    });
    step(world, [start], {});
    assertSame(local, player, 'Dash start');
    player.stunEndTick = world.tick + DERIVED.abilities.ramCharge.wallStunTicks;
    local = { ...local, stunEndTick: player.stunEndTick };
    const duringStun = frame(2, InputButton.Ability, 127);
    local = predictStep(local, duringStun, world.map, {
      tick: world.tick,
      phase: world.phase,
      cover: world.cover,
    });
    const events = step(world, [duringStun], {});
    assertSame(local, player, 'Dash cancellation');
    expect(local.ability).toBeNull();
    expect(events.some((event) => event.type === 'abilityEnd')).toBe(true);
    expect(local.abilityReadyTick[Form.Runner]).toBe(
      1 + DERIVED.abilities.dash.cooldownTicks,
    );
  });

  it('D-069 allocates repeated-sequence shots, resets on a new sequence, and indexes Scatter pellets', () => {
    const { world, player } = setup(5009);
    player.pos = { x: 0, y: 0 };
    let local = localPredictStateFromPlayer(player);
    const held = frame(1, InputButton.Fire);
    const observed: number[] = [];
    for (let tick = 0; tick < 2 * BALANCE.tick.rateHz; tick += 1) {
      local = predictStep(local, held, world.map, {
        tick: world.tick,
        phase: world.phase,
        cover: world.cover,
      });
      const events = step(world, [held], {});
      assertSame(local, player, `repeated shot tick=${tick}`);
      observed.push(...local.shotsThisTick.map((shot) => shot.shotIdx));
      expect(local.shotsThisTick.map((shot) => shot.shotIdx)).toEqual(
        events
          .filter((event) => event.type === 'projectileSpawn')
          .map((event) => event.shotIdx),
      );
    }
    expect(observed.length).toBeGreaterThan(1);
    expect(observed).toEqual(observed.map((_, index) => index));
    const freshSequence = frame(2, InputButton.Fire);
    let firstNewShot: number | undefined;
    for (let tick = 0; tick < BALANCE.tick.rateHz; tick += 1) {
      local = predictStep(local, freshSequence, world.map, {
        tick: world.tick,
        phase: world.phase,
        cover: world.cover,
      });
      const resetEvents = step(world, [freshSequence], {});
      assertSame(local, player, `new shot sequence tick=${tick}`);
      expect(local.shotsThisTick.map((shot) => shot.shotIdx)).toEqual(
        resetEvents
          .filter((event) => event.type === 'projectileSpawn')
          .map((event) => event.shotIdx),
      );
      if (local.shotsThisTick.length > 0) {
        firstNewShot = local.shotsThisTick[0]?.shotIdx;
        break;
      }
    }
    expect(firstNewShot).toBe(0);

    const scatter = setup(5010);
    scatter.player.form = Form.Beast;
    scatter.player.pos = { x: 0, y: 0 };
    const input = frame(1, InputButton.Fire);
    const predicted = predictStep(
      localPredictStateFromPlayer(scatter.player),
      input,
      scatter.world.map,
      { tick: scatter.world.tick, phase: scatter.world.phase, cover: scatter.world.cover },
    );
    step(scatter.world, [input], {});
    assertSame(predicted, scatter.player, 'Scatter indices');
    expect(predicted.shotsThisTick.map((shot) => shot.shotIdx)).toEqual(
      DERIVED.weapons.scatterCannon.pelletOffsetsRad.map((_, index) => index),
    );
  });

  it('GR-4/5/7/8 is deterministic, immutable and creates no authoritative side effects', () => {
    const { world, player } = setup(5002, wallMap);
    player.pos = { x: -2, y: 0 };
    const local = localPredictStateFromPlayer(player);
    const input = frame(1, InputButton.Fire | InputButton.Ability, 127);
    const beforeLocal = structuredClone(local);
    const beforeInput = structuredClone(input);
    const beforeMap = structuredClone(world.map);
    const beforeCover = structuredClone(world.cover);
    const beforeWorld = JSON.stringify(world);
    const context = { tick: world.tick, phase: world.phase, cover: world.cover };
    const one = predictStep(local, input, world.map, context);
    const two = predictStep(local, input, world.map, context);
    expect(one).toEqual(two);
    expect(one).not.toBe(local);
    expect(one.pos).not.toBe(local.pos);
    expect(one.gunTimers).not.toBe(local.gunTimers);
    expect(one.guns).not.toBe(local.guns);
    expect(one.guns.pulsePistol).not.toBe(local.guns.pulsePistol);
    expect(one.selectedTier).not.toBe(local.selectedTier);
    expect(local).toEqual(beforeLocal);
    expect(input).toEqual(beforeInput);
    expect(world.map).toEqual(beforeMap);
    expect(world.cover).toEqual(beforeCover);
    expect(JSON.stringify(world)).toBe(beforeWorld);
    expect(world.projectiles).toHaveLength(0);
    expect(player.hpFrac).toBe(1);
    expect(one.pos).not.toBe(two.pos);
    expect(one.gunTimers).not.toBe(two.gunTimers);
    expect(one.guns.pulsePistol).not.toBe(two.guns.pulsePistol);
    const shotOnly = predictStep(
      local,
      frame(1, InputButton.Fire),
      world.map,
      context,
    );
    expect(shotOnly.shotsThisTick).toHaveLength(1);
    expect(world.projectiles).toHaveLength(0);
  });
});
