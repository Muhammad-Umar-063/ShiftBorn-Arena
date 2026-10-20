import type { InputFrame } from '@shiftborn/shared';
import { advanceAim } from './aim.js';
import type { SimEvent } from './events.js';
import { emitEvent } from './events.js';
import { advanceMovement, decodeMoveDirection } from './movement.js';
import type { Vec2 } from './math/vec2.js';
import { PHASE_POLICY } from './phasePolicy.js';
import type { World } from './world.js';
import { advancePhase } from './match.js';

export interface StepContext {
  readonly spawnAdvanceTicksBySeat?: readonly number[];
}

interface TickContext extends StepContext {
  readonly inputs: readonly InputFrame[];
  readonly directions: Vec2[];
}

type System = (world: World, context: TickContext) => void;
const emptySystem: System = () => undefined;
const inputSystem: System = (world, context) => {
  if (!PHASE_POLICY[world.phase].input) return;
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    const frame = context.inputs[seat];
    if (
      player === null ||
      player === undefined ||
      frame === undefined ||
      frame.seq < player.lastInputSeq
    )
      continue;
    context.directions[seat] = decodeMoveDirection(frame.moveX, frame.moveY);
    player.lastInputSeq = frame.seq;
    if (
      PHASE_POLICY[world.phase].aim &&
      player.alive &&
      world.tick >= player.stunEndTick
    ) {
      player.aim = advanceAim(player, frame.aim);
      player.aimSource = frame.aimSource;
    }
  }
};

const movementSystem: System = (world, context) => {
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (player === null || player === undefined) continue;
    const frozen =
      !PHASE_POLICY[world.phase].movement ||
      !player.alive ||
      world.tick < player.stunEndTick;
    const forcedVelocity =
      !frozen &&
      player.knockback !== null &&
      world.tick < player.knockback.endTick
        ? player.knockback.vel
        : undefined;
    const result = advanceMovement(
      player,
      context.directions[seat] ?? { x: 0, y: 0 },
      world.map,
      world.cover,
      frozen,
      forcedVelocity,
    );
    player.pos = result.pos;
    player.vel = result.vel;
    if (result.clamped) emitEvent(world, { type: 'positionClamped' });
  }
};

const outputSystem: System = (world) => {
  world.tick += 1;
};

// GR-15: step executes this same descriptor that tests inspect.
export const TICK_SYSTEMS = [
  { name: 'phase', run: advancePhase },
  { name: 'inputs', run: inputSystem },
  { name: 'morph', run: emptySystem },
  { name: 'abilityStart', run: emptySystem },
  { name: 'abilityUpdate', run: emptySystem },
  { name: 'movement', run: movementSystem },
  { name: 'weapons', run: emptySystem },
  { name: 'projectiles', run: emptySystem },
  { name: 'deaths', run: emptySystem },
  { name: 'respawns', run: emptySystem },
  { name: 'statusTimers', run: emptySystem },
  { name: 'fluxAndShards', run: emptySystem },
  { name: 'zone', run: emptySystem },
  { name: 'cover', run: emptySystem },
  { name: 'output', run: outputSystem },
] as const;

export function step(
  world: World,
  inputs: readonly InputFrame[],
  context: StepContext,
): SimEvent[] {
  world.events.length = 0;
  const tickContext: TickContext = {
    ...context,
    inputs,
    directions: Array.from({ length: world.players.length }, () => ({
      x: 0,
      y: 0,
    })),
  };
  for (const system of TICK_SYSTEMS) system.run(world, tickContext);
  return world.events;
}
