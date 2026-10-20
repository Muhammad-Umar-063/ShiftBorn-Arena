import { BALANCE, DERIVED, Form } from '@shiftborn/shared';
import type { Vec2 } from './math/vec2.js';
import { circleBoxPushOut } from './math/geometry.js';
import {
  queryCircleWallIndexes,
  type MapRuntime,
} from './map/collisionIndex.js';
import type { CoverState, PlayerRecord } from './world.js';

export interface MotionResult {
  readonly pos: Vec2;
  readonly vel: Vec2;
  readonly clamped: boolean;
}

type MutableVec2 = { x: number; y: number };

/** GR-4.2: quantized input is normalized only above unit length. */
export function decodeMoveDirection(moveX: number, moveY: number): Vec2 {
  const x = moveX / 127;
  const y = moveY / 127;
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

function formSpeed(form: Form): number {
  switch (form) {
    case Form.Runner:
      return BALANCE.forms.runner.speedMps;
    case Form.Beast:
      return BALANCE.forms.beast.speedMps;
    case Form.Turret:
      return BALANCE.forms.turret.speedMps;
  }
}

function formRadius(form: Form): number {
  switch (form) {
    case Form.Runner:
      return BALANCE.forms.runner.radiusM;
    case Form.Beast:
      return BALANCE.forms.beast.radiusM;
    case Form.Turret:
      return BALANCE.forms.turret.radiusM;
  }
}

/** GR-4.3–4.4: target and acceleration use the active (old during morph) form. */
export function targetVelocity(
  player: Pick<PlayerRecord, 'form' | 'morph'>,
  direction: Vec2,
): Vec2 {
  const speed =
    formSpeed(player.form) *
    (player.morph === null ? 1 : BALANCE.morph.moveMult);
  return { x: direction.x * speed, y: direction.y * speed };
}

export function moveTowardVelocity(current: Vec2, target: Vec2): Vec2 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  const maxChange = DERIVED.movement.accelMpsPerTick;
  if (distance <= maxChange) return { x: target.x, y: target.y };
  return {
    x: current.x + (dx / distance) * maxChange,
    y: current.y + (dy / distance) * maxChange,
  };
}

function pushOut(pos: MutableVec2, vel: MutableVec2, correction: Vec2): void {
  pos.x += correction.x;
  pos.y += correction.y;
  const length = Math.hypot(correction.x, correction.y);
  if (length === 0) return;
  const nx = correction.x / length;
  const ny = correction.y / length;
  const inward = vel.x * nx + vel.y * ny;
  if (inward < 0) {
    vel.x -= inward * nx;
    vel.y -= inward * ny;
  }
}

/** GR-4.7–4.10: common integrator for input, ability, and knockback velocities. */
export function integrateCircleMotion(
  player: Pick<PlayerRecord, 'pos' | 'form'>,
  velocity: Vec2,
  map: MapRuntime,
  cover: readonly CoverState[],
): MotionResult {
  const pos = { x: player.pos.x, y: player.pos.y };
  const vel = { x: velocity.x, y: velocity.y };
  const radius = formRadius(player.form);
  const totalDistance = Math.hypot(vel.x, vel.y) * DERIVED.tick.secondsPerTick;
  const count = Math.max(
    1,
    Math.ceil(totalDistance / BALANCE.movement.maxSubstepM),
  );
  const substepSeconds = DERIVED.tick.secondsPerTick / count;
  for (let substep = 0; substep < count; substep += 1) {
    // The adjusted velocity is used for every remaining substep, retaining slide motion.
    pos.x += vel.x * substepSeconds;
    pos.y += vel.y * substepSeconds;
    for (let pass = 0; pass < 3; pass += 1) {
      let collided = false;
      for (const index of queryCircleWallIndexes(map, pos, radius)) {
        const wall = map.walls[index];
        if (wall === undefined) continue;
        const correction = circleBoxPushOut(pos, radius, wall.box);
        if (correction === null) continue;
        pushOut(pos, vel, correction);
        collided = true;
      }
      for (let index = 0; index < map.cover.length; index += 1) {
        if (cover[index]?.intact !== true) continue;
        const box = map.cover[index]?.box;
        if (box === undefined) continue;
        const correction = circleBoxPushOut(pos, radius, box);
        if (correction === null) continue;
        pushOut(pos, vel, correction);
        collided = true;
      }
      if (!collided) break;
    }
  }
  const playable = map.playable;
  const x = Math.max(
    playable.minX + radius,
    Math.min(playable.maxX - radius, pos.x),
  );
  const y = Math.max(
    playable.minY + radius,
    Math.min(playable.maxY - radius, pos.y),
  );
  const clamped = x !== pos.x || y !== pos.y;
  if (x !== pos.x) vel.x = 0;
  if (y !== pos.y) vel.y = 0;
  return { pos: { x, y }, vel, clamped };
}

/** GR-4.5–4.6: explicit control freeze supports future ability motion. */
export function advanceMovement(
  player: Pick<PlayerRecord, 'pos' | 'vel' | 'form' | 'morph'>,
  direction: Vec2,
  map: MapRuntime,
  cover: readonly CoverState[],
  controlFrozen = false,
  forcedVelocity?: Vec2,
): MotionResult {
  if (controlFrozen)
    return { pos: { ...player.pos }, vel: { x: 0, y: 0 }, clamped: false };
  const vel =
    player.form === Form.Turret
      ? { x: 0, y: 0 }
      : (forcedVelocity ??
        moveTowardVelocity(player.vel, targetVelocity(player, direction)));
  return integrateCircleMotion(player, vel, map, cover);
}
