import {
  Form, GREYBOX_V1, GUN_IDS, Mode, gunFor, type GunId, type MapData,
} from '@shiftborn/shared';
import { gunNumbers } from '../../src/loadout.js';
import { addPlayer } from '../../src/player.js';
import { createWorld, type World } from '../../src/world.js';

/** GR-5 tests check morph rules, not D-074 progression, so they opt in here. */
export function unlockAllForms(world: World): void {
  for (const player of world.players) {
    if (player === null) continue;
    player.unlocked = { [Form.Runner]: true, [Form.Beast]: true, [Form.Turret]: true };
  }
}

/**
 * GR-7 firing tests check gun rules, not D-075 loot, so they opt in here:
 * every gun owned with a full magazine and reserve, tier 1 selected.
 */
export function armAllGuns(world: World): void {
  for (const player of world.players) {
    if (player === null) continue;
    for (const gun of GUN_IDS) {
      const numbers = gunNumbers(gun);
      player.guns[gun] = { owned: true, mag: numbers.magazine, reserve: numbers.reserveMax };
    }
    player.selectedTier = { [Form.Runner]: 1, [Form.Beast]: 1, [Form.Turret]: 1 };
  }
}

/** The proto-3 form weapon: tier 1 of the form (GR-7.1). */
export function tier1Gun(form: Form): GunId {
  return gunFor(form, 1);
}

export function makeTestWorld(options: {
  readonly seed: number;
  readonly mode?: Mode;
  readonly map?: MapData;
  readonly players?: readonly { id: string; name: string; isBot: boolean; seat: number }[];
  readonly unlockAllForms?: boolean;
  readonly armAllGuns?: boolean;
}): World {
  const world = createWorld({
    map: options.map ?? GREYBOX_V1,
    roomSeed: options.seed,
    mode: options.mode ?? Mode.Frenzy,
  });
  for (const player of options.players ?? []) addPlayer(world, player);
  if (options.unlockAllForms === true) unlockAllForms(world);
  if (options.armAllGuns === true) armAllGuns(world);
  return world;
}
