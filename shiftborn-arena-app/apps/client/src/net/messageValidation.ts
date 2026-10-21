import {
  BALANCE, GREYBOX_V1, PROTOCOL_VERSION, isValidRoomCode,
} from '@shiftborn/shared';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function uint(value: unknown, maximum = 0xffffffff): value is number {
  return finite(value) && Number.isInteger(value) && value >= 0 && value <= maximum;
}

export interface Welcome {
  readonly protocolVersion: number;
  readonly buildId: string;
  readonly playerId: string;
  readonly seat: number;
  readonly isHost: boolean;
  readonly roomCode: string;
  readonly mapId: string;
  readonly balanceVersion: string;
  readonly balanceHash: string;
  readonly serverTick: number;
  readonly tickRate: number;
  readonly patchRate: number;
  readonly testerCode: string;
}

export type WelcomeResult =
  | { readonly kind: 'valid'; readonly value: Welcome }
  | { readonly kind: 'mismatch' }
  | { readonly kind: 'invalid' };

/** NETWORK_PROTOCOL §§2, 5.1: reject malformed data before advancing the UI. */
export function validateWelcome(value: unknown, localHash: string): WelcomeResult {
  if (!record(value)) return { kind: 'invalid' };
  const v = value;
  if (!uint(v.protocolVersion) || !text(v.balanceVersion) || !text(v.balanceHash))
    return { kind: 'invalid' };
  if (v.protocolVersion !== PROTOCOL_VERSION || v.balanceVersion !== BALANCE.version ||
    v.balanceHash !== localHash) return { kind: 'mismatch' };
  if (!text(v.buildId) || !text(v.playerId) || v.playerId.length === 0 ||
    !uint(v.seat, 7) || typeof v.isHost !== 'boolean' ||
    !isValidRoomCode(v.roomCode) || !text(v.mapId) || v.mapId !== GREYBOX_V1.id ||
    !uint(v.serverTick) || v.tickRate !== BALANCE.tick.rateHz ||
    v.patchRate !== BALANCE.tick.patchRateHz || !text(v.testerCode))
    return { kind: 'invalid' };
  return { kind: 'valid', value: {
    protocolVersion: v.protocolVersion, buildId: v.buildId,
    playerId: v.playerId, seat: v.seat, isHost: v.isHost,
    roomCode: v.roomCode, mapId: v.mapId,
    balanceVersion: v.balanceVersion, balanceHash: v.balanceHash,
    serverTick: v.serverTick, tickRate: v.tickRate, patchRate: v.patchRate,
    testerCode: v.testerCode,
  } };
}

export interface PlayerRead {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly isBot: boolean;
  readonly controller: number;
  readonly connected: boolean;
  readonly alive: boolean;
  readonly x: number;
  readonly y: number;
  readonly aim: number;
  readonly form: number;
  readonly hpFrac: number;
  readonly flux: number;
  readonly kos: number;
  readonly deaths: number;
  readonly assists: number;
  readonly points: number;
  readonly damageDealt: number;
  readonly lastInputSeq: number;
}

export interface AuthoritativeRead {
  readonly tick: number;
  readonly phase: number;
  readonly matchId: string;
  readonly players: Readonly<Record<string, PlayerRead>>;
  /** Detached full Schema JSON for later prediction/render consumers. */
  readonly full: Readonly<Record<string, unknown>>;
}

function player(value: unknown): PlayerRead | null {
  if (!record(value) || !text(value.id) || !text(value.name) ||
    !uint(value.seat, 7) || typeof value.isBot !== 'boolean' ||
    !uint(value.controller, 2) || typeof value.connected !== 'boolean' ||
    typeof value.alive !== 'boolean' || !finite(value.x) || !finite(value.y) ||
    !finite(value.aim) || !uint(value.form, 2) || !finite(value.hpFrac) ||
    !finite(value.flux) || !uint(value.kos, 65535) ||
    !uint(value.deaths, 65535) || !uint(value.assists, 65535) ||
    !finite(value.points) || !finite(value.damageDealt) ||
    !uint(value.lastInputSeq)) return null;
  return {
    id: value.id, name: value.name, seat: value.seat,
    isBot: value.isBot, controller: value.controller,
    connected: value.connected, alive: value.alive,
    x: value.x, y: value.y, aim: value.aim, form: value.form,
    hpFrac: value.hpFrac, flux: value.flux,
    kos: value.kos, deaths: value.deaths, assists: value.assists,
    points: value.points, damageDealt: value.damageDealt,
    lastInputSeq: value.lastInputSeq,
  };
}

export function readAuthoritativeState(state: unknown): AuthoritativeRead | null {
  try {
    const source = record(state) && typeof state.toJSON === 'function'
      ? state.toJSON() as unknown : state;
    const detached = JSON.parse(JSON.stringify(source)) as unknown;
    if (!record(detached) || !uint(detached.tick) ||
      !uint(detached.phase, 2) || !text(detached.matchId) ||
      !record(detached.players)) return null;
    const players: Record<string, PlayerRead> = {};
    for (const [id, raw] of Object.entries(detached.players)) {
      const read = player(raw);
      if (read === null || read.id !== id) return null;
      players[id] = read;
    }
    return {
      tick: detached.tick, phase: detached.phase,
      matchId: detached.matchId, players, full: detached,
    };
  } catch { return null; }
}

export function decodeProbe(value: unknown): number | null {
  return Array.isArray(value) && value.length === 1 &&
    finite(value[0]) && value[0] >= 0 ? value[0] : null;
}

export interface EventBatch {
  readonly tick: number;
  readonly events: readonly (readonly unknown[])[];
}

export function decodeEventBatch(value: unknown): EventBatch | null {
  if (!Array.isArray(value) || value.length < 1 || !uint(value[0])) return null;
  const events: unknown[][] = [];
  for (const entry of value.slice(1)) {
    if (!Array.isArray(entry) || !uint(entry[0], 30) || entry[0] < 1)
      return null;
    events.push(structuredClone(entry) as unknown[]);
  }
  return { tick: value[0], events };
}

export function decodeControl(value: unknown): number | null {
  return Array.isArray(value) && value.length === 1 && uint(value[0], 2)
    ? value[0] : null;
}

export function decodeAfkWarn(value: unknown): number | null {
  return Array.isArray(value) && value.length === 1 && uint(value[0])
    ? value[0] : null;
}

export interface Notice { readonly kind: string; readonly text: string }
export function decodeNotice(value: unknown): Notice | null {
  return record(value) && text(value.kind) && value.kind.length > 0 &&
    text(value.text) ? { kind: value.kind, text: value.text } : null;
}

export interface DevResult { readonly ok: boolean; readonly text: string }
export function decodeDevResult(value: unknown): DevResult | null {
  return record(value) && typeof value.ok === 'boolean' && text(value.text)
    ? { ok: value.ok, text: value.text } : null;
}
