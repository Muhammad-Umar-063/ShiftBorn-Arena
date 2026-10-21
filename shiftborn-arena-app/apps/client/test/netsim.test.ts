import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetSim, parseNetSim } from '../src/net/netsim.js';

afterEach(() => vi.useRealTimers());

describe('T-031 raw FIFO netsim', () => {
  it('parses only finite nonnegative values and keeps a direct no-parameter path', () => {
    expect(parseNetSim('?lag=NaN&jitter=-2&loss=Infinity'))
      .toEqual({ lagMs: 0, jitterMs: 0, lossPercent: 0 });
    expect(parseNetSim('?lag=100&jitter=20&loss=900'))
      .toEqual({ lagMs: 100, jitterMs: 20, lossPercent: 100 });
    const bytes: number[][] = [];
    const sim = new NetSim(parseNetSim(''), (frame) => bytes.push([...frame]), () => undefined);
    sim.outbound(new Uint8Array([1, 2]));
    expect(bytes).toEqual([[1, 2]]);
  });

  it.each([0, 100, 200])('adds half of %i ms per direction without corruption', (lagMs) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const sent: number[][] = [];
    const received: number[][] = [];
    const sim = new NetSim(
      { lagMs, jitterMs: 0, lossPercent: 0 },
      (frame) => sent.push([...frame]), (frame) => received.push([...frame]),
      () => Date.now(), undefined, () => 0.5,
    );
    const reused = new Uint8Array([1, 2, 3]);
    sim.outbound(reused);
    reused[0] = 9;
    if (lagMs > 0) {
      expect(sent).toEqual([]);
      vi.advanceTimersByTime(lagMs / 2);
    }
    expect(sent).toEqual([[1, 2, 3]]);
    sim.inbound(new Uint8Array([4, 5]));
    if (lagMs > 0) vi.advanceTimersByTime(lagMs / 2);
    expect(received).toEqual([[4, 5]]);
    sim.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('holds the FIFO head for 200 ms and never drops or reorders later frames', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const sent: number[] = [];
    const random = [0, 0, 0, 1, 0, 1];
    const sim = new NetSim(
      { lagMs: 150, jitterMs: 20, lossPercent: 2 },
      (frame) => sent.push(frame[0] ?? -1), () => undefined,
      () => Date.now(), undefined, () => random.shift() ?? 1,
    );
    sim.outbound(new Uint8Array([1])); // selected 2% hold
    sim.outbound(new Uint8Array([2]));
    vi.advanceTimersByTime(274);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([1, 2]);
    sim.outbound(new Uint8Array([3]));
    sim.dispose();
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([1, 2]);
  });

  it('forced 100% hold affects every frame and remains FIFO', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const sent: number[] = [];
    const sim = new NetSim(
      { lagMs: 0, jitterMs: 0, lossPercent: 100 },
      (frame) => sent.push(frame[0] ?? -1), () => undefined,
      () => Date.now(), undefined, () => 0.99,
    );
    sim.outbound(new Uint8Array([1]));
    sim.outbound(new Uint8Array([2]));
    vi.advanceTimersByTime(199);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([1, 2]);
  });
});
