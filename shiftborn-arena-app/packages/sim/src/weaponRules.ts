import { BALANCE, DERIVED, Form, Phase, WeaponId } from '@shiftborn/shared';
import type { PlayerRecord } from './player.js';

export type WeaponAbilityBlock =
  'dash' | 'ramWindup' | 'ramCharge' | 'railShotCharge' | null;

export function weaponForForm(form: Form): WeaponId {
  switch (form) {
    case Form.Runner:
      return WeaponId.PulsePistol;
    case Form.Beast:
      return WeaponId.ScatterCannon;
    case Form.Turret:
      return WeaponId.RailRepeater;
  }
}

export function canFireWeapon(
  player: Pick<
    PlayerRecord,
    'alive' | 'morph' | 'stunEndTick' | 'form' | 'overheatEndTick'
  >,
  phase: Phase,
  tick: number,
  abilityBlock: WeaponAbilityBlock = null,
): boolean {
  return (
    phase === Phase.Playing &&
    player.alive &&
    player.morph === null &&
    tick >= player.stunEndTick &&
    abilityBlock === null &&
    (player.form !== Form.Turret || tick >= player.overheatEndTick)
  );
}

/** GR-7.2: all form timers advance, including inactive weapons. */
export function advanceWeaponTimers(
  timers: Readonly<Record<Form, Readonly<{ nextShotIn: number }>>>,
  form: Form,
  fireHeld: boolean,
  permitted: boolean,
): { timers: Record<Form, { nextShotIn: number }>; fired: boolean } {
  const dt = DERIVED.tick.secondsPerTick;
  const next: Record<Form, { nextShotIn: number }> = {
    [Form.Runner]: { nextShotIn: 0 },
    [Form.Beast]: { nextShotIn: 0 },
    [Form.Turret]: { nextShotIn: 0 },
  };
  for (const candidate of [Form.Runner, Form.Beast, Form.Turret]) {
    const advanced = Math.max(timers[candidate].nextShotIn - dt, -dt);
    next[candidate].nextShotIn = fireHeld ? advanced : Math.max(advanced, 0);
  }
  // A mathematically zero timer can retain a few ulps after repeated subtraction.
  const fired =
    permitted && fireHeld && next[form].nextShotIn <= Number.EPSILON;
  if (fired) {
    const interval =
      form === Form.Runner
        ? DERIVED.weapons.pulsePistol.intervalS
        : form === Form.Beast
          ? DERIVED.weapons.scatterCannon.intervalS
          : DERIVED.weapons.railRepeater.intervalS;
    next[form].nextShotIn += interval;
  }
  return { timers: next, fired };
}

export function scatterAngles(aim: number): number[] {
  return DERIVED.weapons.scatterCannon.pelletOffsetsRad.map(
    (offset) => aim + offset,
  );
}

export function scatterDistanceMul(traveledM: number): number {
  const values = BALANCE.weapons.scatterCannon;
  if (traveledM <= values.fullDamageRangeM) return 1;
  const fraction =
    (traveledM - values.fullDamageRangeM) /
    (values.rangeM - values.fullDamageRangeM);
  return Math.max(
    values.minFalloffMult,
    1 - (1 - values.minFalloffMult) * fraction,
  );
}

export function railDistanceMul(traveledM: number): number {
  return traveledM < BALANCE.weapons.railRepeater.armDistanceM
    ? BALANCE.weapons.railRepeater.closeDamageMult
    : 1;
}

/** GR-7.14: epsilon only absorbs accumulator rounding at an exact tick boundary. */
export function advanceTurretHeat(
  heat: number,
  overheatEndTick: number,
  tick: number,
  heldAndPermitted: boolean,
): { heat: number; overheatEndTick: number; overheated: boolean } {
  if (!heldAndPermitted) {
    return {
      heat: Math.max(0, heat - DERIVED.weapons.railRepeater.heatCoolPerTick),
      overheatEndTick,
      overheated: false,
    };
  }
  const nextHeat = heat + DERIVED.tick.secondsPerTick;
  const roundingTolerance =
    Number.EPSILON * BALANCE.weapons.railRepeater.heatMaxS * 16;
  if (nextHeat < BALANCE.weapons.railRepeater.heatMaxS - roundingTolerance) {
    return { heat: nextHeat, overheatEndTick, overheated: false };
  }
  return {
    heat: 0,
    // This tick triggers overheat; the following full 60 ticks are blocked.
    overheatEndTick: tick + DERIVED.weapons.railRepeater.overheatTicks + 1,
    overheated: true,
  };
}
