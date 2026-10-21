import { BALANCE, EventId } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import type { AuthoritativeRead } from '../src/net/messageValidation.js';
import { readEntitySnapshot } from '../src/render/entityState.js';
import { decodeVisualEvents, morphProgress, railChargeProgress } from '../src/render/effects.js';
import { playerYaw } from '../src/render/entityViews.js';

const state: AuthoritativeRead = {
  tick: 100, phase: 1, matchId: 'one',
  players: { p: { id: 'p', name: '<b>Unsafe name</b>', seat: 0,
    isBot: false, controller: 0, connected: true, alive: true,
    x: 2, y: 3, aim: Math.PI / 2, form: 0, hpFrac: 1, flux: 60,
    kos: 0, deaths: 0, assists: 0, points: 0, damageDealt: 0, lastInputSeq: 0 } },
  full: { players: { p: { vx: 0, vy: 0, morphTarget: 1, morphEndTick: 115,
    stunEndTick: 110, protectedEndTick: 120 } },
  shards: { '1': { x: 4, y: 5, kind: 0 },
    '2': { x: 6, y: 7, kind: 1 },
    '3': { x: 8, y: 9, kind: 2, value: BALANCE.flux.largeShard } },
  clusterAnnounces: [{ pointIndex: 0, spawnTick: 190 }],
  cover: [{ intact: false, rebuildTick: 1000 }] },
};

describe('T-033 detached entity projection', () => {
  it('keeps stable player IDs, name text and authoritative state without mutating source', () => {
    const before = JSON.stringify(state);
    const view = readEntitySnapshot(state, 'p');
    expect(view.players[0]).toMatchObject({ id: 'p', name: '<b>Unsafe name</b>',
      morphTarget: 1, morphEndTick: 115, protectedEndTick: 120 });
    expect(view.shards).toEqual([
      { id: '1', x: 4, y: 5, kind: 0 }, { id: '2', x: 6, y: 7, kind: 1 },
      { id: '3', x: 8, y: 9, kind: 1 },
    ]);
    expect(view.clusters).toEqual([{ pointIndex: 0, spawnTick: 190 }]);
    expect(view.cover[0]).toMatchObject({ intact: false, rebuildTick: 1000 });
    expect(JSON.stringify(state)).toBe(before);
  });
  it('drops malformed visual fields without casting them into meshes', () => {
    const view = readEntitySnapshot({ ...state, full: {
      players: { p: { vx: 0, vy: 0, morphTarget: 'beast', stunEndTick: -2 } },
      shards: { bad: { x: Infinity, y: 0, kind: 0 } },
      clusterAnnounces: [{ pointIndex: 999, spawnTick: 8 }],
      cover: [{ intact: 'false', rebuildTick: 9 }],
    } }, 'p');
    expect(view.players[0]?.morphTarget).toBe(-1);
    expect(view.players[0]?.stunEndTick).toBe(0);
    expect(view.shards).toHaveLength(0);
    expect(view.clusters).toHaveLength(0);
    expect(view.cover).toHaveLength(0);
  });
});

describe('T-033 effect timing and authoritative Rail endpoints', () => {
  it('uses the source end tick for morph progress and ends at completion', () => {
    expect(morphProgress(115, 100)).toBe(0);
    expect(morphProgress(115, 107.5)).toBeCloseTo(0.5);
    expect(morphProgress(115, 115)).toBeNull();
    expect(morphProgress(0, 0)).toBeNull();
    expect(railChargeProgress(100, 118, 109)).toBeCloseTo(0.5);
    expect(railChargeProgress(100, 118, 118)).toBeNull();
  });
  it('maps sim +Y to Three -Z through positive yaw, and accepts only release tuples', () => {
    expect(playerYaw(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(decodeVisualEvents({ tick: 40, events: [
      [EventId.RailShotFired, 2, 1, 2, 3, 4],
      [EventId.RailShotFired, 2, 1, 2, Number.NaN, 4],
      [EventId.AbilityEnd, 2, 'railShot', 1],
    ] })).toEqual([{ kind: 'railRelease', tick: 40, seat: 2,
      x1: 1, y1: 2, x2: 3, y2: 4 }]);
  });
});
