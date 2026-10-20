import { BALANCE } from '@shiftborn/shared';
import { nextInt } from './rng.js';
import type { World } from './world.js';

/** GR-11.5: keep only the latest assigned spawn indexes in chronological order. */
export function rememberSpawn(world: World, index: number): void {
  world.recentSpawns.push(index);
  while (world.recentSpawns.length > BALANCE.match.spawnExcludeRecent) {
    world.recentSpawns.shift();
  }
}

/** GR-11.5: maximize nearest living opponent distance; exact ties use map order. */
export function chooseSpawnPoint(world: World, spawningPlayerId: string): number {
  const candidates: number[] = [];
  for (let index = 0; index < world.map.spawnPoints.length; index += 1) {
    if (world.map.spawnPoints[index] !== undefined && !world.recentSpawns.includes(index)) {
      candidates.push(index);
    }
  }
  if (candidates.length === 0) throw new RangeError('no available spawn point');

  let hasOther = false;
  const first = candidates[0];
  if (first === undefined) throw new RangeError('no available spawn point');
  let bestIndex = first;
  let bestNearest = -1;
  for (const index of candidates) {
    const point = world.map.spawnPoints[index];
    if (point === undefined) throw new RangeError('spawn point is missing');
    let nearest = Number.POSITIVE_INFINITY;
    for (const player of world.players) {
      if (player === null || !player.alive || player.id === spawningPlayerId) continue;
      hasOther = true;
      const dx = point.x - player.pos.x;
      const dy = point.y - player.pos.y;
      nearest = Math.min(nearest, dx * dx + dy * dy);
    }
    if (nearest > bestNearest) {
      bestNearest = nearest;
      bestIndex = index;
    }
  }
  // The match RNG is consumed only when no living opponent determines a point.
  if (!hasOther) {
    const randomIndex = candidates[nextInt(world.rng, candidates.length)];
    if (randomIndex === undefined) throw new RangeError('no available spawn point');
    bestIndex = randomIndex;
  }
  rememberSpawn(world, bestIndex);
  return bestIndex;
}
