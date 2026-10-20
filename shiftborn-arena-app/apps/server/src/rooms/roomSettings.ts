import {
  BotDifficultyCode,
  isBotDifficultyCode,
  Mode,
  type BotDifficultyWireCode,
} from '@shiftborn/shared';
import type { BotDifficulty, QuickplayMode } from '../config.js';

export interface RoomSettingsValue {
  readonly botFill: boolean;
  readonly botDifficulty: BotDifficultyWireCode;
  readonly nextMode: Mode;
}

export function difficultyCode(value: BotDifficulty): BotDifficultyWireCode {
  switch (value) {
    case 'easy':
      return BotDifficultyCode.Easy;
    case 'normal':
      return BotDifficultyCode.Normal;
    case 'hard':
      return BotDifficultyCode.Hard;
  }
}

export function quickplayModeForMatch(
  value: QuickplayMode,
  matchIndex: number,
): Mode {
  if (value === 'zoneFrenzy') return Mode.ZoneFrenzy;
  if (value === 'alternate' && matchIndex % 2 === 1) return Mode.ZoneFrenzy;
  return Mode.Frenzy;
}

/** NETWORK_PROTOCOL §5.1, D-063: reject coercion and unknown tier codes. */
export function decodeHostSettings(value: unknown): RoomSettingsValue | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return null;
  const fields = value as Record<string, unknown>;
  if (
    typeof fields.botFill !== 'boolean' ||
    !isBotDifficultyCode(fields.botDifficulty) ||
    (fields.nextMode !== 0 && fields.nextMode !== 1)
  )
    return null;
  return {
    botFill: fields.botFill,
    botDifficulty: fields.botDifficulty,
    nextMode: fields.nextMode === 0 ? Mode.Frenzy : Mode.ZoneFrenzy,
  };
}
