import {
  AbilityId,
  DERIVED,
  Form,
  Phase,
  type AbilityId as AbilityName,
} from '@shiftborn/shared';
import type { CoverState, PlayerRecord } from './world.js';
import type { MapRuntime } from './map/collisionIndex.js';
import type { Vec2 } from './math/vec2.js';
import { meleeActive } from './loadout.js';
import { integrateCircleMotion, type MotionResult } from './movement.js';
import type { AbilityState } from './player.js';
import { emitEvent } from './events.js';
import type { World } from './world.js';

/** D-016: a future kit can override this form lookup. */
export function abilityFor(player: Pick<PlayerRecord, 'form'>): AbilityName {
  switch (player.form) {
    case Form.Runner:
      return AbilityId.Dash;
    case Form.Beast:
      return AbilityId.RamCharge;
    case Form.Turret:
      return AbilityId.RailShot;
  }
}

export function canStartAbility(
  player: Pick<
    PlayerRecord,
    | 'form'
    | 'alive'
    | 'morph'
    | 'stunEndTick'
    | 'knockback'
    | 'ability'
    | 'abilityReadyTick'
    | 'melee'
  >,
  phase: Phase,
  tick: number,
): boolean {
  return (
    phase === Phase.Playing &&
    player.alive &&
    player.morph === null &&
    tick >= player.stunEndTick &&
    (player.knockback === null || tick >= player.knockback.endTick) &&
    player.ability === null &&
    !meleeActive(player, tick) &&
    tick >= player.abilityReadyTick[player.form] &&
    abilityFor(player) === AbilityId.Dash
  );
}

/** GR-8.1: a nonzero movement vector gets full Dash speed. */
export function dashDirection(move: Vec2, aim: number): Vec2 {
  const length = Math.hypot(move.x, move.y);
  return length > 0
    ? { x: move.x / length, y: move.y / length }
    : { x: Math.cos(aim), y: Math.sin(aim) };
}

export function startDash(tick: number, direction: Vec2): AbilityState {
  return {
    id: AbilityId.Dash,
    startTick: tick,
    endTick: tick + DERIVED.abilities.dash.durationTicks,
    dirX: direction.x,
    dirY: direction.y,
  };
}

/** The collision result velocity is only for sliding within this tick. */
export function advanceDash(
  player: Pick<PlayerRecord, 'pos' | 'form'>,
  dash: AbilityState,
  map: MapRuntime,
  cover: readonly CoverState[],
): MotionResult {
  return integrateCircleMotion(
    player,
    {
      x: dash.dirX * DERIVED.abilities.dash.speedMps,
      y: dash.dirY * DERIVED.abilities.dash.speedMps,
    },
    map,
    cover,
  );
}

export function dashCooldownEnd(tick: number): number {
  return tick + DERIVED.abilities.dash.cooldownTicks;
}

export function endDash(
  ability: AbilityState,
  tick: number,
  cancelled: 0 | 1,
): {
  readonly id: typeof AbilityId.Dash;
  readonly readyTick: number;
  readonly cancelled: 0 | 1;
} {
  return { id: ability.id, readyTick: dashCooldownEnd(tick), cancelled };
}

function finishAbility(
  world: World,
  player: PlayerRecord,
  tick: number,
  cancelled: 0 | 1,
): boolean {
  const ability = player.ability;
  if (ability === null) return false;
  const end = finishDashState(player, tick, cancelled);
  emitEvent(world, {
    type: 'abilityEnd',
    seat: player.seat,
    ability: end.id,
    cancelled: end.cancelled,
  });
  return true;
}

/** GR-8.2: the local predictor and server share the end transition. */
export function finishDashState(
  player: Pick<PlayerRecord, 'ability' | 'abilityReadyTick' | 'vel'>,
  tick: number,
  cancelled: 0 | 1,
): ReturnType<typeof endDash> {
  const ability = player.ability;
  if (ability === null) throw new Error('cannot finish an absent Dash');
  const end = endDash(ability, tick, cancelled);
  player.ability = null;
  player.abilityReadyTick[Form.Runner] = end.readyTick;
  player.vel = { x: 0, y: 0 };
  return end;
}

/** T-041 can invoke this on stun or knockback application. Idempotent. */
export function cancelAbility(
  world: World,
  player: PlayerRecord,
  tick: number,
): boolean {
  return finishAbility(world, player, tick, 1);
}

export function completeAbility(
  world: World,
  player: PlayerRecord,
  tick: number,
): boolean {
  return finishAbility(world, player, tick, 0);
}
