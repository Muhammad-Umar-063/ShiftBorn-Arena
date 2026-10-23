import {
  BALANCE,
  DERIVED,
  Form,
  GUN_IDS,
  GUN_TIER,
  InputButton,
  Phase,
  WeaponId,
  type GunId,
} from '@shiftborn/shared';
import {
  gunNumbers,
  meleeActive,
  selectedGun,
  swapTarget,
  usableGun,
  type GunTimers,
} from './loadout.js';
import type { PlayerRecord } from './player.js';
import { endSpawnProtection } from './protection.js';

type FireActor = Pick<
  PlayerRecord,
  | 'alive'
  | 'morph'
  | 'stunEndTick'
  | 'form'
  | 'overheatEndTick'
  | 'ability'
  | 'guns'
  | 'selectedTier'
  | 'reload'
  | 'swapReadyTick'
  | 'melee'
>;

export type WeaponActor = FireActor &
  Pick<PlayerRecord, 'heat' | 'gunTimers' | 'protectedEndTick'>;

/** Ordered results of one weapons step; the sim turns them into events. */
export type WeaponAction =
  | { readonly kind: 'reloadEnd'; readonly gun: GunId; readonly completed: 0 | 1 }
  | { readonly kind: 'swap'; readonly gun: GunId; readonly readyTick: number }
  | {
      readonly kind: 'meleeStart';
      readonly strikeTick: number;
      readonly endTick: number;
    }
  | { readonly kind: 'reloadStart'; readonly gun: GunId; readonly endTick: number }
  | { readonly kind: 'overheat'; readonly endTick: number }
  | { readonly kind: 'fire'; readonly gun: GunId };

const NO_ACTIONS: readonly WeaponAction[] = Object.freeze([]);

/** GR-7.3: the selected gun if it may fire this tick, before heat. */
export function canFireGun(
  player: FireActor,
  phase: Phase,
  tick: number,
): GunId | null {
  if (
    phase !== Phase.Playing ||
    !player.alive ||
    player.morph !== null ||
    tick < player.stunEndTick ||
    player.ability !== null ||
    player.reload !== null ||
    tick < player.swapReadyTick ||
    meleeActive(player, tick)
  )
    return null;
  const gun = selectedGun(player);
  if (gun === null || player.guns[gun].mag < 1) return null;
  if (gun === WeaponId.RailRepeater && tick < player.overheatEndTick) return null;
  return gun;
}

/** GR-7.16: the gun a swap would select now, or null. */
export function canSwap(
  player: FireActor,
  phase: Phase,
  tick: number,
): GunId | null {
  if (
    phase !== Phase.Playing ||
    !player.alive ||
    player.morph !== null ||
    tick < player.stunEndTick
  )
    return null;
  return swapTarget(player);
}

/** GR-7.30: every form may strike when not otherwise committed. */
export function canStartMelee(
  player: FireActor,
  phase: Phase,
  tick: number,
): boolean {
  return (
    phase === Phase.Playing &&
    player.alive &&
    player.morph === null &&
    tick >= player.stunEndTick &&
    player.ability === null &&
    !meleeActive(player, tick)
  );
}

/** GR-7.19: the selected gun if a reload may start now. */
export function canStartReload(
  player: FireActor,
  phase: Phase,
  tick: number,
): GunId | null {
  if (
    phase !== Phase.Playing ||
    !player.alive ||
    player.reload !== null ||
    player.morph !== null ||
    tick < player.stunEndTick ||
    player.ability !== null ||
    meleeActive(player, tick) ||
    tick < player.swapReadyTick
  )
    return null;
  const gun = selectedGun(player);
  if (gun === null) return null;
  const state = player.guns[gun];
  return state.mag < gunNumbers(gun).magazine && state.reserve > 0 ? gun : null;
}

/** GR-7.2: every gun's timer advances; only the selected gun can fire. */
export function advanceGunTimers(
  timers: Readonly<GunTimers>,
  gun: GunId | null,
  fireHeld: boolean,
  permitted: boolean,
): { timers: GunTimers; fired: boolean } {
  const dt = DERIVED.tick.secondsPerTick;
  const next = {} as GunTimers;
  for (const candidate of GUN_IDS) {
    const advanced = Math.max(timers[candidate] - dt, -dt);
    next[candidate] = fireHeld ? advanced : Math.max(advanced, 0);
  }
  // A mathematically zero timer can retain a few ulps after repeated subtraction.
  const fired =
    gun !== null && permitted && fireHeld && next[gun] <= Number.EPSILON;
  if (fired) next[gun] += gunNumbers(gun).intervalS;
  return { timers: next, fired };
}

export function scatterAngles(aim: number): number[] {
  return DERIVED.weapons.scatterCannon.pelletOffsetsRad.map(
    (offset) => aim + offset,
  );
}

/** D-069: one firing-order index stream for each applied input sequence. */
export function advanceShotSequence(
  history: Pick<PlayerRecord, 'lastShotInputSeq' | 'nextShotIdx'>,
  inputSeq: number,
  gun: GunId,
): { firstShotIdx: number; nextShotIdx: number } {
  const firstShotIdx = history.lastShotInputSeq === inputSeq
    ? history.nextShotIdx
    : 0;
  const count = gun === WeaponId.ScatterCannon
    ? DERIVED.weapons.scatterCannon.pelletOffsetsRad.length
    : 1;
  return { firstShotIdx, nextShotIdx: firstShotIdx + count };
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

/** GR-7.20: a cancelled reload moves no ammunition. */
export function cancelReloadState(
  player: Pick<PlayerRecord, 'reload'>,
): GunId | null {
  const reload = player.reload;
  if (reload === null) return null;
  player.reload = null;
  return reload.gun;
}

function startReload(
  player: FireActor,
  phase: Phase,
  tick: number,
  push: (action: WeaponAction) => void,
): void {
  const gun = canStartReload(player, phase, tick);
  if (gun === null) return;
  player.reload = { gun, endTick: tick + gunNumbers(gun).reloadTicks };
  push({ kind: 'reloadStart', gun, endTick: player.reload.endTick });
}

/**
 * GR-15 step 7 for one player, shared by the server and `predictStep`:
 * reload completion, swap, dagger start, reload start, heat and timers, fire,
 * then an automatic reload. Callers turn the actions into events and shots.
 */
export function advanceWeaponState(
  player: WeaponActor,
  phase: Phase,
  tick: number,
  held: boolean,
  pressed: number,
): readonly WeaponAction[] {
  let actions: WeaponAction[] | null = null;
  const push = (action: WeaponAction): void => {
    (actions ??= []).push(action);
  };
  if (player.melee !== null && tick >= player.melee.endTick) player.melee = null;
  const reload = player.reload;
  // GR-7.20: death cancels reloads in step 9; a dead player never completes one.
  if (reload !== null && player.alive && tick >= reload.endTick) {
    const state = player.guns[reload.gun];
    const moved = Math.min(gunNumbers(reload.gun).magazine - state.mag, state.reserve);
    state.mag += moved;
    state.reserve -= moved;
    player.reload = null;
    push({ kind: 'reloadEnd', gun: reload.gun, completed: 1 });
  }
  if ((pressed & InputButton.Swap) !== 0) {
    const target = canSwap(player, phase, tick);
    if (target !== null) {
      const cancelled = cancelReloadState(player);
      if (cancelled !== null) push({ kind: 'reloadEnd', gun: cancelled, completed: 0 });
      player.selectedTier[player.form] = GUN_TIER[target];
      player.swapReadyTick = tick + DERIVED.weapons.swapTicks;
      push({ kind: 'swap', gun: target, readyTick: player.swapReadyTick });
    }
  }
  const daggerRequested =
    (pressed & InputButton.Dagger) !== 0 || (held && usableGun(player) === null);
  if (daggerRequested && canStartMelee(player, phase, tick)) {
    const cancelled = cancelReloadState(player);
    if (cancelled !== null) push({ kind: 'reloadEnd', gun: cancelled, completed: 0 });
    const strikeTick = tick + DERIVED.weapons.dagger.windupTicks;
    player.melee = {
      startTick: tick,
      strikeTick,
      endTick: strikeTick + DERIVED.weapons.dagger.recoveryTicks,
    };
    endSpawnProtection(player, tick);
    push({ kind: 'meleeStart', strikeTick, endTick: player.melee.endTick });
  }
  if ((pressed & InputButton.Reload) !== 0) startReload(player, phase, tick, push);
  const gun = canFireGun(player, phase, tick);
  const heat = advanceTurretHeat(
    player.heat,
    player.overheatEndTick,
    tick,
    player.form === Form.Turret && gun === WeaponId.RailRepeater && held,
  );
  player.heat = heat.heat;
  player.overheatEndTick = heat.overheatEndTick;
  if (heat.overheated) push({ kind: 'overheat', endTick: player.overheatEndTick });
  const timers = advanceGunTimers(
    player.gunTimers,
    gun,
    held,
    gun !== null && !heat.overheated,
  );
  player.gunTimers = timers.timers;
  if (timers.fired && gun !== null) {
    player.guns[gun].mag -= 1;
    push({ kind: 'fire', gun });
  }
  const selected = selectedGun(player);
  if (selected !== null && player.guns[selected].mag === 0)
    startReload(player, phase, tick, push);
  return actions ?? NO_ACTIONS;
}
