import { describe, expect, it } from 'vitest';
import {
  BotDifficultyCode,
  isBotDifficultyCode,
  isValidRoomCode,
} from '../src/index.js';

describe('AT-NET-14 room code and D-063 difficulty wire values', () => {
  it('accepts only quick play or six exact alphabet characters', () => {
    expect(isValidRoomCode('')).toBe(true);
    expect(isValidRoomCode('ABC234')).toBe(true);
    expect(isValidRoomCode('ZZZZZZ')).toBe(true);
    for (const value of [
      undefined,
      null,
      123,
      {},
      'abc234',
      'ABC 34',
      ' ABC234',
      'ABC234 ',
      'ABC23',
      'ABC2345',
      'ABC0IO',
      'LLLLLL',
      '111111',
    ])
      expect(isValidRoomCode(value)).toBe(false);
  });

  it('accepts only approved difficulty codes', () => {
    expect(Object.values(BotDifficultyCode)).toEqual([0, 1, 2]);
    for (const value of [0, 1, 2])
      expect(isBotDifficultyCode(value)).toBe(true);
    for (const value of [-1, 3, '0', null, true])
      expect(isBotDifficultyCode(value)).toBe(false);
  });
});
