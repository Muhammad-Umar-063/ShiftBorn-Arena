import { AimSource } from './constants.js';
import type { AbilityId, Cause, Form, Phase, WeaponId } from './constants.js';

// NETWORK_PROTOCOL §2: initial wire version.
export const PROTOCOL_VERSION = 1;

export const ClientMessageId = {
  Input: 1,
  Ping: 2,
  Vis: 3,
  HostSettings: 4,
  DevCmd: 5,
  ClientStats: 6,
  ProbeReply: 7,
} as const;
export type ClientMessageId =
  (typeof ClientMessageId)[keyof typeof ClientMessageId];

export const ServerMessageId = {
  Welcome: 100,
  Pong: 101,
  Ev: 102,
  Probe: 103,
  AfkWarn: 104,
  Control: 105,
  Notice: 106,
  DevResult: 107,
} as const;
export type ServerMessageId =
  (typeof ServerMessageId)[keyof typeof ServerMessageId];

export const ClientAimSourceCode = {
  Mouse: 0,
  Keys: 1,
  Lock: 2,
  Touch: 3,
  Pad: 4,
} as const;
export type ClientAimSourceCode =
  (typeof ClientAimSourceCode)[keyof typeof ClientAimSourceCode];
export type ClientAimSource = Exclude<AimSource, typeof AimSource.Bot>;

export const InputButton = {
  Fire: 1 << 0,
  Ability: 1 << 1,
  MorphRunner: 1 << 2,
  MorphBeast: 1 << 3,
  MorphTurret: 1 << 4,
  Crate: 1 << 5,
  Ultimate: 1 << 6,
  Interact: 1 << 7,
} as const;
export type InputButton = (typeof InputButton)[keyof typeof InputButton];
export const VALID_BUTTON_MASK = 0x00ff;
export const UNUSED_BUTTON_MASK = 0xff00;

export interface InputFrame {
  readonly seq: number;
  readonly moveX: number;
  readonly moveY: number;
  readonly aim: number;
  readonly buttons: number;
  readonly aimSource: AimSource;
}
export interface ClientInputFrame extends InputFrame {
  readonly aimSource: ClientAimSource;
}

export interface DecodedInputPacket {
  readonly frames: readonly ClientInputFrame[];
  readonly rejectedFrames: number;
  readonly packetValid: boolean;
}

const MAX_SEQUENCE = 4_294_967_295;
const MAX_SEQUENCE_DISTANCE = 1000;
const FRAME_WIDTH = 6;
const MAX_FRAMES_PER_PACKET = 3;

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function sequenceIsValid(
  seq: unknown,
  lastReceivedSeq?: number,
): seq is number {
  if (!integerInRange(seq, 1, MAX_SEQUENCE)) return false;
  if (lastReceivedSeq === undefined) return true;
  return (
    integerInRange(lastReceivedSeq, 0, MAX_SEQUENCE) &&
    Math.abs(seq - lastReceivedSeq) <= MAX_SEQUENCE_DISTANCE
  );
}

function aimSourceCode(source: unknown): ClientAimSourceCode | null {
  switch (source) {
    case AimSource.Mouse:
      return ClientAimSourceCode.Mouse;
    case AimSource.Keys:
      return ClientAimSourceCode.Keys;
    case AimSource.Lock:
      return ClientAimSourceCode.Lock;
    case AimSource.Touch:
      return ClientAimSourceCode.Touch;
    case AimSource.Pad:
      return ClientAimSourceCode.Pad;
    default:
      return null;
  }
}

function aimSourceFromCode(code: unknown): ClientAimSource | null {
  switch (code) {
    case ClientAimSourceCode.Mouse:
      return AimSource.Mouse;
    case ClientAimSourceCode.Keys:
      return AimSource.Keys;
    case ClientAimSourceCode.Lock:
      return AimSource.Lock;
    case ClientAimSourceCode.Touch:
      return AimSource.Touch;
    case ClientAimSourceCode.Pad:
      return AimSource.Pad;
    default:
      return null;
  }
}

// NETWORK_PROTOCOL §5.2: client input is checked without coercion or clamping.
export function isValidClientInputFrame(
  value: unknown,
  lastReceivedSeq?: number,
): value is ClientInputFrame {
  if (typeof value !== 'object' || value === null) return false;
  const frame = value as Record<string, unknown>;
  return (
    sequenceIsValid(frame.seq, lastReceivedSeq) &&
    integerInRange(frame.moveX, -127, 127) &&
    integerInRange(frame.moveY, -127, 127) &&
    integerInRange(frame.aim, 0, 65535) &&
    integerInRange(frame.buttons, 0, 65535) &&
    (frame.buttons & UNUSED_BUTTON_MASK) === 0 &&
    aimSourceCode(frame.aimSource) !== null
  );
}

// Frames are supplied newest first; invalid input returns null without mutation.
export function encodeInputPacket(
  frames: readonly InputFrame[],
): readonly number[] | null {
  if (
    !Array.isArray(frames) ||
    frames.length < 1 ||
    frames.length > MAX_FRAMES_PER_PACKET
  ) {
    return null;
  }
  const packet: number[] = [];
  let previousSeq = Infinity;
  for (const frame of frames) {
    if (!isValidClientInputFrame(frame) || frame.seq >= previousSeq)
      return null;
    const code = aimSourceCode(frame.aimSource);
    if (code === null) return null;
    packet.push(
      frame.seq,
      frame.moveX,
      frame.moveY,
      frame.aim,
      frame.buttons,
      code,
    );
    previousSeq = frame.seq;
  }
  return packet;
}

function decodeFrame(
  values: readonly unknown[],
  lastReceivedSeq?: number,
): ClientInputFrame | null {
  const [seq, moveX, moveY, aim, buttons, code] = values;
  const source = aimSourceFromCode(code);
  if (source === null) return null;
  const frame = { seq, moveX, moveY, aim, buttons, aimSource: source };
  return isValidClientInputFrame(frame, lastReceivedSeq) ? frame : null;
}

export function decodeInputPacket(
  payload: unknown,
  lastReceivedSeq?: number,
): DecodedInputPacket {
  if (
    !Array.isArray(payload) ||
    payload.length < FRAME_WIDTH ||
    payload.length > FRAME_WIDTH * MAX_FRAMES_PER_PACKET ||
    payload.length % FRAME_WIDTH !== 0
  ) {
    return { frames: [], rejectedFrames: 0, packetValid: false };
  }
  const frames: ClientInputFrame[] = [];
  let rejectedFrames = 0;
  let previousSeq = Infinity;
  for (let offset = 0; offset < payload.length; offset += FRAME_WIDTH) {
    const frame = decodeFrame(
      payload.slice(offset, offset + FRAME_WIDTH),
      lastReceivedSeq,
    );
    if (frame === null || frame.seq >= previousSeq) {
      rejectedFrames += 1;
      continue;
    }
    frames.push(frame);
    previousSeq = frame.seq;
  }
  return { frames, rejectedFrames, packetValid: true };
}

// NETWORK_PROTOCOL §5.3: event IDs follow the expanded table order.
export const EventId = {
  ProjectileSpawn: 1,
  ProjectileHit: 2,
  ProjectileImpact: 3,
  ProjectileExpire: 4,
  Blocked: 5,
  MorphStart: 6,
  MorphEnd: 7,
  MorphDenied: 8,
  AbilityStart: 9,
  AbilityEnd: 10,
  AbilityHit: 11,
  RailShotFired: 12,
  Stun: 13,
  Knockback: 14,
  Overheat: 15,
  Death: 16,
  Spawn: 17,
  Respawn: 18,
  ShardSpawn: 19,
  ShardPickup: 20,
  ShardExpire: 21,
  ClusterAnnounce: 22,
  CoverDestroyed: 23,
  CoverRebuilt: 24,
  ZoneAnnounce: 25,
  ZoneMoved: 26,
  ZoneState: 27,
  Phase: 28,
  MatchEnd: 29,
  BotReplaced: 30,
} as const;
export type EventId = (typeof EventId)[keyof typeof EventId];

export const DamageTag = { Effective: 1, Resisted: 2, Armor: 4 } as const;
export type DamageTag = (typeof DamageTag)[keyof typeof DamageTag];
export const MorphDenialReason = {
  Cooldown: 0,
  Flux: 1,
  Busy: 2,
  Phase: 3,
} as const;
export type MorphDenialReason =
  (typeof MorphDenialReason)[keyof typeof MorphDenialReason];

// §5.3 does not fix the representation of projectile and shard IDs yet.
export type EventEntityId = string | number;
export type ProjectileSpawnEvent = readonly [
  typeof EventId.ProjectileSpawn,
  id: EventEntityId,
  ownerSeat: number,
  weapon: WeaponId,
  x: number,
  y: number,
  angle: number,
  spawnTick: number,
  advancedTicks: number,
  inputSeq: number,
  shotIdx: number,
];
export type ProjectileHitEvent = readonly [
  typeof EventId.ProjectileHit,
  id: EventEntityId,
  targetSeat: number,
  damage: number,
  tags: number,
  x: number,
  y: number,
];
export type ProjectileImpactEvent = readonly [
  typeof EventId.ProjectileImpact,
  id: EventEntityId,
  x: number,
  y: number,
];
export type ProjectileExpireEvent = readonly [
  typeof EventId.ProjectileExpire,
  id: EventEntityId,
];
export type BlockedEvent = readonly [
  typeof EventId.Blocked,
  id: EventEntityId,
  targetSeat: number,
];
export type MorphStartEvent = readonly [
  typeof EventId.MorphStart,
  seat: number,
  from: Form,
  to: Form,
  endTick: number,
];
export type MorphEndEvent = readonly [
  typeof EventId.MorphEnd,
  seat: number,
  form: Form,
];
export type MorphDeniedEvent = readonly [
  typeof EventId.MorphDenied,
  seat: number,
  target: Form,
  reason: MorphDenialReason,
];
export type AbilityStartEvent = readonly [
  typeof EventId.AbilityStart,
  seat: number,
  ability: AbilityId,
  startTick: number,
  endTick: number,
  dirX: number,
  dirY: number,
];
export type AbilityEndEvent = readonly [
  typeof EventId.AbilityEnd,
  seat: number,
  ability: AbilityId,
  cancelled: 0 | 1,
];
export type AbilityHitEvent = readonly [
  typeof EventId.AbilityHit,
  seat: number,
  ability: AbilityId,
  targetSeat: number,
  damage: number,
  tags: number,
];
export type RailShotFiredEvent = readonly [
  typeof EventId.RailShotFired,
  seat: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
];
export type StunEvent = readonly [
  typeof EventId.Stun,
  seat: number,
  endTick: number,
];
export type KnockbackEvent = readonly [
  typeof EventId.Knockback,
  seat: number,
  vx: number,
  vy: number,
  endTick: number,
];
export type OverheatEvent = readonly [
  typeof EventId.Overheat,
  seat: number,
  endTick: number,
];
export type DeathEvent = readonly [
  typeof EventId.Death,
  victimSeat: number,
  killerSeat: number,
  cause: Cause,
  killerForm: Form,
  victimForm: Form,
  finalDamage: number,
  counterForm: Form,
  ...assistSeats: number[],
];
export type SpawnEvent = readonly [
  typeof EventId.Spawn,
  seat: number,
  x: number,
  y: number,
  protectedEndTick: number,
];
export type RespawnEvent = readonly [
  typeof EventId.Respawn,
  seat: number,
  x: number,
  y: number,
  protectedEndTick: number,
];
export type ShardSpawnEvent = readonly [
  typeof EventId.ShardSpawn,
  shardId: EventEntityId,
];
export type ShardPickupEvent = readonly [
  typeof EventId.ShardPickup,
  shardId: EventEntityId,
  seat: number,
  value: number,
];
export type ShardExpireEvent = readonly [
  typeof EventId.ShardExpire,
  shardId: EventEntityId,
];
export type ClusterAnnounceEvent = readonly [
  typeof EventId.ClusterAnnounce,
  pointIndex: number,
  spawnTick: number,
];
export type CoverDestroyedEvent = readonly [
  typeof EventId.CoverDestroyed,
  coverIndex: number,
];
export type CoverRebuiltEvent = readonly [
  typeof EventId.CoverRebuilt,
  coverIndex: number,
];
export type ZoneAnnounceEvent = readonly [
  typeof EventId.ZoneAnnounce,
  nextPoint: number,
  moveTick: number,
];
export type ZoneMovedEvent = readonly [typeof EventId.ZoneMoved, point: number];
export type ZoneStateEvent = readonly [
  typeof EventId.ZoneState,
  state: number,
  holderSeat: number,
];
export type PhaseEvent = readonly [
  typeof EventId.Phase,
  phase: Phase,
  phaseEndTick: number,
];
export type MatchEndEvent = readonly [
  typeof EventId.MatchEnd,
  ranking: readonly number[],
];
export type BotReplacedEvent = readonly [
  typeof EventId.BotReplaced,
  seat: number,
  newPlayerId: string,
];

export type EncodedEvent =
  | ProjectileSpawnEvent
  | ProjectileHitEvent
  | ProjectileImpactEvent
  | ProjectileExpireEvent
  | BlockedEvent
  | MorphStartEvent
  | MorphEndEvent
  | MorphDeniedEvent
  | AbilityStartEvent
  | AbilityEndEvent
  | AbilityHitEvent
  | RailShotFiredEvent
  | StunEvent
  | KnockbackEvent
  | OverheatEvent
  | DeathEvent
  | SpawnEvent
  | RespawnEvent
  | ShardSpawnEvent
  | ShardPickupEvent
  | ShardExpireEvent
  | ClusterAnnounceEvent
  | CoverDestroyedEvent
  | CoverRebuiltEvent
  | ZoneAnnounceEvent
  | ZoneMovedEvent
  | ZoneStateEvent
  | PhaseEvent
  | MatchEndEvent
  | BotReplacedEvent;

export const CloseCode = {
  VersionMismatch: 4000,
  RoomFull: 4001,
  InvalidRoomCode: 4002,
  InvalidInput: 4003,
  ServerShuttingDown: 4004,
  InternalRoomError: 4010,
} as const;
export type CloseCode = (typeof CloseCode)[keyof typeof CloseCode];
