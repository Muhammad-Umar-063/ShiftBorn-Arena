import { BALANCE, DERIVED } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import {
  decodeTimeTuple,
  medianRtt,
  ProbeTracker,
  rttToSpawnAdvanceTicks,
} from '../src/net/ping.js';

describe('NETWORK_PROTOCOL §5.1 exact ping/probe tuples', () => {
  it('accepts zero, integer and fractional timestamps', () => {
    for (const time of [0, 12, 12.25]) expect(decodeTimeTuple([time])).toBe(time);
  });

  it('rejects malformed tuples without coercion', () => {
    for (const value of [
      null, {}, 1, '1', [], [1, 2], ['1'], [true], [{}], [-1],
      [NaN], [Infinity], [-Infinity],
    ]) expect(decodeTimeTuple(value)).toBeNull();
  });
});

describe('GR-7.9 measured RTT history and spawn advance', () => {
  it('calculates odd and even medians without sorting the source', () => {
    expect(medianRtt([])).toBeUndefined();
    expect(medianRtt([9])).toBe(9);
    const chronological = [9, 1, 5, 3];
    expect(medianRtt(chronological)).toBe(4);
    expect(chronological).toEqual([9, 1, 5, 3]);
    expect(medianRtt([9, 1, 5])).toBe(5);
  });

  it('rounds one-way latency using BALANCE and caps it using DERIVED', () => {
    expect([0, 100, 150, 200, 10000].map(rttToSpawnAdvanceTicks)).toEqual([
      0, 2, 2, DERIVED.weapons.spawnAdvanceMaxTicks,
      DERIVED.weapons.spawnAdvanceMaxTicks,
    ]);
    const oneTickRtt = (1000 / BALANCE.tick.rateHz) * 2;
    expect(rttToSpawnAdvanceTicks(oneTickRtt * 0.49)).toBe(0);
    expect(rttToSpawnAdvanceTicks(oneTickRtt * 0.5)).toBe(1);
    for (const value of [undefined, -1, NaN, Infinity])
      expect(rttToSpawnAdvanceTicks(value)).toBe(0);
  });

  it('owns one challenge per identity and rejects duplicates, stale and cross-player replies', () => {
    let now = 1000;
    const tracker = new ProbeTracker(() => now);
    const alice = {};
    const bob = {};
    tracker.admit('alice', alice);
    tracker.admit('bob', bob);
    expect(tracker.accept('alice', alice, 1000)).toBe(false);
    const old = tracker.issue('alice', alice);
    const bobToken = tracker.issue('bob', bob);
    const newer = tracker.issue('alice', alice);
    expect(old).toBeDefined();
    expect(bobToken).toBeDefined();
    expect(newer).toBeDefined();
    expect(newer).not.toBe(old);
    expect(bobToken).not.toBe(old);
    expect(tracker.accept('alice', alice, old ?? -1)).toBe(false);
    expect(tracker.accept('alice', alice, bobToken ?? -1)).toBe(false);
    now += 100;
    expect(tracker.accept('alice', alice, newer ?? -1)).toBe(true);
    expect(tracker.accept('alice', alice, newer ?? -1)).toBe(false);
    expect(tracker.medianFor('alice')).toBe(100);
    expect(tracker.medianFor('bob')).toBeUndefined();
  });

  it('keeps the newest ten accepted samples, detached from callers', () => {
    let now = 100;
    const tracker = new ProbeTracker(() => now);
    const transport = {};
    tracker.admit('alice', transport);
    for (let duration = 1; duration <= 12; duration += 1) {
      const token = tracker.issue('alice', transport);
      now += duration;
      expect(tracker.accept('alice', transport, token ?? -1)).toBe(true);
    }
    expect(tracker.samplesFor('alice')).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(tracker.medianFor('alice')).toBe(7.5);
    const copy = tracker.samplesFor('alice');
    if (Array.isArray(copy)) copy.splice(0);
    expect(tracker.samplesFor('alice')).toHaveLength(10);
  });

  it('retains samples on detach but clears old challenges and releases final identity', () => {
    let now = 200;
    const tracker = new ProbeTracker(() => now);
    const old = {};
    const replacement = {};
    tracker.admit('alice', old);
    const token = tracker.issue('alice', old);
    tracker.detach('alice', old);
    tracker.attach('alice', replacement);
    now += 100;
    expect(tracker.accept('alice', old, token ?? -1)).toBe(false);
    expect(tracker.accept('alice', replacement, token ?? -1)).toBe(false);
    const newToken = tracker.issue('alice', replacement);
    now += 150;
    expect(tracker.accept('alice', replacement, newToken ?? -1)).toBe(true);
    expect(tracker.medianFor('alice')).toBe(150);
    tracker.release('alice');
    tracker.admit('alice', old);
    expect(tracker.medianFor('alice')).toBeUndefined();
    tracker.clear();
    expect(tracker.issue('alice', old)).toBeUndefined();
  });

  it('schedules one probe on each due tick and skips missed boundaries', () => {
    const tracker = new ProbeTracker(() => 1);
    const interval = DERIVED.net.pingIntervalTicks;
    expect(tracker.due(0)).toBe(false);
    expect(tracker.due(interval - 1)).toBe(false);
    expect(tracker.due(interval)).toBe(true);
    expect(tracker.due(interval)).toBe(false);
    expect(tracker.due(interval * 4 + 1)).toBe(true);
    expect(tracker.due(interval * 4 + 1)).toBe(false);
    expect(tracker.due(interval * 5)).toBe(true);
  });
});

describe('AT-NET-19 server half deterministic latency profiles', () => {
  it('keeps test-only pong anchors within two ticks under 150 ms ±20 ms jitter', () => {
    const tickMs = 1000 / BALANCE.tick.rateHz;
    for (const baseRtt of [0, 100, 200, 150]) {
      for (let sample = 0; sample < 20; sample += 1) {
        const outbound = baseRtt / 2 + (baseRtt === 150 ? (sample % 3 - 1) * 20 : 0);
        const inbound = baseRtt / 2 + (baseRtt === 150 ? ((sample + 1) % 3 - 1) * 20 : 0);
        const sentAt = sample * DERIVED.net.pingIntervalTicks * tickMs;
        const serverTick = Math.floor((sentAt + outbound) / tickMs);
        const receivedAt = sentAt + outbound + inbound;
        // NETWORK_PROTOCOL §10 client estimator, modeled only in this test.
        const estimated = serverTick + (receivedAt - sentAt) / 2 / tickMs;
        const actual = receivedAt / tickMs;
        expect(Math.abs(estimated - actual)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('bounds server samples and preserves the median with deterministic 2% head-of-line delay', () => {
    let now = 0;
    const tracker = new ProbeTracker(() => now);
    const transport = {};
    tracker.admit('human', transport);
    for (let sample = 0; sample < 100; sample += 1) {
      now += DERIVED.net.pingIntervalTicks * (1000 / BALANCE.tick.rateHz);
      const token = tracker.issue('human', transport);
      expect(token).toBeDefined();
      now += sample % 50 === 0 ? 350 : 150;
      expect(tracker.accept('human', transport, token ?? -1)).toBe(true);
      expect(tracker.samplesFor('human').length).toBeLessThanOrEqual(10);
    }
    expect(tracker.medianFor('human')).toBe(150);
  });
});
