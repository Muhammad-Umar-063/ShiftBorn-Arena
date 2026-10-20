import { describe, expect, it, vi } from 'vitest';
import { isValidRoomCode } from '@shiftborn/shared';
import {
  ROOM_CODE_ALPHABET, generateRoomCode, normalizeRoomCode,
  parseRoomQuery, validJoinRoomCode,
} from '../src/rooms/roomCode.js';

describe('room code handling', () => {
  it('uppercases input but validates the exact six-character alphabet', () => {
    expect(normalizeRoomCode('abc234more')).toBe('ABC234');
    expect(validJoinRoomCode('abc234')).toBe('ABC234');
    expect(validJoinRoomCode('ABC23')).toBeNull();
    expect(validJoinRoomCode('ABC2345')).toBeNull();
    expect(validJoinRoomCode('ABCI10')).toBeNull();
    expect(validJoinRoomCode('ABC 34')).toBeNull();
    expect(validJoinRoomCode('')).toBeNull();
  });

  it('uses injected entropy without Math.random and always validates generated codes', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('forbidden'); });
    try {
      expect(generateRoomCode((bytes) => bytes.set([0, 1, 2, 3, 4, 5])))
        .toBe(ROOM_CODE_ALPHABET.slice(0, 6));
      for (let seed = 0; seed < 256; seed += 1) {
        const code = generateRoomCode((bytes) => bytes.fill(seed));
        expect(code).toHaveLength(6);
        expect(isValidRoomCode(code)).toBe(true);
      }
    } finally {
      random.mockRestore();
    }
  });

  it('parses room links and leaves unsafe URL content as plain data', () => {
    expect(parseRoomQuery('')).toEqual({ kind: 'none' });
    expect(parseRoomQuery('?room=abc234')).toEqual({ kind: 'valid', code: 'ABC234' });
    expect(parseRoomQuery('?room=ABC23')).toEqual({ kind: 'invalid', entered: 'ABC23' });
    expect(parseRoomQuery('?room=%3Csvg%3E')).toEqual({ kind: 'invalid', entered: '<SVG>' });
    expect(parseRoomQuery('?room=')).toEqual({ kind: 'invalid', entered: '' });
  });
});
