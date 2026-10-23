import { emitEvent } from './events.js';
import type { PlayerRecord } from './player.js';
import { cancelReloadState } from './weaponRules.js';
import type { World } from './world.js';

/** GR-7.20: a cancelled reload moves no ammunition and reports itself. */
export function cancelReload(world: World, player: PlayerRecord): void {
  const gun = cancelReloadState(player);
  if (gun !== null)
    emitEvent(world, { type: 'reloadEnd', seat: player.seat, gun, completed: 0 });
}

/** GR-7.20, GR-7.32: death, stun and the end of PLAYING cancel both commitments. */
export function cancelWeaponCommitments(world: World, player: PlayerRecord): void {
  cancelReload(world, player);
  player.melee = null;
}
