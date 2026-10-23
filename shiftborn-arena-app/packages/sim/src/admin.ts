import { BALANCE, DERIVED, Form } from '@shiftborn/shared';
import { cancelAbility } from './ability.js';
import { circleBoxPushOut } from './math/geometry.js';
import { integrateCircleMotion } from './movement.js';
import { cancelMorphOnDeath } from './morph.js';
import { removeOwnedProjectiles } from './projectiles.js';
import { formStats } from './formStats.js';
import type { PlayerRecord } from './player.js';
import type { World } from './world.js';

/** T-029: administrative elimination has no combat credit, drop, or RNG draw. */
export function administrativelyEliminate(world: World, player: PlayerRecord): boolean {
  if (!player.alive) return false;
  player.alive = false;
  player.hpFrac = 0;
  cancelMorphOnDeath(player);
  cancelAbility(world, player, world.tick);
  player.vel = { x: 0, y: 0 };
  player.knockback = null;
  player.stunEndTick = world.tick;
  player.protectedEndTick = world.tick;
  player.lastHeldButtons = 0;
  player.damageLog = [];
  player.respawnFlux = null;
  player.respawnTick = world.tick + DERIVED.match.respawnTicks;
  removeOwnedProjectiles(world, player.id);
  return true;
}

/** T-029: a direct Flux edit starts a fresh regeneration anchor. */
export function setAdministrativeFlux(player: PlayerRecord, amount: number): void {
  if (!Number.isFinite(amount) || amount < 0 || amount > BALANCE.flux.max)
    throw new RangeError('invalid administrative Flux');
  player.flux = amount;
  player.fluxRegenAnchor = amount;
  player.fluxRegenTicks = 0;
}

export function setAdministrativeHealth(world: World, player: PlayerRecord, fraction: number): boolean {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
    throw new RangeError('invalid administrative health');
  if (!player.alive) return false;
  if (fraction === 0) return administrativelyEliminate(world, player);
  player.hpFrac = fraction;
  return true;
}

/** D-074 test seam: unlock every form without KO credit, events or progress. */
export function setAdministrativeUnlockAll(player: PlayerRecord): void {
  player.unlocked = { [Form.Runner]: true, [Form.Beast]: true, [Form.Turret]: true };
}

/** T-029: direct form selection does not enter the normal paid morph pipeline. */
export function setAdministrativeForm(world: World, player: PlayerRecord, form: Form): boolean {
  if (!player.alive) return false;
  cancelAbility(world, player, world.tick);
  player.morph = null;
  player.form = form;
  if (form === Form.Turret) player.vel = { x: 0, y: 0 };
  return true;
}

function validPosition(world: World, player: PlayerRecord, x: number, y: number): boolean {
  const radius = formStats(player.form).radiusM;
  const bounds = world.map.playable;
  if (x < bounds.minX + radius || x > bounds.maxX - radius ||
    y < bounds.minY + radius || y > bounds.maxY - radius) return false;
  const pos = { x, y };
  for (const wall of world.map.walls)
    if (circleBoxPushOut(pos, radius, wall.box) !== null) return false;
  for (let index = 0; index < world.map.cover.length; index += 1) {
    if (world.cover[index]?.intact !== true) continue;
    const cover = world.map.cover[index];
    if (cover !== undefined && circleBoxPushOut(pos, radius, cover.box) !== null)
      return false;
  }
  return true;
}

/** T-029: use the same circle resolver as movement, then verify the final point. */
export function administrativelyTeleport(
  world: World, player: PlayerRecord, x: number, y: number,
): { readonly x: number; readonly y: number } | null {
  if (!player.alive || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const radius = formStats(player.form).radiusM;
  const bounds = world.map.playable;
  const withinBounds = {
    x: Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, x)),
    y: Math.max(bounds.minY + radius, Math.min(bounds.maxY - radius, y)),
  };
  const resolved = integrateCircleMotion(
    { pos: withinBounds, form: player.form }, { x: 0, y: 0 },
    world.map, world.cover,
  ).pos;
  if (!validPosition(world, player, resolved.x, resolved.y)) return null;
  cancelAbility(world, player, world.tick);
  player.knockback = null;
  player.pos = resolved;
  player.vel = { x: 0, y: 0 };
  return resolved;
}

/** T-029: the room owns the toggle; only ordinary bot occupants are touched. */
export function stopOrdinaryBots(world: World): void {
  for (const player of world.players) {
    if (player?.isBot !== true) continue;
    cancelAbility(world, player, world.tick);
    player.vel = { x: 0, y: 0 };
    player.knockback = null;
    player.lastHeldButtons = 0;
  }
}
