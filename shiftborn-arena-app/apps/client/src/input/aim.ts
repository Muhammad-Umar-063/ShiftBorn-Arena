import type { GroundPoint } from '../render/coordinates.js';

export const MOUSE_AIM_DEAD_ZONE_M = 0.75;

export interface AimResult { readonly radians: number; readonly distanceM: number }

export function aimFromGround(point: GroundPoint | null, player: GroundPoint,
  previousRadians: number): AimResult {
  if (point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
    !Number.isFinite(player.x) || !Number.isFinite(player.y))
    return { radians: previousRadians, distanceM: 0 };
  const dx = point.x - player.x;
  const dy = point.y - player.y;
  const distanceM = Math.hypot(dx, dy);
  if (distanceM < MOUSE_AIM_DEAD_ZONE_M)
    return { radians: previousRadians, distanceM };
  return { radians: Math.atan2(dy, dx), distanceM };
}

export function angleToUint16(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  const wrapped = ((radians % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(wrapped / (Math.PI * 2) * 65536) & 0xffff;
}

export interface GroundProjector {
  groundAtNdc(x: number, y: number): GroundPoint | null;
}

export function pointerGroundPoint(
  clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  camera: GroundProjector,
): GroundPoint | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) ||
    !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
    rect.width <= 0 || rect.height <= 0) return null;
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = 1 - ((clientY - rect.top) / rect.height) * 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return camera.groundAtNdc(x, y);
}
