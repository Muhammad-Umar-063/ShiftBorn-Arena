import { DERIVED } from '@shiftborn/shared';
import type { PlayerRecord } from './player.js';

/** GR-9.3: the end tick is exclusive for damage and future status immunity. */
export function isSpawnProtected(
  player: Pick<PlayerRecord, 'protectedEndTick'>,
  tick: number,
): boolean {
  return tick < player.protectedEndTick;
}

export function grantSpawnProtection(player: PlayerRecord, tick: number): void {
  player.protectedEndTick = tick + DERIVED.match.spawnProtectionTicks;
}

/** Call on a successful shot or future ability start, never on input alone. */
export function endSpawnProtection(
  player: Pick<PlayerRecord, 'protectedEndTick'>,
  tick: number,
): void {
  if (isSpawnProtected(player, tick)) player.protectedEndTick = tick;
}
