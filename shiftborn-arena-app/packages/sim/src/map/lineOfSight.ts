import type { Box } from '@shiftborn/shared';
import { segmentBoxIntersection } from '../math/geometry.js';
import type { Vec2 } from '../math/vec2.js';
import { queryWallIndexes } from './collisionIndex.js';
import type { World } from '../world.js';

/** GR-4.9, GR-4.11: walls and intact cover block even at boundary contact. */
export function lineOfSight(world: World, a: Vec2, b: Vec2): boolean {
  const bounds: Box = [
    Math.min(a.x, b.x),
    Math.min(a.y, b.y),
    Math.max(a.x, b.x),
    Math.max(a.y, b.y),
  ];
  for (const index of queryWallIndexes(world.map, bounds)) {
    const wall = world.map.walls[index];
    if (wall !== undefined && segmentBoxIntersection(a, b, wall.box) !== null) {
      return false;
    }
  }
  for (let index = 0; index < world.cover.length; index += 1) {
    const state = world.cover[index];
    const cover = world.map.cover[index];
    if (state?.intact && cover !== undefined &&
      segmentBoxIntersection(a, b, cover.box) !== null) {
      return false;
    }
  }
  return true;
}
