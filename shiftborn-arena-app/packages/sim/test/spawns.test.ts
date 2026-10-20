import { BALANCE, Mode, type MapData } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/player.js';
import { chooseSpawnPoint, rememberSpawn } from '../src/spawns.js';
import { createWorld } from '../src/world.js';
import { nextInt } from '../src/rng.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

const map: MapData = {
  ...TEST_OPEN,
  spawnPoints: Array.from({ length: 6 }, (_, index) => ({ id: `S-${index}`, x: index * 10, y: 0 })),
};

function worldWithPlayers(): ReturnType<typeof createWorld> {
  const world = createWorld({ map, roomSeed: 7, mode: Mode.Frenzy });
  const self = createPlayer({ id: 'self', name: 'Self', isBot: false, seat: 0 }, world.tick);
  self.alive = true;
  self.pos = { x: 999, y: 0 };
  const left = createPlayer({ id: 'left', name: 'Left', isBot: false, seat: 1 }, world.tick);
  left.alive = true;
  left.pos = { x: 0, y: 0 };
  const right = createPlayer({ id: 'right', name: 'Right', isBot: false, seat: 2 }, world.tick);
  right.alive = true;
  right.pos = { x: 50, y: 0 };
  world.players[0] = self;
  world.players[1] = left;
  world.players[2] = right;
  return world;
}

describe('GR-11.5 spawn point choice', () => {
  it('maximizes nearest living opponent distance and breaks exact ties by lowest index', () => {
    const world = worldWithPlayers();
    const before = JSON.stringify(map);
    expect(chooseSpawnPoint(world, 'self')).toBe(2);
    expect(world.recentSpawns).toEqual([2]);
    expect(JSON.stringify(map)).toBe(before);
  });

  it('excludes recent points, ignores dead players and the spawning player', () => {
    const world = worldWithPlayers();
    world.recentSpawns = [2, 3];
    const right = world.players[2];
    if (right === null || right === undefined) throw new Error('Missing player');
    right.alive = false;
    expect(chooseSpawnPoint(world, 'self')).toBe(5);
    expect(world.recentSpawns).toEqual([3, 5]);
  });

  it('uses current match RNG deterministically when no other player lives', () => {
    const first = worldWithPlayers();
    const second = worldWithPlayers();
    for (const world of [first, second]) {
      for (const seat of [1, 2]) {
        const player = world.players[seat];
        if (player === null || player === undefined) throw new Error('Missing player');
        player.alive = false;
      }
    }
    first.recentSpawns = [0, 1];
    second.recentSpawns = [0, 1];
    const expectedRng = { ...first.rng };
    const expected = [2, 3, 4, 5][nextInt(expectedRng, 4)];
    const chosen = chooseSpawnPoint(first, 'self');
    expect(chosen).toBe(expected);
    expect(first.rng).toEqual(expectedRng);
    expect(chooseSpawnPoint(second, 'self')).toBe(chosen);
    expect(second.rng).toEqual(first.rng);
  });

  it('keeps a rolling history and fails clearly when no candidate exists', () => {
    const world = worldWithPlayers();
    rememberSpawn(world, 0);
    rememberSpawn(world, 1);
    rememberSpawn(world, 2);
    expect(world.recentSpawns).toEqual([1, 2]);
    expect(world.recentSpawns).toHaveLength(BALANCE.match.spawnExcludeRecent);
    const emptyMap = { ...TEST_OPEN, spawnPoints: [] };
    const malformed = createWorld({ map: emptyMap, roomSeed: 7, mode: Mode.Frenzy });
    expect(() => chooseSpawnPoint(malformed, 'missing')).toThrow(/no available spawn point/);
    malformed.map = { ...malformed.map, spawnPoints: map.spawnPoints.slice(0, 2) };
    malformed.recentSpawns = [0, 1];
    expect(() => chooseSpawnPoint(malformed, 'missing')).toThrow(/no available spawn point/);
  });
});
