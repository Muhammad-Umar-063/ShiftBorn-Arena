import { DERIVED, type Cause } from '@shiftborn/shared';
import {
  calculateDamage,
  type AttackSource,
  type DamageResult,
} from './damageMath.js';
import { emitEvent } from './events.js';
import type { Vec2 } from './math/vec2.js';
import { cancelMorphOnDeath } from './morph.js';
import { PHASE_POLICY } from './phasePolicy.js';
import type { PlayerRecord } from './player.js';
import type { World } from './world.js';

// GR-6.7: comparison threshold is on the health fraction, before display rounding.
const LETHAL_HP_FRACTION = 1e-9;
const IGNORED_DAMAGE: DamageResult = {
  applied: false,
  finalDamage: 0,
  tags: 0,
  lethal: false,
};

/** GR-6.2, GR-6.7, GR-6.9, GR-6.11: one authoritative damage application. */
export function applyDamage(
  world: World,
  attacker: AttackSource,
  victim: PlayerRecord,
  base: number,
  distanceMul: number,
  incomingDir: Vec2,
  cause: Cause,
): DamageResult {
  if (
    !PHASE_POLICY[world.phase].damage ||
    !victim.alive ||
    world.tick < victim.protectedEndTick
  )
    return IGNORED_DAMAGE;

  const victimForm = victim.form;
  const calculated = calculateDamage(
    attacker,
    victim,
    base,
    distanceMul,
    incomingDir,
  );
  const remaining =
    victim.hpFrac - calculated.finalDamage / calculated.defenderMaxHp;
  const lethal = remaining <= LETHAL_HP_FRACTION;
  victim.hpFrac = lethal ? 0 : Math.max(0, Math.min(1, remaining));
  if (lethal) {
    victim.alive = false;
    cancelMorphOnDeath(victim);
  }

  // An entry exactly at the assist-window boundary remains eligible.
  const oldestTick = world.tick - DERIVED.match.assistWindowTicks;
  victim.damageLog = victim.damageLog.filter(
    (entry) => entry.tick >= oldestTick,
  );
  victim.damageLog.push({
    attackerId: attacker.id,
    tick: world.tick,
    amount: calculated.finalDamage,
  });
  emitEvent(world, {
    type: 'damage',
    attackerId: attacker.id,
    attackerSeat: attacker.seat,
    attackerForm: attacker.form,
    victimId: victim.id,
    victimSeat: victim.seat,
    victimForm,
    cause,
    finalDamage: calculated.finalDamage,
    tags: calculated.tags,
    incomingDir: { x: incomingDir.x, y: incomingDir.y },
  });
  return {
    applied: true,
    finalDamage: calculated.finalDamage,
    tags: calculated.tags,
    lethal,
  };
}
