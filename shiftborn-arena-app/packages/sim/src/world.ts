import { BALANCE, Phase, type MapData, type Mode } from '@shiftborn/shared';
import type { SimEvent } from './events.js';
import { sfc32, type Rng } from './rng.js';

// T-011 will add collision indexing to this static map view.
export type MapRuntime = MapData;
export type CoverState = { readonly id: string };
export type PlayerRecord = { readonly id: string; readonly seat: number };
export type Projectile = { readonly id: number };
export type Shard = { readonly id: number };
export type ClusterState = Readonly<Record<string, unknown>>;
export type ZoneState = Readonly<Record<string, unknown>>;

export interface World {
  tick: number;
  phase: Phase;
  phaseEndTick: number;
  mode: Mode;
  matchIndex: number;
  matchId: string;
  roomSeed: number;
  rng: Rng;
  map: MapRuntime;
  cover: CoverState[];
  players: (PlayerRecord | null)[];
  projectiles: Projectile[];
  nextProjectileId: number;
  shards: Shard[];
  clusters: ClusterState[];
  zone: ZoneState | null;
  recentSpawns: number[];
  events: SimEvent[];
}

export function createWorld(opts: {
  readonly map: MapData;
  readonly roomSeed: number;
  readonly mode: Mode;
}): World {
  const matchIndex = 0;
  return {
    tick: 0,
    phase: Phase.Countdown,
    phaseEndTick: 0,
    mode: opts.mode,
    matchIndex,
    matchId: '',
    roomSeed: opts.roomSeed,
    rng: sfc32(opts.roomSeed, matchIndex),
    map: opts.map,
    cover: [],
    players: Array.from({ length: BALANCE.match.seats }, () => null),
    projectiles: [],
    nextProjectileId: 0,
    shards: [],
    clusters: [],
    zone: null,
    recentSpawns: [],
    events: [],
  };
}
