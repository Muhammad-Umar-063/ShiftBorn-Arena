import {
  Form,
  BALANCE,
  clampAimDistance,
  InputButton,
  Phase,
  WeaponId,
  type GunId,
  type InputFrame,
} from '@shiftborn/shared';
import { advanceAim } from './aim.js';
import {
  advanceDash,
  canStartAbility,
  dashDirection,
  finishDashState,
  startDash,
} from './ability.js';
import { advanceInputHistory } from './inputHistory.js';
import { cloneGuns } from './loadout.js';
import type { MapRuntime } from './map/collisionIndex.js';
import {
  advanceMovement,
  canSprint,
  decodeMoveDirection,
} from './movement.js';
import {
  completeMorphState,
  evaluateMorphRequest,
  morphKnockbackImmune,
  requestedMorphTarget,
} from './morph.js';
import { PHASE_POLICY } from './phasePolicy.js';
import type { PlayerRecord } from './player.js';
import { endSpawnProtection } from './protection.js';
import {
  advanceShotSequence,
  advanceWeaponState,
  cancelReloadState,
  scatterAngles,
} from './weaponRules.js';
import type { CoverState } from './world.js';

export interface PredictedShot {
  readonly inputSeq: number;
  /** D-069 per-input-sequence index for later T-037 visual matching. */
  readonly shotIdx: number;
  readonly form: Form;
  readonly weapon: GunId;
  readonly angle: number;
}

/**
 * The local, predictable subset of PlayerRecord. `authoritativeFlux` is the
 * last server value; provisionalMorphCost tracks only locally requested spend.
 * T-035 must replace both from a patch before replay, not infer Flux gains.
 */
export interface LocalPredictState extends Pick<
  PlayerRecord,
  | 'alive'
  | 'pos'
  | 'vel'
  | 'aim'
  | 'aimDistM'
  | 'sprinting'
  | 'form'
  | 'unlocked'
  | 'morph'
  | 'morphReadyTick'
  | 'ability'
  | 'abilityReadyTick'
  | 'guns'
  | 'selectedTier'
  | 'gunTimers'
  | 'reload'
  | 'swapReadyTick'
  | 'melee'
  | 'heat'
  | 'overheatEndTick'
  | 'stunEndTick'
  | 'ccImmuneEndTick'
  | 'knockback'
  | 'protectedEndTick'
  | 'lastInputSeq'
  | 'lastButtonInputSeq'
  | 'lastHeldButtons'
  | 'lastShotInputSeq'
  | 'nextShotIdx'
  | 'aimSource'
> {
  authoritativeFlux: number;
  provisionalMorphCost: number;
  /** Shots requested on this step only; no projectile or damage is created. */
  shotsThisTick: readonly PredictedShot[];
}

export interface PredictStepContext {
  /** Pre-step server simulation tick, never the InputFrame sequence number. */
  readonly tick: number;
  /** Phase at the input system, after any server phase transition. */
  readonly phase: Phase;
  /** Current authoritative intact flags, aligned with map.cover indexes. */
  readonly cover: readonly CoverState[];
  /** NETWORK_PROTOCOL §5.4 merged edges when a server tick consumes two frames. */
  readonly pressedButtons?: number;
}

/** In-memory bootstrap only; a network patch needs a complete restoration contract. */
export function localPredictStateFromPlayer(player: PlayerRecord): LocalPredictState {
  return {
    alive: player.alive,
    pos: { ...player.pos },
    vel: { ...player.vel },
    aim: player.aim,
    aimDistM: player.aimDistM, sprinting: player.sprinting,
    form: player.form,
    unlocked: { ...player.unlocked },
    morph: player.morph === null ? null : { ...player.morph },
    morphReadyTick: player.morphReadyTick,
    ability: player.ability === null ? null : { ...player.ability },
    abilityReadyTick: { ...player.abilityReadyTick },
    guns: cloneGuns(player.guns),
    selectedTier: { ...player.selectedTier },
    gunTimers: { ...player.gunTimers },
    reload: player.reload === null ? null : { ...player.reload },
    swapReadyTick: player.swapReadyTick,
    melee: player.melee === null ? null : { ...player.melee },
    heat: player.heat,
    overheatEndTick: player.overheatEndTick,
    stunEndTick: player.stunEndTick,
    ccImmuneEndTick: player.ccImmuneEndTick,
    knockback:
      player.knockback === null
        ? null
        : { vel: { ...player.knockback.vel }, endTick: player.knockback.endTick },
    protectedEndTick: player.protectedEndTick,
    lastInputSeq: player.lastInputSeq,
    lastButtonInputSeq: player.lastButtonInputSeq,
    lastHeldButtons: player.lastHeldButtons,
    lastShotInputSeq: player.lastShotInputSeq,
    nextShotIdx: player.nextShotIdx,
    aimSource: player.aimSource,
    authoritativeFlux: player.flux,
    provisionalMorphCost: 0,
    shotsThisTick: [],
  };
}

/**
 * GR-15 local subset: one call advances one server tick with a caller-supplied
 * input. The caller must supply the same phase, cover and merged edges that the
 * server used. Returned state is independent of the input and previous state.
 */
export function predictStep(
  local: LocalPredictState,
  input: InputFrame,
  map: MapRuntime,
  context: PredictStepContext,
): LocalPredictState {
  const next: LocalPredictState = {
    ...local,
    pos: { ...local.pos },
    vel: { ...local.vel },
    unlocked: { ...local.unlocked },
    morph: local.morph === null ? null : { ...local.morph },
    ability: local.ability === null ? null : { ...local.ability },
    abilityReadyTick: { ...local.abilityReadyTick },
    guns: cloneGuns(local.guns),
    selectedTier: { ...local.selectedTier },
    gunTimers: { ...local.gunTimers },
    reload: local.reload === null ? null : { ...local.reload },
    melee: local.melee === null ? null : { ...local.melee },
    knockback:
      local.knockback === null
        ? null
        : { vel: { ...local.knockback.vel }, endTick: local.knockback.endTick },
    shotsThisTick: [],
  };
  const { tick, phase, cover } = context;
  const history = advanceInputHistory(next, input, context.pressedButtons);
  const useInput = history.accepted && PHASE_POLICY[phase].input;
  const direction = useInput
    ? decodeMoveDirection(input.moveX, input.moveY)
    : { x: 0, y: 0 };
  const held = useInput && (input.buttons & InputButton.Fire) !== 0;
  if (useInput) {
    next.lastInputSeq = input.seq;
    if (PHASE_POLICY[phase].aim && next.alive && tick >= next.stunEndTick) {
      next.aim = advanceAim(next, input.aim);
      next.aimSource = input.aimSource;
      next.aimDistM = clampAimDistance((input.aimDist ?? BALANCE.aimDistance.defaultM * 10) / 10);
    }
  }

  // GR-5.4: input aim used the old form even if the morph ends now.
  if (!next.alive) next.morph = null;
  else completeMorphState(next, tick);
  const target = requestedMorphTarget(history.pressed);
  if (target !== null) {
    const decision = evaluateMorphRequest(
      {
        ...next,
        flux: next.authoritativeFlux - next.provisionalMorphCost,
      },
      target,
      phase,
      tick,
    );
    if (decision.kind === 'start') {
      next.provisionalMorphCost += decision.cost;
      next.morph = { target, endTick: decision.endTick };
      cancelReloadState(next);
    }
  }

  if (
    (history.pressed & InputButton.Ability) !== 0 &&
    canStartAbility(next, phase, tick)
  ) {
    next.ability = startDash(tick, dashDirection(direction, next.aim));
    next.vel = { x: 0, y: 0 };
    endSpawnProtection(next, tick);
    cancelReloadState(next);
  }
  if (next.ability !== null) {
    if (
      !next.alive ||
      phase !== Phase.Playing ||
      tick < next.stunEndTick ||
      (next.knockback !== null && tick < next.knockback.endTick)
    ) {
      finishDashState(next, tick, 1);
    } else if (tick >= next.ability.endTick) {
      finishDashState(next, tick, 0);
    } else {
      const motion = advanceDash(next, next.ability, map, cover);
      next.pos = motion.pos;
      next.vel = { x: 0, y: 0 };
    }
  }
  next.sprinting = canSprint(next, direction, useInput ? input.buttons : 0, phase, tick);
  if (next.ability === null) {
    const frozen =
      !PHASE_POLICY[phase].movement || !next.alive || tick < next.stunEndTick;
    const forcedVelocity =
      !frozen &&
      next.knockback !== null &&
      !morphKnockbackImmune(next) &&
      tick < next.knockback.endTick
        ? next.knockback.vel
        : undefined;
    const motion = advanceMovement(
      next,
      direction,
      map,
      cover,
      frozen,
      forcedVelocity,
    );
    next.pos = motion.pos;
    next.vel = motion.vel;
  }

  const pressed = useInput ? history.pressed : 0;
  for (const action of advanceWeaponState(next, phase, tick, held, pressed)) {
    if (action.kind !== 'fire') continue;
    const inputSeq = useInput
      ? input.shotIntentSeq !== undefined &&
        Number.isSafeInteger(input.shotIntentSeq) && input.shotIntentSeq > 0 &&
        input.shotIntentSeq <= input.seq ? input.shotIntentSeq : input.seq
      : next.lastInputSeq;
    // D-069: the server and predictor share the per-sequence allocation rule.
    const sequence = advanceShotSequence(next, inputSeq, action.gun);
    next.lastShotInputSeq = inputSeq;
    next.nextShotIdx = sequence.nextShotIdx;
    const angles =
      action.gun === WeaponId.ScatterCannon
        ? scatterAngles(next.aim)
        : [next.aim];
    next.shotsThisTick = angles.map((angle, index) => ({
      inputSeq,
      shotIdx: sequence.firstShotIdx + index,
      form: next.form,
      weapon: action.gun,
      angle,
    }));
    endSpawnProtection(next, tick);
  }
  return next;
}
