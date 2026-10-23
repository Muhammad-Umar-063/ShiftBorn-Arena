import {
  AimSource,
  BALANCE,
  ClientAimSourceCode,
  InputButton,
} from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import { InputQueue } from '../src/net/inputQueue.js';

function frame(seq: number, buttons = 0, moveX = 0, aim = 0): number[] {
  return [seq, moveX, 0, aim, buttons, ClientAimSourceCode.Mouse,
    120, ...Array(8).fill(0)];
}

function pad(values: readonly unknown[]): unknown[] {
  return [...values, 120, ...Array(8).fill(0)];
}

function packet(...frames: readonly number[][]): number[] {
  return frames.flat();
}

describe('T-022 input queue', () => {
  it('AT-NET-02 recovers every second lost packet once in ascending order', () => {
    let now = 0;
    const queue = new InputQueue(() => now);
    const applied: number[] = [];
    for (let seq = 1; seq <= 13; seq += 1) {
      if (seq % 2 === 0) continue;
      const redundant = [seq, seq - 1, seq - 2]
        .filter((value) => value > 0)
        .map((value) => frame(value));
      queue.receive(packet(...redundant));
      applied.push(...queue.consume().consumedSequences);
      now += 1000 / BALANCE.tick.rateHz;
    }
    while (queue.frames.length > 0)
      applied.push(...queue.consume().consumedSequences);
    expect(applied).toEqual(Array.from({ length: 13 }, (_, index) => index + 1));
    expect(queue.counters.total).toBe(0);
    expect(queue.lastReceivedSeq).toBe(13);
    expect(queue.lastInputSeq).toBe(13);
  });

  it('AT-NET-03 consumes a six-frame burst 2,2,1,1 with unioned edges', () => {
    const queue = new InputQueue(() => 0);
    queue.receive(
      packet(frame(3, InputButton.MorphBeast), frame(2), frame(1, InputButton.Ability)),
    );
    queue.receive(packet(frame(6), frame(5, InputButton.Fire), frame(4)));
    const first = queue.consume();
    const second = queue.consume();
    const third = queue.consume();
    const fourth = queue.consume();
    expect([
      first.consumedSequences.length,
      second.consumedSequences.length,
      third.consumedSequences.length,
      fourth.consumedSequences.length,
    ]).toEqual([2, 2, 1, 1]);
    expect(first.consumedSequences).toEqual([1, 2]);
    expect(first.pressedButtons).toBe(InputButton.Ability);
    expect(first.frame?.buttons).toBe(0);
    expect(second.consumedSequences).toEqual([3, 4]);
    expect(second.pressedButtons).toBe(InputButton.MorphBeast);
    expect(third.pressedButtons).toBe(InputButton.Fire);
    expect(fourth.pressedButtons).toBe(0);
    expect(queue.lastInputSeq).toBe(6);
    expect(queue.consume()).toEqual({
      frame: fourth.frame,
      pressedButtons: 0,
      consumedSequences: [],
    });
  });

  it('AT-NET-03 uses the newer held state, movement, aim, and source', () => {
    const queue = new InputQueue(() => 0);
    queue.receive(packet(frame(3, InputButton.Fire), frame(2), frame(1)));
    queue.receive(
      packet(
        frame(6),
        frame(5),
        pad([4, 77, -25, 2222, 0, ClientAimSourceCode.Pad]) as number[],
      ),
    );
    queue.consume();
    const result = queue.consume();
    expect(result.frame).toMatchObject({ aimDist: 120,
      seq: 4,
      moveX: 77,
      moveY: -25,
      aim: 2222,
      buttons: 0,
      aimSource: AimSource.Pad,
    });
    expect(result.pressedButtons).toBe(InputButton.Fire);
    expect(queue.lastHeldButtons).toBe(0);
  });

  it('D-072 selects ordered intent tags once and ignores stale tags after fallback', () => {
    const queue = new InputQueue(() => 0);
    const tagged = (seq: number, intents: readonly number[]) =>
      [seq, 0, 0, 0, InputButton.Fire, ClientAimSourceCode.Mouse, 120,
        ...Array.from({ length: 8 }, (_, index) => intents[index] ?? 0)];
    queue.receive(packet(tagged(3, [1, 3]), tagged(2, [1]), tagged(1, [])));
    queue.receive(packet(tagged(4, [1, 3]), tagged(3, [1, 3]),
      tagged(2, [1])));
    // A four-frame burst consumes 1 and 2 while applying 2.
    const first = queue.consume().frame!;
    expect(first.seq).toBe(2);
    expect(queue.candidateShotIntent(first)).toBe(1);
    queue.resolveShotIntent(first.seq, 1);
    expect(queue.candidateShotIntent(first)).toBeNull();
    const second = queue.consume().frame!;
    expect(second.seq).toBe(3);
    expect(queue.candidateShotIntent(second)).toBe(3);
    queue.resolveShotIntent(second.seq, 3);
    expect(queue.candidateShotIntent(queue.consume().frame!)).toBeNull();

    queue.receive(tagged(5, []));
    const fallback = queue.consume().frame!;
    expect(queue.candidateShotIntent(fallback)).toBeNull();
    queue.resolveShotIntent(fallback.seq, null);
    queue.receive(tagged(6, [1, 3]));
    expect(queue.candidateShotIntent(queue.consume().frame!)).toBeNull();
  });

  it('AT-NET-04 accepts 40 of 60 unique frames per second and cannot revive drops', () => {
    let now = 0;
    const queue = new InputQueue(() => now);
    const accepted: number[] = [];
    for (let seq = 1; seq <= 60; seq += 1) {
      now = seq * 10;
      queue.receive(frame(seq));
      accepted.push(...queue.consume().consumedSequences);
    }
    expect(accepted).toEqual(Array.from({ length: 40 }, (_, index) => index + 1));
    expect(queue.counters.rateLimited).toBe(20);
    expect(queue.counters.total).toBe(20);
    expect(queue.lastReceivedSeq).toBe(60);
    expect(queue.lastInputSeq).toBe(40);
    queue.receive(packet(frame(60), frame(59), frame(58)));
    expect(queue.counters.total).toBe(20);
    expect(queue.frames).toEqual([]);
    now = 1100;
    queue.receive(frame(61));
    expect(queue.consume().consumedSequences).toEqual([61]);
  });

  it('AT-SEC-01 rejects malformed, invalid, Bot, and out-of-order fields without mutation', () => {
    const queue = new InputQueue(() => 0);
    const malformed: unknown[] = [null, {}, [], [1, 2], Array(24).fill(0)];
    for (const value of malformed) expect(() => queue.receive(value)).not.toThrow();
    expect(queue.counters.malformedPacket).toBe(malformed.length);
    const invalid = [
      [1.5, 0, 0, 0, 0, 0],
      [1, 128, 0, 0, 0, 0],
      [1, 0, 0, 65536, 0, 0],
      [1, 0, 0, 0, 1 << 12, 0],
      [1, 0, 0, 0, 0, 5],
      [1, 0, 0, 0, 0, 99],
      ['1', 0, 0, 0, 0, 0],
    ];
    for (const value of invalid) expect(() => queue.receive(pad(value))).not.toThrow();
    expect(queue.counters.invalidFrame).toBe(invalid.length);
    const original = packet(frame(2), pad([1, 0, 0, 0, 1 << 12, 0]) as number[]);
    const copy = [...original];
    queue.receive(original);
    expect(original).toEqual(copy);
    expect(queue.counters.invalidFrame).toBe(invalid.length + 1);
    expect(queue.consume().consumedSequences).toEqual([2]);
    queue.receive(packet(frame(3), frame(4)));
    expect(queue.counters.invalidFrame).toBe(invalid.length + 2);
    queue.receive(frame(1004));
    expect(queue.counters.invalidFrame).toBe(invalid.length + 3);
    expect(queue.lastReceivedSeq).toBe(3);
    expect(queue.counters.total).toBe(malformed.length + invalid.length + 3);
  });

  it('AT-SEC-01 closes once at 50 violations in ten seconds and expires old ones', () => {
    let now = 0;
    const queue = new InputQueue(() => now);
    for (let index = 0; index < 49; index += 1)
      expect(queue.noteUnknownMessage()).toBe(false);
    expect(queue.violationWindowCount).toBe(49);
    expect(queue.isClosed).toBe(false);
    now = 10_000;
    expect(queue.violationWindowCount).toBe(0);
    for (let index = 0; index < 49; index += 1)
      expect(queue.noteUnknownMessage()).toBe(false);
    expect(queue.noteUnknownMessage()).toBe(true);
    expect(queue.noteUnknownMessage()).toBe(false);
    expect(queue.counters.unknownMessage).toBe(99);
    expect(queue.violationWindowCount).toBe(50);
  });

  it('AT-SEC-01 caps the buffer at eight, drops oldest, and isolates players', () => {
    const first = new InputQueue(() => 0);
    const second = new InputQueue(() => 0);
    for (let seq = 1; seq <= BALANCE.net.inputBufferMax + 2; seq += 1)
      first.receive(frame(seq));
    expect(first.frames.map(({ seq }) => seq)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(first.counters.bufferOverflow).toBe(2);
    first.receive(frame(1));
    expect(first.frames.map(({ seq }) => seq)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(second.frames).toEqual([]);
    expect(second.counters.total).toBe(0);
    expect(first.violationWindowCount).toBe(2);
  });

  it('accepts reserved client bits and Touch/Pad sources without drops', () => {
    const queue = new InputQueue(() => 0);
    queue.receive(pad([1, 0, 0, 0, InputButton.Crate | InputButton.Ultimate | InputButton.Interact, ClientAimSourceCode.Touch]));
    queue.receive(pad([2, 0, 0, 0, 0, ClientAimSourceCode.Pad]));
    expect(queue.consume().frame?.aimSource).toBe(AimSource.Touch);
    expect(queue.consume().frame?.aimSource).toBe(AimSource.Pad);
    expect(queue.counters.total).toBe(0);
  });

  it('uses a neutral source before the first frame and retains applied state on repeat', () => {
    const queue = new InputQueue(() => 0);
    expect(queue.consume()).toEqual({
      frame: undefined,
      pressedButtons: 0,
      consumedSequences: [],
    });
    expect(queue.lastInputSeq).toBe(-1);
    queue.receive(frame(1, InputButton.Fire));
    const first = queue.consume();
    expect(first.pressedButtons).toBe(InputButton.Fire);
    expect(queue.consume()).toEqual({
      frame: first.frame,
      pressedButtons: 0,
      consumedSequences: [],
    });
    expect(queue.lastInputSeq).toBe(1);
  });

  it.each([
    { rttMs: 0, headOfLine: false },
    { rttMs: 100, headOfLine: false },
    { rttMs: 200, headOfLine: false },
    { rttMs: 150, headOfLine: true },
  ])('AT-NET-02 deterministic $rttMs ms RTT, HOL=$headOfLine matrix', ({ rttMs, headOfLine }) => {
    const tickMs = 1000 / BALANCE.tick.rateHz;
    let now = 0;
    const queue = new InputQueue(() => now);
    const deliveries: { at: number; payload: number[] }[] = [];
    let randomState = 0x5eed;
    let heldUntil = 0;
    let selectedDelays = 0;
    for (let seq = 1; seq <= 120; seq += 1) {
      const baseArrival = seq * tickMs + rttMs / 2;
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
      if (headOfLine && randomState / 2 ** 32 < 0.02) {
        selectedDelays += 1;
        heldUntil = Math.max(heldUntil, baseArrival + 200);
      }
      deliveries.push({
        at: Math.max(baseArrival, heldUntil),
        payload: packet(
          ...[seq, seq - 1, seq - 2]
            .filter((value) => value > 0)
            .map((value) => frame(value)),
        ),
      });
    }
    const applied: number[] = [];
    let nextDelivery = 0;
    for (let tick = 0; tick < 150; tick += 1) {
      now = tick * tickMs;
      while ((deliveries[nextDelivery]?.at ?? Infinity) <= now) {
        const delivery = deliveries[nextDelivery];
        if (delivery === undefined) break;
        queue.receive(delivery.payload);
        nextDelivery += 1;
      }
      applied.push(...queue.consume().consumedSequences);
    }
    expect(nextDelivery).toBe(deliveries.length);
    expect(applied).toEqual(Array.from({ length: 120 }, (_, index) => index + 1));
    expect(queue.counters.total).toBe(0);
    if (headOfLine) expect(selectedDelays).toBeGreaterThan(0);
  });
});
