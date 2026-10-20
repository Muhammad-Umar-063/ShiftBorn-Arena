import { BALANCE, Mode, Phase } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { TEST_OPEN } from './fixtures/testOpen.js';
import { createWorld, type World } from '../src/world.js';
import { hashWorld } from '../src/hash.js';
import { emitEvent } from '../src/events.js';
import { nextFloat } from '../src/rng.js';

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
      phaseEndTick: 0,
      mode: Mode.Frenzy,
      matchIndex: 0,
      matchId: '',
      roomSeed: 42,
      nextProjectileId: 0,
      zone: null,
    });
    expect(world.map).toBe(TEST_OPEN);
    expect(world.players).toEqual(Array(BALANCE.match.seats).fill(null));
    for (const field of [
      'cover',
      'projectiles',
      'shards',
      'clusters',
      'recentSpawns',
      'events',
    ] as const) {
      expect(world[field]).toEqual([]);
    }
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
        world.cover.push({ id: 'cover' });
      },
    ],
    [
      'players',
      (world) => {
        world.players[0] = { id: 'player', seat: 0 };
      },
    ],
    [
      'projectiles',
      (world) => {
        world.projectiles.push({ id: 1 });
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
        world.shards.push({ id: 1 });
      },
    ],
    [
      'clusters',
      (world) => {
        world.clusters.push({});
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
    emitEvent(world, { type: 'spawn' });
    expect(hashWorld(world)).toBe(hash);
  });
});
