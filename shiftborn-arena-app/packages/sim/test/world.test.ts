import { BALANCE, DERIVED, GREYBOX_V1, Mode, Phase } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { TEST_OPEN } from './fixtures/testOpen.js';
import { createWorld, type World } from '../src/world.js';
import { hashWorld } from '../src/hash.js';
import { emitEvent } from '../src/events.js';
import { nextFloat } from '../src/rng.js';
import { createPlayer } from '../src/player.js';
import { projectileRecord } from './fixtures/projectileRecord.js';
import { ShardKind } from '../src/shards.js';

describe('GR-1.5 deterministic world skeleton', () => {
  it('createWorld starts with structural defaults and does not mutate the map', () => {
    const mapBefore = JSON.stringify(TEST_OPEN);
    const world = createWorld({
      map: TEST_OPEN,
      roomSeed: 42,
      mode: Mode.Frenzy,
    });
    expect(world).toMatchObject({
      tick: 0,
      phase: Phase.Countdown,
      phaseEndTick: DERIVED.match.countdownTicks,
      mode: Mode.Frenzy,
      matchIndex: 0,
      matchId: 'match:42:0',
      roomSeed: 42,
      nextProjectileId: 0,
      zone: null,
    });
    expect(world.map.walls).toBe(TEST_OPEN.walls);
    expect(world.map.wallGrid.cellSizeM).toBe(4);
    expect(world.players).toEqual(Array(BALANCE.match.seats).fill(null));
    for (const field of [
      'cover',
      'projectiles',
      'shards',
      'clusters',
      'recentSpawns',
    ] as const) {
      expect(world[field]).toEqual([]);
    }
    expect(world.events).toEqual(world.loot.map(item => ({ type: 'lootSpawn', lootId: item.id, gun: item.gun, x: item.x, y: item.y })));
    expect(world.loot).toHaveLength(15);
    expect(JSON.stringify(TEST_OPEN)).toBe(mapBefore);
  });

  it('createWorld gives separate worlds fresh mutable state containers', () => {
    const first = createWorld({
      map: TEST_OPEN,
      roomSeed: 2,
      mode: Mode.Frenzy,
    });
    const second = createWorld({
      map: TEST_OPEN,
      roomSeed: 2,
      mode: Mode.Frenzy,
    });
    for (const field of [
      'rng',
      'cover',
      'players',
      'projectiles',
      'shards',
      'clusters',
      'recentSpawns',
      'events',
    ] as const) {
      expect(first[field]).not.toBe(second[field]);
    }
    expect(first).toEqual(second);
  });

  it('hashWorld matches equivalent worlds regardless of object key insertion order', () => {
    const first = createWorld({
      map: TEST_OPEN,
      roomSeed: 8,
      mode: Mode.Frenzy,
    });
    const second = createWorld({
      map: TEST_OPEN,
      roomSeed: 8,
      mode: Mode.Frenzy,
    });
    first.zone = { alpha: 1, beta: 2 };
    second.zone = { beta: 2, alpha: 1 };
    expect(hashWorld(first)).toBe(hashWorld(second));
  });

  const stateChanges: readonly [string, (world: World) => void][] = [
    [
      'tick',
      (world) => {
        world.tick += 1;
      },
    ],
    [
      'phase',
      (world) => {
        world.phase = Phase.Playing;
      },
    ],
    [
      'phaseEndTick',
      (world) => {
        world.phaseEndTick = 1;
      },
    ],
    [
      'mode',
      (world) => {
        world.mode = Mode.ZoneFrenzy;
      },
    ],
    [
      'pendingMode',
      (world) => {
        world.pendingMode = Mode.ZoneFrenzy;
      },
    ],
    [
      'matchIndex',
      (world) => {
        world.matchIndex = 1;
      },
    ],
    [
      'matchId',
      (world) => {
        world.matchId = 'match';
      },
    ],
    [
      'roomSeed',
      (world) => {
        world.roomSeed = 9;
      },
    ],
    [
      'rng',
      (world) => {
        nextFloat(world.rng);
      },
    ],
    [
      'map',
      (world) => {
        world.map = { ...world.map, id: 'other' };
      },
    ],
    [
      'cover',
      (world) => {
        world.cover.push({ id: 'cover', intact: true });
      },
    ],
    [
      'players',
      (world) => {
        world.players[0] = createPlayer(
          { id: 'player', seat: 0, name: 'Player', isBot: false },
          world.tick,
        );
      },
    ],
    [
      'projectiles',
      (world) => {
        world.projectiles.push(projectileRecord(1));
      },
    ],
    [
      'nextProjectileId',
      (world) => {
        world.nextProjectileId = 1;
      },
    ],
    [
      'shards',
      (world) => {
        world.shards.push({
          id: 1,
          x: 0,
          y: 0,
          value: BALANCE.flux.smallShard,
          kind: ShardKind.Small,
          expiresTick: 0,
          clusterId: null,
        });
      },
    ],
    [
      'nextShardId',
      (world) => {
        world.nextShardId = 1;
      },
    ],
    [
      'clusters',
      (world) => {
        world.clusters.push({
          id: 0,
          pointIndex: 0,
          state: 'waiting',
          announceTick: 1,
          spawnTick: 0,
        });
      },
    ],
    [
      'zone',
      (world) => {
        world.zone = {};
      },
    ],
    [
      'recentSpawns',
      (world) => {
        world.recentSpawns.push(1);
      },
    ],
  ];

  it.each(stateChanges)(
    'hashWorld changes when %s changes',
    (_name, mutate) => {
      const baseline = createWorld({
        map: TEST_OPEN,
        roomSeed: 8,
        mode: Mode.Frenzy,
      });
      const changed = createWorld({
        map: TEST_OPEN,
        roomSeed: 8,
        mode: Mode.Frenzy,
      });
      mutate(changed);
      expect(hashWorld(changed)).not.toBe(hashWorld(baseline));
    },
  );

  it('hashWorld excludes the transient event buffer and does not mutate the world', () => {
    const world = createWorld({
      map: TEST_OPEN,
      roomSeed: 8,
      mode: Mode.Frenzy,
    });
    const before = JSON.stringify(world);
    const hash = hashWorld(world);
    expect(JSON.stringify(world)).toBe(before);
    emitEvent(world, {
      type: 'spawn',
      seat: 0,
      x: 0,
      y: 0,
      protectedEndTick: 0,
    });
    expect(hashWorld(world)).toBe(hash);
  });

  it('GR-4.11 initializes ordered cover and gives each world fresh mutable cover state', () => {
    const before = JSON.stringify(GREYBOX_V1);
    const options = { map: GREYBOX_V1, roomSeed: 8, mode: Mode.Frenzy };
    const first = createWorld(options);
    const second = createWorld(options);
    expect(first.cover).toEqual(
      GREYBOX_V1.cover.map(({ id }) => ({ id, intact: true })),
    );
    expect(first.cover).not.toBe(second.cover);
    expect(first.cover[0]).not.toBe(second.cover[0]);
    const firstCover = first.cover[0];
    if (firstCover === undefined) throw new Error('Expected greybox cover');
    firstCover.intact = false;
    expect(second.cover[0]?.intact).toBe(true);
    expect(JSON.stringify(GREYBOX_V1)).toBe(before);
  });

  it('hashWorld agrees for equivalent independently built runtime maps', () => {
    const copied = JSON.parse(JSON.stringify(GREYBOX_V1)) as typeof GREYBOX_V1;
    const first = createWorld({
      map: GREYBOX_V1,
      roomSeed: 8,
      mode: Mode.Frenzy,
    });
    const second = createWorld({ map: copied, roomSeed: 8, mode: Mode.Frenzy });
    expect(hashWorld(first)).toBe(hashWorld(second));
    expect(JSON.parse(JSON.stringify(first.map))).toEqual(first.map);
  });
});
