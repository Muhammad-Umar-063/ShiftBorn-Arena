import type { Box } from '@shiftborn/shared';
import { dot, subtract, type Vec2 } from './vec2.js';

function validRadius(radius: number): void {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError('radius must be finite and nonnegative');
  }
}

/**
 * GR-4.8: shortest displacement that separates a circle from a closed box.
 * null means no penetration; exact tangency is clear. For centres within the
 * box, equal exit distances prefer west, east, south, then north.
 */
export function circleBoxPushOut(
  center: Vec2,
  radius: number,
  box: Box,
): Vec2 | null {
  validRadius(radius);
  const closestX = Math.max(box[0], Math.min(center.x, box[2]));
  const closestY = Math.max(box[1], Math.min(center.y, box[3]));
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared > 0) {
    const distance = Math.sqrt(distanceSquared);
    if (distance >= radius) return null;
    const penetration = radius - distance;
    return { x: (dx / distance) * penetration, y: (dy / distance) * penetration };
  }

  // The centre is inside or on the box boundary. Choose the nearest exit.
  const west = center.x - box[0] + radius;
  const east = box[2] - center.x + radius;
  const south = center.y - box[1] + radius;
  const north = box[3] - center.y + radius;
  const shortest = Math.min(west, east, south, north);
  if (shortest === 0) return null;
  if (west === shortest) return { x: -west, y: 0 };
  if (east === shortest) return { x: east, y: 0 };
  if (south === shortest) return { x: 0, y: -south };
  return { x: 0, y: north };
}

/** Earliest closed-segment contact with a box inflated on every side. */
export function segmentBoxIntersection(
  a: Vec2,
  b: Vec2,
  box: Box,
  inflation = 0,
): number | null {
  validRadius(inflation);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let enter = 0;
  let exit = 1;
  if (dx === 0) {
    if (a.x < box[0] - inflation || a.x > box[2] + inflation) return null;
  } else {
    const first = (box[0] - inflation - a.x) / dx;
    const last = (box[2] + inflation - a.x) / dx;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter > exit) return null;
  }
  if (dy === 0) {
    if (a.y < box[1] - inflation || a.y > box[3] + inflation) return null;
  } else {
    const first = (box[1] - inflation - a.y) / dy;
    const last = (box[3] + inflation - a.y) / dy;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter > exit) return null;
  }
  return Number.isFinite(enter) && enter <= 1 ? enter : null;
}

/** Earliest closed-segment contact with a circle, including start inside. */
export function segmentCircleIntersection(
  a: Vec2,
  b: Vec2,
  center: Vec2,
  radius: number,
): number | null {
  validRadius(radius);
  const offset = subtract(a, center);
  const radiusSquared = radius * radius;
  if (dot(offset, offset) <= radiusSquared) return 0;
  const direction = subtract(b, a);
  const lengthSquared = dot(direction, direction);
  if (lengthSquared === 0) return null;
  const projection = dot(offset, direction);
  const discriminant = projection * projection - lengthSquared * (dot(offset, offset) - radiusSquared);
  if (discriminant < 0) return null;
  const t = (-projection - Math.sqrt(discriminant)) / lengthSquared;
  return t >= 0 && t <= 1 && Number.isFinite(t) ? t : null;
}

/**
 * GR-7.22: earliest contact with an inflated box plus the outward normal of
 * the face entered last. A tie between slabs is a corner and sets both axes.
 * A contact at t = 0 while moving away from that face is not a contact.
 */
export function segmentBoxContact(
  a: Vec2,
  b: Vec2,
  box: Box,
  inflation = 0,
): { t: number; normalX: number; normalY: number } | null {
  validRadius(inflation);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let enterX = -Infinity;
  let exitX = Infinity;
  if (dx === 0) {
    if (a.x < box[0] - inflation || a.x > box[2] + inflation) return null;
  } else {
    const first = (box[0] - inflation - a.x) / dx;
    const last = (box[2] + inflation - a.x) / dx;
    enterX = Math.min(first, last);
    exitX = Math.max(first, last);
  }
  let enterY = -Infinity;
  let exitY = Infinity;
  if (dy === 0) {
    if (a.y < box[1] - inflation || a.y > box[3] + inflation) return null;
  } else {
    const first = (box[1] - inflation - a.y) / dy;
    const last = (box[3] + inflation - a.y) / dy;
    enterY = Math.min(first, last);
    exitY = Math.max(first, last);
  }
  const enter = Math.max(0, enterX, enterY);
  const exit = Math.min(1, exitX, exitY);
  if (enter > exit || !Number.isFinite(enter) || enter > 1) return null;
  const normalX = enterX >= enterY ? -Math.sign(dx) : 0;
  const normalY = enterY >= enterX ? -Math.sign(dy) : 0;
  // A segment starting inside or on the box: only an entering motion counts.
  if (enter === 0 && enterX < 0 && enterY < 0) return null;
  if (enter === 0 && normalX * dx + normalY * dy >= 0) return null;
  return { t: enter, normalX, normalY };
}
