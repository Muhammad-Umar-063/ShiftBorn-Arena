import { AimSource, Form, GREYBOX_V1, Phase } from '@shiftborn/shared';
import type { CoverState, LocalPredictState } from '@shiftborn/sim';
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
  if (!record(raw) || read.players[playerId] === undefined ||
    !uint(read.tick) || typeof read.matchId !== 'string' ||
    typeof raw.alive !== 'boolean' || !finite(raw.x) || !finite(raw.y) ||
    !finite(raw.vx) || !finite(raw.vy) || !finite(raw.aim) ||
    form(raw.form) === null || !uint(raw.morphReadyTick) ||
    !uint(raw.morphEndTick) || !uint(raw.abilityStartTick) ||
    !uint(raw.abilityEndTick) || !finite(raw.abilityDirX) ||
    !finite(raw.abilityDirY) || !uint(raw.abilityReadyRunner) ||
    !uint(raw.abilityReadyBeast) || !uint(raw.abilityReadyTurret) ||
    !finite(raw.weaponRunnerNextShotIn) || !finite(raw.weaponBeastNextShotIn) ||
    !finite(raw.weaponTurretNextShotIn) || !finite(raw.heat) ||
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
  if (phase === null || selectedForm === null || aimSource === null) return null;
  const morphTarget = raw.morphTarget === -1 ? null : form(raw.morphTarget);
  const state: LocalPredictState = {
    alive: raw.alive, pos: { x: raw.x, y: raw.y },
    vel: { x: raw.vx, y: raw.vy }, aim: raw.aim, form: selectedForm,
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
    weapon: { [Form.Runner]: { nextShotIn: raw.weaponRunnerNextShotIn },
      [Form.Beast]: { nextShotIn: raw.weaponBeastNextShotIn },
      [Form.Turret]: { nextShotIn: raw.weaponTurretNextShotIn } },
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
