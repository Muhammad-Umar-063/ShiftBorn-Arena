import { BALANCE } from './balance.js';
import { DERIVED } from './derived.js';

/** GR-4.19: normalize intent before rotation; right strafe is clockwise. */
export function encodeFacingMove(forward: number, right: number, aim: number): { moveX: number; moveY: number } {
  const length = Math.max(1, Math.hypot(forward, right));
  const f = forward / length; const r = right / length;
  return { moveX: Math.round((Math.cos(aim) * f + Math.sin(aim) * r) * 127),
    moveY: Math.round((Math.sin(aim) * f - Math.cos(aim) * r) * 127) };
}

/** BALANCE §9.6: exact capped linear-rate integral, independent of render FPS. */
export function integrateKeyboardTurn(heldS: number, deltaS: number): number {
  const { turnStartRadPerS: start, turnMaxRadPerS: max, turnAccelRadPerS2: accel } = DERIVED.keyboardAim;
  const capS = (max - start) / accel;
  const integral = (t: number) => {
    const ramp = Math.min(Math.max(0, t), capS);
    return start * ramp + accel * ramp * ramp / 2 + max * Math.max(0, t - capS);
  };
  return integral(heldS + deltaS) - integral(heldS);
}

export function clampAimDistance(distanceM: number): number {
  return Math.max(BALANCE.aimDistance.minM, Math.min(BALANCE.aimDistance.maxM, distanceM));
}

/** GR-4.18: Up increases and Down decreases mortar distance. */
export function integrateAimDistance(distanceM: number, direction: number, deltaS: number): number {
  return clampAimDistance(distanceM + direction * BALANCE.keyboardAim.distRateMps * deltaS);
}
