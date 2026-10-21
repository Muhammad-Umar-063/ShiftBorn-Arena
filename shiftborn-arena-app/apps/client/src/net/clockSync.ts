import { BALANCE } from '@shiftborn/shared';

export type MonotonicClock = () => number;

const RTT_WINDOW = 10;
const MAX_CORRECTION_MS = 5;
const TICK_MS = 1000 / BALANCE.tick.rateHz;

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validTick(value: unknown): value is number {
  return validTime(value) && Number.isInteger(value) && value <= 0xffffffff;
}

export function median(samples: readonly number[]): number | undefined {
  if (samples.length === 0) return undefined;
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return undefined;
  return sorted.length % 2 === 1 ? upper : (upper + (sorted[middle - 1] ?? upper)) / 2;
}

/** NETWORK_PROTOCOL §10: only browser-monotonic timestamps are subtracted. */
export class ClockSync {
  private pending: number | null = null;
  private readonly samples: number[] = [];
  private anchorTick: number | null = null;
  private anchorAtMs = 0;
  private displayTick = 0;
  private displayAtMs = 0;
  private lastFrame: number | null = null;

  constructor(private readonly now: MonotonicClock = () => performance.now()) {}

  reset(): void {
    this.pending = null;
    this.samples.length = 0;
    this.anchorTick = null;
    this.anchorAtMs = 0;
    this.displayTick = 0;
    this.displayAtMs = 0;
    this.lastFrame = null;
  }

  issuePing(): readonly [number] | null {
    const at = this.now();
    if (!validTime(at)) return null;
    this.pending = at;
    return [at];
  }

  acceptPong(payload: unknown): boolean {
    if (!Array.isArray(payload) || payload.length !== 3) return false;
    const [echo, serverTick, serverTimeMs] = payload as readonly unknown[];
    if (!validTime(echo) || !validTick(serverTick) || !validTime(serverTimeMs) ||
      this.pending === null || echo !== this.pending) return false;
    const receivedAt = this.now();
    const rtt = receivedAt - echo;
    if (!Number.isFinite(rtt) || rtt < 0) return false;
    this.pending = null;
    this.samples.push(rtt);
    if (this.samples.length > RTT_WINDOW) this.samples.shift();
    this.anchorTick = serverTick;
    this.anchorAtMs = receivedAt;
    if (this.samples.length === 1) {
      this.displayTick = serverTick + rtt / 2 / TICK_MS;
      this.displayAtMs = receivedAt;
    }
    return true;
  }

  rttSamples(): readonly number[] { return [...this.samples]; }
  medianRttMs(): number | undefined { return median(this.samples); }

  /** Apply at most one bounded anchor correction for a unique rendered frame. */
  advanceFrame(frame: number): number | null {
    if (this.anchorTick === null) return null;
    if (this.lastFrame === frame) return this.estimatedTick();
    this.lastFrame = frame;
    const at = this.now();
    if (!validTime(at)) return this.displayTick;
    const ordinary = this.displayTick + Math.max(0, at - this.displayAtMs) / TICK_MS;
    const desired = this.anchorTick +
      ((this.medianRttMs() ?? 0) / 2 + Math.max(0, at - this.anchorAtMs)) / TICK_MS;
    const correctionMs = Math.max(-MAX_CORRECTION_MS,
      Math.min(MAX_CORRECTION_MS, (desired - ordinary) * TICK_MS));
    this.displayTick = ordinary + correctionMs / TICK_MS;
    this.displayAtMs = at;
    return this.displayTick;
  }

  /** Repeated reads advance ordinary time, but never apply another correction. */
  estimatedTick(): number | null {
    if (this.anchorTick === null) return null;
    return this.displayTick + Math.max(0, this.now() - this.displayAtMs) / TICK_MS;
  }
}
