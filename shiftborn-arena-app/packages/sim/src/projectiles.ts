import {
  BALANCE, DERIVED, Form, WeaponId, type Box, type GunId,
} from '@shiftborn/shared';
import { applyDamage } from './damage.js';
import { emitEvent } from './events.js';
import { formStats } from './formStats.js';
import {
  circleBoxPushOut,
  segmentBoxContact,
  segmentBoxIntersection,
  segmentCircleIntersection,
} from './math/geometry.js';
import type { Vec2 } from './math/vec2.js';
import { queryWallIndexes, type MapRuntime } from './map/collisionIndex.js';
import { lineOfSight } from './map/lineOfSight.js';
import type { PlayerRecord } from './player.js';
import { endSpawnProtection, isSpawnProtected } from './protection.js';
import {
  railDistanceMul,
  scatterAngles,
  scatterDistanceMul,
} from './weaponRules.js';
import type { CoverState, World } from './world.js';

type MutableVec2 = { x: number; y: number };

export interface Projectile {
  id: number;
  ownerId: string;
  ownerName: string;
  ownerSeat: number;
  ownerForm: Form;
  weapon: GunId;
  pos: MutableVec2;
  dir: MutableVec2;
  angle: number;
  speedMPerTick: number;
  radiusM: number;
  rangeM: number;
  traveledM: number;
  baseDamage: number;
  spawnTick: number;
  inputSeq: number;
  shotIdx: number;
  /** GR-7.22 Ricochet Disc bounces so far and its damage multiplier. */
  bounces: number;
  damageMult: number;
  /** GR-7.27 Arc Mortar landing tick and point; 0 for direct-fire guns. */
  landTick: number;
  targetX: number;
  targetY: number;
}

function insideAnyBox(
  map: MapRuntime,
  cover: readonly CoverState[],
  x: number,
  y: number,
): boolean {
  const inside = (box: Box): boolean =>
    x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
  for (const index of queryWallIndexes(map, [x, y, x, y])) {
    const wall = map.walls[index];
    if (wall !== undefined && inside(wall.box)) return true;
  }
  for (let index = 0; index < map.cover.length; index += 1) {
    const box = map.cover[index];
    if (cover[index]?.intact === true && box !== undefined && inside(box.box))
      return true;
  }
  return false;
}

/**
 * GR-7.26: clamp the aim distance, clamp to the playable area, then step back
 * toward the shooter until the point is clear of every wall and intact cover.
 */
export function mortarLandingPoint(
  map: MapRuntime,
  cover: readonly CoverState[],
  origin: Vec2,
  aim: number,
  aimDistM: number,
): Vec2 {
  const values = BALANCE.weapons.arcMortar;
  const distance = Math.min(values.maxRangeM, Math.max(values.minRangeM, aimDistM));
  const dirX = Math.cos(aim);
  const dirY = Math.sin(aim);
  const { playable } = map;
  let x = Math.min(playable.maxX, Math.max(playable.minX, origin.x + dirX * distance));
  let y = Math.min(playable.maxY, Math.max(playable.minY, origin.y + dirY * distance));
  const steps = Math.ceil(distance / values.landingNudgeStepM) + 1;
  for (let step = 0; step < steps && insideAnyBox(map, cover, x, y); step += 1) {
    x -= dirX * values.landingNudgeStepM;
    y -= dirY * values.landingNudgeStepM;
  }
  return { x, y };
}

function weaponNumbers(weapon: GunId): {
  speedMPerTick: number;
  radiusM: number;
  rangeM: number;
  baseDamage: number;
} {
  switch (weapon) {
    case WeaponId.PulsePistol:
      return {
        speedMPerTick: DERIVED.weapons.pulsePistol.projSpeedMPerTick,
        radiusM: BALANCE.weapons.pulsePistol.projRadiusM,
        rangeM: BALANCE.weapons.pulsePistol.rangeM,
        baseDamage: BALANCE.weapons.pulsePistol.damage,
      };
    case WeaponId.ScatterCannon:
      return {
        speedMPerTick: DERIVED.weapons.scatterCannon.projSpeedMPerTick,
        radiusM: BALANCE.weapons.scatterCannon.projRadiusM,
        rangeM: BALANCE.weapons.scatterCannon.rangeM,
        baseDamage: BALANCE.weapons.scatterCannon.damagePerPellet,
      };
    case WeaponId.RailRepeater:
      return {
        speedMPerTick: DERIVED.weapons.railRepeater.projSpeedMPerTick,
        radiusM: BALANCE.weapons.railRepeater.projRadiusM,
        rangeM: BALANCE.weapons.railRepeater.rangeM,
        baseDamage: BALANCE.weapons.railRepeater.damage,
      };
    case WeaponId.RicochetDisc:
      return {
        speedMPerTick: DERIVED.weapons.ricochetDisc.projSpeedMPerTick,
        radiusM: BALANCE.weapons.ricochetDisc.projRadiusM,
        rangeM: BALANCE.weapons.ricochetDisc.rangeM,
        baseDamage: BALANCE.weapons.ricochetDisc.damage,
      };
    case WeaponId.SlugCannon:
      return {
        speedMPerTick: DERIVED.weapons.slugCannon.projSpeedMPerTick,
        radiusM: BALANCE.weapons.slugCannon.projRadiusM,
        rangeM: BALANCE.weapons.slugCannon.rangeM,
        baseDamage: BALANCE.weapons.slugCannon.damage,
      };
    // GR-7.27: the shell never moves through collision; it lands by tick.
    case WeaponId.ArcMortar:
      return {
        speedMPerTick: 0,
        radiusM: 0,
        rangeM: BALANCE.weapons.arcMortar.maxRangeM,
        baseDamage: BALANCE.weapons.arcMortar.damage,
      };
  }
}

function releaseAt(world: World, index: number): void {
  const released = world.projectiles.splice(index, 1)[0];
  if (released !== undefined) world.projectilePool.push(released);
}

/** GR-2.7: release records while keeping ids monotonic across matches. */
export function clearProjectiles(world: World): void {
  while (world.projectiles.length > 0)
    releaseAt(world, world.projectiles.length - 1);
}

export function removeOwnedProjectiles(world: World, ownerId: string): void {
  const expiredIds = world.projectiles
    .filter((projectile) => projectile.ownerId === ownerId)
    .map((projectile) => projectile.id)
    .sort((left, right) => left - right);
  for (let index = world.projectiles.length - 1; index >= 0; index -= 1) {
    if (world.projectiles[index]?.ownerId === ownerId) releaseAt(world, index);
  }
  for (const id of expiredIds)
    emitEvent(world, { type: 'projectileExpire', id });
}

function spawnOverlaps(world: World, pos: Vec2, radiusM: number): boolean {
  const indexes = queryWallIndexes(world.map, [
    pos.x - radiusM,
    pos.y - radiusM,
    pos.x + radiusM,
    pos.y + radiusM,
  ]);
  for (const index of indexes) {
    const wall = world.map.walls[index];
    if (wall !== undefined && circleBoxPushOut(pos, radiusM, wall.box) !== null)
      return true;
  }
  for (let index = 0; index < world.cover.length; index += 1) {
    const cover = world.cover[index];
    const box = world.map.cover[index];
    if (
      cover?.intact &&
      box !== undefined &&
      circleBoxPushOut(pos, radiusM, box.box) !== null
    )
      return true;
  }
  return false;
}

/** GR-7.5: allocate a complete record, including an overlap terminal event. */
export function spawnProjectile(
  world: World,
  player: PlayerRecord,
  weapon: GunId,
  angle: number,
  inputSeq: number,
  shotIdx: number,
  advancedTicks: number,
): Projectile | null {
  const numbers = weaponNumbers(weapon);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const muzzleDistance =
    formStats(player.form).radiusM + BALANCE.weapons.muzzleExtraM;
  const x = player.pos.x + dir.x * muzzleDistance;
  const y = player.pos.y + dir.y * muzzleDistance;
  const projectile = world.projectilePool.pop() ?? {
    id: 0,
    ownerId: '',
    ownerName: '',
    ownerSeat: 0,
    ownerForm: Form.Runner,
    weapon: WeaponId.PulsePistol,
    pos: { x: 0, y: 0 },
    dir: { x: 0, y: 0 },
    angle: 0,
    speedMPerTick: 0,
    radiusM: 0,
    rangeM: 0,
    traveledM: 0,
    baseDamage: 0,
    spawnTick: 0,
    inputSeq: 0,
    shotIdx: 0,
    bounces: 0,
    damageMult: 1,
    landTick: 0,
    targetX: 0,
    targetY: 0,
  };
  projectile.id = world.nextProjectileId;
  world.nextProjectileId += 1;
  projectile.ownerId = player.id;
  projectile.ownerName = player.name;
  projectile.ownerSeat = player.seat;
  projectile.ownerForm = player.form;
  projectile.weapon = weapon;
  projectile.pos.x = x;
  projectile.pos.y = y;
  projectile.dir.x = dir.x;
  projectile.dir.y = dir.y;
  projectile.angle = angle;
  projectile.speedMPerTick = numbers.speedMPerTick;
  projectile.radiusM = numbers.radiusM;
  projectile.rangeM = numbers.rangeM;
  projectile.traveledM = 0;
  projectile.baseDamage = numbers.baseDamage;
  projectile.spawnTick = world.tick;
  projectile.inputSeq = inputSeq;
  projectile.shotIdx = shotIdx;
  projectile.bounces = 0;
  projectile.damageMult = 1;
  const mortar = weapon === WeaponId.ArcMortar;
  const landing = mortar
    ? mortarLandingPoint(world.map, world.cover, player.pos, angle, player.aimDistM)
    : null;
  projectile.landTick = mortar ? world.tick + DERIVED.weapons.arcMortar.flightTicks : 0;
  projectile.targetX = landing?.x ?? 0;
  projectile.targetY = landing?.y ?? 0;
  emitEvent(world, {
    type: 'projectileSpawn',
    id: projectile.id,
    ownerSeat: player.seat,
    weapon,
    x,
    y,
    angle,
    spawnTick: world.tick,
    advancedTicks,
    inputSeq,
    shotIdx,
    landTick: projectile.landTick,
    targetX: projectile.targetX,
    targetY: projectile.targetY,
  });
  // GR-7.26: the shell has no muzzle check; it flies over everything.
  if (!mortar && spawnOverlaps(world, projectile.pos, projectile.radiusM)) {
    emitEvent(world, { type: 'projectileImpact', id: projectile.id, x, y });
    world.projectilePool.push(projectile);
    return null;
  }
  world.projectiles.push(projectile);
  return projectile;
}

/** GR-7.10: one firing action creates pellets in the documented offset order. */
export function fireProjectiles(
  world: World,
  player: PlayerRecord,
  weapon: GunId,
  inputSeq: number,
  firstShotIdx: number,
  advancedTicks: number,
): Projectile[] {
  const angles =
    weapon === WeaponId.ScatterCannon ? scatterAngles(player.aim) : [player.aim];
  const spawned: Projectile[] = [];
  for (let index = 0; index < angles.length; index += 1) {
    const angle = angles[index];
    if (angle === undefined) continue;
    const projectile = spawnProjectile(
      world,
      player,
      weapon,
      angle,
      inputSeq,
      firstShotIdx + index,
      advancedTicks,
    );
    if (projectile !== null) spawned.push(projectile);
  }
  // GR-7.4: even an immediate muzzle impact counts as a fired shot.
  endSpawnProtection(player, world.tick);
  return spawned;
}

type Contact =
  | { kind: 'box'; t: number; box: Box; normalX: number; normalY: number }
  | { kind: 'player'; t: number; seat: number };

function boxContact(
  projectile: Projectile,
  start: Vec2,
  end: Vec2,
  box: Box,
): { t: number; normalX: number; normalY: number } | null {
  // GR-7.22: only the disc needs the face; it may start on a face it left.
  if (projectile.weapon === WeaponId.RicochetDisc)
    return segmentBoxContact(start, end, box, projectile.radiusM);
  const t = segmentBoxIntersection(start, end, box, projectile.radiusM);
  return t === null ? null : { t, normalX: 0, normalY: 0 };
}

function earliestContact(
  world: World,
  projectile: Projectile,
  end: Vec2,
): Contact | null {
  const start = projectile.pos;
  const radius = projectile.radiusM;
  const bounds: [number, number, number, number] = [
    Math.min(start.x, end.x) - radius,
    Math.min(start.y, end.y) - radius,
    Math.max(start.x, end.x) + radius,
    Math.max(start.y, end.y) + radius,
  ];
  let contact: Contact | null = null;
  for (const index of queryWallIndexes(world.map, bounds)) {
    const wall = world.map.walls[index];
    if (wall === undefined) continue;
    const hit = boxContact(projectile, start, end, wall.box);
    if (hit !== null && (contact === null || hit.t < contact.t))
      contact = { kind: 'box', box: wall.box, ...hit };
  }
  for (let index = 0; index < world.cover.length; index += 1) {
    const cover = world.cover[index];
    const box = world.map.cover[index];
    if (!cover?.intact || box === undefined) continue;
    const hit = boxContact(projectile, start, end, box.box);
    if (hit !== null && (contact === null || hit.t < contact.t))
      contact = { kind: 'box', box: box.box, ...hit };
  }
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (
      player === null ||
      player === undefined ||
      !player.alive ||
      player.id === projectile.ownerId
    )
      continue;
    const t = segmentCircleIntersection(
      start,
      end,
      player.pos,
      formStats(player.form).radiusM + radius,
    );
    if (t !== null && (contact === null || t < contact.t))
      contact = { kind: 'player', t, seat };
  }
  return contact;
}

function attackSource(projectile: Projectile) {
  return {
    id: projectile.ownerId,
    name: projectile.ownerName,
    seat: projectile.ownerSeat,
    form: projectile.ownerForm,
  };
}

/** GR-7.28: blast at the landing point; walls and intact cover shield targets. */
function resolveMortarBlast(world: World, projectile: Projectile): void {
  const values = BALANCE.weapons.arcMortar;
  const landing = { x: projectile.targetX, y: projectile.targetY };
  emitEvent(world, { type: 'mortarBlast', id: projectile.id, x: landing.x, y: landing.y });
  for (const player of world.players) {
    if (player === null || !player.alive || player.id === projectile.ownerId) continue;
    const distance = Math.hypot(player.pos.x - landing.x, player.pos.y - landing.y);
    const edge = Math.max(0, distance - formStats(player.form).radiusM);
    // Coordinate subtraction can put exact tangency a few ULPs outside the
    // radius. This numerical tolerance scales with coordinates, not gameplay.
    const tolerance = Number.EPSILON * (Math.abs(player.pos.x) + Math.abs(player.pos.y) +
      Math.abs(landing.x) + Math.abs(landing.y) + values.blastRadiusM);
    if (edge - values.blastRadiusM > tolerance || !lineOfSight(world, landing, player.pos)) continue;
    if (isSpawnProtected(player, world.tick)) {
      emitEvent(world, { type: 'blocked', id: projectile.id, targetSeat: player.seat });
      continue;
    }
    // GR-6.4: incoming points from the target back toward the blast.
    const incoming = distance > 0
      ? { x: (landing.x - player.pos.x) / distance, y: (landing.y - player.pos.y) / distance }
      : { x: -projectile.dir.x, y: -projectile.dir.y };
    const result = applyDamage(
      world,
      attackSource(projectile),
      player,
      projectile.baseDamage,
      1 - (1 - values.edgeDamageMult) * (Math.min(edge, values.blastRadiusM) / values.blastRadiusM),
      incoming,
      projectile.weapon,
    );
    if (result.applied)
      emitEvent(world, {
        type: 'projectileHit',
        id: projectile.id,
        targetSeat: player.seat,
        damage: result.finalDamage,
        tags: result.tags,
        x: player.pos.x,
        y: player.pos.y,
      });
  }
}

/** GR-7.6, GR-7.22, GR-7.27: one complete step, shared by spawn advance and normal movement. */
function advanceAt(world: World, index: number): boolean {
  const projectile = world.projectiles[index];
  if (projectile === undefined) return false;
  if (projectile.weapon === WeaponId.ArcMortar) {
    if (world.tick < projectile.landTick) return true;
    resolveMortarBlast(world, projectile);
    releaseAt(world, index);
    return false;
  }
  let remaining = Math.min(
    projectile.speedMPerTick,
    Math.max(0, projectile.rangeM - projectile.traveledM),
  );
  for (;;) {
    const end = {
      x: projectile.pos.x + projectile.dir.x * remaining,
      y: projectile.pos.y + projectile.dir.y * remaining,
    };
    const contact = earliestContact(world, projectile, end);
    const t = contact?.t ?? 1;
    projectile.pos.x += (end.x - projectile.pos.x) * t;
    projectile.pos.y += (end.y - projectile.pos.y) * t;
    projectile.traveledM += remaining * t;
    if (contact?.kind === 'box') {
      if (
        projectile.weapon === WeaponId.RicochetDisc &&
        projectile.bounces < BALANCE.weapons.ricochetDisc.maxBounces
      ) {
        if (contact.normalX !== 0) projectile.dir.x = -projectile.dir.x;
        if (contact.normalY !== 0) projectile.dir.y = -projectile.dir.y;
        projectile.bounces += 1;
        projectile.damageMult = BALANCE.weapons.ricochetDisc.bounceDamageMult;
        const angle = Math.atan2(projectile.dir.y, projectile.dir.x);
        projectile.angle = angle < 0 ? angle + 2 * Math.PI : angle;
        emitEvent(world, {
          type: 'projectileBounce',
          id: projectile.id,
          x: projectile.pos.x,
          y: projectile.pos.y,
          angle: projectile.angle,
        });
        remaining *= 1 - t;
        if (remaining > 0) continue;
        break;
      }
      emitEvent(world, {
        type: 'projectileImpact',
        id: projectile.id,
        x: Math.max(contact.box[0], Math.min(projectile.pos.x, contact.box[2])),
        y: Math.max(contact.box[1], Math.min(projectile.pos.y, contact.box[3])),
      });
      releaseAt(world, index);
      return false;
    }
    if (contact?.kind === 'player') {
      const player = world.players[contact.seat];
      if (player !== null && player !== undefined) {
        if (isSpawnProtected(player, world.tick)) {
          emitEvent(world, {
            type: 'blocked',
            id: projectile.id,
            targetSeat: player.seat,
          });
        } else {
          const distanceMul =
            projectile.weapon === WeaponId.ScatterCannon
              ? scatterDistanceMul(projectile.traveledM)
              : projectile.weapon === WeaponId.RailRepeater
                ? railDistanceMul(projectile.traveledM)
                : 1;
          const result = applyDamage(
            world,
            attackSource(projectile),
            player,
            projectile.baseDamage * projectile.damageMult,
            distanceMul,
            { x: -projectile.dir.x, y: -projectile.dir.y },
            projectile.weapon,
          );
          if (result.applied)
            emitEvent(world, {
              type: 'projectileHit',
              id: projectile.id,
              targetSeat: player.seat,
              damage: result.finalDamage,
              tags: result.tags,
              x: projectile.pos.x,
              y: projectile.pos.y,
            });
        }
      }
      releaseAt(world, index);
      return false;
    }
    break;
  }
  if (projectile.traveledM >= projectile.rangeM) {
    projectile.traveledM = projectile.rangeM;
    emitEvent(world, { type: 'projectileExpire', id: projectile.id });
    releaseAt(world, index);
    return false;
  }
  return true;
}

export function advanceProjectile(
  world: World,
  projectile: Projectile,
): boolean {
  const index = world.projectiles.indexOf(projectile);
  return index >= 0 && advanceAt(world, index);
}

export function advanceAllProjectiles(world: World): void {
  // Removal does not reorder survivors; the next id stays at this index.
  for (let index = 0; index < world.projectiles.length;) {
    if (advanceAt(world, index)) index += 1;
  }
}
