import {
  AimSource, BALANCE, Cause, Controller, Form, GREYBOX_V1, Mode, Phase,
  WeaponId,
} from '@shiftborn/shared';
import { createMapRuntime } from './map/collisionIndex.js';
import { deriveMatchId } from './match.js';
import { createPlayer, createPlayerStats } from './player.js';
import type { World } from './world.js';

export type WorldSnapshot = Omit<World, 'map' | 'events' | 'projectilePool'> & {
  readonly mapId: string;
};

function clonePlain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => clonePlain(item));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clonePlain(item)]),
    );
  }
  return value;
}

/** GR-2.10: static map data is identified, never copied from a replay file. */
export function snapshotWorld(world: World): WorldSnapshot {
  const copy = clonePlain({
    tick: world.tick, phase: world.phase, phaseEndTick: world.phaseEndTick,
    mode: world.mode, pendingMode: world.pendingMode,
    matchIndex: world.matchIndex, matchId: world.matchId,
    roomSeed: world.roomSeed, rng: world.rng, cover: world.cover,
    players: world.players, projectiles: world.projectiles,
    nextProjectileId: world.nextProjectileId, nextShardId: world.nextShardId,
    shards: world.shards, clusters: world.clusters, zone: world.zone,
    recentSpawns: world.recentSpawns, pendingDeaths: world.pendingDeaths,
    mapId: world.map.id,
  });
  if (!isWorldSnapshot(copy)) throw new TypeError('invalid world snapshot');
  return copy;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function integer(value: unknown): value is number {
  return finite(value) && Number.isSafeInteger(value);
}

function oneOf(value: unknown, choices: readonly string[]): boolean {
  return typeof value === 'string' && choices.includes(value);
}

function vec(value: unknown): boolean {
  return record(value) && finite(value.x) && finite(value.y) &&
    Object.keys(value).length === 2;
}

function finiteTree(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 10000 &&
    value.every((item: unknown) => finiteTree(item, depth + 1));
  if (!record(value) || Object.keys(value).length > 1000) return false;
  return Object.entries(value).every(([key, item]) =>
    key !== '__proto__' && finiteTree(item, depth + 1));
}

function numericShape(value: unknown, template: unknown): boolean {
  if (typeof template === 'number') return finite(value);
  if (!record(value) || !record(template)) return false;
  const keys = Object.keys(template);
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key) &&
      numericShape(value[key], template[key]));
}

const playerTemplate = createPlayer({ id: 'template', name: 'Template', seat: 0, isBot: false }, 0);
const playerKeys = Object.keys(playerTemplate);
const snapshotKeys = [
  'tick', 'phase', 'phaseEndTick', 'mode', 'pendingMode', 'matchIndex',
  'matchId', 'roomSeed', 'rng', 'cover', 'players', 'projectiles',
  'nextProjectileId', 'nextShardId', 'shards', 'clusters', 'zone',
  'recentSpawns', 'pendingDeaths', 'mapId',
];
const numericPlayerKeys = [
  'seat', 'aim', 'morphReadyTick', 'hpFrac', 'flux', 'heat', 'overheatEndTick',
  'stunEndTick', 'ccImmuneEndTick', 'protectedEndTick', 'respawnTick',
  'fluxRegenAnchor', 'fluxRegenTicks', 'lastInputSeq', 'lastButtonInputSeq',
  'lastHeldButtons', 'lastShotInputSeq', 'nextShotIdx',
] as const;

function player(value: unknown, seat: number): boolean {
  if (value === null) return true;
  if (!record(value) || Object.keys(value).length !== playerKeys.length ||
    !playerKeys.every((key) => Object.hasOwn(value, key))) return false;
  if (typeof value.id !== 'string' || value.id.length === 0 ||
    typeof value.name !== 'string' || typeof value.isBot !== 'boolean' ||
    typeof value.alive !== 'boolean' || value.seat !== seat ||
    !oneOf(value.controller, Object.values(Controller)) ||
    !oneOf(value.form, Object.values(Form)) ||
    !oneOf(value.aimSource, Object.values(AimSource)) ||
    !vec(value.pos) || !vec(value.vel) ||
    !numericPlayerKeys.every((key) => finite(value[key])) ||
    !numericShape(value.stats, createPlayerStats()) ||
    !numericShape(value.weapon, playerTemplate.weapon) ||
    !numericShape(value.abilityReadyTick, playerTemplate.abilityReadyTick) ||
    !(value.respawnFlux === null || finite(value.respawnFlux))) return false;
  if (value.isBot && value.controller !== Controller.Bot) return false;
  if (!finite(value.hpFrac) || value.hpFrac < 0 || value.hpFrac > 1 ||
    !finite(value.flux) || value.flux < 0 ||
    value.flux > BALANCE.flux.max) return false;
  if (value.morph !== null && (!record(value.morph) ||
    !oneOf(value.morph.target, Object.values(Form)) || !integer(value.morph.endTick))) return false;
  if (value.ability !== null && (!record(value.ability) ||
    !finiteTree(value.ability))) return false;
  if (value.knockback !== null && (!record(value.knockback) ||
    !vec(value.knockback.vel) || !integer(value.knockback.endTick))) return false;
  return Array.isArray(value.damageLog) && value.damageLog.every((entry: unknown) =>
    record(entry) && typeof entry.attackerId === 'string' &&
    integer(entry.tick) && finite(entry.amount));
}

function projectile(value: unknown): boolean {
  if (!record(value) || !finiteTree(value) || !vec(value.pos) || !vec(value.dir) ||
    typeof value.ownerId !== 'string' || typeof value.ownerName !== 'string' ||
    !oneOf(value.ownerForm, Object.values(Form)) ||
    !oneOf(value.weapon, Object.values(WeaponId))) return false;
  const numericKeys = [
    'id', 'ownerSeat', 'angle', 'speedMPerTick', 'radiusM', 'rangeM',
    'traveledM', 'baseDamage', 'spawnTick', 'inputSeq', 'shotIdx',
  ];
  return Object.keys(value).length === numericKeys.length + 6 &&
    numericKeys.every((key) => finite(value[key]));
}

function shard(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 7 &&
    integer(value.id) && value.id >= 0 && finite(value.x) && finite(value.y) &&
    finite(value.value) && (value.kind === 0 || value.kind === 1 || value.kind === 2) &&
    integer(value.expiresTick) &&
    (value.clusterId === null || integer(value.clusterId));
}

function cluster(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 5 &&
    integer(value.id) && integer(value.pointIndex) &&
    value.pointIndex >= 0 && value.pointIndex < GREYBOX_V1.shardPoints.length &&
    oneOf(value.state, ['active', 'waiting', 'announced']) &&
    integer(value.announceTick) && integer(value.spawnTick);
}

function pendingDeath(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 10 &&
    typeof value.victimId === 'string' && integer(value.victimSeat) &&
    oneOf(value.victimForm, Object.values(Form)) &&
    typeof value.killerId === 'string' && integer(value.killerSeat) &&
    typeof value.killerName === 'string' &&
    oneOf(value.killerForm, Object.values(Form)) &&
    oneOf(value.cause, Object.values(Cause)) &&
    finite(value.finalDamage) && integer(value.deathTick);
}

/** Reject untrusted replay state before constructing a World. */
export function isWorldSnapshot(value: unknown): value is WorldSnapshot {
  if (!record(value) || Object.keys(value).length !== snapshotKeys.length ||
    !snapshotKeys.every((key) => Object.hasOwn(value, key)) ||
    value.mapId !== GREYBOX_V1.id ||
    !integer(value.tick) || value.tick < 0 ||
    !integer(value.phaseEndTick) ||
    !integer(value.roomSeed) ||
    !integer(value.matchIndex) || value.matchIndex < 0 ||
    value.matchId !== deriveMatchId(value.roomSeed, value.matchIndex) ||
    !oneOf(value.phase, Object.values(Phase)) ||
    !oneOf(value.mode, Object.values(Mode)) ||
    !oneOf(value.pendingMode, Object.values(Mode)) ||
    !record(value.rng) || Object.keys(value.rng).length !== 4 ||
    !['a', 'b', 'c', 'd'].every((key) => {
      const component = record(value.rng) ? value.rng[key] : undefined;
      return integer(component) && component >= 0 && component <= 0xffffffff;
    }) ||
    !Array.isArray(value.players) || value.players.length !== BALANCE.match.seats ||
    !value.players.every((item: unknown, seat: number) => player(item, seat)) ||
    !Array.isArray(value.cover) || value.cover.length !== GREYBOX_V1.cover.length ||
    !value.cover.every((item: unknown, index: number) =>
      record(item) && Object.keys(item).length === 2 &&
      item.id === GREYBOX_V1.cover[index]?.id &&
      typeof item.intact === 'boolean') ||
    !Array.isArray(value.projectiles) ||
    !value.projectiles.every(projectile) ||
    !Array.isArray(value.shards) || !value.shards.every(shard) ||
    !Array.isArray(value.clusters) || !value.clusters.every(cluster) ||
    !Array.isArray(value.pendingDeaths) || !value.pendingDeaths.every(pendingDeath) ||
    !Array.isArray(value.recentSpawns) ||
    !value.recentSpawns.every((index: unknown) =>
      integer(index) && index >= 0 && index < GREYBOX_V1.spawnPoints.length) ||
    !(value.zone === null || finiteTree(value.zone)) ||
    !integer(value.nextProjectileId) || value.nextProjectileId < 0 ||
    !integer(value.nextShardId) || value.nextShardId < 0) return false;
  return true;
}

export function restoreWorld(value: unknown): World {
  if (!isWorldSnapshot(value)) throw new TypeError('invalid replay snapshot');
  const detached = clonePlain(value);
  if (!isWorldSnapshot(detached)) throw new TypeError('invalid replay snapshot');
  return {
    tick: detached.tick, phase: detached.phase,
    phaseEndTick: detached.phaseEndTick, mode: detached.mode,
    pendingMode: detached.pendingMode, matchIndex: detached.matchIndex,
    matchId: detached.matchId, roomSeed: detached.roomSeed, rng: detached.rng,
    cover: detached.cover, players: detached.players,
    projectiles: detached.projectiles,
    nextProjectileId: detached.nextProjectileId,
    nextShardId: detached.nextShardId, shards: detached.shards,
    clusters: detached.clusters, zone: detached.zone,
    recentSpawns: detached.recentSpawns, pendingDeaths: detached.pendingDeaths,
    map: createMapRuntime(GREYBOX_V1),
    events: [],
    projectilePool: [],
  };
}
