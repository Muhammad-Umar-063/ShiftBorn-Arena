import { GREYBOX_V1, Mode } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { hashWorld } from '../src/hash.js';
import { restoreWorld, snapshotWorld } from '../src/snapshot.js';
import { spawnProjectile } from '../src/projectiles.js';
import { createWorld } from '../src/world.js';
import { tier1Gun } from './fixtures/makeTestWorld.js';

describe('AT-DET-06 pure world snapshot seam', () => {
  it('round-trips gameplay state without sharing mutable records or map data', () => {
    const world = createWorld({
      map: GREYBOX_V1, roomSeed: 27, mode: Mode.Frenzy,
      initialPlayers: [{ id: 'human', name: 'Human', seat: 0, isBot: false }],
    });
    const snapshot = snapshotWorld(world);
    expect(snapshot.mapId).toBe(GREYBOX_V1.id);
    expect(hashWorld(restoreWorld(snapshot))).toBe(hashWorld(world));
    const originalPlayer = world.players[0];
    if (originalPlayer === null || originalPlayer === undefined) throw new Error('missing player');
    const original = originalPlayer.hpFrac;
    originalPlayer.hpFrac = 0.5;
    expect(snapshot.players[0]?.hpFrac).toBe(original);
    const restored = restoreWorld(snapshot);
    const restoredPlayer = restored.players[0];
    if (restoredPlayer === null || restoredPlayer === undefined) throw new Error('missing restored player');
    restoredPlayer.hpFrac = 0.25;
    expect(snapshot.players[0]?.hpFrac).toBe(original);
    expect(restored.map.walls).toEqual(GREYBOX_V1.walls);
    originalPlayer.pos = { x: 0, y: 4 };
    expect(spawnProjectile(world, originalPlayer, tier1Gun(originalPlayer.form), 0, 1, 0, 0)).not.toBeNull();
    const withProjectile = snapshotWorld(world);
    expect(hashWorld(restoreWorld(withProjectile))).toBe(hashWorld(world));
  });

  it('rejects untrusted unknown maps, controllers and malformed state', () => {
    const world = createWorld({ map: GREYBOX_V1, roomSeed: 1, mode: Mode.Frenzy });
    const snapshot = snapshotWorld(world);
    expect(() => restoreWorld({ ...snapshot, mapId: '../escape' })).toThrow();
    expect(() => restoreWorld({ ...snapshot, roomSeed: '1' })).toThrow();
    expect(() => restoreWorld({ ...snapshot, players: [] })).toThrow();
    const humanWorld = createWorld({ map: GREYBOX_V1, roomSeed: 2, mode: Mode.Frenzy,
      initialPlayers: [{ id: 'human', name: 'Human', seat: 0, isBot: false }] });
    const human = snapshotWorld(humanWorld);
    const badPlayers: unknown[] = [...human.players];
    const first = human.players[0];
    if (first === null || first === undefined) throw new Error('missing player');
    badPlayers[0] = { ...first, controller: 'invalid' };
    expect(() => restoreWorld({ ...human, players: badPlayers })).toThrow();
  });
});
