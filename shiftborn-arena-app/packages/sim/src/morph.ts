import {
  BALANCE,
  DERIVED,
  Form,
  InputButton,
  MorphDenialReason,
  Phase,
  type MorphDenialReason as MorphDenialReasonType,
} from '@shiftborn/shared';
import type { Vec2 } from './math/vec2.js';
import type { PlayerRecord } from './player.js';

export type MorphDecision =
  | { readonly kind: 'sameForm' }
  | { readonly kind: 'denied'; readonly reason: MorphDenialReasonType }
  | { readonly kind: 'start'; readonly cost: number; readonly endTick: number };

export interface MorphCompletion {
  readonly form: Form;
  readonly morphReadyTick: number;
  readonly vel: Vec2;
}

/** D-064: a tick with multiple distinct target edges has no morph target. */
export function requestedMorphTarget(pressedButtons: number): Form | null {
  const runner = (pressedButtons & InputButton.MorphRunner) !== 0;
  const beast = (pressedButtons & InputButton.MorphBeast) !== 0;
  const turret = (pressedButtons & InputButton.MorphTurret) !== 0;
  if (Number(runner) + Number(beast) + Number(turret) !== 1) return null;
  return runner ? Form.Runner : beast ? Form.Beast : Form.Turret;
}

export function morphCost(target: Form): number {
  switch (target) {
    case Form.Runner:
      return BALANCE.morph.costRunner;
    case Form.Beast:
      return BALANCE.morph.costBeast;
    case Form.Turret:
      return BALANCE.morph.costTurret;
  }
}

/** GR-5.1–5.2: validation order is observable through denial reasons. */
export function evaluateMorphRequest(
  player: Pick<
    PlayerRecord,
    | 'form'
    | 'alive'
    | 'morph'
    | 'morphReadyTick'
    | 'stunEndTick'
    | 'knockback'
    | 'ability'
    | 'flux'
  >,
  target: Form,
  phase: Phase,
  tick: number,
): MorphDecision {
  if (target === player.form) return { kind: 'sameForm' };
  if (phase !== Phase.Playing)
    return { kind: 'denied', reason: MorphDenialReason.Phase };
  if (!player.alive || player.morph !== null)
    return { kind: 'denied', reason: MorphDenialReason.Busy };
  if (tick < player.morphReadyTick)
    return { kind: 'denied', reason: MorphDenialReason.Cooldown };
  if (
    tick < player.stunEndTick ||
    (player.knockback !== null && tick < player.knockback.endTick) ||
    player.ability !== null
  )
    return { kind: 'denied', reason: MorphDenialReason.Busy };
  const cost = morphCost(target);
  if (player.flux < cost)
    return { kind: 'denied', reason: MorphDenialReason.Flux };
  return { kind: 'start', cost, endTick: tick + DERIVED.morph.durationTicks };
}

/** GR-5.4: completion keeps hpFrac and per-form timers untouched. */
export function dueMorphCompletion(
  player: Pick<PlayerRecord, 'morph' | 'vel'>,
  tick: number,
): MorphCompletion | null {
  const morph = player.morph;
  if (morph === null || tick < morph.endTick) return null;
  return {
    form: morph.target,
    morphReadyTick: morph.endTick + DERIVED.morph.cooldownTicks,
    vel: morph.target === Form.Turret ? { x: 0, y: 0 } : { ...player.vel },
  };
}

/** GR-5.4: shared state transition; callers own events and Flux. */
export function completeMorphState(
  player: Pick<PlayerRecord, 'morph' | 'form' | 'morphReadyTick' | 'vel'>,
  tick: number,
): MorphCompletion | null {
  const completion = dueMorphCompletion(player, tick);
  if (completion === null) return null;
  player.form = completion.form;
  player.morph = null;
  player.morphReadyTick = completion.morphReadyTick;
  player.vel = completion.vel;
  return completion;
}

/** D-013: status systems must ignore knockback while a morph is active. */
export function morphKnockbackImmune(
  player: Pick<PlayerRecord, 'morph'>,
): boolean {
  return player.morph !== null;
}

/** GR-5.5: future death handling calls this seam without refunding Flux. */
export function cancelMorphOnDeath(player: PlayerRecord): void {
  player.morph = null;
}

/** GR-5.5 and GR-11.6: future respawn handling returns to Runner. */
export function resetMorphForRespawn(player: PlayerRecord, tick: number): void {
  player.form = Form.Runner;
  player.morph = null;
  player.morphReadyTick = tick;
}
