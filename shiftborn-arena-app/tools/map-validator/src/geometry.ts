import type { Box, MapPoint } from '@shiftborn/shared';

export function pointBoxDistance(point: MapPoint, box: Box): number {
  const dx = Math.max(box[0] - point.x, 0, point.x - box[2]);
  const dy = Math.max(box[1] - point.y, 0, point.y - box[3]);
  return Math.hypot(dx, dy);
}

export function boxBoxDistance(a: Box, b: Box): number {
  const dx = Math.max(a[0] - b[2], b[0] - a[2], 0);
  const dy = Math.max(a[1] - b[3], b[1] - a[3], 0);
  return Math.hypot(dx, dy);
}

export function pointDistance(a: MapPoint, b: MapPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// MAP_SPEC §10 V4: entry distance into an inflated AABB along a unit ray.
export function rayBoxDistance(
  x: number,
  y: number,
  dx: number,
  dy: number,
  box: Box,
  inflation = 0,
): number {
  const minX = box[0] - inflation;
  const minY = box[1] - inflation;
  const maxX = box[2] + inflation;
  const maxY = box[3] + inflation;
  if (x >= minX && x <= maxX && y >= minY && y <= maxY) return 0;

  let enter = -Infinity;
  let exit = Infinity;
  if (dx === 0) {
    if (x < minX || x > maxX) return Infinity;
  } else {
    const first = (minX - x) / dx;
    const second = (maxX - x) / dx;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
  }
  if (dy === 0) {
    if (y < minY || y > maxY) return Infinity;
  } else {
    const first = (minY - y) / dy;
    const second = (maxY - y) / dy;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
  }
  return exit >= Math.max(enter, 0) ? Math.max(enter, 0) : Infinity;
}
