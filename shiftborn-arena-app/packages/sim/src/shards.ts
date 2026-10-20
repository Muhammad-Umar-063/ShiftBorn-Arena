import { BALANCE, DERIVED } from '@shiftborn/shared';
import { emitEvent } from './events.js';
import { formStats } from './formStats.js';
import { gainFlux, regenerateFlux } from './flux.js';
import { nextInt } from './rng.js';
import type { World } from './world.js';

// NETWORK_PROTOCOL §4.2 shard kind values; event tuples remain unchanged.
export const ShardKind = {
  Small: 0,
  Large: 1,
  DeathDrop: 2,
} as const;
export type ShardKind = (typeof ShardKind)[keyof typeof ShardKind];

export interface Shard {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly value: number;
  readonly kind: ShardKind;
  readonly expiresTick: number;
  readonly clusterId: number | null;
}

export type ClusterPhase = 'active' | 'waiting' | 'announced';
export interface ClusterState {
  readonly id: number;
  pointIndex: number;
  state: ClusterPhase;
  announceTick: number;
  spawnTick: number;
}

/** Monotonic numeric IDs are compatible with EventEntityId and array order. */
export function spawnShard(world: World, shard: Omit<Shard, 'id'>): Shard {
  const record: Shard = { id: world.nextShardId, ...shard };
  world.nextShardId += 1;
  world.shards.push(record);
  emitEvent(world, { type: 'shardSpawn', shardId: record.id });
  return record;
}

/** GR-10.5: fixed order is center, +x, -x, +y, -y. */
export function spawnCluster(world: World, cluster: ClusterState): void {
  const point = world.map.shardPoints[cluster.pointIndex];
  if (point === undefined) throw new RangeError('cluster point is missing');
  for (let index = 0; index < BALANCE.shards.clusterLarge; index += 1) {
    spawnShard(world, {
      x: point.x,
      y: point.y,
      value: BALANCE.flux.largeShard,
      kind: ShardKind.Large,
      expiresTick: 0,
      clusterId: cluster.id,
    });
  }
  const offset = BALANCE.shards.clusterOffsetM;
  const offsets = [
    { x: offset, y: 0 },
    { x: -offset, y: 0 },
    { x: 0, y: offset },
    { x: 0, y: -offset },
  ];
  for (let index = 0; index < BALANCE.shards.clusterSmall; index += 1) {
    const shift = offsets[index];
    if (shift === undefined) throw new RangeError('cluster offset is missing');
    spawnShard(world, {
      x: point.x + shift.x,
      y: point.y + shift.y,
      value: BALANCE.flux.smallShard,
      kind: ShardKind.Small,
      expiresTick: 0,
      clusterId: cluster.id,
    });
  }
  cluster.state = 'active';
  cluster.announceTick = 0;
  cluster.spawnTick = 0;
}

/** GR-2.5: run after the seeded spawn shuffle, on each new COUNTDOWN. */
export function setupClusters(world: World): void {
  world.shards = [];
  world.clusters = [];
  const points = world.map.shardPoints;
  if (points.length === 0) return; // test_open's intentional empty-map path
  if (points.length < BALANCE.shards.activeClusters)
    throw new RangeError('fewer shard points than active clusters');
  const available = points.map((_, index) => index);
  for (let id = 0; id < BALANCE.shards.activeClusters; id += 1) {
    const choice = nextInt(world.rng, available.length);
    const pointIndex = available.splice(choice, 1)[0];
    if (pointIndex === undefined)
      throw new RangeError('cluster point is missing');
    const cluster: ClusterState = {
      id,
      pointIndex,
      state: 'active',
      announceTick: 0,
      spawnTick: 0,
    };
    world.clusters.push(cluster);
    spawnCluster(world, cluster);
  }
}

/** GR-10.7: shard ID first, then shortest distance, then ascending seat. */
export function pickUpShards(world: World): void {
  world.shards.sort((a, b) => a.id - b.id);
  for (let index = 0; index < world.shards.length;) {
    const shard = world.shards[index];
    if (shard === undefined) break;
    let nearestSeat = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let seat = 0; seat < world.players.length; seat += 1) {
      const player = world.players[seat];
      if (player === null || player === undefined || !player.alive) continue;
      const dx = player.pos.x - shard.x;
      const dy = player.pos.y - shard.y;
      const distance = dx * dx + dy * dy;
      const radius =
        formStats(player.form).radiusM + BALANCE.shards.pickupExtraRadiusM;
      if (distance <= radius * radius && distance < nearestDistance) {
        nearestSeat = seat;
        nearestDistance = distance;
      }
    }
    if (nearestSeat < 0) {
      index += 1;
      continue;
    }
    const player = world.players[nearestSeat];
    if (player === null || player === undefined)
      throw new Error('collector is missing');
    world.shards.splice(index, 1);
    gainFlux(player, shard.value);
    emitEvent(world, {
      type: 'shardPickup',
      shardId: shard.id,
      seat: nearestSeat,
      value: shard.value,
    });
    if (shard.clusterId === null) continue;
    const cluster = world.clusters[shard.clusterId];
    if (cluster === undefined || cluster.state !== 'active') continue;
    if (world.shards.some((remaining) => remaining.clusterId === cluster.id))
      continue;
    cluster.state = 'waiting';
    cluster.announceTick = world.tick + DERIVED.shards.respawnDelayTicks;
    cluster.spawnTick = 0;
  }
}

/** GR-10.9: pickup on the expiry tick has already run. */
export function expireDroppedShards(world: World): void {
  world.shards.sort((a, b) => a.id - b.id);
  for (let index = 0; index < world.shards.length;) {
    const shard = world.shards[index];
    if (shard === undefined) break;
    if (shard.kind !== ShardKind.DeathDrop || world.tick < shard.expiresTick) {
      index += 1;
      continue;
    }
    world.shards.splice(index, 1);
    emitEvent(world, { type: 'shardExpire', shardId: shard.id });
  }
}

/** GR-10.6: stable cluster order makes reservations visible on the same tick. */
export function advanceClusterSchedule(world: World): void {
  for (const cluster of world.clusters) {
    if (cluster.state === 'waiting' && cluster.announceTick === world.tick) {
      const eligible: number[] = [];
      for (let index = 0; index < world.map.shardPoints.length; index += 1) {
        if (index === cluster.pointIndex) continue;
        if (
          world.clusters.some(
            (other) => other.state !== 'waiting' && other.pointIndex === index,
          )
        )
          continue;
        eligible.push(index);
      }
      if (eligible.length === 0)
        throw new RangeError('no available shard point');
      const pointIndex = eligible[nextInt(world.rng, eligible.length)];
      if (pointIndex === undefined)
        throw new RangeError('cluster point is missing');
      cluster.pointIndex = pointIndex;
      cluster.state = 'announced';
      cluster.spawnTick = world.tick + DERIVED.shards.announceTicks;
      emitEvent(world, {
        type: 'clusterAnnounce',
        pointIndex,
        spawnTick: cluster.spawnTick,
      });
    } else if (
      cluster.state === 'announced' &&
      cluster.spawnTick === world.tick
    ) {
      spawnCluster(world, cluster);
    }
  }
}

/** GR-15 step 12: regeneration, pickups, expiry, then cluster schedule. */
export function advanceFluxAndShards(world: World): void {
  regenerateFlux(world);
  pickUpShards(world);
  expireDroppedShards(world);
  advanceClusterSchedule(world);
}
