import {
  BALANCE,
  Cause,
  DERIVED,
  Form,
  GREYBOX_V1,
  Mode,
  Phase,
  type MapData,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { applyDamage } from '../src/damage.js';
import { finalizeDeaths } from '../src/death.js';
import {
  createDeathDrop,
  deathFluxAmounts,
  insideBlockingGeometry,
  nudgeDropPoint,
} from '../src/deathDrops.js';
import { gainFlux, regenerateFlux } from '../src/flux.js';
import { hashWorld } from '../src/hash.js';
import { startMatch } from '../src/match.js';
import { removePlayer } from '../src/player.js';
import { respawnDuePlayers } from '../src/respawn.js';
import { nextFloat } from '../src/rng.js';
import {
  ShardKind,
  advanceClusterSchedule,
  advanceFluxAndShards,
  expireDroppedShards,
  pickUpShards,
  setupClusters,
  spawnCluster,
  spawnShard,
} from '../src/shards.js';
import { step } from '../src/step.js';
import type { ClusterState, PlayerRecord, World } from '../src/world.js';
import { createWorld } from '../src/world.js';
import { makeTestWorld } from './fixtures/makeTestWorld.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

const emptyShardMap: MapData = {
  ...TEST_OPEN,
  spawnPoints: GREYBOX_V1.spawnPoints,
};
const players = [
  { id: 'killer', name: 'Killer', isBot: false, seat: 0 },
  { id: 'victim', name: 'Victim', isBot: false, seat: 1 },
  { id: 'assist', name: 'Assist', isBot: false, seat: 2 },
  { id: 'other', name: 'Other', isBot: false, seat: 3 },
];

function seated(world: World, seat: number): PlayerRecord {
  const player = world.players[seat];
  if (player === null || player === undefined)
    throw new Error('missing player');
  return player;
}

function playing(count = 1, map: MapData = emptyShardMap): World {
  const world = makeTestWorld({
    seed: 18,
    map,
    players: players.slice(0, count),
  });
  world.phase = Phase.Playing;
  world.phaseEndTick = 10_000;
  world.events.length = 0;
  for (let seat = 0; seat < count; seat += 1) {
    const player = seated(world, seat);
    player.protectedEndTick = world.tick;
    player.pos = { x: seat * 8, y: 0 };
  }
  return world;
}

function putShard(
  world: World,
  x: number,
  y: number,
  value: number = BALANCE.flux.largeShard,
) {
  return spawnShard(world, {
    x,
    y,
    value,
    kind: ShardKind.Large,
    expiresTick: 0,
    clusterId: null,
  });
}

function kill(world: World, killer: PlayerRecord, victim: PlayerRecord): void {
  victim.hpFrac = 1e-3;
  const result = applyDamage(
    world,
    { id: killer.id, seat: killer.seat, name: killer.name, form: killer.form },
    victim,
    BALANCE.weapons.pulsePistol.damage,
    1,
    { x: -1, y: 0 },
    Cause.PulsePistol,
  );
  expect(result.lethal).toBe(true);
}

describe('T-018 Flux and shard rules', () => {
  it('AT-FLUX-01 GR-10.2 adds exactly one after 30 PLAYING ticks and gates by phase and life', () => {
    const world = playing();
    const player = seated(world, 0);
    player.flux = BALANCE.flux.start;
    for (let tick = 0; tick < BALANCE.tick.rateHz; tick += 1)
      step(world, [], {});
    expect(player.flux).toBe(BALANCE.flux.start + BALANCE.flux.regenPerS);
    world.phase = Phase.Countdown;
    world.phaseEndTick = world.tick + DERIVED.match.countdownTicks;
    const before = player.flux;
    step(world, [], {});
    expect(player.flux).toBe(before);
    world.phase = Phase.Results;
    world.phaseEndTick = world.tick + DERIVED.match.resultsTicks;
    step(world, [], {});
    expect(player.flux).toBe(before);
    world.phase = Phase.Playing;
    world.phaseEndTick = 10_000;
    player.alive = false;
    step(world, [], {});
    expect(player.flux).toBe(before);
    player.alive = true;
    player.flux = BALANCE.flux.max;
    regenerateFlux(world);
    expect(player.flux).toBe(BALANCE.flux.max);
    const respawned = playing();
    const returning = seated(respawned, 0);
    returning.alive = false;
    returning.respawnTick = respawned.tick;
    returning.respawnFlux = BALANCE.flux.respawnFloor;
    step(respawned, [], {});
    expect(returning.alive).toBe(true);
    expect(returning.flux).toBe(
      BALANCE.flux.respawnFloor + DERIVED.flux.regenPerTick,
    );
  });

  it('GR-10.1 gainFlux clamps every source and permits fractional gains without changing other state', () => {
    const world = playing();
    const player = seated(world, 0);
    player.flux = 95;
    const health = player.hpFrac;
    gainFlux(player, 0.25);
    expect(player.flux).toBe(95.25);
    gainFlux(player, BALANCE.flux.largeShard);
    expect(player.flux).toBe(BALANCE.flux.max);
    player.flux = -1;
    gainFlux(player, 0);
    expect(player.flux).toBe(0);
    expect(player.hpFrac).toBe(health);
    expect(() => gainFlux(player, Number.NaN)).toThrow(RangeError);
  });

  it('AT-FLUX-02 GR-10.1/D-021 consumes capped shards and reports full value', () => {
    for (const startingFlux of [95, BALANCE.flux.max]) {
      const world = playing();
      const player = seated(world, 0);
      player.flux = startingFlux;
      const shard = putShard(world, player.pos.x, player.pos.y);
      const events = step(world, [], {});
      expect(player.flux).toBe(BALANCE.flux.max);
      expect(world.shards).toEqual([]);
      expect(events).toContainEqual({
        type: 'shardPickup',
        shardId: shard.id,
        seat: player.seat,
        value: BALANCE.flux.largeShard,
      });
    }
  });

  it('GR-10.7 pickups have no extra phase gate beyond life and distance', () => {
    for (const phase of [Phase.Countdown, Phase.Results]) {
      const world = playing();
      const player = seated(world, 0);
      world.phase = phase;
      player.flux = 0;
      const shard = putShard(world, player.pos.x, player.pos.y);
      world.events.length = 0;
      advanceFluxAndShards(world);
      expect(player.flux).toBe(shard.value);
      expect(world.events).toEqual([
        {
          type: 'shardPickup',
          shardId: shard.id,
          seat: player.seat,
          value: shard.value,
        },
      ]);
    }
  });

  it('AT-FLUX-03 GR-10.3 rewards living killer/assisters, caps gains, and preserves dead credit', () => {
    const world = playing(4);
    const killer = seated(world, 0);
    const victim = seated(world, 1);
    const assister = seated(world, 2);
    const deadAssister = seated(world, 3);
    victim.flux = 0;
    victim.damageLog = [
      { attackerId: deadAssister.id, tick: world.tick, amount: 1 },
      { attackerId: assister.id, tick: world.tick, amount: 1 },
    ];
    deadAssister.alive = false;
    killer.flux = 50;
    assister.flux = 60;
    const deadFlux = deadAssister.flux;
    kill(world, killer, victim);
    finalizeDeaths(world);
    expect(killer.flux).toBe(50 + BALANCE.flux.ko);
    expect(assister.flux).toBe(60 + BALANCE.flux.assist);
    expect(deadAssister.flux).toBe(deadFlux);
    expect(deadAssister.stats.assists).toBe(1);
    expect(killer.stats.kos).toBe(1);
    const capped = playing(3);
    seated(capped, 1).flux = 0;
    seated(capped, 0).flux = BALANCE.flux.max - 1;
    seated(capped, 2).flux = BALANCE.flux.max - 1;
    seated(capped, 1).damageLog = [
      { attackerId: 'assist', tick: 0, amount: 1 },
    ];
    kill(capped, seated(capped, 0), seated(capped, 1));
    finalizeDeaths(capped);
    expect(seated(capped, 0).flux).toBe(BALANCE.flux.max);
    expect(seated(capped, 2).flux).toBe(BALANCE.flux.max);
    const deadKiller = playing(2);
    seated(deadKiller, 1).flux = 0;
    const deadOwner = seated(deadKiller, 0);
    deadOwner.alive = false;
    const before = deadOwner.flux;
    kill(deadKiller, deadOwner, seated(deadKiller, 1));
    finalizeDeaths(deadKiller);
    expect(deadOwner.stats.kos).toBe(1);
    expect(deadOwner.flux).toBe(before);
  });

  it('AT-FLUX-04 GR-10.5 initializes three distinct five-shard clusters in fixed order', () => {
    const mapBefore = structuredClone(GREYBOX_V1);
    const balanceBefore = structuredClone(BALANCE);
    const first = createWorld({
      map: GREYBOX_V1,
      roomSeed: 19,
      mode: Mode.Frenzy,
    });
    const second = createWorld({
      map: GREYBOX_V1,
      roomSeed: 19,
      mode: Mode.Frenzy,
    });
    expect(first.clusters).toEqual(second.clusters);
    expect(first.shards).toEqual(second.shards);
    expect(first.clusters).toHaveLength(BALANCE.shards.activeClusters);
    expect(
      new Set(first.clusters.map((cluster) => cluster.pointIndex)).size,
    ).toBe(BALANCE.shards.activeClusters);
    expect(first.shards).toHaveLength(
      BALANCE.shards.activeClusters *
        (BALANCE.shards.clusterLarge + BALANCE.shards.clusterSmall),
    );
    expect(first.shards.map((shard) => shard.id)).toEqual(
      Array.from({ length: first.shards.length }, (_, id) => id),
    );
    for (const cluster of first.clusters) {
      const point = GREYBOX_V1.shardPoints[cluster.pointIndex];
      if (point === undefined) throw new Error('missing point');
      expect(
        first.shards.filter((shard) => shard.clusterId === cluster.id),
      ).toMatchObject([
        {
          x: point.x,
          y: point.y,
          value: BALANCE.flux.largeShard,
          kind: ShardKind.Large,
          expiresTick: 0,
        },
        {
          x: point.x + BALANCE.shards.clusterOffsetM,
          y: point.y,
          value: BALANCE.flux.smallShard,
          kind: ShardKind.Small,
          expiresTick: 0,
        },
        {
          x: point.x - BALANCE.shards.clusterOffsetM,
          y: point.y,
          value: BALANCE.flux.smallShard,
          kind: ShardKind.Small,
          expiresTick: 0,
        },
        {
          x: point.x,
          y: point.y + BALANCE.shards.clusterOffsetM,
          value: BALANCE.flux.smallShard,
          kind: ShardKind.Small,
          expiresTick: 0,
        },
        {
          x: point.x,
          y: point.y - BALANCE.shards.clusterOffsetM,
          value: BALANCE.flux.smallShard,
          kind: ShardKind.Small,
          expiresTick: 0,
        },
      ]);
    }
    expect(
      first.events
        .filter((event) => event.type === 'shardSpawn')
        .map((event) => event.shardId),
    ).toEqual(first.shards.map((shard) => shard.id));
    expect(GREYBOX_V1).toEqual(mapBefore);
    expect(BALANCE).toEqual(balanceBefore);
    const empty = createWorld({
      map: TEST_OPEN,
      roomSeed: 19,
      mode: Mode.Frenzy,
    });
    expect(empty.clusters).toEqual([]);
    expect(empty.shards).toEqual([]);
    const malformed = {
      ...TEST_OPEN,
      shardPoints: GREYBOX_V1.shardPoints.slice(0, 1),
    };
    expect(() =>
      createWorld({ map: malformed, roomSeed: 19, mode: Mode.Frenzy }),
    ).toThrow(RangeError);
  });

  it('AT-FLUX-05 GR-10.6 waits 150 ticks, announces and reserves, then spawns at +90', () => {
    const world = makeTestWorld({ seed: 20, players: players.slice(0, 1) });
    world.phase = Phase.Playing;
    world.phaseEndTick = 10_000;
    world.tick = 10;
    world.events.length = 0;
    const collector = seated(world, 0);
    const cluster = world.clusters[0];
    if (cluster === undefined) throw new Error('missing cluster');
    const emptiedPoint = cluster.pointIndex;
    for (const shard of world.shards.filter(
      (entry) => entry.clusterId === cluster.id,
    )) {
      collector.pos = { x: shard.x, y: shard.y };
      pickUpShards(world);
    }
    expect(cluster.state).toBe('waiting');
    expect(cluster.announceTick).toBe(10 + DERIVED.shards.respawnDelayTicks);
    world.events.length = 0;
    world.tick = cluster.announceTick - 1;
    advanceClusterSchedule(world);
    expect(world.events).toEqual([]);
    world.tick += 1;
    const activePoints = world.clusters
      .filter((entry) => entry.state === 'active')
      .map((entry) => entry.pointIndex);
    advanceClusterSchedule(world);
    expect(cluster.state).toBe('announced');
    expect(cluster.pointIndex).not.toBe(emptiedPoint);
    expect(activePoints).not.toContain(cluster.pointIndex);
    expect(world.events).toEqual([
      {
        type: 'clusterAnnounce',
        pointIndex: cluster.pointIndex,
        spawnTick: world.tick + DERIVED.shards.announceTicks,
      },
    ]);
    world.events.length = 0;
    world.tick = cluster.spawnTick - 1;
    advanceClusterSchedule(world);
    expect(
      world.shards.filter((shard) => shard.clusterId === cluster.id),
    ).toEqual([]);
    expect(world.events).toEqual([]);
    world.tick += 1;
    advanceClusterSchedule(world);
    expect(cluster.state).toBe('active');
    const spawned = world.shards.filter(
      (shard) => shard.clusterId === cluster.id,
    );
    expect(spawned).toHaveLength(
      BALANCE.shards.clusterLarge + BALANCE.shards.clusterSmall,
    );
    expect(world.events).toEqual(
      spawned.map((shard) => ({ type: 'shardSpawn', shardId: shard.id })),
    );
  });

  it('GR-10.6 simultaneous cluster announcements reserve different points in slot order', () => {
    const first = createWorld({
      map: GREYBOX_V1,
      roomSeed: 21,
      mode: Mode.Frenzy,
    });
    const second = createWorld({
      map: GREYBOX_V1,
      roomSeed: 21,
      mode: Mode.Frenzy,
    });
    for (const world of [first, second]) {
      world.events.length = 0;
      world.tick = 160;
      for (const cluster of world.clusters.slice(0, 2)) {
        cluster.state = 'waiting';
        cluster.announceTick = world.tick;
      }
      world.shards = world.shards.filter(
        (shard) => shard.clusterId !== 0 && shard.clusterId !== 1,
      );
      advanceClusterSchedule(world);
    }
    const announced = first.clusters.slice(0, 2);
    expect(announced.map((cluster) => cluster.pointIndex)).toEqual(
      second.clusters.slice(0, 2).map((cluster) => cluster.pointIndex),
    );
    expect(announced[0]?.pointIndex).not.toBe(announced[1]?.pointIndex);
    expect(first.events).toEqual(second.events);
    expect(first.events.map((event) => event.type)).toEqual([
      'clusterAnnounce',
      'clusterAnnounce',
    ]);
  });

  it('AT-FLUX-06 GR-10.7 uses exact old-form radius, closest player and seat tie', () => {
    const world = playing(2);
    const first = seated(world, 0);
    const second = seated(world, 1);
    const radius =
      BALANCE.forms.runner.radiusM + BALANCE.shards.pickupExtraRadiusM;
    first.pos = { x: radius, y: 0 };
    second.alive = false;
    const exact = putShard(world, 0, 0);
    pickUpShards(world);
    expect(world.shards).not.toContain(exact);
    expect(world.events).toContainEqual({
      type: 'shardPickup',
      shardId: exact.id,
      seat: 0,
      value: exact.value,
    });
    first.pos = { x: radius + 0.01, y: 0 };
    const beyond = putShard(world, 0, 0);
    pickUpShards(world);
    expect(world.shards).toContain(beyond);
    world.shards = [];
    second.alive = true;
    first.pos = { x: 0.7, y: 0 };
    second.pos = { x: 0.5, y: 0 };
    const closer = putShard(world, 0, 0);
    pickUpShards(world);
    expect(world.events).toContainEqual({
      type: 'shardPickup',
      shardId: closer.id,
      seat: 1,
      value: closer.value,
    });
    first.pos = { x: -0.5, y: 0 };
    second.pos = { x: 0.5, y: 0 };
    const tied = putShard(world, 0, 0);
    pickUpShards(world);
    expect(world.events).toContainEqual({
      type: 'shardPickup',
      shardId: tied.id,
      seat: 0,
      value: tied.value,
    });
    first.form = Form.Runner;
    first.morph = { target: Form.Beast, endTick: 100 };
    first.protectedEndTick = 100;
    first.pos = { x: radius, y: 0 };
    second.alive = false;
    const duringMorph = putShard(world, 0, 0);
    pickUpShards(world);
    expect(world.events).toContainEqual({
      type: 'shardPickup',
      shardId: duringMorph.id,
      seat: 0,
      value: duringMorph.value,
    });
    first.pos = {
      x: BALANCE.forms.beast.radiusM + BALANCE.shards.pickupExtraRadiusM,
      y: 0,
    };
    const outsideOldForm = putShard(world, 0, 0);
    pickUpShards(world);
    expect(world.shards).toContain(outsideOldForm);
  });

  it('AT-FLUX-07 GR-10.8/10.9/10.10 uses one angle and precomputed respawn Flux', () => {
    for (const [atDeath, expectedDrop, shardValues, expectedRespawn] of [
      [63.7, 25, Array(5).fill(BALANCE.flux.smallShard), 40],
      [90, 36, [...Array(7).fill(BALANCE.flux.smallShard), 1], 54],
    ] as const) {
      const world = playing(2);
      const victim = seated(world, 1);
      victim.pos = { x: 0, y: 0 };
      victim.flux = atDeath;
      const rng = { ...world.rng };
      const startAngle = nextFloat(rng) * 2 * Math.PI;
      expect(deathFluxAmounts(atDeath)).toEqual({
        drop: expectedDrop,
        respawnFlux: expectedRespawn,
      });
      kill(world, seated(world, 0), victim);
      finalizeDeaths(world);
      expect(world.rng).toEqual(rng);
      expect(victim.respawnFlux).toBe(expectedRespawn);
      expect(world.shards.map((shard) => shard.value)).toEqual(shardValues);
      expect(
        world.shards.every(
          (shard) =>
            shard.kind === ShardKind.DeathDrop &&
            shard.clusterId === null &&
            shard.expiresTick === DERIVED.shards.dropLifetimeTicks,
        ),
      ).toBe(true);
      for (let index = 0; index < world.shards.length; index += 1) {
        const shard = world.shards[index];
        if (shard === undefined) throw new Error('missing shard');
        const angle = startAngle + (2 * Math.PI * index) / world.shards.length;
        expect(shard.x).toBeCloseTo(
          Math.cos(angle) * BALANCE.shards.dropRingRadiusM,
          12,
        );
        expect(shard.y).toBeCloseTo(
          Math.sin(angle) * BALANCE.shards.dropRingRadiusM,
          12,
        );
      }
      const collector = seated(world, 0);
      const firstDrop = world.shards[0];
      if (firstDrop === undefined) throw new Error('missing drop');
      collector.pos = { x: firstDrop.x, y: firstDrop.y };
      pickUpShards(world);
      expect(world.shards.length).toBeLessThan(shardValues.length);
      expect(victim.respawnFlux).toBe(expectedRespawn);
      world.tick = DERIVED.shards.dropLifetimeTicks;
      expireDroppedShards(world);
      expect(victim.respawnFlux).toBe(expectedRespawn);
      world.tick = victim.respawnTick;
      respawnDuePlayers(world);
      expect(victim.flux).toBe(expectedRespawn);
      expect(victim.respawnFlux).toBeNull();
    }
  });

  it('GR-10.9 zero-Flux death creates no shards and consumes no angle draw', () => {
    const world = playing(2);
    const victim = seated(world, 1);
    victim.flux = 0;
    const before = { ...world.rng };
    kill(world, seated(world, 0), victim);
    finalizeDeaths(world);
    expect(world.shards).toEqual([]);
    expect(world.rng).toEqual(before);
    expect(victim.respawnFlux).toBe(BALANCE.flux.respawnFloor);
  });

  it('GR-10.9 room departure does not create a death drop', () => {
    const world = playing(2);
    const before = { ...world.rng };
    removePlayer(world, seated(world, 1).id);
    expect(world.shards).toEqual([]);
    expect(world.rng).toEqual(before);
    expect(world.events.some((event) => event.type === 'shardSpawn')).toBe(
      false,
    );
  });

  it('GR-11.3 mutual deaths count both KOs but give no Flux rewards and deterministic drops', () => {
    function run() {
      const world = playing(2);
      const first = seated(world, 0);
      const second = seated(world, 1);
      const firstFlux = first.flux;
      const secondFlux = second.flux;
      kill(world, first, second);
      kill(world, second, first);
      finalizeDeaths(world);
      expect(first.stats.kos).toBe(1);
      expect(second.stats.kos).toBe(1);
      expect(first.flux).toBe(firstFlux);
      expect(second.flux).toBe(secondFlux);
      const { drop } = deathFluxAmounts(BALANCE.flux.start);
      const shardsPerDeath =
        Math.floor(drop / BALANCE.flux.smallShard) +
        Number(drop % BALANCE.flux.smallShard > 0);
      expect(world.shards).toHaveLength(2 * shardsPerDeath);
      expect(
        world.events
          .filter((event) => event.type === 'death')
          .map((event) => event.victimSeat),
      ).toEqual([0, 1]);
      expect(
        world.events
          .filter((event) => event.type === 'shardSpawn')
          .map((event) => event.shardId),
      ).toEqual(world.shards.map((shard) => shard.id));
      return world;
    }
    const first = run();
    const second = run();
    expect(first.shards).toEqual(second.shards);
    expect(first.events).toEqual(second.events);
    expect(hashWorld(first)).toBe(hashWorld(second));
  });

  it('GR-1.6 pickups and expiries process ascending shard ID even from reversed input', () => {
    const world = playing();
    seated(world, 0).pos = { x: 0, y: 0 };
    const a = putShard(world, 0, 0, BALANCE.flux.smallShard);
    const b = putShard(world, 0, 0, BALANCE.flux.smallShard);
    const c = putShard(world, 0, 0, BALANCE.flux.smallShard);
    world.shards.reverse();
    world.events.length = 0;
    pickUpShards(world);
    expect(
      world.events.map((event) =>
        event.type === 'shardPickup' ? event.shardId : null,
      ),
    ).toEqual([a.id, b.id, c.id]);
    const d = spawnShard(world, {
      x: 10,
      y: 0,
      value: 1,
      kind: ShardKind.DeathDrop,
      expiresTick: 1,
      clusterId: null,
    });
    const e = spawnShard(world, {
      x: 11,
      y: 0,
      value: 1,
      kind: ShardKind.DeathDrop,
      expiresTick: 1,
      clusterId: null,
    });
    world.shards.reverse();
    world.events.length = 0;
    world.tick = 1;
    expireDroppedShards(world);
    expect(world.events).toEqual([
      { type: 'shardExpire', shardId: d.id },
      { type: 'shardExpire', shardId: e.id },
    ]);
  });

  it('AT-FLUX-08 GR-10.9 nudges wall/cover hits toward death and leaves finite free points', () => {
    const map: MapData = {
      ...emptyShardMap,
      walls: [...TEST_OPEN.walls, { id: 'test-wall', box: [0.5, -2, 1.5, 2] }],
      cover: [{ id: 'test-cover', box: [-1.5, -2, -0.5, 2] }],
    };
    const world = playing(2, map);
    const victim = seated(world, 1);
    victim.pos = { x: 0, y: 0 };
    const before = structuredClone(map);
    for (const proposed of [
      { x: BALANCE.shards.dropRingRadiusM, y: 0 },
      { x: -BALANCE.shards.dropRingRadiusM, y: 0 },
      {
        x: BALANCE.shards.dropRingRadiusM * Math.cos(Math.PI / 4),
        y: BALANCE.shards.dropRingRadiusM * Math.sin(Math.PI / 4),
      },
    ]) {
      expect(insideBlockingGeometry(world, proposed)).toBe(true);
      const moved = nudgeDropPoint(world, victim.pos, proposed);
      expect(Math.hypot(moved.x, moved.y)).toBeLessThan(
        Math.hypot(proposed.x, proposed.y),
      );
      expect(Number.isFinite(moved.x) && Number.isFinite(moved.y)).toBe(true);
      expect(insideBlockingGeometry(world, moved)).toBe(false);
    }
    const dropped = deathFluxAmounts(BALANCE.flux.start).drop;
    createDeathDrop(world, victim, world.tick, dropped);
    expect(
      world.shards.every((shard) => !insideBlockingGeometry(world, shard)),
    ).toBe(true);
    expect(map).toEqual(before);
  });

  it('AT-FLUX-09 GR-10.9 expires at +450 once; pickup wins on that tick', () => {
    const world = playing();
    const player = seated(world, 0);
    player.pos = { x: 0, y: 0 };
    const cluster = putShard(world, 20, 0);
    const dropped = spawnShard(world, {
      x: 10,
      y: 0,
      value: BALANCE.flux.smallShard,
      kind: ShardKind.DeathDrop,
      expiresTick: DERIVED.shards.dropLifetimeTicks,
      clusterId: null,
    });
    world.events.length = 0;
    world.tick = DERIVED.shards.dropLifetimeTicks - 1;
    expireDroppedShards(world);
    expect(world.shards).toContain(dropped);
    expect(world.events).toEqual([]);
    world.tick += 1;
    expireDroppedShards(world);
    expect(world.shards).not.toContain(dropped);
    expect(world.shards).toContain(cluster);
    expect(world.events).toEqual([
      { type: 'shardExpire', shardId: dropped.id },
    ]);
    expireDroppedShards(world);
    expect(world.events).toHaveLength(1);
    const pickup = spawnShard(world, {
      x: player.pos.x,
      y: player.pos.y,
      value: BALANCE.flux.smallShard,
      kind: ShardKind.DeathDrop,
      expiresTick: world.tick,
      clusterId: null,
    });
    world.events.length = 0;
    advanceFluxAndShards(world);
    expect(world.shards).not.toContain(pickup);
    expect(world.events).toEqual([
      { type: 'shardPickup', shardId: pickup.id, seat: 0, value: pickup.value },
    ]);
  });

  it('GR-15 creates death drops before death event and can collect them in the same tick', () => {
    const world = playing(2);
    const killer = seated(world, 0);
    const victim = seated(world, 1);
    killer.form = Form.Beast;
    killer.pos = { x: 0, y: 0 };
    victim.pos = { x: 0, y: 0 };
    victim.flux = 63.7;
    kill(world, killer, victim);
    const events = step(world, [], {});
    const names = events.map((event) => event.type);
    const firstSpawn = names.indexOf('shardSpawn');
    const death = names.indexOf('death');
    const firstPickup = names.indexOf('shardPickup');
    expect(firstSpawn).toBeGreaterThan(names.indexOf('damage'));
    expect(death).toBeGreaterThan(firstSpawn);
    expect(firstPickup).toBeGreaterThan(death);
    expect(events.filter((event) => event.type === 'shardSpawn')).toHaveLength(
      5,
    );
    expect(events.filter((event) => event.type === 'shardPickup')).toHaveLength(
      5,
    );
    expect(world.shards).toEqual([]);
  });

  it('GR-2.5 clears prior drops and schedules, while shard lifecycle changes hash', () => {
    const world = createWorld({
      map: GREYBOX_V1,
      roomSeed: 23,
      mode: Mode.Frenzy,
    });
    const initial = hashWorld(world);
    const first = world.shards[0];
    if (first === undefined) throw new Error('missing shard');
    world.shards.splice(0, 1);
    expect(hashWorld(world)).not.toBe(initial);
    const cluster = world.clusters[0];
    if (cluster === undefined) throw new Error('missing cluster');
    cluster.state = 'waiting';
    const changed = hashWorld(world);
    expect(changed).not.toBe(initial);
    spawnShard(world, {
      x: 0,
      y: 0,
      value: 1,
      kind: ShardKind.DeathDrop,
      expiresTick: 500,
      clusterId: null,
    });
    const oldIds = world.shards.map((shard) => shard.id);
    world.events.length = 0;
    world.matchIndex += 1;
    startMatch(world);
    expect(world.clusters.every((cluster) => cluster.state === 'active')).toBe(
      true,
    );
    expect(
      world.shards.every((shard) => shard.kind !== ShardKind.DeathDrop),
    ).toBe(true);
    expect(world.shards[0]?.id).toBeGreaterThan(Math.max(...oldIds));
  });

  it('GR-10.5 exported setup/spawn helpers preserve stable order and typed events', () => {
    const world = createWorld({
      map: GREYBOX_V1,
      roomSeed: 24,
      mode: Mode.Frenzy,
    });
    world.events.length = 0;
    setupClusters(world);
    const first = world.shards[0];
    if (first === undefined) throw new Error('missing shard');
    expect(world.shards.map((shard) => shard.id)).toEqual(
      Array.from(
        { length: world.shards.length },
        (_, index) => first.id + index,
      ),
    );
    const cluster: ClusterState = {
      id: 3,
      pointIndex: 0,
      state: 'announced',
      announceTick: 0,
      spawnTick: world.tick,
    };
    spawnCluster(world, cluster);
    expect(cluster.state).toBe('active');
    expect(
      world.events.filter((event) => event.type === 'shardSpawn'),
    ).toHaveLength(
      BALANCE.shards.activeClusters *
        (BALANCE.shards.clusterLarge + BALANCE.shards.clusterSmall) +
        BALANCE.shards.clusterLarge +
        BALANCE.shards.clusterSmall,
    );
  });
});
