/** D-063: stable codes in RoomSettings and hostSettings. */
export const BotDifficultyCode = {
  Easy: 0,
  Normal: 1,
  Hard: 2,
} as const;

export type BotDifficultyCode =
  (typeof BotDifficultyCode)[keyof typeof BotDifficultyCode];

export function isBotDifficultyCode(
  value: unknown,
): value is BotDifficultyCode {
  return (
    value === BotDifficultyCode.Easy ||
    value === BotDifficultyCode.Normal ||
    value === BotDifficultyCode.Hard
  );
}
