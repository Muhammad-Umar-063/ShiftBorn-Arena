import { GREYBOX_V1, Mode, type MapData } from '@shiftborn/shared';
import { addPlayer } from '../../src/player.js';
import { createWorld, type World } from '../../src/world.js';

export function makeTestWorld(options: {
  readonly seed: number;
  readonly mode?: Mode;
  readonly map?: MapData;
  readonly players?: readonly { id: string; name: string; isBot: boolean; seat: number }[];
}): World {
  const world = createWorld({
    map: options.map ?? GREYBOX_V1,
    roomSeed: options.seed,
    mode: options.mode ?? Mode.Frenzy,
  });
  for (const player of options.players ?? []) addPlayer(world, player);
  return world;
}
