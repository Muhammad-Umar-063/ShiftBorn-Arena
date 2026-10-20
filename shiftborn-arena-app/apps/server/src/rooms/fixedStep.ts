import { performance } from 'node:perf_hooks';
import { BALANCE, DERIVED } from '@shiftborn/shared';

// ARCHITECTURE §5.3 and D-061: Colyseus' helper catches up five steps.
export const MAX_CATCH_UP_STEPS = 3;
export const FIXED_STEP_MS = 1000 / BALANCE.tick.rateHz;
export const FIXED_STEP_SECONDS = DERIVED.tick.secondsPerTick;
const CLOCK_EPSILON_MS = FIXED_STEP_MS * Number.EPSILON * 8;

export interface TickMetrics {
  samples: number;
  totalMs: number;
  meanMs: number;
  lastMs: number;
  maxMs: number;
}

export interface FixedStepWarning {
  warn(fields: Record<string, number | string>, message: string): void;
}

export interface FixedStepClock {
  now(): number;
  setInterval(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setInterval>;
  clearInterval(handle: ReturnType<typeof setInterval>): void;
}

const systemClock: FixedStepClock = {
  now: () => performance.now(),
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (handle) => clearInterval(handle),
};

export class FixedStepLoop {
  readonly metrics: TickMetrics = {
    samples: 0,
    totalMs: 0,
    meanMs: 0,
    lastMs: 0,
    maxMs: 0,
  };
  private accumulatedMs = 0;
  private lastClockMs: number;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly step: (fixedDtSeconds: number) => void,
    private readonly log: FixedStepWarning,
    private readonly clock: FixedStepClock = systemClock,
  ) {
    this.lastClockMs = clock.now();
  }

  start(): void {
    if (this.interval !== null) return;
    this.lastClockMs = this.clock.now();
    this.interval = this.clock.setInterval(
      () => this.pump(this.clock.now()),
      FIXED_STEP_MS,
    );
  }

  stop(): void {
    if (this.interval === null) return;
    this.clock.clearInterval(this.interval);
    this.interval = null;
  }

  get isRunning(): boolean {
    return this.interval !== null;
  }

  /** A monotonic elapsed time schedules steps; the sim receives fixed dt only. */
  pump(nowMs: number): number {
    const elapsedMs = Math.max(0, nowMs - this.lastClockMs);
    this.lastClockMs = nowMs;
    this.accumulatedMs += elapsedMs;
    let executedSteps = 0;
    while (
      this.accumulatedMs + CLOCK_EPSILON_MS >= FIXED_STEP_MS &&
      executedSteps < MAX_CATCH_UP_STEPS
    ) {
      this.accumulatedMs = Math.max(0, this.accumulatedMs - FIXED_STEP_MS);
      const startedMs = this.clock.now();
      this.step(FIXED_STEP_SECONDS);
      const durationMs = Math.max(0, this.clock.now() - startedMs);
      this.metrics.samples += 1;
      this.metrics.totalMs += durationMs;
      this.metrics.meanMs = this.metrics.totalMs / this.metrics.samples;
      this.metrics.lastMs = durationMs;
      this.metrics.maxMs = Math.max(this.metrics.maxMs, durationMs);
      if (durationMs > FIXED_STEP_MS) {
        this.log.warn(
          {
            durationMs,
            budgetMs: FIXED_STEP_MS,
            samples: this.metrics.samples,
          },
          'arena_tick_overrun',
        );
      }
      executedSteps += 1;
    }
    if (this.accumulatedMs + CLOCK_EPSILON_MS >= FIXED_STEP_MS) {
      const droppedMs =
        Math.floor((this.accumulatedMs + CLOCK_EPSILON_MS) / FIXED_STEP_MS) *
        FIXED_STEP_MS;
      this.accumulatedMs = Math.max(0, this.accumulatedMs - droppedMs);
      this.log.warn(
        { executedSteps, droppedMs, backlogMs: this.accumulatedMs },
        'arena_tick_backlog_dropped',
      );
    }
    return executedSteps;
  }
}
