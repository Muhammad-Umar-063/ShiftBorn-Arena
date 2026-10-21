import { BALANCE } from '@shiftborn/shared';

export const INPUT_STEP_MS = 1000 / BALANCE.tick.rateHz;
export const MAX_CLIENT_STEPS_PER_FRAME = 4;
const FLOAT_ROUNDING_TOLERANCE_MS = 1e-7;

/** ARCHITECTURE §6.2: bounded catch-up inside the renderer's one RAF loop. */
export function advanceFixedSteps(accumulatedMs: number, deltaMs: number,
  step: () => void): number {
  const remaining = Math.min(INPUT_STEP_MS * MAX_CLIENT_STEPS_PER_FRAME,
    Math.max(0, accumulatedMs) + Math.max(0, deltaMs));
  const count = Math.min(MAX_CLIENT_STEPS_PER_FRAME,
    Math.floor((remaining + FLOAT_ROUNDING_TOLERANCE_MS) / INPUT_STEP_MS));
  for (let index = 0; index < count; index += 1) step();
  return Math.max(0, remaining - count * INPUT_STEP_MS);
}
