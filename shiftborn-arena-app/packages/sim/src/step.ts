import { Form, InputButton, type InputFrame } from '@shiftborn/shared';
import { advanceAim } from './aim.js';
import type { SimEvent } from './events.js';
import { emitEvent } from './events.js';
import { advanceMovement, decodeMoveDirection } from './movement.js';
import type { Vec2 } from './math/vec2.js';
import {
  cancelMorphOnDeath,
  dueMorphCompletion,
  evaluateMorphRequest,
  morphKnockbackImmune,
} from './morph.js';
import { PHASE_POLICY } from './phasePolicy.js';
import type { World } from './world.js';
import { advancePhase } from './match.js';

export interface StepContext {
  readonly spawnAdvanceTicksBySeat?: readonly number[];
}

interface TickContext extends StepContext {
  readonly inputs: readonly InputFrame[];
  readonly directions: Vec2[];
  readonly pressedButtonsBySeat: number[];
}

type System = (world: World, context: TickContext) => void;
const emptySystem: System = () => undefined;
const inputSystem: System = (world, context) => {
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    const frame = context.inputs[seat];
    if (
      player === null ||
      player === undefined ||
      frame === undefined ||
      frame.seq < Math.max(player.lastInputSeq, player.lastButtonInputSeq)
    )
      continue;
    // GR-5.1: held bits produce an edge only for a new input sequence.
    if (frame.seq > player.lastButtonInputSeq) {
      context.pressedButtonsBySeat[seat] =
        frame.buttons & ~player.lastHeldButtons;
      player.lastHeldButtons = frame.buttons;
      player.lastButtonInputSeq = frame.seq;
    }
    // RESULTS still observes morph presses for GR-5.2 phase denial, without
    // applying movement/aim or advancing the T-012 lastInputSeq field.
    if (!PHASE_POLICY[world.phase].input) continue;
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

function requestedMorphTarget(pressedButtons: number): Form | null {
  const runner = (pressedButtons & InputButton.MorphRunner) !== 0;
  const beast = (pressedButtons & InputButton.MorphBeast) !== 0;
  const turret = (pressedButtons & InputButton.MorphTurret) !== 0;
  // OQ-014: multiple new targets have no defined priority, so select none.
  if (Number(runner) + Number(beast) + Number(turret) !== 1) return null;
  return runner ? Form.Runner : beast ? Form.Beast : Form.Turret;
}

const morphSystem: System = (world, context) => {
  // GR-5.4: all due completions precede all new requests on this tick.
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (player === null || player === undefined) continue;
    if (!player.alive) {
      cancelMorphOnDeath(player);
      continue;
    }
    const completion = dueMorphCompletion(player, world.tick);
    if (completion === null) continue;
    player.form = completion.form;
    player.morph = null;
    player.morphReadyTick = completion.morphReadyTick;
    player.vel = completion.vel;
    emitEvent(world, { type: 'morphEnd', seat, form: completion.form });
  }
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (player === null || player === undefined) continue;
    const target = requestedMorphTarget(
      context.pressedButtonsBySeat[seat] ?? 0,
    );
    if (target === null) continue;
    const decision = evaluateMorphRequest(
      player,
      target,
      world.phase,
      world.tick,
    );
    if (decision.kind === 'sameForm') continue;
    if (decision.kind === 'denied') {
      emitEvent(world, {
        type: 'morphDenied',
        seat,
        target,
        reason: decision.reason,
      });
      continue;
    }
    player.flux -= decision.cost;
    player.morph = { target, endTick: decision.endTick };
    emitEvent(world, {
      type: 'morphStart',
      seat,
      from: player.form,
      to: target,
      endTick: decision.endTick,
    });
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
      !morphKnockbackImmune(player) &&
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
  { name: 'morph', run: morphSystem },
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
    pressedButtonsBySeat: Array.from({ length: world.players.length }, () => 0),
  };
  for (const system of TICK_SYSTEMS) system.run(world, tickContext);
  return world.events;
}
