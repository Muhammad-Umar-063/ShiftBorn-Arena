import {
  BALANCE,
  DERIVED,
  Form,
  GUN_FORM,
  GUN_IDS,
  GUN_TIER,
  WeaponId,
  gunFor,
  type GunId,
  type GunTier,
} from '@shiftborn/shared';
import type { PlayerRecord } from './player.js';

export interface GunState {
  owned: boolean;
  mag: number;
  reserve: number;
}
export type GunInventory = Record<GunId, GunState>;
export type GunTimers = Record<GunId, number>;
export type SelectedTiers = Record<Form, 0 | GunTier>;
export interface ReloadState {
  readonly gun: GunId;
  readonly endTick: number;
}
export interface MeleeState {
  readonly startTick: number;
  readonly strikeTick: number;
  readonly endTick: number;
}

export interface GunNumbers {
  readonly magazine: number;
  readonly reserveMax: number;
  readonly ammoPerPickup: number;
  readonly reloadTicks: number;
  readonly intervalS: number;
}

/** BALANCE §4: one lookup for every per-gun ammunition and timing value. */
export function gunNumbers(gun: GunId): GunNumbers {
  switch (gun) {
    case WeaponId.PulsePistol:
      return {
        ...pick(BALANCE.weapons.pulsePistol),
        reloadTicks: DERIVED.weapons.pulsePistol.reloadTicks,
        intervalS: DERIVED.weapons.pulsePistol.intervalS,
      };
    case WeaponId.RicochetDisc:
      return {
        ...pick(BALANCE.weapons.ricochetDisc),
        reloadTicks: DERIVED.weapons.ricochetDisc.reloadTicks,
        intervalS: DERIVED.weapons.ricochetDisc.intervalS,
      };
    case WeaponId.ScatterCannon:
      return {
        ...pick(BALANCE.weapons.scatterCannon),
        reloadTicks: DERIVED.weapons.scatterCannon.reloadTicks,
        intervalS: DERIVED.weapons.scatterCannon.intervalS,
      };
    case WeaponId.SlugCannon:
      return {
        ...pick(BALANCE.weapons.slugCannon),
        reloadTicks: DERIVED.weapons.slugCannon.reloadTicks,
        intervalS: DERIVED.weapons.slugCannon.intervalS,
      };
    case WeaponId.RailRepeater:
      return {
        ...pick(BALANCE.weapons.railRepeater),
        reloadTicks: DERIVED.weapons.railRepeater.reloadTicks,
        intervalS: DERIVED.weapons.railRepeater.intervalS,
      };
    case WeaponId.ArcMortar:
      return {
        ...pick(BALANCE.weapons.arcMortar),
        reloadTicks: DERIVED.weapons.arcMortar.reloadTicks,
        intervalS: DERIVED.weapons.arcMortar.intervalS,
      };
  }
}

function pick(values: {
  readonly magazine: number;
  readonly reserveMax: number;
  readonly ammoPerPickup: number;
}): Pick<GunNumbers, 'magazine' | 'reserveMax' | 'ammoPerPickup'> {
  return {
    magazine: values.magazine,
    reserveMax: values.reserveMax,
    ammoPerPickup: values.ammoPerPickup,
  };
}

/** GR-18.1: a fresh loadout owns no gun. */
export function emptyGuns(): GunInventory {
  const guns = {} as GunInventory;
  for (const gun of GUN_IDS) guns[gun] = { owned: false, mag: 0, reserve: 0 };
  return guns;
}

export function zeroGunTimers(): GunTimers {
  const timers = {} as GunTimers;
  for (const gun of GUN_IDS) timers[gun] = 0;
  return timers;
}

export function noSelection(): SelectedTiers {
  return { [Form.Runner]: 0, [Form.Beast]: 0, [Form.Turret]: 0 };
}

export function cloneGuns(guns: Readonly<GunInventory>): GunInventory {
  const copy = {} as GunInventory;
  for (const gun of GUN_IDS) copy[gun] = { ...guns[gun] };
  return copy;
}

/** GR-7.15: the gun the current form uses, or null for the dagger. */
export function selectedGun(
  player: Pick<PlayerRecord, 'form' | 'selectedTier' | 'guns'>,
): GunId | null {
  const tier = player.selectedTier[player.form];
  if (tier === 0) return null;
  const gun = gunFor(player.form, tier);
  return player.guns[gun].owned ? gun : null;
}

/** GR-7.17: a gun with rounds in its magazine or reserve. */
export function usableGun(
  player: Pick<PlayerRecord, 'form' | 'selectedTier' | 'guns'>,
): GunId | null {
  const gun = selectedGun(player);
  if (gun === null) return null;
  const state = player.guns[gun];
  return state.mag + state.reserve > 0 ? gun : null;
}

/** GR-7.16: the other owned gun of the current form, if both are owned. */
export function swapTarget(
  player: Pick<PlayerRecord, 'form' | 'selectedTier' | 'guns'>,
): GunId | null {
  const current = selectedGun(player);
  if (current === null) return null;
  const other = gunFor(player.form, GUN_TIER[current] === 1 ? 2 : 1);
  return player.guns[other].owned ? other : null;
}

export function gunForm(gun: GunId): Form {
  return GUN_FORM[gun];
}

/** GR-7.32: a strike in progress until its end tick. */
export function meleeActive(
  player: Pick<PlayerRecord, 'melee'>,
  tick: number,
): boolean {
  return player.melee !== null && tick < player.melee.endTick;
}
