import {
  AimSource, BALANCE, Controller, DERIVED, Form, Mode, REPLAY_FORMAT_VERSION,
  UNUSED_BUTTON_MASK, balanceHash, isValidClientInputFrame,
  isBotDifficultyCode,
  type InputFrame, type ReplayCheckpoint, type ReplayEnd,
  type ReplayHeader, type ReplayTick,
} from '@shiftborn/shared';
import { deriveMatchId, isWorldSnapshot } from '@shiftborn/sim';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function hash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function form(value: unknown): boolean {
  return value === Form.Runner || value === Form.Beast || value === Form.Turret;
}

function controller(value: unknown): boolean {
  return value === Controller.Human || value === Controller.Bot ||
    value === Controller.Proxy;
}

function point(value: unknown): boolean {
  return object(value) && typeof value.x === 'number' &&
    Number.isFinite(value.x) && typeof value.y === 'number' &&
    Number.isFinite(value.y);
}

function frame(value: unknown): value is InputFrame {
  if (!object(value)) return false;
  if (value.aimSource === AimSource.Bot) {
    return integer(value.seq) && value.seq >= 0 &&
      integer(value.moveX) && value.moveX >= -127 && value.moveX <= 127 &&
      integer(value.moveY) && value.moveY >= -127 && value.moveY <= 127 &&
      typeof value.aim === 'number' && Number.isFinite(value.aim) &&
      value.aim >= 0 && value.aim < 2 * Math.PI &&
      integer(value.buttons) && value.buttons >= 0 &&
      (value.buttons & UNUSED_BUTTON_MASK) === 0;
  }
  return isValidClientInputFrame(value);
}

function fixedArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === BALANCE.match.seats;
}

function roomSettings(value: unknown): boolean {
  return object(value) && Object.keys(value).length === 3 &&
    typeof value.botFill === 'boolean' &&
    isBotDifficultyCode(value.botDifficulty) &&
    (value.nextMode === Mode.Frenzy || value.nextMode === Mode.ZoneFrenzy);
}

function roomState(value: unknown): boolean {
  return object(value) && Object.keys(value).length === 3 &&
    roomSettings(value.active) && roomSettings(value.pending) &&
    typeof value.botsFrozen === 'boolean';
}

export function parseHeader(value: unknown): ReplayHeader {
  if (!object(value) || value.kind !== 'header' ||
    value.version !== REPLAY_FORMAT_VERSION ||
    typeof value.matchId !== 'string' ||
    !integer(value.roomSeed) || !integer(value.matchIndex) ||
    value.matchIndex < 0 ||
    (value.mode !== Mode.Frenzy && value.mode !== Mode.ZoneFrenzy) ||
    value.matchId !== deriveMatchId(value.roomSeed, value.matchIndex) ||
    value.mapId !== 'greybox_v1' ||
    value.balanceVersion !== BALANCE.version ||
    value.balanceHash !== balanceHash() ||
    typeof value.buildId !== 'string' || !hash(value.initialHash) ||
    !isWorldSnapshot(value.initialSnapshot))
    throw new TypeError('invalid or incompatible replay header');
  if (value.initialSnapshot.mapId !== value.mapId ||
    value.initialSnapshot.roomSeed !== value.roomSeed ||
    value.initialSnapshot.matchIndex !== value.matchIndex ||
    value.initialSnapshot.matchId !== value.matchId ||
    value.initialSnapshot.mode !== value.mode)
    throw new TypeError('replay header and snapshot disagree');
  return value as unknown as ReplayHeader;
}

export function parseCheckpoint(value: unknown): ReplayCheckpoint {
  if (!object(value) || value.kind !== 'checkpoint' ||
    !integer(value.t) || value.t < 0 ||
    !hash(value.beforeHash) || !hash(value.afterHash) ||
    !isWorldSnapshot(value.snapshot) || value.snapshot.tick !== value.t ||
    (Object.hasOwn(value, 'roomState') && !roomState(value.roomState)))
    throw new TypeError('invalid replay checkpoint');
  return value as unknown as ReplayCheckpoint;
}

export function parseTick(value: unknown): ReplayTick {
  if (!object(value) || value.kind !== 'tick' ||
    !integer(value.t) || value.t < 0 || !hash(value.hash) ||
    !fixedArray(value.inputs) || !value.inputs.every((item: unknown) =>
      item === null || frame(item)) ||
    !fixedArray(value.controllers) || !value.controllers.every((item: unknown) =>
      item === null || item === Controller.Human || item === Controller.Bot ||
      item === Controller.Proxy) ||
    !fixedArray(value.inputPressedButtonsBySeat) ||
    !value.inputPressedButtonsBySeat.every((item: unknown) =>
      item === null || (integer(item) && item >= 0 &&
        (item & UNUSED_BUTTON_MASK) === 0)) ||
    !fixedArray(value.spawnAdvanceTicksBySeat) ||
    !value.spawnAdvanceTicksBySeat.every((item: unknown) =>
      integer(item) && item >= 0 && item <= DERIVED.weapons.spawnAdvanceMaxTicks))
    throw new TypeError('invalid replay tick');
  return value as unknown as ReplayTick;
}

export function parseEnd(value: unknown): ReplayEnd {
  if (!object(value) || value.kind !== 'end' ||
    !integer(value.t) || value.t < 0 || !hash(value.finalHash) ||
    typeof value.natural !== 'boolean') throw new TypeError('invalid replay end');
  return value as unknown as ReplayEnd;
}

export function parseMatchLine(value: unknown): Record<string, unknown> {
  const types = [
    'match_start', 'morph', 'damage', 'death', 'match_end', 'client_stats',
  ];
  if (!object(value) || !integer(value.t) || value.t < 0 ||
    typeof value.type !== 'string' || !types.includes(value.type))
    throw new TypeError('invalid match log line');
  if (value.type === 'match_start') {
    if (typeof value.matchId !== 'string' ||
      typeof value.roomId !== 'string' || typeof value.roomCode !== 'string' ||
      (value.mode !== Mode.Frenzy && value.mode !== Mode.ZoneFrenzy) ||
      !integer(value.roomSeed) || !integer(value.matchIndex) ||
      typeof value.balanceVersion !== 'string' ||
      value.mapId !== 'greybox_v1' || typeof value.buildId !== 'string' ||
      !integer(value.botDifficulty) || value.botDifficulty < 0 ||
      value.botDifficulty > 2 || !fixedArray(value.seats) ||
      !value.seats.every((seat: unknown) => seat === null ||
        (object(seat) && typeof seat.id === 'string' &&
        typeof seat.name === 'string' && typeof seat.isBot === 'boolean' &&
        controller(seat.controller) &&
        (seat.inputScheme === null || seat.inputScheme === 'mouse' ||
          seat.inputScheme === 'keys'))))
      throw new TypeError('invalid match_start');
  } else if (value.type === 'morph') {
    if (typeof value.playerId !== 'string' || !form(value.from) ||
      !form(value.to) || !nonnegative(value.fluxBefore) ||
      !nonnegative(value.hpFrac) || typeof value.phase !== 'string')
      throw new TypeError('invalid morph record');
  } else if (value.type === 'damage') {
    if (typeof value.attackerId !== 'string' ||
      typeof value.victimId !== 'string' || !form(value.attackerForm) ||
      !form(value.victimForm) || typeof value.cause !== 'string' ||
      !nonnegative(value.amount) || !integer(value.tags))
      throw new TypeError('invalid damage record');
  } else if (value.type === 'death') {
    if (typeof value.victimId !== 'string' ||
      typeof value.killerId !== 'string' || !Array.isArray(value.assisters) ||
      !value.assisters.every((id: unknown) => typeof id === 'string') ||
      !form(value.killerForm) || !form(value.victimForm) ||
      typeof value.cause !== 'string' || !point(value.position))
      throw new TypeError('invalid death record');
  } else if (value.type === 'client_stats') {
    if (typeof value.playerId !== 'string' ||
      !nonnegative(value.fpsMedian) || !nonnegative(value.fpsP5) ||
      !nonnegative(value.rttMs) || !integer(value.corrections) ||
      (value.inputScheme !== 'mouse' && value.inputScheme !== 'keys') ||
      !object(value.windowSize) || !integer(value.windowSize.width) ||
      !integer(value.windowSize.height) || typeof value.browser !== 'string' ||
      !nonnegative(value.hiddenMs) || !integer(value.errors))
      throw new TypeError('invalid client_stats record');
  } else if (value.type === 'match_end') {
    if (!hash(value.finalHash) || !integer(value.durationTicks) ||
      !integer(value.humans) || !integer(value.bots) ||
      !Array.isArray(value.playerStats) ||
      !value.playerStats.every((item: unknown) => object(item) &&
        typeof item.playerId === 'string' && object(item.stats)))
      throw new TypeError('invalid match_end');
  }
  return value;
}
