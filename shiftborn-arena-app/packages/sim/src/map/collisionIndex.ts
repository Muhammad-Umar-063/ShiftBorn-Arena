import type { Box, MapData } from '@shiftborn/shared';
import { circleBoxPushOut } from '../math/geometry.js';
import { lootCandidates } from '../loot.js';
import type { Vec2 } from '../math/vec2.js';

// ARCH §4.5: one static wall grid cell spans exactly four sim metres.
export const WALL_GRID_CELL_SIZE_M = 4;

export interface WallCollisionGrid {
  readonly cellSizeM: number;
  readonly cells: Record<string, number[]>;
}

export type MapRuntime = MapData & { readonly wallGrid: WallCollisionGrid; readonly lootCandidates: readonly Vec2[] };

function cell(x: number): number {
  return Math.floor(x / WALL_GRID_CELL_SIZE_M);
}

// A closed box beginning exactly on a cell edge also touches the preceding cell.
function firstTouchedCell(x: number): number {
  const index = cell(x);
  return x % WALL_GRID_CELL_SIZE_M === 0 ? index - 1 : index;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** Build once from static walls. Closed box boundaries touch both adjacent cells. */
export function createMapRuntime(map: MapData): MapRuntime {
  const cells: Record<string, number[]> = {};
  map.walls.forEach((wall, index) => {
    for (let x = firstTouchedCell(wall.box[0]); x <= cell(wall.box[2]); x += 1) {
      for (let y = firstTouchedCell(wall.box[1]); y <= cell(wall.box[3]); y += 1) {
        const name = key(x, y);
        (cells[name] ??= []).push(index);
      }
    }
  });
  return { ...map, lootCandidates: lootCandidates(map), wallGrid: { cellSizeM: WALL_GRID_CELL_SIZE_M, cells } };
}

function boxesTouch(a: Box, b: Box): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Closed bounds query, exact AABB filtering, ascending wall source indexes. */
export function queryWallIndexes(runtime: MapRuntime, bounds: Box): number[] {
  const seen: boolean[] = [];
  for (let x = firstTouchedCell(bounds[0]); x <= cell(bounds[2]); x += 1) {
    for (let y = firstTouchedCell(bounds[1]); y <= cell(bounds[3]); y += 1) {
      for (const index of runtime.wallGrid.cells[key(x, y)] ?? []) {
        seen[index] = true;
      }
    }
  }
  const result: number[] = [];
  for (let index = 0; index < runtime.walls.length; index += 1) {
    const wall = runtime.walls[index];
    if (seen[index] && wall !== undefined && boxesTouch(bounds, wall.box)) {
      result.push(index);
    }
  }
  return result;
}

/** GR-4.8: strictly penetrating walls only, with the same predicate as brute force. */
export function queryCircleWallIndexes(
  runtime: MapRuntime,
  center: Vec2,
  radius: number,
): number[] {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError('radius must be finite and nonnegative');
  }
  const bounds: Box = [
    center.x - radius,
    center.y - radius,
    center.x + radius,
    center.y + radius,
  ];
  return queryWallIndexes(runtime, bounds).filter((index) => {
    const wall = runtime.walls[index];
    return wall !== undefined && circleBoxPushOut(center, radius, wall.box) !== null;
  });
}
