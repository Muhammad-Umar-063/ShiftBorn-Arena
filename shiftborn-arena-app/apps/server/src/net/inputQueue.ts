import { performance } from 'node:perf_hooks';
import {
  BALANCE,
  decodeInputPacket,
  type ClientInputFrame,
} from '@shiftborn/shared';

export interface InputDropCounters {
  malformedPacket: number;
  invalidFrame: number;
  rateLimited: number;
  bufferOverflow: number;
  unknownMessage: number;
  total: number;
}

export interface AppliedInput {
  readonly frame: ClientInputFrame | undefined;
  readonly pressedButtons: number;
  readonly consumedSequences: readonly number[];
}

export interface AcceptedInput {
  readonly frame: ClientInputFrame;
  readonly previousAim: number;
}

export interface ReceivedInput {
  readonly shouldKick: boolean;
  readonly accepted: readonly AcceptedInput[];
}

type DropReason = Exclude<keyof InputDropCounters, 'total'>;
const RATE_WINDOW_MS = 1000;
const VIOLATION_WINDOW_MS = 10 * RATE_WINDOW_MS;
const VIOLATION_LIMIT = 50;

/** NETWORK_PROTOCOL §5.2/§5.4: one stable input history per player seat. */
export class InputQueue {
  readonly counters: InputDropCounters = {
    malformedPacket: 0,
    invalidFrame: 0,
    rateLimited: 0,
    bufferOverflow: 0,
    unknownMessage: 0,
    total: 0,
  };
  readonly frames: ClientInputFrame[] = [];
  lastReceivedSeq = 0;
  lastInputSeq = -1;
  lastHeldButtons = 0;
  private lastAcceptedAim = 0;
  private lastApplied: ClientInputFrame | undefined;
  private readonly acceptedAtMs: number[] = [];
  private readonly violationsAtMs: number[] = [];
  private closed = false;

  constructor(private readonly nowMs: () => number = () => performance.now()) {}

  get isClosed(): boolean {
    return this.closed;
  }

  get violationWindowCount(): number {
    this.expire(this.violationsAtMs, this.nowMs(), VIOLATION_WINDOW_MS);
    return this.violationsAtMs.length;
  }

  /** Returns true only when this packet first reaches the kick threshold. */
  receive(payload: unknown): boolean {
    return this.receiveDetailed(payload).shouldKick;
  }

  /** T-026 observes only newly accepted frames; T-022's queue rules stay intact. */
  receiveDetailed(payload: unknown): ReceivedInput {
    if (this.closed) return { shouldKick: false, accepted: [] };
    const wasClosed = this.closed;
    const now = this.nowMs();
    const decoded = decodeInputPacket(payload, this.lastReceivedSeq);
    if (!decoded.packetValid) {
      this.drop('malformedPacket', now);
      return { shouldKick: !wasClosed && this.closed, accepted: [] };
    }
    for (let index = 0; index < decoded.rejectedFrames; index += 1)
      this.drop('invalidFrame', now);
    if (this.closed) return { shouldKick: !wasClosed, accepted: [] };

    // The wire is newest first. Sort newly received frames for deterministic
    // application and retain only sequences beyond the previous high water mark.
    const newFrames = decoded.frames
      .filter((frame) => frame.seq > this.lastReceivedSeq)
      .sort((left, right) => left.seq - right.seq);
    const accepted: AcceptedInput[] = [];
    for (const frame of newFrames) {
      if (frame.seq <= this.lastReceivedSeq) continue;
      this.lastReceivedSeq = frame.seq;
      this.expire(this.acceptedAtMs, now, RATE_WINDOW_MS);
      if (this.acceptedAtMs.length >= BALANCE.net.maxInputsPerS) {
        this.drop('rateLimited', now);
        if (this.closed) break;
        continue;
      }
      this.acceptedAtMs.push(now);
      accepted.push({ frame, previousAim: this.lastAcceptedAim });
      this.lastAcceptedAim = frame.aim;
      this.frames.push(frame);
      if (this.frames.length > BALANCE.net.inputBufferMax) {
        this.frames.shift();
        this.drop('bufferOverflow', now);
        if (this.closed) break;
      }
    }
    return { shouldKick: !wasClosed && this.closed, accepted };
  }

  /** Known IDs without a T-022 handler are ignored by the room. */
  noteUnknownMessage(): boolean {
    if (this.closed) return false;
    this.drop('unknownMessage', this.nowMs());
    return this.closed;
  }

  consume(): AppliedInput {
    if (this.frames.length === 0) {
      return {
        frame: this.lastApplied,
        pressedButtons: 0,
        consumedSequences: [],
      };
    }
    const count = this.frames.length >= 4 ? 2 : 1;
    let held = this.lastHeldButtons;
    let pressedButtons = 0;
    const consumedSequences: number[] = [];
    let frame: ClientInputFrame | undefined;
    for (let index = 0; index < count; index += 1) {
      frame = this.frames.shift();
      if (frame === undefined) break;
      pressedButtons |= frame.buttons & ~held;
      held = frame.buttons;
      consumedSequences.push(frame.seq);
    }
    if (frame === undefined) throw new Error('input buffer underflow');
    this.lastApplied = frame;
    this.lastHeldButtons = held;
    this.lastInputSeq = frame.seq;
    return { frame, pressedButtons, consumedSequences };
  }

  /** Preserve sequence high-water marks while discarding inactive-seat input. */
  discardPending(): void {
    this.frames.length = 0;
    this.lastApplied = undefined;
    this.lastHeldButtons = 0;
  }

  /** Keep only the first waking frame after AFK proxy control. */
  retainWakingFrame(frame: ClientInputFrame): void {
    this.discardPending();
    this.frames.push(frame);
  }

  private drop(reason: DropReason, now: number): void {
    this.counters[reason] += 1;
    this.counters.total += 1;
    this.expire(this.violationsAtMs, now, VIOLATION_WINDOW_MS);
    this.violationsAtMs.push(now);
    if (this.violationsAtMs.length >= VIOLATION_LIMIT) this.closed = true;
  }

  private expire(history: number[], now: number, windowMs: number): void {
    while (history.length > 0 && (history[0] ?? Infinity) <= now - windowMs)
      history.shift();
  }
}
