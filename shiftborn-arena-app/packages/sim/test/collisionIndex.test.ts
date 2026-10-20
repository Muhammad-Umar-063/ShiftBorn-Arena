import { BALANCE, GREYBOX_V1, Mode, type MapData } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { circleBoxPushOut } from '../src/math/geometry.js';
import { createMapRuntime, queryCircleWallIndexes, queryWallIndexes, WALL_GRID_CELL_SIZE_M } from '../src/map/collisionIndex.js';
import { lineOfSight } from '../src/map/lineOfSight.js';
import { nextFloat, sfc32 } from '../src/rng.js';
import { createWorld } from '../src/world.js';
import { TEST_OPEN } from './fixtures/testOpen.js';

const smallMap: MapData = {
  ...TEST_OPEN,
  walls: [
    { id: 'first', box: [-5, -1, 5, 1] },
    { id: 'second', box: [0, 0, 8, 8] },
    { id: 'third', box: [-8, -8, -4, -4] },
  ],
};

describe('ARCH §4.5 static wall collision grid', () => {
  it('indexes every touched cell, including negative coordinates and exact boundaries', () => {
    const runtime = createMapRuntime(smallMap);
    expect(WALL_GRID_CELL_SIZE_M).toBe(4);
    expect(runtime.wallGrid.cellSizeM).toBe(4);
    expect(runtime.wallGrid.cells['-2,-1']).toContain(0);
    expect(runtime.wallGrid.cells['1,0']).toEqual([0, 1]);
    expect(runtime.wallGrid.cells['2,2']).toEqual([1]);
    expect(runtime.wallGrid.cells['-2,-2']).toContain(2);
    expect(runtime.wallGrid.cells['0,0']).toEqual([0, 1]);
    expect(runtime.wallGrid.cells['-1,-1']).toContain(1);
    expect(queryWallIndexes(runtime, [4, 0, 4, 0])).toEqual([0, 1]);
  });

  it('filters exact bounds and returns ascending source order without duplicates', () => {
    const runtime = createMapRuntime(smallMap);
    expect(queryWallIndexes(runtime, [-10, -10, 10, 10])).toEqual([0, 1, 2]);
    expect(queryWallIndexes(runtime, [6, -1, 7, -0.5])).toEqual([]);
    expect(queryWallIndexes(runtime, [-10, -10, -8, -8])).toEqual([2]);
    expect(queryWallIndexes(runtime, [8, 8, 20, 20])).toEqual([1]);
    expect(JSON.parse(JSON.stringify(runtime))).toEqual(runtime);
  });

  it('GR-4.8 circle query excludes exact tangency and validates radius', () => {
    const runtime = createMapRuntime(smallMap);
    expect(queryCircleWallIndexes(runtime, { x: -6, y: 0 }, 1)).toEqual([]);
    expect(queryCircleWallIndexes(runtime, { x: 0, y: 1.5 }, 1)).toEqual([0, 1]);
    expect(queryCircleWallIndexes(runtime, { x: -6, y: -6 }, 0)).toEqual([2]);
    expect(() => queryCircleWallIndexes(runtime, { x: 0, y: 0 }, -1)).toThrow(RangeError);
  });
});

describe('AT-MAP-03 collision index', () => {
  it('matches brute force for exactly 10,000 seeded greybox circle queries', () => {
    const runtime = createMapRuntime(GREYBOX_V1);
    const rng = sfc32(11003, 0);
    const radii = [
      BALANCE.forms.runner.radiusM,
      BALANCE.forms.beast.radiusM,
      BALANCE.forms.turret.radiusM,
    ];
    for (let query = 0; query < 10_000; query += 1) {
      const center = { x: nextFloat(rng) * 80 - 40, y: nextFloat(rng) * 80 - 40 };
      const radius = radii[query % radii.length] as number;
      const indexed = queryCircleWallIndexes(runtime, center, radius);
      const brute: number[] = [];
      for (let index = 0; index < GREYBOX_V1.walls.length; index += 1) {
        const wall = GREYBOX_V1.walls[index];
        if (wall !== undefined && circleBoxPushOut(center, radius, wall.box) !== null) brute.push(index);
      }
      expect(indexed).toEqual(brute);
    }
  });

  it('covers negative cells, boundaries, spans, outside bounds, deduplication, and tangency', () => {
    const runtime = createMapRuntime(GREYBOX_V1);
    const cases = [
      { x: -31.5, y: -31.5, radius: BALANCE.forms.runner.radiusM },
      { x: -4, y: 4, radius: BALANCE.forms.beast.radiusM },
      { x: 0, y: 0, radius: BALANCE.forms.beast.radiusM },
      { x: 32, y: 32, radius: BALANCE.forms.turret.radiusM },
      { x: 40, y: 40, radius: BALANCE.forms.runner.radiusM },
      { x: -32.6, y: 0, radius: BALANCE.forms.runner.radiusM },
    ];
    for (const { x, y, radius } of cases) {
      const center = { x, y };
      const indexed = queryCircleWallIndexes(runtime, center, radius);
      const brute = GREYBOX_V1.walls.flatMap((wall, index) =>
        circleBoxPushOut(center, radius, wall.box) === null ? [] : [index]);
      expect(indexed).toEqual(brute);
      expect(new Set(indexed).size).toBe(indexed.length);
    }
    expect(queryCircleWallIndexes(runtime, { x: 40, y: 40 }, BALANCE.forms.runner.radiusM)).toEqual([]);
  });
});

describe('GR-4.9 / GR-4.11 line of sight', () => {
  const map: MapData = {
    ...TEST_OPEN,
    walls: [{ id: 'wall', box: [0, 0, 2, 2] }],
    cover: [{ id: 'cover', box: [4, 0, 5, 2] }],
  };
  const world = () => createWorld({ map, roomSeed: 3, mode: Mode.Frenzy });

  it('passes open paths and ignores players', () => {
    const state = world();
    state.players[0] = { id: 'player', seat: 0 };
    expect(lineOfSight(state, { x: -2, y: 3 }, { x: 6, y: 3 })).toBe(true);
    expect(lineOfSight(state, { x: -2, y: 3 }, { x: -1, y: 3 })).toBe(true);
  });

  it('blocks walls, tangents, corners, endpoints, and zero-length points inside', () => {
    const state = world();
    expect(lineOfSight(state, { x: -1, y: 1 }, { x: 3, y: 1 })).toBe(false);
    expect(lineOfSight(state, { x: -1, y: 2 }, { x: 3, y: 2 })).toBe(false);
    expect(lineOfSight(state, { x: -1, y: 1 }, { x: 1, y: 3 })).toBe(false);
    expect(lineOfSight(state, { x: -1, y: 1 }, { x: 0, y: 1 })).toBe(false);
    expect(lineOfSight(state, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(false);
    expect(lineOfSight(state, { x: -1, y: 1 }, { x: -1, y: 1 })).toBe(true);
  });

  it('blocks intact cover and passes through destroyed cover', () => {
    const state = world();
    const a = { x: 3, y: 1 };
    const b = { x: 6, y: 1 };
    expect(lineOfSight(state, a, b)).toBe(false);
    const cover = state.cover[0];
    if (cover === undefined) throw new Error('Expected cover');
    cover.intact = false;
    expect(lineOfSight(state, a, b)).toBe(true);
    expect(lineOfSight(state, { x: 4, y: 1 }, { x: 4, y: 1 })).toBe(true);
  });
});
