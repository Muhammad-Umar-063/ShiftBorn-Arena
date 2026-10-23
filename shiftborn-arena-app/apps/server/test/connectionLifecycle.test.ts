import { BALANCE, DERIVED, Phase } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { InputQueue } from '../src/net/inputQueue.js';
import {
  afkAction,
  decodeVisibility,
  isMeaningfulInput,
  rebaseAfk,
  shortestAimChangeRad,
  shutdownResultsWaitMs,
  SHUTDOWN_RESULTS_MAX_MS,
  type HumanSession,
} from '../src/rooms/connectionLifecycle.js';

function session(): HumanSession {
  return {
    id: 'human',
    seat: 0,
    queue: new InputQueue(),
    client: null,
    connected: true,
    hidden: false,
    proxyReason: null,
    lastMeaningfulInputTick: 0,
    afkWarned: false,
  };
}

describe('AT-NET-12 exact visibility decoding', () => {
  it('accepts only [0] and [1]', () => {
    expect(decodeVisibility([0])).toBe(false);
    expect(decodeVisibility([1])).toBe(true);
    for (const value of [0, 1, [false], ['1'], [], [1, 0], [2], [NaN], {}])
      expect(decodeVisibility(value)).toBeNull();
  });
});

describe('AT-NET-13 meaningful input and AFK thresholds', () => {
  const quiet = { moveX: 0, moveY: 0, buttons: 0, aim: 0 };

  it('uses a strict 2-degree shortest arc and accepts movement or buttons', () => {
    const threshold = DERIVED.net.afkAimThresholdRad;
    expect(shortestAimChangeRad(0, threshold)).toBe(threshold);
    expect(
      shortestAimChangeRad(2 * Math.PI - threshold / 2, threshold / 2),
    ).toBeCloseTo(threshold);
    expect(isMeaningfulInput(quiet, 0)).toBe(false);
    expect(isMeaningfulInput({ ...quiet, moveX: 1 }, 0)).toBe(true);
    expect(isMeaningfulInput({ ...quiet, moveY: -1 }, 0)).toBe(true);
    expect(isMeaningfulInput({ ...quiet, buttons: 1 }, 0)).toBe(true);
    expect(isMeaningfulInput({ ...quiet, aim: 364 }, 0)).toBe(false);
    expect(isMeaningfulInput({ ...quiet, aim: 365 }, 0)).toBe(true);
    expect(isMeaningfulInput({ ...quiet, aim: 0 }, 65535)).toBe(false);
    expect(isMeaningfulInput({ ...quiet, aim: 365 }, 65535)).toBe(true);
  });

  it('reports only newly accepted frames, not duplicates, stale or rate-limited input', () => {
    let now = 0;
    const queue = new InputQueue(() => now);
    expect(
      queue
        .receiveDetailed([1, 1, 0, 0, 0, 0, 120, ...Array(8).fill(0)])
        .accepted.map((item) => item.frame.seq),
    ).toEqual([1]);
    expect(queue.receiveDetailed([1, 1, 0, 0, 0, 0, 120, ...Array(8).fill(0)]).accepted).toEqual([]);
    expect(queue.receiveDetailed([0, 1, 0, 0, 0, 0, 120, ...Array(8).fill(0)]).accepted).toEqual([]);
    expect(queue.receiveDetailed(['bad']).accepted).toEqual([]);
    for (let seq = 2; seq <= BALANCE.net.maxInputsPerS; seq += 1)
      queue.receiveDetailed([seq, 0, 0, 0, 0, 0, 120, ...Array(8).fill(0)]);
    expect(
      queue.receiveDetailed([BALANCE.net.maxInputsPerS + 1, 1, 0, 0, 0, 0,
        120, ...Array(8).fill(0)])
        .accepted,
    ).toEqual([]);
    now = 2000;
    expect(
      queue.receiveDetailed([BALANCE.net.maxInputsPerS + 2, 1, 0, 0, 0, 0,
        120, ...Array(8).fill(0)])
        .accepted,
    ).toHaveLength(1);
  });

  it('warns and proxies at exact ticks, rebases, and pauses while hidden or dropped', () => {
    const record = session();
    expect(afkAction(record, DERIVED.net.afkWarnTicks - 1)).toBeNull();
    expect(afkAction(record, DERIVED.net.afkWarnTicks)).toBe('warn');
    record.afkWarned = true;
    expect(afkAction(record, DERIVED.net.afkWarnTicks + 1)).toBeNull();
    expect(afkAction(record, DERIVED.net.afkBotTicks - 1)).toBeNull();
    expect(afkAction(record, DERIVED.net.afkBotTicks)).toBe('proxy');
    record.hidden = true;
    expect(afkAction(record, DERIVED.net.afkBotTicks)).toBeNull();
    record.hidden = false;
    record.connected = false;
    expect(afkAction(record, DERIVED.net.afkBotTicks)).toBeNull();
    record.connected = true;
    rebaseAfk(record, DERIVED.net.afkWarnTicks);
    expect(record.afkWarned).toBe(false);
    expect(afkAction(record, 2 * DERIVED.net.afkWarnTicks)).toBe('warn');
  });
});

describe('T-026 shutdown wait', () => {
  it('waits only the current RESULTS remainder, capped at ten seconds', () => {
    expect(shutdownResultsWaitMs(Phase.Playing, 1000, 0)).toBe(0);
    expect(shutdownResultsWaitMs(Phase.Results, 30, 0)).toBe(1000);
    expect(shutdownResultsWaitMs(Phase.Results, 0, 0)).toBe(0);
    expect(shutdownResultsWaitMs(Phase.Results, 999999, 0)).toBe(
      SHUTDOWN_RESULTS_MAX_MS,
    );
  });
});
