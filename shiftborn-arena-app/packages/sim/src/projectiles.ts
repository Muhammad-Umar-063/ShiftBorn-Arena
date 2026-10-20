import { BALANCE, DERIVED, Form, WeaponId, type Box } from '@shiftborn/shared';
import { applyDamage } from './damage.js';
import { emitEvent } from './events.js';
import { formStats } from './formStats.js';
import {
  circleBoxPushOut,
  segmentBoxIntersection,
  segmentCircleIntersection,
} from './math/geometry.js';
import type { Vec2 } from './math/vec2.js';
import { queryWallIndexes } from './map/collisionIndex.js';
import type { PlayerRecord } from './player.js';
import {
  railDistanceMul,
  scatterAngles,
  scatterDistanceMul,
  weaponForForm,
} from './weaponRules.js';
import type { World } from './world.js';

type MutableVec2 = { x: number; y: number };

export interface Projectile {
  id: number;
  ownerId: string;
  ownerSeat: number;
  ownerForm: Form;
  weapon: WeaponId;
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
}

function weaponNumbers(weapon: WeaponId): {
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
  for (let index = world.projectiles.length - 1; index >= 0; index -= 1) {
    if (world.projectiles[index]?.ownerId === ownerId) releaseAt(world, index);
  }
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
  angle: number,
  inputSeq: number,
  shotIdx: number,
  advancedTicks: number,
): Projectile | null {
  const weapon = weaponForForm(player.form);
  const numbers = weaponNumbers(weapon);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const muzzleDistance =
    formStats(player.form).radiusM + BALANCE.weapons.muzzleExtraM;
  const x = player.pos.x + dir.x * muzzleDistance;
  const y = player.pos.y + dir.y * muzzleDistance;
  const projectile = world.projectilePool.pop() ?? {
    id: 0,
    ownerId: '',
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
  };
  projectile.id = world.nextProjectileId;
  world.nextProjectileId += 1;
  projectile.ownerId = player.id;
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
  });
  if (spawnOverlaps(world, projectile.pos, projectile.radiusM)) {
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
  inputSeq: number,
  firstShotIdx: number,
  advancedTicks: number,
): Projectile[] {
  const angles =
    player.form === Form.Beast ? scatterAngles(player.aim) : [player.aim];
  const spawned: Projectile[] = [];
  for (let index = 0; index < angles.length; index += 1) {
    const angle = angles[index];
    if (angle === undefined) continue;
    const projectile = spawnProjectile(
      world,
      player,
      angle,
      inputSeq,
      firstShotIdx + index,
      advancedTicks,
    );
    if (projectile !== null) spawned.push(projectile);
  }
  // GR-7.4: even an immediate muzzle impact counts as a fired shot.
  player.protectedEndTick = world.tick;
  return spawned;
}

type Contact =
  | { kind: 'box'; t: number; box: Box }
  | { kind: 'player'; t: number; seat: number };

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
    const t = segmentBoxIntersection(start, end, wall.box, radius);
    if (t !== null && (contact === null || t < contact.t))
      contact = { kind: 'box', t, box: wall.box };
  }
  for (let index = 0; index < world.cover.length; index += 1) {
    const cover = world.cover[index];
    const box = world.map.cover[index];
    if (!cover?.intact || box === undefined) continue;
    const t = segmentBoxIntersection(start, end, box.box, radius);
    if (t !== null && (contact === null || t < contact.t))
      contact = { kind: 'box', t, box: box.box };
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

/** GR-7.6: one complete swept step, shared by spawn advance and normal movement. */
function advanceAt(world: World, index: number): boolean {
  const projectile = world.projectiles[index];
  if (projectile === undefined) return false;
  const distance = Math.min(
    projectile.speedMPerTick,
    Math.max(0, projectile.rangeM - projectile.traveledM),
  );
  const end = {
    x: projectile.pos.x + projectile.dir.x * distance,
    y: projectile.pos.y + projectile.dir.y * distance,
  };
  const contact = earliestContact(world, projectile, end);
  const t = contact?.t ?? 1;
  projectile.pos.x += (end.x - projectile.pos.x) * t;
  projectile.pos.y += (end.y - projectile.pos.y) * t;
  projectile.traveledM += distance * t;
  if (contact?.kind === 'box') {
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
      if (world.tick < player.protectedEndTick) {
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
          {
            id: projectile.ownerId,
            seat: projectile.ownerSeat,
            form: projectile.ownerForm,
          },
          player,
          projectile.baseDamage,
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
