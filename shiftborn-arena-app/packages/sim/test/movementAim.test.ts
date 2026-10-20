import {
  AimSource,
  BALANCE,
  DERIVED,
  Form,
  GREYBOX_V1,
  Phase,
  type InputFrame,
  type MapData,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { advanceAim } from '../src/aim.js';
import { circleBoxPushOut } from '../src/math/geometry.js';
import {
  advanceMovement,
  decodeMoveDirection,
  integrateCircleMotion,
  moveTowardVelocity,
  targetVelocity,
} from '../src/movement.js';
import { createMapRuntime } from '../src/map/collisionIndex.js';
import { nextFloat, sfc32 } from '../src/rng.js';
import { step } from '../src/step.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';

const openMap: MapData = {
  ...GREYBOX_V1,
  id: 'movement_open',
  walls: [],
  cover: [],
};
const wall = { id: 'wall', box: [0, -10, 1, 10] as const };
const wallMap: MapData = { ...openMap, id: 'movement_wall', walls: [wall] };
const coverBox = { id: 'cover', box: [0, -10, 1, 10] as const };
const coverMap: MapData = {
  ...openMap,
  id: 'movement_cover',
  cover: [coverBox],
};
const participant = { id: 'p0', name: 'P0', isBot: false, seat: 0 };

function frame(moveX = 0, moveY = 0, aim = 0, seq = 1): InputFrame {
  return { seq, moveX, moveY, aim, buttons: 0, aimSource: AimSource.Mouse };
}

function playerWorld(map: MapData = openMap) {
  const world = makeTestWorld({ seed: 23, map, players: [participant] });
  const player = world.players[0];
  if (player === null || player === undefined)
    throw new Error('missing fixture player');
  player.pos = { x: -5, y: 0 };
  return { world, player };
}

describe('GR-4 movement and aim', () => {
  it('AT-MOV-01 GR-4.4 accelerates and decelerates by vector magnitude', () => {
    const { world, player } = playerWorld();
    for (const expected of [2, 4, 6, 8, BALANCE.forms.runner.speedMps]) {
      step(world, [frame(127, 0, 0, world.tick + 1)], {});
      expect(player.vel.x).toBeCloseTo(expected, 12);
      expect(player.vel.y).toBe(0);
    }
    step(world, [frame(0, 0, 0, world.tick + 1)], {});
    expect(player.vel.x).toBeCloseTo(
      BALANCE.forms.runner.speedMps - DERIVED.movement.accelMpsPerTick,
      12,
    );
    const turned = moveTowardVelocity({ x: 2, y: 0 }, { x: 0, y: 2 });
    expect(turned.x).toBeCloseTo(2 - Math.SQRT2, 12);
    expect(turned.y).toBeCloseTo(Math.SQRT2, 12);
  });

  it('AT-MOV-02 GR-4.2 normalizes only diagonals beyond unit length', () => {
    const { world, player } = playerWorld();
    expect(decodeMoveDirection(64, 0)).toEqual({ x: 64 / 127, y: 0 });
    const diagonal = decodeMoveDirection(127, 127);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 12);
    for (let tick = 0; tick < 5; tick += 1)
      step(world, [frame(127, 127, 0, tick + 1)], {});
    expect(Math.hypot(player.vel.x, player.vel.y)).toBeCloseTo(
      BALANCE.forms.runner.speedMps,
      12,
    );
  });

  it('AT-MOV-03 GR-4.3 uses Beast speed and old-form speed during morph', () => {
    const { world, player } = playerWorld();
    player.form = Form.Beast;
    for (let tick = 0; tick < 3; tick += 1)
      step(world, [frame(127, 0, 0, tick + 1)], {});
    expect(player.vel.x).toBe(BALANCE.forms.beast.speedMps);
    player.form = Form.Runner;
    player.morph = { target: Form.Beast, endTick: world.tick + 10 };
    player.vel = { x: 0, y: 0 };
    expect(targetVelocity(player, { x: 1, y: 0 }).x).toBe(
      BALANCE.forms.runner.speedMps * BALANCE.morph.moveMult,
    );
    for (let tick = 0; tick < 3; tick += 1)
      step(world, [frame(127, 0, 0, world.tick + 1)], {});
    expect(player.vel.x).toBe(
      BALANCE.forms.runner.speedMps * BALANCE.morph.moveMult,
    );
  });

  it('AT-MOV-04 GR-4.5 Turret is rooted and velocity becomes zero', () => {
    const { world, player } = playerWorld();
    player.form = Form.Turret;
    player.vel = { x: 8, y: 0 };
    const before = { ...player.pos };
    step(world, [frame(127, 0)], {});
    expect(player.pos).toEqual(before);
    expect(player.vel).toEqual({ x: 0, y: 0 });
    expect(
      advanceMovement(player, { x: 1, y: 0 }, world.map, world.cover, false, {
        x: 12,
        y: 0,
      }).pos,
    ).toEqual(before);
  });

  it('AT-MOV-05 GR-4.8 slides along a wall and respects intact cover', () => {
    const runtime = createMapRuntime(wallMap);
    const initial = {
      pos: { x: -BALANCE.forms.runner.radiusM - 0.01, y: 0 },
      form: Form.Runner,
    };
    const slid = integrateCircleMotion(initial, { x: 6, y: 6 }, runtime, []);
    expect(slid.pos.x).toBeCloseTo(-BALANCE.forms.runner.radiusM, 12);
    expect(slid.pos.y).toBeGreaterThan(0);
    expect(slid.vel.x).toBeCloseTo(0, 12);
    expect(slid.vel.y).toBeCloseTo(6, 12);
    expect(
      circleBoxPushOut(slid.pos, BALANCE.forms.runner.radiusM, wall.box),
    ).toBeNull();
    const coverRuntime = createMapRuntime(coverMap);
    const blocked = integrateCircleMotion(
      initial,
      { x: 6, y: 0 },
      coverRuntime,
      [{ id: 'cover', intact: true }],
    );
    const clear = integrateCircleMotion(initial, { x: 6, y: 0 }, coverRuntime, [
      { id: 'cover', intact: false },
    ]);
    expect(blocked.pos.x).toBeCloseTo(-BALANCE.forms.runner.radiusM, 12);
    expect(clear.pos.x).toBeGreaterThan(blocked.pos.x);
  });

  it('AT-MOV-06 GR-4.7 prevents tunneling over 1,000 seeded wall approaches', () => {
    const runtime = createMapRuntime(wallMap);
    const rng = sfc32(1306, 0);
    const radius = BALANCE.forms.runner.radiusM;
    const dashSpeed =
      BALANCE.abilities.dash.distanceM / BALANCE.abilities.dash.durationS;
    const knockbackSpeed =
      BALANCE.abilities.ramCharge.knockbackM /
      BALANCE.abilities.ramCharge.knockbackDurationS;
    for (let approach = 0; approach < 1000; approach += 1) {
      const angle = (nextFloat(rng) - 0.5) * (Math.PI / 2);
      const speed = approach % 2 === 0 ? dashSpeed : knockbackSpeed;
      let state = {
        pos: {
          x: -radius - 0.01 - nextFloat(rng),
          y: (nextFloat(rng) - 0.5) * 10,
        },
        form: Form.Runner,
      };
      let velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
      for (
        let tick = 0;
        tick < DERIVED.abilities.dash.durationTicks;
        tick += 1
      ) {
        const result = integrateCircleMotion(state, velocity, runtime, []);
        state = { pos: result.pos, form: Form.Runner };
        velocity = result.vel;
        expect(state.pos.x).toBeLessThanOrEqual(-radius + 1e-9);
        expect(circleBoxPushOut(state.pos, radius, wall.box)).toBeNull();
      }
    }
  });

  it('AT-MOV-07 GR-4.9 players pass through one another', () => {
    const world = makeTestWorld({
      seed: 24,
      map: openMap,
      players: [participant, { id: 'p1', name: 'P1', isBot: false, seat: 1 }],
    });
    const first = world.players[0];
    const second = world.players[1];
    if (
      first === null ||
      first === undefined ||
      second === null ||
      second === undefined
    )
      throw new Error('missing players');
    first.pos = { x: -0.01, y: 0 };
    second.pos = { x: 0.01, y: 0 };
    first.vel = { x: 6, y: 0 };
    second.vel = { x: -6, y: 0 };
    step(world, [frame(127, 0), frame(-127, 0)], {});
    expect(first.pos.x).toBeGreaterThan(second.pos.x);
  });

  it('AT-MOV-08 GR-4.10 clamps by current radius and emits once with finite values', () => {
    for (const form of [Form.Runner, Form.Beast, Form.Turret]) {
      const { world, player } = playerWorld();
      player.form = form;
      player.pos = {
        x: openMap.playable.maxX + 2,
        y: openMap.playable.maxY + 2,
      };
      const events = step(world, [frame()], {});
      const radius =
        form === Form.Runner
          ? BALANCE.forms.runner.radiusM
          : form === Form.Beast
            ? BALANCE.forms.beast.radiusM
            : BALANCE.forms.turret.radiusM;
      expect(player.pos).toEqual({
        x: openMap.playable.maxX - radius,
        y: openMap.playable.maxY - radius,
      });
      expect(
        events.filter((event) => event.type === 'positionClamped'),
      ).toHaveLength(1);
      expect(
        Number.isFinite(player.pos.x) && Number.isFinite(player.pos.y),
      ).toBe(true);
      expect(
        step(world, [frame(0, 0, 0, 2)], {}).filter(
          (event) => event.type === 'positionClamped',
        ),
      ).toHaveLength(0);
    }
    const run = () => {
      const { world, player } = playerWorld();
      const rng = sfc32(808, 0);
      const positions = [];
      for (let tick = 0; tick < 120; tick += 1) {
        player.form =
          [Form.Runner, Form.Beast, Form.Turret][tick % 3] ?? Form.Runner;
        const moveX = Math.round((nextFloat(rng) * 2 - 1) * 127);
        const moveY = Math.round((nextFloat(rng) * 2 - 1) * 127);
        step(world, [frame(moveX, moveY, 0, tick + 1)], {});
        const radius =
          player.form === Form.Runner
            ? BALANCE.forms.runner.radiusM
            : player.form === Form.Beast
              ? BALANCE.forms.beast.radiusM
              : BALANCE.forms.turret.radiusM;
        expect(
          Number.isFinite(player.pos.x) && Number.isFinite(player.pos.y),
        ).toBe(true);
        expect(player.pos.x).toBeGreaterThanOrEqual(
          openMap.playable.minX + radius,
        );
        expect(player.pos.x).toBeLessThanOrEqual(
          openMap.playable.maxX - radius,
        );
        expect(player.pos.y).toBeGreaterThanOrEqual(
          openMap.playable.minY + radius,
        );
        expect(player.pos.y).toBeLessThanOrEqual(
          openMap.playable.maxY - radius,
        );
        positions.push({ ...player.pos });
      }
      return positions;
    };
    expect(run()).toEqual(run());
  });

  it('AT-FORM-02 GR-4.12 sets Runner and Beast aim instantly, including old form during morph', () => {
    const { world, player } = playerWorld();
    const target = 16384;
    step(world, [frame(0, 0, target)], {});
    expect(player.aim).toBeCloseTo(Math.PI / 2, 12);
    player.form = Form.Beast;
    step(world, [frame(0, 0, 32768, 2)], {});
    expect(player.aim).toBeCloseTo(Math.PI, 12);
    player.form = Form.Runner;
    player.morph = { target: Form.Turret, endTick: world.tick + 10 };
    step(world, [frame(0, 0, 0, 3)], {});
    expect(player.aim).toBe(0);
  });

  it('AT-FORM-03 GR-4.13 caps Turret turn and chooses counter-clockwise exact-π ties', () => {
    const { world, player } = playerWorld();
    player.form = Form.Turret;
    for (let tick = 1; tick <= 45; tick += 1) {
      step(world, [frame(0, 0, 32768, tick)], {});
      expect(player.aim).toBeCloseTo(
        tick * DERIVED.forms.turret.turnRateRadPerTick,
        10,
      );
    }
    expect(player.aim).toBeCloseTo(Math.PI, 10);
    expect(advanceAim({ aim: Math.PI, form: Form.Turret }, 0)).toBeCloseTo(
      Math.PI + DERIVED.forms.turret.turnRateRadPerTick,
      10,
    );
    player.aim = (359 / 180) * Math.PI;
    step(world, [frame(0, 0, Math.round(65536 / 360), 46)], {});
    expect(player.aim).toBeCloseTo((1 / 180) * Math.PI, 3);
    player.aim = 0;
    player.morph = { target: Form.Runner, endTick: world.tick + 10 };
    step(world, [frame(0, 0, 32768, 47)], {});
    expect(player.aim).toBeCloseTo(DERIVED.forms.turret.turnRateRadPerTick, 12);
  });

  it('AT-FORM-04 GR-4.14 freezes for stun/control but not knockback alone', () => {
    const { world, player } = playerWorld();
    player.stunEndTick = world.tick + 2;
    const before = { ...player.pos };
    step(world, [frame(127, 0, 16384)], {});
    expect(player.pos).toEqual(before);
    expect(player.vel).toEqual({ x: 0, y: 0 });
    expect(player.aim).toBe(0);
    expect(advanceAim(player, 16384, true)).toBe(0);
    expect(
      advanceMovement(player, { x: 1, y: 0 }, world.map, world.cover, true).pos,
    ).toEqual(before);
    player.stunEndTick = world.tick;
    player.knockback = { vel: { x: 4, y: 0 }, endTick: world.tick + 2 };
    step(world, [frame(0, 0, 16384, 2)], {});
    expect(player.aim).toBeCloseTo(Math.PI / 2, 12);
    expect(player.pos.x).toBeGreaterThan(before.x);
  });

  it('GR-4.6/4.14 dead players keep position and aim while velocity clears', () => {
    const { world, player } = playerWorld();
    player.alive = false;
    player.vel = { x: 6, y: 0 };
    const before = { ...player.pos };
    step(world, [frame(127, 0, 16384)], {});
    expect(player.pos).toEqual(before);
    expect(player.vel).toEqual({ x: 0, y: 0 });
    expect(player.aim).toBe(0);
  });

  it('AT-MATCH-03 GR-2.2 allows COUNTDOWN move/aim and blocks RESULTS', () => {
    const { world, player } = playerWorld();
    expect(world.phase).toBe(Phase.Countdown);
    step(world, [frame(127, 0, 16384)], {});
    expect(player.vel.x).toBe(2);
    expect(player.aim).toBeCloseTo(Math.PI / 2, 12);
    const before = { ...player.pos };
    world.phase = Phase.Results;
    world.phaseEndTick = world.tick + 100;
    step(world, [frame(127, 0, 32768, 2)], {});
    expect(player.pos).toEqual(before);
    expect(player.vel).toEqual({ x: 0, y: 0 });
    expect(player.aim).toBeCloseTo(Math.PI / 2, 12);
    expect(player.lastInputSeq).toBe(1);
  });

  it('GR-4.2–4.15 pure helpers leave their inputs unchanged', () => {
    const { world, player } = playerWorld(coverMap);
    const before = structuredClone(player);
    const mapBefore = structuredClone(world.map);
    const coverBefore = structuredClone(world.cover);
    const direction = Object.freeze({ x: 1, y: 0 });
    const velocity = Object.freeze({ x: 6, y: 0 });
    targetVelocity(player, direction);
    advanceAim(player, 16384);
    moveTowardVelocity(velocity, { x: 0, y: 0 });
    integrateCircleMotion(player, velocity, world.map, world.cover);
    advanceMovement(player, direction, world.map, world.cover);
    expect(player).toEqual(before);
    expect(world.map).toEqual(mapBefore);
    expect(world.cover).toEqual(coverBefore);
  });
});
