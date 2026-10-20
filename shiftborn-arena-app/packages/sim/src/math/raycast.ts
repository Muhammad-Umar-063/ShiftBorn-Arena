import type { Box } from '@shiftborn/shared';
import { segmentBoxIntersection, segmentCircleIntersection } from './geometry.js';
import type { Vec2 } from './vec2.js';

export type RaycastShape =
  | { readonly kind: 'box'; readonly box: Box; readonly inflation?: number }
  | { readonly kind: 'circle'; readonly center: Vec2; readonly radius: number };

export interface RaycastHit {
  readonly index: number;
  readonly t: number;
}

/** Nearest closed-segment contact; equal t values prefer earlier source order. */
export function raycast(
  a: Vec2,
  b: Vec2,
  sources: readonly RaycastShape[],
): RaycastHit | null {
  let hit: RaycastHit | null = null;
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    if (source === undefined) continue;
    const t = source.kind === 'box'
      ? segmentBoxIntersection(a, b, source.box, source.inflation)
      : segmentCircleIntersection(a, b, source.center, source.radius);
    if (t !== null && (hit === null || t < hit.t)) hit = { index, t };
  }
  return hit;
}
