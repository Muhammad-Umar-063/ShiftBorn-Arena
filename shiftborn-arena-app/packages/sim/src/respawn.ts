import { Form, Phase } from '@shiftborn/shared';
import { zeroGunTimers } from './loadout.js';
import { emitEvent } from './events.js';
import type { Vec2 } from './math/vec2.js';
import { resetMorphForRespawn } from './morph.js';
import type { PlayerRecord } from './player.js';
import { grantSpawnProtection } from './protection.js';
import { chooseSpawnPoint } from './spawns.js';
import type { World } from './world.js';

/** GR-11.6: preserve room identity, match stats, input state, and Flux by default. */
export function respawnPlayer(
  player: PlayerRecord,
  tick: number,
  pos: Vec2,
  mapCenter: Vec2,
  respawnFlux?: number,
): void {
  player.alive = true;
  player.pos = { x: pos.x, y: pos.y };
  player.vel = { x: 0, y: 0 };
  const angle = Math.atan2(mapCenter.y - pos.y, mapCenter.x - pos.x);
  player.aim = angle < 0 ? angle + 2 * Math.PI : angle;
  resetMorphForRespawn(player, tick);
  player.hpFrac = 1;
  if (respawnFlux !== undefined) player.flux = respawnFlux;
  player.respawnFlux = null;
  player.fluxRegenAnchor = player.flux;
  player.fluxRegenTicks = 0;
  player.ability = null;
  player.abilityReadyTick = {
    [Form.Runner]: tick,
    [Form.Beast]: tick,
    [Form.Turret]: tick,
  };
  // GR-11.6, D-076: transient gun state resets; ownership and ammunition stay.
  player.gunTimers = zeroGunTimers();
  player.reload = null;
  player.melee = null;
  player.swapReadyTick = tick;
  player.heat = 0;
  player.overheatEndTick = tick;
  player.stunEndTick = tick;
  player.ccImmuneEndTick = tick;
  player.knockback = null;
  player.damageLog = [];
  grantSpawnProtection(player, tick);
}

/** GR-15 step 10: earlier seats are alive during later spawn selection. */
export function respawnDuePlayers(world: World): void {
  if (world.phase !== Phase.Playing) return;
  const { minX, minY, maxX, maxY } = world.map.bounds;
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  for (const player of world.players) {
    if (player === null || player.alive || player.respawnTick !== world.tick)
      continue;
    const spawnIndex = chooseSpawnPoint(world, player.id);
    const point = world.map.spawnPoints[spawnIndex];
    if (point === undefined) throw new RangeError('spawn point is missing');
    respawnPlayer(
      player,
      world.tick,
      point,
      center,
      player.respawnFlux ?? player.flux,
    );
    emitEvent(world, {
      type: 'respawn',
      seat: player.seat,
      pos: { x: player.pos.x, y: player.pos.y },
      protectedEndTick: player.protectedEndTick,
    });
  }
}
