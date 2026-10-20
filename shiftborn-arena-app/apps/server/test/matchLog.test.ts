import {
  BALANCE, Cause, Form, GREYBOX_V1, Mode, Phase,
} from '@shiftborn/shared';
import { createWorld, type SimEvent } from '@shiftborn/sim';
import { describe, expect, it } from 'vitest';
import {
  capturePreStepTelemetry, decodeClientStats, matchEndRecord,
  matchStartRecord, projectMatchEvents,
} from '../src/logging/matchLog.js';

function world() {
  const result = createWorld({
    map: GREYBOX_V1, roomSeed: 17, mode: Mode.Frenzy,
    initialPlayers: [
      { id: 'human', name: 'Human', seat: 0, isBot: false },
      { id: 'bot', name: 'Bot', seat: 1, isBot: true },
    ],
  });
  result.phase = Phase.Playing;
  return result;
}

describe('AT-TEL-01 Stage A pure event projection', () => {
  it('records authoritative start fields and explicit absent bot input scheme', () => {
    const state = world();
    const record = matchStartRecord(state, {
      roomId: 'room', roomCode: '', buildId: 'build', botDifficulty: 1,
      inputSchemes: new Map([['human', 'mouse']]),
    });
    expect(record.roomSeed).toBe(17);
    expect(record.matchIndex).toBe(0);
    expect(record.balanceVersion).toBe(BALANCE.version);
    expect((record.seats as unknown[]).slice(0, 2)).toMatchObject([
      { id: 'human', inputScheme: 'mouse' },
      { id: 'bot', inputScheme: null },
    ]);
  });

  it('projects one morphStart, applied damage and authoritative death without future fields', () => {
    const state = world();
    const human = state.players[0];
    const bot = state.players[1];
    if (human === null || human === undefined || bot === null || bot === undefined)
      throw new Error('missing players');
    human.flux = 60;
    human.hpFrac = 0.75;
    bot.pos = { x: 2, y: 3 };
    const before = capturePreStepTelemetry(state);
    human.flux = 25;
    const events: SimEvent[] = [
      { type: 'morphStart', seat: 0, from: Form.Runner,
        to: Form.Beast, endTick: 20 },
      { type: 'morphEnd', seat: 0, form: Form.Beast },
      { type: 'blocked', id: 1, targetSeat: 1 },
      { type: 'damage', attackerId: 'human', attackerSeat: 0,
        attackerForm: Form.Runner, victimId: 'bot', victimSeat: 1,
        victimForm: Form.Runner, cause: Cause.PulsePistol,
        finalDamage: 12, tags: 1, incomingDir: { x: 1, y: 0 } },
      { type: 'death', victimId: 'bot', victimSeat: 1,
        victimForm: Form.Runner, killerId: 'human', killerSeat: 0,
        killerName: 'Human', killerForm: Form.Runner,
        cause: Cause.PulsePistol, finalDamage: 12,
        counterForm: Form.Beast, assisters: [{ id: 'helper', seat: 2 }] },
    ];
    const records = projectMatchEvents(10, events, state, before);
    expect(records.map((record) => record.type)).toEqual(['morph', 'damage', 'death']);
    expect(records[0]).toMatchObject({
      t: 10, fluxBefore: 60, hpFrac: 0.75, phase: Phase.Playing,
    });
    expect(records[1]).toMatchObject({ amount: 12, tags: 1 });
    expect(records[1]).not.toHaveProperty('distance');
    expect(records[1]).not.toHaveProperty('aimSource');
    expect(records[2]).toMatchObject({
      assisters: ['helper'], position: { x: 2, y: 3 },
    });
  });

  it('copies current stats and leaves ranking to T-044', () => {
    const state = world();
    state.phase = Phase.Results;
    const record = matchEndRecord(state, 100);
    expect(record.durationTicks).toBe(BALANCE.match.durationS * BALANCE.tick.rateHz);
    expect(record.humans).toBe(1);
    expect(record.bots).toBe(1);
    expect(record).not.toHaveProperty('ranking');
    const stats = (record.playerStats as { stats: { kos: number } }[])[0]?.stats;
    const player = state.players[0];
    if (player === null || player === undefined) throw new Error('missing player');
    player.stats.kos = 9;
    expect(stats?.kos).toBe(0);
  });
});

describe('AT-TEL-01 informational client stats decoding', () => {
  const valid = {
    fpsMedian: 60, fpsP5: 40, rttMs: 150.5, corrections: 2,
    inputScheme: 'mouse', windowW: 1280, windowH: 720,
    browser: 'Chromium', hiddenMs: 0, errors: 0,
  };

  it('accepts exact numeric metrics and copies only documented fields', () => {
    expect(decodeClientStats({ ...valid, playerId: 'forged' })).toEqual(valid);
  });

  it('rejects arrays, coerced, negative, unsafe and invalid scheme values', () => {
    for (const payload of [
      null, [], 'stats',
      { ...valid, fpsMedian: '60' },
      { ...valid, fpsP5: NaN },
      { ...valid, rttMs: Infinity },
      { ...valid, corrections: -1 },
      { ...valid, windowW: 1.5 },
      { ...valid, windowH: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, hiddenMs: -1 },
      { ...valid, errors: {} },
      { ...valid, inputScheme: 'pad' },
      { ...valid, browser: 7 },
    ]) expect(decodeClientStats(payload)).toBeNull();
  });
});
