import { AimSource, Form, GREYBOX_V1, GUN_IDS, Phase } from '@shiftborn/shared';
import {
  gunNumbers, type CoverState, type GunInventory, type GunTimers,
  type LocalPredictState, type SelectedTiers,
} from '@shiftborn/sim';
import type { AuthoritativeRead } from '../net/messageValidation.js';

export interface PredictionAuthority {
  readonly tick: number;
  readonly matchId: string;
  readonly playerId: string;
  readonly phase: Phase;
  readonly cover: readonly CoverState[];
  readonly respawnTick: number;
  readonly state: LocalPredictState;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function uint(value: unknown): value is number {
  return finite(value) && Number.isSafeInteger(value) && value >= 0 &&
    value <= 0xffffffff;
}
function form(value: unknown): Form | null {
  return value === 0 ? Form.Runner : value === 1 ? Form.Beast
    : value === 2 ? Form.Turret : null;
}
function tier(value: unknown): 0 | 1 | 2 | null {
  return value === 0 || value === 1 || value === 2 ? value : null;
}
function numbers(value: unknown, valid: (item: unknown) => boolean): number[] | null {
  return Array.isArray(value) && value.length === GUN_IDS.length &&
    value.every(valid) ? value as number[] : null;
}

/** D-076: ownership, magazines and reserves within each gun's limits. */
function guns(raw: Record<string, unknown>): GunInventory | null {
  const mask = raw.gunOwnedMask;
  const mags = numbers(raw.gunMag, uint);
  const reserves = numbers(raw.gunReserve, uint);
  if (!uint(mask) || mask >= 1 << GUN_IDS.length || mags === null ||
    reserves === null) return null;
  const inventory = {} as GunInventory;
  for (let index = 0; index < GUN_IDS.length; index += 1) {
    const gun = GUN_IDS[index];
    const mag = mags[index];
    const reserve = reserves[index];
    if (gun === undefined || mag === undefined || reserve === undefined) return null;
    const owned = (mask & (1 << index)) !== 0;
    const limits = gunNumbers(gun);
    if (mag > limits.magazine || reserve > limits.reserveMax ||
      (!owned && (mag !== 0 || reserve !== 0))) return null;
    inventory[gun] = { owned, mag, reserve };
  }
  return inventory;
}
function gunTimers(value: unknown): GunTimers | null {
  const values = numbers(value, finite);
  if (values === null) return null;
  const timers = {} as GunTimers;
  for (let index = 0; index < GUN_IDS.length; index += 1) {
    const gun = GUN_IDS[index];
    const timer = values[index];
    if (gun === undefined || timer === undefined) return null;
    timers[gun] = timer;
  }
  return timers;
}

/** GR-18.1: bit 0 (Runner) is always set; bits 3 to 7 are invalid. */
function unlocked(value: unknown): Record<Form, boolean> | null {
  if (!uint(value) || value > 7 || (value & 1) === 0) return null;
  return { [Form.Runner]: true, [Form.Beast]: (value & 2) !== 0,
    [Form.Turret]: (value & 4) !== 0 };
}
function source(value: unknown): typeof AimSource[keyof typeof AimSource] | null {
  return value === 0 ? AimSource.Mouse : value === 1 ? AimSource.Keys
    : value === 2 ? AimSource.Lock : value === 3 ? AimSource.Touch
      : value === 4 ? AimSource.Pad : null;
}

/** D-071: reject incomplete patches rather than replaying from stale local timers. */
export function readPredictionAuthority(read: AuthoritativeRead,
  playerId: string): PredictionAuthority | null {
  const rawPlayers = read.full.players;
  const raw = record(rawPlayers) ? rawPlayers[playerId] : null;
  const locomotion = record(raw) && record(raw.locomotion) ? raw.locomotion : null;
  if (!record(raw) || !locomotion || read.players[playerId] === undefined ||
    !uint(read.tick) || typeof read.matchId !== 'string' ||
    typeof raw.alive !== 'boolean' || !finite(raw.x) || !finite(raw.y) ||
    !uint(locomotion.aimDist) || locomotion.aimDist < 20 || locomotion.aimDist > 240 || typeof locomotion.sprinting !== 'boolean' ||
    !finite(raw.vx) || !finite(raw.vy) || !finite(raw.aim) ||
    form(raw.form) === null || !uint(raw.morphReadyTick) ||
    !uint(raw.morphEndTick) || !uint(raw.abilityStartTick) ||
    !uint(raw.abilityEndTick) || !finite(raw.abilityDirX) ||
    !finite(raw.abilityDirY) || !uint(raw.abilityReadyRunner) ||
    !uint(raw.abilityReadyBeast) || !uint(raw.abilityReadyTurret) ||
    !finite(raw.heat) ||
    !uint(raw.overheatEndTick) || !uint(raw.stunEndTick) ||
    !uint(raw.ccImmuneEndTick) || !uint(raw.knockbackEndTick) ||
    !finite(raw.kbvx) || !finite(raw.kbvy) ||
    !uint(raw.protectedEndTick) || !uint(raw.respawnTick) ||
    !finite(raw.flux) || !uint(raw.lastInputSeq) ||
    !uint(raw.lastButtonInputSeq) || !uint(raw.lastHeldButtons) ||
    raw.lastHeldButtons > 0xffff || !uint(raw.lastShotInputSeq) ||
    !uint(raw.nextShotIdx) || source(raw.aimSource) === null) return null;
  if (raw.morphTarget !== -1 && form(raw.morphTarget) === null) return null;
  if (raw.abilityId !== -1 && raw.abilityId !== 0) return null;
  if (raw.abilityPhase !== 0 && raw.abilityPhase !== 1 &&
    raw.abilityPhase !== 2) return null;
  const rawCover = read.full.cover;
  if (!Array.isArray(rawCover) || rawCover.length !== GREYBOX_V1.cover.length ||
    !rawCover.every((entry: unknown) => record(entry) &&
      typeof entry.intact === 'boolean')) return null;
  const phase = read.phase === 0 ? Phase.Countdown : read.phase === 1
    ? Phase.Playing : read.phase === 2 ? Phase.Results : null;
  const selectedForm = form(raw.form);
  const aimSource = source(raw.aimSource);
  const unlockedForms = unlocked(raw.unlockedMask);
  const inventory = guns(raw);
  const timers = gunTimers(raw.gunNextShotIn);
  const runnerTier = tier(raw.selectedRunner);
  const beastTier = tier(raw.selectedBeast);
  const turretTier = tier(raw.selectedTurret);
  const reloadGun = raw.reloadGun === -1 ? null
    : typeof raw.reloadGun === 'number' ? GUN_IDS[raw.reloadGun] ?? undefined : undefined;
  if (phase === null || selectedForm === null || aimSource === null ||
    unlockedForms === null || inventory === null || timers === null ||
    runnerTier === null || beastTier === null || turretTier === null ||
    reloadGun === undefined || !uint(raw.reloadEndTick) ||
    !uint(raw.swapReadyTick) || typeof raw.meleeActive !== 'boolean' ||
    !uint(raw.meleeStartTick) || !uint(raw.meleeStrikeTick) ||
    !uint(raw.meleeEndTick)) return null;
  const selectedTier: SelectedTiers = { [Form.Runner]: runnerTier,
    [Form.Beast]: beastTier, [Form.Turret]: turretTier };
  const morphTarget = raw.morphTarget === -1 ? null : form(raw.morphTarget);
  const state: LocalPredictState = {
    alive: raw.alive, pos: { x: raw.x, y: raw.y },
    vel: { x: raw.vx, y: raw.vy }, aim: raw.aim, form: selectedForm,
    unlocked: unlockedForms, aimDistM: locomotion.aimDist / 10, sprinting: locomotion.sprinting,
    morph: morphTarget === null ? null : { target: morphTarget,
      endTick: raw.morphEndTick as number },
    morphReadyTick: raw.morphReadyTick,
    ability: raw.abilityId === 0 ? { id: 'dash',
      startTick: raw.abilityStartTick as number,
      endTick: raw.abilityEndTick as number,
      dirX: raw.abilityDirX as number, dirY: raw.abilityDirY as number } : null,
    abilityReadyTick: { [Form.Runner]: raw.abilityReadyRunner as number,
      [Form.Beast]: raw.abilityReadyBeast as number,
      [Form.Turret]: raw.abilityReadyTurret as number },
    guns: inventory, selectedTier, gunTimers: timers,
    reload: reloadGun === null ? null
      : { gun: reloadGun, endTick: raw.reloadEndTick },
    swapReadyTick: raw.swapReadyTick,
    melee: raw.meleeActive ? { startTick: raw.meleeStartTick,
      strikeTick: raw.meleeStrikeTick, endTick: raw.meleeEndTick } : null,
    heat: raw.heat, overheatEndTick: raw.overheatEndTick,
    stunEndTick: raw.stunEndTick, ccImmuneEndTick: raw.ccImmuneEndTick,
    knockback: raw.knockbackEndTick > 0
      ? { vel: { x: raw.kbvx, y: raw.kbvy }, endTick: raw.knockbackEndTick }
      : null,
    protectedEndTick: raw.protectedEndTick,
    lastInputSeq: raw.lastInputSeq,
    lastButtonInputSeq: raw.lastButtonInputSeq === 0 ? -1 : raw.lastButtonInputSeq,
    lastHeldButtons: raw.lastHeldButtons,
    lastShotInputSeq: raw.lastShotInputSeq === 0 ? -1 : raw.lastShotInputSeq,
    nextShotIdx: raw.nextShotIdx,
    aimSource, authoritativeFlux: raw.flux,
    provisionalMorphCost: 0, shotsThisTick: [],
  };
  return { tick: read.tick, matchId: read.matchId, playerId, phase,
    cover: rawCover.map((entry: unknown, index: number) => ({
      id: GREYBOX_V1.cover[index]?.id ?? '',
      intact: (entry as { intact: boolean }).intact,
    })), respawnTick: raw.respawnTick, state };
}
