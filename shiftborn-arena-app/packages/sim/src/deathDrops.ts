import { BALANCE, DERIVED, type Box } from '@shiftborn/shared';
import type { Vec2 } from './math/vec2.js';
import type { PlayerRecord } from './player.js';
import { nextFloat } from './rng.js';
import { ShardKind, spawnShard } from './shards.js';
import type { World } from './world.js';

/** GR-10.8, GR-10.10: one captured amount drives both drop and respawn. */
export function deathFluxAmounts(fluxAtDeath: number): {
  readonly drop: number;
  readonly respawnFlux: number;
} {
  if (!Number.isFinite(fluxAtDeath) || fluxAtDeath < 0)
    throw new RangeError('death Flux must be finite and nonnegative');
  const drop = Math.floor(fluxAtDeath * BALANCE.flux.deathDropFrac);
  return {
    drop,
    respawnFlux: Math.max(BALANCE.flux.respawnFloor, fluxAtDeath - drop),
  };
}

function insideBox(point: Vec2, box: Box): boolean {
  return (
    point.x >= box[0] &&
    point.x <= box[2] &&
    point.y >= box[1] &&
    point.y <= box[3]
  );
}

/** The rule checks the shard point itself, with no collision radius. */
export function insideBlockingGeometry(world: World, point: Vec2): boolean {
  for (const wall of world.map.walls) {
    if (insideBox(point, wall.box)) return true;
  }
  for (let index = 0; index < world.cover.length; index += 1) {
    const state = world.cover[index];
    const cover = world.map.cover[index];
    if (state?.intact && cover !== undefined && insideBox(point, cover.box))
      return true;
  }
  return false;
}

/** GR-10.9: bounded steps along the line back to a valid death point. */
export function nudgeDropPoint(
  world: World,
  deathPos: Vec2,
  proposed: Vec2,
): Vec2 {
  if (
    !Number.isFinite(deathPos.x) ||
    !Number.isFinite(deathPos.y) ||
    !Number.isFinite(proposed.x) ||
    !Number.isFinite(proposed.y)
  )
    throw new RangeError('drop coordinates must be finite');
  const dx = proposed.x - deathPos.x;
  const dy = proposed.y - deathPos.y;
  const length = Math.hypot(dx, dy);
  const maxSteps = Math.ceil(length / BALANCE.shards.dropNudgeStepM);
  for (let step = 0; step <= maxSteps; step += 1) {
    const distance = Math.max(0, length - step * BALANCE.shards.dropNudgeStepM);
    const fraction = length === 0 ? 0 : distance / length;
    const point = {
      x: deathPos.x + dx * fraction,
      y: deathPos.y + dy * fraction,
    };
    if (!insideBlockingGeometry(world, point)) return point;
  }
  throw new RangeError('death position has no geometry-free drop point');
}

/** GR-10.9: draw one angle only for a positive drop; emit in ring/id order. */
export function createDeathDrop(
  world: World,
  victim: PlayerRecord,
  deathTick: number,
  drop: number,
): void {
  if (!Number.isSafeInteger(drop) || drop < 0)
    throw new RangeError('drop must be a nonnegative integer');
  if (drop === 0) return;
  const regularCount = Math.floor(drop / BALANCE.flux.smallShard);
  const remainder = drop - regularCount * BALANCE.flux.smallShard;
  const count = regularCount + Number(remainder > 0);
  const startAngle = nextFloat(world.rng) * 2 * Math.PI;
  const deathPos = { x: victim.pos.x, y: victim.pos.y };
  for (let index = 0; index < count; index += 1) {
    const angle = startAngle + (2 * Math.PI * index) / count;
    const proposed = {
      x: deathPos.x + Math.cos(angle) * BALANCE.shards.dropRingRadiusM,
      y: deathPos.y + Math.sin(angle) * BALANCE.shards.dropRingRadiusM,
    };
    const pos = nudgeDropPoint(world, deathPos, proposed);
    spawnShard(world, {
      x: pos.x,
      y: pos.y,
      value: index < regularCount ? BALANCE.flux.smallShard : remainder,
      kind: ShardKind.DeathDrop,
      expiresTick: deathTick + DERIVED.shards.dropLifetimeTicks,
      clusterId: null,
    });
  }
}
