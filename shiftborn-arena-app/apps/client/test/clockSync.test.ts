import { BALANCE } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { ClockSync, median } from '../src/net/clockSync.js';

describe('T-031 production clock', () => {
  it('matches one issued ping, rejects stale and malformed replies, and ignores server clock origin', () => {
    let now = 1000;
    const clock = new ClockSync(() => now);
    expect(clock.acceptPong([1000, 50, 999_999])).toBe(false);
    expect(clock.issuePing()).toEqual([1000]);
    now = 1100;
    expect(clock.acceptPong([999, 50, 999_999])).toBe(false);
    expect(clock.acceptPong([1000, 50, 999_999])).toBe(true);
    expect(clock.acceptPong([1000, 50, 999_999])).toBe(false);
    expect(clock.medianRttMs()).toBe(100);
    expect(clock.estimatedTick()).toBeCloseTo(51.5);
    now = 1200;
    expect(clock.estimatedTick()).toBeCloseTo(54.5);
    clock.reset();
    expect(clock.estimatedTick()).toBeNull();
    expect(clock.rttSamples()).toEqual([]);
  });

  it('keeps the newest ten samples and applies only 5 ms correction per frame', () => {
    let now = 1000;
    const clock = new ClockSync(() => now);
    for (let index = 1; index <= 11; index += 1) {
      const sent = now;
      clock.issuePing();
      now += index * 10;
      expect(clock.acceptPong([sent, 100 + index, 0])).toBe(true);
    }
    expect(clock.rttSamples()).toEqual([20, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
    expect(median(clock.rttSamples())).toBe(65);
    const before = clock.estimatedTick();
    const after = clock.advanceFrame(1);
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs(((after ?? 0) - (before ?? 0)) * 1000 / BALANCE.tick.rateHz))
      .toBeLessThanOrEqual(5.001);
    expect(clock.advanceFrame(1)).toBe(after);
    now += 100;
    expect(clock.estimatedTick()).toBeCloseTo((after ?? 0) + 3);
  });
});
