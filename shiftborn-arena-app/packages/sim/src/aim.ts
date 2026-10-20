import { DERIVED, Form } from '@shiftborn/shared';
import type { PlayerRecord } from './player.js';

const FULL_TURN = 2 * Math.PI;

/** GR-4.12–4.15: exact half-turn ties rotate counter-clockwise. */
export function advanceAim(
  player: Pick<PlayerRecord, 'aim' | 'form'>,
  encodedAim: number,
  controlFrozen = false,
): number {
  if (controlFrozen) return player.aim;
  const target = ((encodedAim / 65536) * FULL_TURN) % FULL_TURN;
  if (player.form !== Form.Turret) return target;
  const current = ((player.aim % FULL_TURN) + FULL_TURN) % FULL_TURN;
  let difference =
    ((target - current + Math.PI + FULL_TURN) % FULL_TURN) - Math.PI;
  if (difference === -Math.PI) difference = Math.PI;
  const cap = DERIVED.forms.turret.turnRateRadPerTick;
  const turn = Math.max(-cap, Math.min(cap, difference));
  return (((current + turn) % FULL_TURN) + FULL_TURN) % FULL_TURN;
}
