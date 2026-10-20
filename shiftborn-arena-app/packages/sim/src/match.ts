import { DERIVED, Phase, type Mode } from '@shiftborn/shared';
import { emitEvent } from './events.js';
import { resetPlayerForMatch } from './player.js';
import { clearProjectiles } from './projectiles.js';
import { sfc32, shuffle } from './rng.js';
import { rememberSpawn } from './spawns.js';
import { grantSpawnProtection } from './protection.js';
import { setupClusters } from './shards.js';
import type { World } from './world.js';

/** GR-2.10: a collision-free textual encoding of the two safe integer inputs. */
export function deriveMatchId(roomSeed: number, matchIndex: number): string {
  if (
    !Number.isSafeInteger(roomSeed) ||
    !Number.isSafeInteger(matchIndex) ||
    matchIndex < 0
  ) {
    throw new RangeError(
      'match ID inputs must be safe integers with a nonnegative match index',
    );
  }
  return `match:${roomSeed}:${matchIndex}`;
}

/** GR-2.9: a requested mode takes effect only at the next COUNTDOWN. */
export function setMode(world: World, mode: Mode): void {
  world.pendingMode = mode;
}

/** GR-2.3–2.5: start a match from a single seeded shuffle, in seat order. */
export function startMatch(world: World): void {
  const occupied = world.players.filter((player) => player !== null);
  if (occupied.length > world.map.spawnPoints.length) {
    throw new RangeError('fewer spawn points than occupied seats');
  }
  world.mode = world.pendingMode;
  world.phase = Phase.Countdown;
  world.phaseEndTick = world.tick + DERIVED.match.countdownTicks;
  world.matchId = deriveMatchId(world.roomSeed, world.matchIndex);
  world.rng = sfc32(world.roomSeed, world.matchIndex);
  const spawnOrder = shuffle(
    world.rng,
    world.map.spawnPoints.map((_, index) => index),
  );
  world.recentSpawns = [];
  world.pendingDeaths = [];
  clearProjectiles(world);
  for (const cover of world.cover) cover.intact = true;
  for (let seat = 0, assignment = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (player === null || player === undefined) continue;
    const spawnIndex = spawnOrder[assignment];
    const point =
      spawnIndex === undefined ? undefined : world.map.spawnPoints[spawnIndex];
    if (spawnIndex === undefined || point === undefined)
      throw new RangeError('spawn point is missing');
    resetPlayerForMatch(player, world.tick);
    player.pos = { x: point.x, y: point.y };
    rememberSpawn(world, spawnIndex);
    emitEvent(world, { type: 'spawn' });
    assignment += 1;
  }
  setupClusters(world);
}

/** GR-2.2: transition at the start of each exclusive boundary tick. */
export function advancePhase(world: World): void {
  if (world.tick < world.phaseEndTick) return;
  if (world.phase === Phase.Countdown) {
    world.phase = Phase.Playing;
    world.phaseEndTick = world.tick + DERIVED.match.durationTicks;
    for (const player of world.players) {
      if (player?.alive) grantSpawnProtection(player, world.tick);
    }
    emitEvent(world, { type: 'phase' });
  } else if (world.phase === Phase.Playing) {
    world.phase = Phase.Results;
    world.phaseEndTick = world.tick + DERIVED.match.resultsTicks;
    clearProjectiles(world);
    // GR-5.8: match end drops unfinished morphs without a refund or morph event.
    for (const player of world.players) {
      if (player !== null) player.morph = null;
    }
    emitEvent(world, { type: 'phase' });
  } else {
    world.matchIndex += 1;
    emitEvent(world, { type: 'phase' });
    startMatch(world);
  }
}
