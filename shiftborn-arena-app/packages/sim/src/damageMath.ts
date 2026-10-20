import { BALANCE, DamageTag, Form, degreesToRadians } from '@shiftborn/shared';
import { formStats } from './formStats.js';
import type { Vec2 } from './math/vec2.js';

/** GR-6.3, GR-7.8: captured when a shot or ability starts. */
export interface AttackSource {
  readonly id: string;
  readonly name?: string;
  readonly seat: number;
  readonly form: Form;
}

export interface DamageCalculation {
  readonly finalDamage: number;
  readonly tags: number;
  readonly matchupMul: number;
  readonly armorMul: number;
  readonly defenderMaxHp: number;
}

export interface DamageResult {
  readonly applied: boolean;
  readonly finalDamage: number;
  readonly tags: number;
  readonly lethal: boolean;
}

export interface DamageTarget {
  readonly form: Form;
  readonly aim: number;
}

/** GR-6.2–6.6: calculate against the defender's current, old-during-morph form. */
export function calculateDamage(
  attacker: AttackSource,
  victim: DamageTarget,
  base: number,
  distanceMul: number,
  incomingDir: Vec2,
): DamageCalculation {
  const matchupMul = BALANCE.matchup[attacker.form][victim.form];
  let armorMul = 1;
  if (victim.form === Form.Turret) {
    const length = Math.hypot(incomingDir.x, incomingDir.y);
    if (length > 0) {
      const aimX = Math.cos(victim.aim);
      const aimY = Math.sin(victim.aim);
      const alignment = (aimX * incomingDir.x + aimY * incomingDir.y) / length;
      const halfArcRad = degreesToRadians(BALANCE.forms.turret.frontArcDeg / 2);
      if (alignment >= Math.cos(halfArcRad)) {
        armorMul = BALANCE.forms.turret.frontArcDamageMult;
      }
    }
  }
  let tags = 0;
  if (matchupMul > 1) tags |= DamageTag.Effective;
  if (matchupMul < 1) tags |= DamageTag.Resisted;
  if (armorMul < 1) tags |= DamageTag.Armor;
  return {
    finalDamage: base * distanceMul * matchupMul * armorMul,
    tags,
    matchupMul,
    armorMul,
    defenderMaxHp: formStats(victim.form).maxHp,
  };
}
