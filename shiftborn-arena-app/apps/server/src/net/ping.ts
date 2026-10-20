import { performance } from 'node:perf_hooks';
import { BALANCE, DERIVED } from '@shiftborn/shared';

const RTT_WINDOW_SIZE = 10;

export type MonotonicClock = () => number;
export const monotonicServerTimeMs: MonotonicClock = () => performance.now();

/** NETWORK_PROTOCOL §5.1: timestamps are exact one-number tuples. */
export function decodeTimeTuple(value: unknown): number | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const time = value[0];
  return typeof time === 'number' && Number.isFinite(time) && time >= 0
    ? time
    : null;
}

export function medianRtt(samples: readonly number[]): number | undefined {
  if (samples.length === 0) return undefined;
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  const upper = sorted[middle];
  const lower = sorted[middle - 1];
  return upper === undefined || lower === undefined
    ? undefined
    : (lower + upper) / 2;
}

/** GR-7.9: convert server-measured round-trip time to immediate extra steps. */
export function rttToSpawnAdvanceTicks(rttMs: number | undefined): number {
  if (rttMs === undefined || !Number.isFinite(rttMs) || rttMs < 0) return 0;
  const tickDurationMs = 1000 / BALANCE.tick.rateHz;
  return Math.max(
    0,
    Math.min(
      Math.round(rttMs / 2 / tickDurationMs),
      DERIVED.weapons.spawnAdvanceMaxTicks,
    ),
  );
}

interface OutstandingProbe {
  readonly token: number;
  readonly sentAtMs: number;
}

interface HumanRtt {
  transport: object | null;
  outstanding: OutstandingProbe | null;
  readonly samples: number[];
}

/** Stable player IDs own samples; the current transport owns each challenge. */
export class ProbeTracker {
  private readonly humans = new Map<string, HumanRtt>();
  private lastToken = -1;
  private nextProbeTick: number;

  constructor(
    private readonly clock: MonotonicClock = monotonicServerTimeMs,
    initialTick = 0,
  ) {
    this.nextProbeTick = initialTick + DERIVED.net.pingIntervalTicks;
  }

  admit(id: string, transport: object): void {
    this.humans.set(id, { transport, outstanding: null, samples: [] });
  }

  detach(id: string, transport: object): void {
    const human = this.humans.get(id);
    if (human?.transport !== transport) return;
    human.transport = null;
    human.outstanding = null;
  }

  attach(id: string, transport: object): boolean {
    const human = this.humans.get(id);
    if (human === undefined) return false;
    human.transport = transport;
    human.outstanding = null;
    return true;
  }

  release(id: string): void {
    this.humans.delete(id);
  }

  clear(): void {
    this.humans.clear();
  }

  /** A skipped scheduler call yields one current probe, never a catch-up burst. */
  due(tick: number): boolean {
    if (tick < this.nextProbeTick) return false;
    const interval = DERIVED.net.pingIntervalTicks;
    this.nextProbeTick +=
      (Math.floor((tick - this.nextProbeTick) / interval) + 1) * interval;
    return true;
  }

  issue(id: string, transport: object): number | undefined {
    const human = this.humans.get(id);
    if (human?.transport !== transport) return undefined;
    const sentAtMs = this.clock();
    if (!Number.isFinite(sentAtMs) || sentAtMs < 0) return undefined;
    // Give simultaneous private probes distinct opaque numeric challenges.
    const token = Math.max(sentAtMs, this.lastToken + 0.000001);
    this.lastToken = token;
    human.outstanding = { token, sentAtMs };
    return token;
  }

  accept(id: string, transport: object, token: number): boolean {
    const human = this.humans.get(id);
    const outstanding = human?.outstanding;
    if (
      human?.transport !== transport ||
      outstanding === null ||
      outstanding === undefined ||
      outstanding.token !== token
    ) return false;
    const receivedAtMs = this.clock();
    const rttMs = receivedAtMs - outstanding.sentAtMs;
    if (!Number.isFinite(rttMs) || rttMs < 0) return false;
    human.outstanding = null;
    human.samples.push(rttMs);
    if (human.samples.length > RTT_WINDOW_SIZE) human.samples.shift();
    return true;
  }

  samplesFor(id: string): readonly number[] {
    return [...(this.humans.get(id)?.samples ?? [])];
  }

  medianFor(id: string): number | undefined {
    return medianRtt(this.humans.get(id)?.samples ?? []);
  }
}
