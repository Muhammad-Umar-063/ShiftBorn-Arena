import { BALANCE, GREYBOX_V1, type ClientInputFrame } from '@shiftborn/shared';
import { createMapRuntime, predictStep, type LocalPredictState,
  type MapRuntime, type PredictedShot } from '@shiftborn/sim';
import type { PredictionAuthority } from './authoritative.js';

export interface LocalPresentation {
  readonly x: number;
  readonly y: number;
  readonly aim: number;
  readonly form: LocalPredictState['form'];
  readonly alive: boolean;
  readonly morph: LocalPredictState['morph'];
  readonly ability: LocalPredictState['ability'];
  readonly stunEndTick: number;
  readonly knockbackEndTick: number;
  readonly protectedEndTick: number;
}

export type PredictionNotice =
  | { readonly kind: 'rejectedMorph'; readonly target: LocalPredictState['form'] };

export interface PredictedShotStart extends PredictedShot {
  readonly x: number;
  readonly y: number;
}

interface PendingFrame { readonly frame: ClientInputFrame }
const MAX_PENDING = BALANCE.net.reconnectS * BALANCE.tick.rateHz;
// NETWORK_PROTOCOL §7 identifies a consecutive authoritative jump over 5 m as a teleport.
const TELEPORT_DISTANCE_M = 5;

/** D-061/D-067: project-sequence replay around the shared T-040 step. */
export class Predictor {
  private readonly map: MapRuntime;
  private readonly listeners = new Set<(notice: PredictionNotice) => void>();
  private readonly pending: PendingFrame[] = [];
  private authority: PredictionAuthority | null = null;
  private predicted: LocalPredictState | null = null;
  private predictedTick = 0;
  private offsetX = 0;
  private offsetY = 0;
  private offsetAt = 0;
  private morphRequest: { readonly seq: number;
    readonly target: LocalPredictState['form'] } | null = null;
  private corrections = 0;
  private lastErrorM: number | null = null;
  private readonly errorsM: number[] = [];
  private readonly correctionAtMs: number[] = [];
  private disposed = false;

  constructor(map: MapRuntime = createMapRuntime(GREYBOX_V1)) { this.map = map; }

  subscribe(listener: (notice: PredictionNotice) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  get correctionCount(): number { return this.corrections; }
  get localTick(): number | null {
    return this.predicted === null ? null : this.predictedTick;
  }
  metrics(atMs: number): { readonly lastErrorM: number | null;
    readonly averageErrorM: number | null; readonly correctionsPerMinute: number } {
    while (this.correctionAtMs[0] !== undefined &&
      atMs - this.correctionAtMs[0] >= 60_000) this.correctionAtMs.shift();
    return { lastErrorM: this.lastErrorM,
      averageErrorM: this.errorsM.length === 0 ? null :
        this.errorsM.reduce((sum, error) => sum + error, 0) / this.errorsM.length,
      correctionsPerMinute: this.correctionAtMs.length };
  }
  get pendingSequences(): readonly number[] {
    return this.pending.map((entry) => entry.frame.seq);
  }
  get state(): LocalPredictState | null {
    return this.predicted === null ? null : structuredClone(this.predicted);
  }

  /** Called once after InputManager successfully sends a newly sampled frame. */
  onFrame(frame: ClientInputFrame): readonly PredictedShotStart[] {
    if (this.disposed || this.authority === null || this.predicted === null ||
      !this.predicted.alive || this.pending.length >= MAX_PENDING ||
      frame.seq <= (this.pending.at(-1)?.frame.seq ?? this.authority.state.lastInputSeq))
      return [];
    this.pending.push({ frame: { ...frame } });
    const before = this.predicted.morph;
    this.predicted = predictStep(this.predicted, frame, this.map, {
      tick: this.predictedTick, phase: this.authority.phase,
      cover: this.authority.cover,
    });
    this.predictedTick += 1;
    if (before === null && this.predicted.morph !== null)
      this.morphRequest = { seq: frame.seq, target: this.predicted.morph.target };
    const state = this.predicted;
    return state.shotsThisTick.map((shot) => ({ ...shot,
      x: state.pos.x, y: state.pos.y }));
  }

  /** A full authoritative restore precedes every replay; no stale timer survives. */
  adopt(next: PredictionAuthority, atMs: number, reset = false): void {
    if (this.disposed || !Number.isFinite(atMs)) return;
    const previous = this.authority;
    if (!reset && previous !== null && previous.matchId === next.matchId &&
      previous.playerId === next.playerId && next.tick <= previous.tick) return;
    const hardReset = reset || previous === null ||
      previous.matchId !== next.matchId || previous.playerId !== next.playerId ||
      !next.state.alive || !previous.state.alive ||
      next.respawnTick !== previous.respawnTick ||
      Math.hypot(next.state.pos.x - previous.state.pos.x,
        next.state.pos.y - previous.state.pos.y) > TELEPORT_DISTANCE_M;
    const displayed = hardReset ? null : this.presentation(atMs);
    const request = this.morphRequest;
    if (hardReset) {
      this.pending.length = 0;
      this.morphRequest = null;
    } else {
      while (this.pending.length > 0 &&
        (this.pending[0]?.frame.seq ?? Infinity) <= next.state.lastInputSeq)
        this.pending.shift();
      if (request !== null && next.state.lastInputSeq >= request.seq) {
        if (next.state.morph?.target !== request.target &&
          next.state.form !== request.target)
          for (const listener of this.listeners)
            listener({ kind: 'rejectedMorph', target: request.target });
        this.morphRequest = null;
      }
    }
    this.authority = next;
    this.predicted = structuredClone(next.state);
    this.predictedTick = next.tick;
    for (const { frame } of this.pending) {
      this.predicted = predictStep(this.predicted, frame, this.map, {
        tick: this.predictedTick, phase: next.phase, cover: next.cover,
      });
      this.predictedTick += 1;
    }
    if (hardReset || displayed === null) {
      this.offsetX = 0; this.offsetY = 0; this.offsetAt = atMs;
      return;
    }
    const dx = displayed.x - this.predicted.pos.x;
    const dy = displayed.y - this.predicted.pos.y;
    // D-061: Euclidean, inclusive >= threshold. Offset is visual only.
    const errorM = Math.hypot(dx, dy);
    this.lastErrorM = errorM;
    this.errorsM.push(errorM);
    if (this.errorsM.length > 60) this.errorsM.shift();
    if (errorM >= BALANCE.net.smoothErrorM) {
      this.corrections += 1;
      this.correctionAtMs.push(atMs);
      this.offsetX = 0; this.offsetY = 0;
    } else {
      this.offsetX = dx; this.offsetY = dy;
    }
    this.offsetAt = atMs;
  }

  presentation(atMs: number): LocalPresentation | null {
    const state = this.predicted;
    if (state === null) return null;
    const elapsed = Number.isFinite(atMs) ? Math.max(0, atMs - this.offsetAt) : 0;
    const remaining = Math.max(0, 1 - elapsed / BALANCE.net.smoothMs);
    return { x: state.pos.x + this.offsetX * remaining,
      y: state.pos.y + this.offsetY * remaining,
      aim: state.aim, form: state.form, alive: state.alive,
      morph: state.morph, ability: state.ability,
      stunEndTick: state.stunEndTick,
      knockbackEndTick: state.knockback?.endTick ?? 0,
      protectedEndTick: state.protectedEndTick };
  }

  /** Recovery, visibility return, teleport and session replacement snap fresh state. */
  reset(): void {
    this.pending.length = 0;
    this.authority = null; this.predicted = null;
    this.predictedTick = 0;
    this.morphRequest = null;
    this.offsetX = 0; this.offsetY = 0; this.offsetAt = 0;
    this.lastErrorM = null;
    this.errorsM.length = 0;
    this.correctionAtMs.length = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset(); this.listeners.clear(); this.disposed = true;
  }
}
