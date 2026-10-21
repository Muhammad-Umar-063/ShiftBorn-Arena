import { BALANCE, GREYBOX_V1, PROTOCOL_VERSION, balanceHash } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import {
  decodeEventBatch, readAuthoritativeState, validateWelcome,
} from '../src/net/messageValidation.js';

const valid = {
  protocolVersion: PROTOCOL_VERSION, buildId: 'test', playerId: 'player',
  seat: 2, isHost: true, roomCode: 'ABC234', mapId: GREYBOX_V1.id,
  balanceVersion: BALANCE.version, balanceHash: balanceHash(), serverTick: 5,
  tickRate: BALANCE.tick.rateHz, patchRate: BALANCE.tick.patchRateHz,
  testerCode: 'player',
};

describe('T-031 Welcome and detached message validation', () => {
  it('accepts documented Welcome fields and distinguishes version mismatch from malformed input', () => {
    expect(validateWelcome(valid, balanceHash())).toEqual({ kind: 'valid', value: valid });
    expect(validateWelcome({ ...valid, protocolVersion: PROTOCOL_VERSION + 1 }, balanceHash()))
      .toEqual({ kind: 'mismatch' });
    expect(validateWelcome({ ...valid, balanceHash: 'other' }, balanceHash()))
      .toEqual({ kind: 'mismatch' });
    expect(validateWelcome({ ...valid, seat: -1 }, balanceHash()))
      .toEqual({ kind: 'invalid' });
    expect(validateWelcome({ ...valid, mapId: 'other' }, balanceHash()))
      .toEqual({ kind: 'invalid' });
  });

  it('copies state and event payloads before callers can mutate their SDK sources', () => {
    const source = { tick: 5, phase: 0, matchId: 'm', players: {
      player: { id: 'player', name: 'Tester', seat: 2, isBot: false,
        controller: 0, connected: true, alive: true, x: 1, y: 2, aim: 0,
        form: 0, hpFrac: 1, flux: 0, kos: 0, deaths: 0, assists: 0,
        points: 0, damageDealt: 0, lastInputSeq: 7 },
    } };
    const read = readAuthoritativeState({ toJSON: () => source });
    expect(read?.players.player?.x).toBe(1);
    source.players.player.x = 99;
    expect(read?.players.player?.x).toBe(1);
    const encoded = [5, [1, 2]];
    const batch = decodeEventBatch(encoded);
    (encoded[1] as number[])[1] = 99;
    expect(batch?.events).toEqual([[1, 2]]);
    expect(decodeEventBatch([5, ['bad']])).toBeNull();
  });
});
