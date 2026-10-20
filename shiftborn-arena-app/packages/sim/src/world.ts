import { BALANCE, Phase, type MapData, type Mode } from '@shiftborn/shared';
import type { SimEvent } from './events.js';
import type { PendingDeath } from './death.js';
import { sfc32, type Rng } from './rng.js';
import { createMapRuntime, type MapRuntime } from './map/collisionIndex.js';
import { startMatch } from './match.js';
import {
  createPlayer,
  type PlayerIdentity,
  type PlayerRecord,
} from './player.js';
import type { Projectile } from './projectiles.js';
import type { Shard, ClusterState } from './shards.js';

export type { MapRuntime } from './map/collisionIndex.js';
export type CoverState = { readonly id: string; intact: boolean };
export type { PlayerRecord, PlayerStats } from './player.js';
export type { PlayerIdentity } from './player.js';
export type { Projectile } from './projectiles.js';
export type { PendingDeath } from './death.js';
export type { Shard, ClusterState } from './shards.js';
export type ZoneState = Readonly<Record<string, unknown>>;

export interface World {
  tick: number;
  phase: Phase;
  phaseEndTick: number;
  mode: Mode;
  pendingMode: Mode;
  matchIndex: number;
  matchId: string;
  roomSeed: number;
  rng: Rng;
  map: MapRuntime;
  cover: CoverState[];
  players: (PlayerRecord | null)[];
  projectiles: Projectile[];
  projectilePool: Projectile[];
  nextProjectileId: number;
  nextShardId: number;
  shards: Shard[];
  clusters: ClusterState[];
  zone: ZoneState | null;
  recentSpawns: number[];
  pendingDeaths: PendingDeath[];
  events: SimEvent[];
}

export function createWorld(opts: {
  readonly map: MapData;
  readonly roomSeed: number;
  readonly mode: Mode;
  readonly initialPlayers?: readonly PlayerIdentity[];
}): World {
  const matchIndex = 0;
  const world: World = {
    tick: 0,
    phase: Phase.Countdown,
    phaseEndTick: 0,
    mode: opts.mode,
    pendingMode: opts.mode,
    matchIndex,
    matchId: '',
    roomSeed: opts.roomSeed,
    rng: sfc32(opts.roomSeed, matchIndex),
    map: createMapRuntime(opts.map),
    cover: opts.map.cover.map(({ id }) => ({ id, intact: true })),
    players: Array.from({ length: BALANCE.match.seats }, () => null),
    projectiles: [],
    projectilePool: [],
    nextProjectileId: 0,
    nextShardId: 0,
    shards: [],
    clusters: [],
    zone: null,
    recentSpawns: [],
    pendingDeaths: [],
    events: [],
  };
  for (const player of opts.initialPlayers ?? []) {
    if (
      !Number.isInteger(player.seat) ||
      player.seat < 0 ||
      player.seat >= BALANCE.match.seats ||
      world.players[player.seat] !== null ||
      world.players.some((current) => current?.id === player.id)
    )
      throw new RangeError('invalid initial player seat or id');
    world.players[player.seat] = createPlayer(player, world.tick);
  }
  startMatch(world);
  return world;
}
