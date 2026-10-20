import { schema, t } from '@colyseus/schema';

// NETWORK_PROTOCOL §4.2: widths and sentinel values are part of the wire contract.
export const RoomSettings = schema(
  {
    botFill: t.boolean().default(false),
    botDifficulty: t.uint8().default(0),
    nextMode: t.uint8().default(0),
  },
  'RoomSettings',
);
export type RoomSettingsState = InstanceType<typeof RoomSettings>;

export const PlayerState = schema(
  {
    id: t.string().default(''),
    name: t.string().default(''),
    seat: t.uint8().default(0),
    isBot: t.boolean().default(false),
    controller: t.uint8().default(0),
    connected: t.boolean().default(false),
    alive: t.boolean().default(false),
    x: t.float32().default(0),
    y: t.float32().default(0),
    vx: t.float32().default(0),
    vy: t.float32().default(0),
    aim: t.float32().default(0),
    form: t.uint8().default(0),
    morphTarget: t.int8().default(-1),
    morphEndTick: t.uint32().default(0),
    morphReadyTick: t.uint32().default(0),
    hpFrac: t.float32().default(0),
    flux: t.float32().default(0),
    abilityId: t.int8().default(-1),
    abilityPhase: t.uint8().default(0),
    abilityStartTick: t.uint32().default(0),
    abilityEndTick: t.uint32().default(0),
    abilityDirX: t.float32().default(0),
    abilityDirY: t.float32().default(0),
    abilityReadyRunner: t.uint32().default(0),
    abilityReadyBeast: t.uint32().default(0),
    abilityReadyTurret: t.uint32().default(0),
    heat: t.float32().default(0),
    overheatEndTick: t.uint32().default(0),
    stunEndTick: t.uint32().default(0),
    knockbackEndTick: t.uint32().default(0),
    kbvx: t.float32().default(0),
    kbvy: t.float32().default(0),
    protectedEndTick: t.uint32().default(0),
    respawnTick: t.uint32().default(0),
    kos: t.uint16().default(0),
    deaths: t.uint16().default(0),
    assists: t.uint16().default(0),
    points: t.float32().default(0),
    damageDealt: t.float32().default(0),
    lastInputSeq: t.uint32().default(0),
    aimSource: t.uint8().default(0),
  },
  'PlayerState',
);
export type PlayerStateRecord = InstanceType<typeof PlayerState>;

export const ShardState = schema(
  {
    x: t.float32().default(0),
    y: t.float32().default(0),
    value: t.uint8().default(0),
    kind: t.uint8().default(0),
    expiresTick: t.uint32().default(0),
  },
  'ShardState',
);
export type ShardStateRecord = InstanceType<typeof ShardState>;

export const ClusterAnnounce = schema(
  {
    pointIndex: t.uint8().default(0),
    spawnTick: t.uint32().default(0),
  },
  'ClusterAnnounce',
);
export type ClusterAnnounceRecord = InstanceType<typeof ClusterAnnounce>;

export const CoverState = schema(
  {
    intact: t.boolean().default(false),
    rebuildTick: t.uint32().default(0),
  },
  'CoverState',
);
export type CoverStateRecord = InstanceType<typeof CoverState>;

export const ZoneState = schema(
  {
    active: t.boolean().default(false),
    point: t.int8().default(-1),
    nextPoint: t.int8().default(-1),
    moveTick: t.uint32().default(0),
    state: t.uint8().default(0),
    holderId: t.string().default(''),
  },
  'ZoneState',
);
export type ZoneStateRecord = InstanceType<typeof ZoneState>;

export const ArenaState = schema(
  {
    tick: t.uint32().default(0),
    phase: t.uint8().default(0),
    phaseEndTick: t.uint32().default(0),
    mode: t.uint8().default(0),
    matchId: t.string().default(''),
    matchIndex: t.uint16().default(0),
    hostId: t.string().default(''),
    settings: t.ref(RoomSettings),
    players: t.map(PlayerState),
    shards: t.map(ShardState),
    clusterAnnounces: t.array(ClusterAnnounce),
    cover: t.array(CoverState),
    zone: t.ref(ZoneState),
  },
  'ArenaState',
);
export type ArenaStateRecord = InstanceType<typeof ArenaState>;
