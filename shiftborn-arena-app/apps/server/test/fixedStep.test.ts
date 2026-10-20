import { describe, expect, it, vi } from 'vitest';
import {
  FIXED_STEP_MS,
  FIXED_STEP_SECONDS,
  FixedStepLoop,
  MAX_CATCH_UP_STEPS,
  type FixedStepClock,
} from '../src/rooms/fixedStep.js';

function fakeClock() {
  let time = 0;
  let callback: (() => void) | null = null;
  const clock: FixedStepClock = {
    now: () => time,
    setInterval: (run) => {
      callback = run;
      return 1 as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: () => {
      callback = null;
    },
  };
  return {
    clock,
    setTime: (value: number) => {
      time = value;
    },
    advance: (value: number) => {
      time += value;
      callback?.();
    },
    active: () => callback !== null,
  };
}

describe('T-021 fixed 30 Hz loop, ARCHITECTURE §5.3 and D-061', () => {
  it('runs 30 fixed steps per simulated second despite scheduler jitter', () => {
    const fake = fakeClock();
    const steps: number[] = [];
    const warning = { warn: vi.fn() };
    const loop = new FixedStepLoop((dt) => steps.push(dt), warning, fake.clock);
    loop.start();
    for (let tick = 1; tick <= 30; tick += 1) {
      fake.advance(FIXED_STEP_MS + (tick % 2 === 0 ? 2 : -2));
    }
    expect(steps).toHaveLength(30);
    expect(steps.every((dt) => dt === FIXED_STEP_SECONDS)).toBe(true);
    expect(loop.metrics.samples).toBe(30);
    expect(warning.warn).not.toHaveBeenCalled();
    loop.stop();
    expect(fake.active()).toBe(false);
  });

  it('runs exactly three steps after a hitch and drops remaining backlog once', () => {
    const fake = fakeClock();
    const warning = { warn: vi.fn() };
    let steps = 0;
    const loop = new FixedStepLoop(
      () => {
        steps += 1;
      },
      warning,
      fake.clock,
    );
    fake.setTime(8 * FIXED_STEP_MS);
    expect(loop.pump(fake.clock.now())).toBe(MAX_CATCH_UP_STEPS);
    expect(steps).toBe(3);
    expect(loop.metrics.samples).toBe(3);
    expect(warning.warn).toHaveBeenCalledTimes(1);
    expect(warning.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        executedSteps: 3,
        droppedMs: expect.closeTo(5 * FIXED_STEP_MS),
      }),
      'arena_tick_backlog_dropped',
    );
    expect(loop.pump(fake.clock.now())).toBe(0);
  });

  it('records actual step duration and warns when one step exceeds its budget', () => {
    const fake = fakeClock();
    const warning = { warn: vi.fn() };
    const loop = new FixedStepLoop(
      () => fake.setTime(fake.clock.now() + FIXED_STEP_MS + 1),
      warning,
      fake.clock,
    );
    fake.setTime(FIXED_STEP_MS);
    expect(loop.pump(fake.clock.now())).toBe(1);
    expect(loop.metrics).toMatchObject({
      samples: 1,
      meanMs: FIXED_STEP_MS + 1,
      lastMs: FIXED_STEP_MS + 1,
      maxMs: FIXED_STEP_MS + 1,
    });
    expect(warning.warn).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: FIXED_STEP_MS + 1 }),
      'arena_tick_overrun',
    );
  });
});
