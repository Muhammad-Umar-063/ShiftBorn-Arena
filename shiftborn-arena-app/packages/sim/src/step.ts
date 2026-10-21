import {
  Controller,
  DERIVED,
  InputButton,
  Phase,
  type InputFrame,
} from '@shiftborn/shared';
import { advanceAim } from './aim.js';
import { advanceInputHistory } from './inputHistory.js';
import {
  advanceDash,
  canStartAbility,
  cancelAbility,
  completeAbility,
  dashDirection,
  startDash,
} from './ability.js';
import { finalizeDeaths } from './death.js';
import type { SimEvent } from './events.js';
import { emitEvent } from './events.js';
import { advanceMovement, decodeMoveDirection } from './movement.js';
import type { Vec2 } from './math/vec2.js';
import {
  cancelMorphOnDeath,
  completeMorphState,
  evaluateMorphRequest,
  morphKnockbackImmune,
  requestedMorphTarget,
} from './morph.js';
import { PHASE_POLICY } from './phasePolicy.js';
import { endSpawnProtection } from './protection.js';
import { respawnDuePlayers } from './respawn.js';
import { advanceFluxAndShards } from './shards.js';
import type { World } from './world.js';
import { advancePhase } from './match.js';
import {
  advanceAllProjectiles,
  advanceProjectile,
  fireProjectiles,
  type Projectile,
} from './projectiles.js';
import {
  advanceWeaponState,
  advanceShotSequence,
} from './weaponRules.js';

export interface StepContext {
  readonly spawnAdvanceTicksBySeat?: readonly number[];
  /** NETWORK_PROTOCOL §5.4: server catch-up may merge edges from two inputs. */
  readonly inputPressedButtonsBySeat?: readonly (number | undefined)[];
}

interface TickContext extends StepContext {
  readonly inputs: readonly InputFrame[];
  readonly directions: Vec2[];
  readonly pressedButtonsBySeat: number[];
  readonly fireHeldBySeat: boolean[];
  readonly inputSeqBySeat: number[];
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
      frame === undefined
    )
      continue;
    const history = advanceInputHistory(
      player,
      frame,
      context.inputPressedButtonsBySeat?.[seat],
    );
    if (!history.accepted) continue;
    context.pressedButtonsBySeat[seat] = history.pressed;
    // RESULTS still observes morph presses for GR-5.2 phase denial, without
    // applying movement/aim or advancing the T-012 lastInputSeq field.
    if (!PHASE_POLICY[world.phase].input) continue;
    context.fireHeldBySeat[seat] = (frame.buttons & InputButton.Fire) !== 0;
    context.inputSeqBySeat[seat] = frame.seq;
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

const morphSystem: System = (world, context) => {
  // GR-5.4: all due completions precede all new requests on this tick.
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (player === null || player === undefined) continue;
    if (!player.alive) {
      cancelMorphOnDeath(player);
      continue;
    }
    const completion = completeMorphState(player, world.tick);
    if (completion === null) continue;
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

const abilityStartSystem: System = (world, context) => {
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (
      player === null ||
      player === undefined ||
      ((context.pressedButtonsBySeat[seat] ?? 0) & InputButton.Ability) === 0 ||
      !canStartAbility(player, world.phase, world.tick)
    )
      continue;
    const direction = dashDirection(
      context.directions[seat] ?? { x: 0, y: 0 },
      player.aim,
    );
    const ability = startDash(world.tick, direction);
    player.ability = ability;
    player.vel = { x: 0, y: 0 };
    endSpawnProtection(player, world.tick);
    emitEvent(world, {
      type: 'abilityStart',
      seat,
      ability: ability.id,
      startTick: ability.startTick,
      endTick: ability.endTick,
      dirX: ability.dirX,
      dirY: ability.dirY,
    });
  }
};

const abilityUpdateSystem: System = (world) => {
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (player === null || player === undefined || player.ability === null)
      continue;
    if (
      !player.alive ||
      world.phase !== Phase.Playing ||
      world.tick < player.stunEndTick ||
      (player.knockback !== null && world.tick < player.knockback.endTick)
    ) {
      cancelAbility(world, player, world.tick);
      continue;
    }
    if (world.tick >= player.ability.endTick) {
      completeAbility(world, player, world.tick);
      continue;
    }
    const result = advanceDash(player, player.ability, world.map, world.cover);
    player.pos = result.pos;
    player.vel = { x: 0, y: 0 };
    if (result.clamped) emitEvent(world, { type: 'positionClamped' });
  }
};

const movementSystem: System = (world, context) => {
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (player === null || player === undefined) continue;
    if (player.ability !== null) continue;
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

const weaponsSystem: System = (world, context) => {
  const spawned: { projectile: Projectile; advanceTicks: number }[] = [];
  // GR-15: finish every same-tick firing decision before advance can cause a kill.
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const player = world.players[seat];
    if (player === null || player === undefined) continue;
    const held = context.fireHeldBySeat[seat] ?? false;
    const result = advanceWeaponState(player, world.phase, world.tick, held);
    if (result.overheated)
      emitEvent(world, {
        type: 'overheat',
        seat,
        endTick: player.overheatEndTick,
      });
    if (!result.fired) continue;
    const inputSeq = context.inputSeqBySeat[seat] ?? player.lastInputSeq;
    const shotSequence = advanceShotSequence(player, inputSeq, player.form);
    player.lastShotInputSeq = inputSeq;
    player.nextShotIdx = shotSequence.nextShotIdx;
    const requestedAdvance = context.spawnAdvanceTicksBySeat?.[seat] ?? 0;
    const advanceTicks =
      player.controller === Controller.Human && !player.isBot
        ? Math.min(
            Math.max(
              0,
              Number.isFinite(requestedAdvance)
                ? Math.trunc(requestedAdvance)
                : 0,
            ),
            // GR-7.9: server has already converted latency into whole ticks.
            // The sim applies only the documented cap.
            DERIVED.weapons.spawnAdvanceMaxTicks,
          )
        : 0;
    const fired = fireProjectiles(
      world,
      player,
      inputSeq,
      shotSequence.firstShotIdx,
      advanceTicks,
    );
    for (const projectile of fired) spawned.push({ projectile, advanceTicks });
  }
  for (const { projectile, advanceTicks } of spawned) {
    for (let extra = 0; extra < advanceTicks; extra += 1) {
      if (!advanceProjectile(world, projectile)) break;
    }
  }
};

const projectilesSystem: System = (world) => advanceAllProjectiles(world);

const outputSystem: System = (world) => {
  world.tick += 1;
};

// GR-15: step executes this same descriptor that tests inspect.
export const TICK_SYSTEMS = [
  { name: 'phase', run: advancePhase },
  { name: 'inputs', run: inputSystem },
  { name: 'morph', run: morphSystem },
  { name: 'abilityStart', run: abilityStartSystem },
  { name: 'abilityUpdate', run: abilityUpdateSystem },
  { name: 'movement', run: movementSystem },
  { name: 'weapons', run: weaponsSystem },
  { name: 'projectiles', run: projectilesSystem },
  { name: 'deaths', run: finalizeDeaths },
  { name: 'respawns', run: respawnDuePlayers },
  { name: 'statusTimers', run: emptySystem },
  { name: 'fluxAndShards', run: advanceFluxAndShards },
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
    fireHeldBySeat: Array.from({ length: world.players.length }, () => false),
    inputSeqBySeat: Array.from({ length: world.players.length }, () => -1),
  };
  for (const system of TICK_SYSTEMS) system.run(world, tickContext);
  return world.events;
}
