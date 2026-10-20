import { BotDifficultyCode, Mode } from '@shiftborn/shared';
import { describe, expect, it } from 'vitest';
import {
  decodeHostSettings,
  difficultyCode,
  quickplayModeForMatch,
} from '../src/rooms/roomSettings.js';

describe('AT-MATCH-08 and AT-SEC-03 room settings', () => {
  it('maps trusted difficulty and alternating quick-play modes', () => {
    expect(
      ['easy', 'normal', 'hard'].map((tier) =>
        difficultyCode(tier as Parameters<typeof difficultyCode>[0]),
      ),
    ).toEqual([
      BotDifficultyCode.Easy,
      BotDifficultyCode.Normal,
      BotDifficultyCode.Hard,
    ]);
    expect(
      [0, 1, 2, 3].map((index) => quickplayModeForMatch('alternate', index)),
    ).toEqual([Mode.Frenzy, Mode.ZoneFrenzy, Mode.Frenzy, Mode.ZoneFrenzy]);
    expect(quickplayModeForMatch('frenzy', 1)).toBe(Mode.Frenzy);
    expect(quickplayModeForMatch('zoneFrenzy', 0)).toBe(Mode.ZoneFrenzy);
  });

  it('strictly decodes unknown host settings without mutating input', () => {
    const value = Object.freeze({
      botFill: false,
      botDifficulty: 2,
      nextMode: 1,
    });
    expect(decodeHostSettings(value)).toEqual({
      botFill: false,
      botDifficulty: 2,
      nextMode: Mode.ZoneFrenzy,
    });
    for (const invalid of [
      null,
      [],
      'settings',
      {},
      { botFill: 'false', botDifficulty: 2, nextMode: 1 },
      { botFill: false, botDifficulty: '2', nextMode: 1 },
      { botFill: false, botDifficulty: 3, nextMode: 1 },
      { botFill: false, botDifficulty: 2, nextMode: '1' },
      { botFill: false, botDifficulty: 2, nextMode: 2 },
    ])
      expect(decodeHostSettings(invalid)).toBeNull();
  });
});
