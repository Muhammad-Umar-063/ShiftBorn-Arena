import { BALANCE, Cause, type Box } from '@shiftborn/shared';
import { applyDamage } from './damage.js';
import { emitEvent } from './events.js';
import { formStats } from './formStats.js';
import { segmentBoxIntersection } from './math/geometry.js';
import type { Vec2 } from './math/vec2.js';
import { queryWallIndexes } from './map/collisionIndex.js';
import { lineOfSight } from './map/lineOfSight.js';
import type { PlayerRecord } from './player.js';
import { isSpawnProtected } from './protection.js';
import type { World } from './world.js';

/** GR-7.31: the strike segment stops at the first wall or intact cover. */
function truncateAtObstacles(world: World, start: Vec2, end: Vec2): number {
  const bounds: Box = [
    Math.min(start.x, end.x),
    Math.min(start.y, end.y),
    Math.max(start.x, end.x),
    Math.max(start.y, end.y),
  ];
  let t = 1;
  for (const index of queryWallIndexes(world.map, bounds)) {
    const wall = world.map.walls[index];
    if (wall === undefined) continue;
    const contact = segmentBoxIntersection(start, end, wall.box);
    if (contact !== null && contact < t) t = contact;
  }
  for (let index = 0; index < world.cover.length; index += 1) {
    const box = world.map.cover[index];
    if (world.cover[index]?.intact !== true || box === undefined) continue;
    const contact = segmentBoxIntersection(start, end, box.box);
    if (contact !== null && contact < t) t = contact;
  }
  return t;
}

/** Parameter in [0, 1] of the closest segment point to `point`. */
function closestParameter(start: Vec2, end: Vec2, point: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return 0;
  const raw = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  return Math.max(0, Math.min(1, raw));
}

/** GR-7.31: resolve one strike at its strike tick with current positions. */
export function resolveMeleeStrike(world: World, attacker: PlayerRecord): void {
  const dagger = BALANCE.weapons.dagger;
  const dir = { x: Math.cos(attacker.aim), y: Math.sin(attacker.aim) };
  const length = formStats(attacker.form).radiusM + dagger.reachM;
  const start = attacker.pos;
  const full = { x: start.x + dir.x * length, y: start.y + dir.y * length };
  const t = truncateAtObstacles(world, start, full);
  const end = { x: start.x + (full.x - start.x) * t, y: start.y + (full.y - start.y) * t };
  let target: PlayerRecord | null = null;
  let bestParameter = Infinity;
  let bestDistance = Infinity;
  for (const candidate of world.players) {
    if (candidate === null || !candidate.alive || candidate.id === attacker.id) continue;
    const ahead =
      (candidate.pos.x - start.x) * dir.x + (candidate.pos.y - start.y) * dir.y;
    if (ahead < 0) continue;
    const s = closestParameter(start, end, candidate.pos);
    const px = start.x + (end.x - start.x) * s;
    const py = start.y + (end.y - start.y) * s;
    const gap = Math.hypot(candidate.pos.x - px, candidate.pos.y - py);
    const radius = formStats(candidate.form).radiusM;
    if (gap > radius + dagger.widthM / 2) continue;
    // The target's point nearest the strike must be visible from the attacker.
    const reach = gap > radius ? radius / gap : 1;
    const nearest = {
      x: candidate.pos.x + (px - candidate.pos.x) * reach,
      y: candidate.pos.y + (py - candidate.pos.y) * reach,
    };
    if (!lineOfSight(world, start, nearest)) continue;
    const distance = Math.hypot(candidate.pos.x - start.x, candidate.pos.y - start.y);
    // Seat order iteration makes the lower seat win the final tie.
    if (s < bestParameter || (s === bestParameter && distance < bestDistance)) {
      target = candidate;
      bestParameter = s;
      bestDistance = distance;
    }
  }
  let damage = 0;
  let tags = 0;
  if (target !== null && !isSpawnProtected(target, world.tick)) {
    const result = applyDamage(
      world,
      { id: attacker.id, name: attacker.name, seat: attacker.seat, form: attacker.form },
      target,
      dagger.damage,
      1,
      { x: -dir.x, y: -dir.y },
      Cause.Dagger,
    );
    damage = result.finalDamage;
    tags = result.tags;
  }
  emitEvent(world, {
    type: 'meleeStrike',
    seat: attacker.seat,
    targetSeat: target?.seat ?? -1,
    damage,
    tags,
    x2: end.x,
    y2: end.y,
  });
}
