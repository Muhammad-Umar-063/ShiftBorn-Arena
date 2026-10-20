import { BALANCE, DERIVED } from '@shiftborn/shared';
import { PHASE_POLICY } from './phasePolicy.js';
import type { PlayerRecord } from './player.js';
import type { World } from './world.js';

/** GR-10.1: all positive Flux sources share the same cap and fractional behavior. */
export function gainFlux(
  player: PlayerRecord,
  amount: number,
  baseFlux = player.flux,
): void {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(baseFlux))
    throw new RangeError('Flux gain and base must be finite and nonnegative');
  player.flux = Math.max(0, Math.min(BALANCE.flux.max, baseFlux + amount));
}

/** GR-10.2: calculate from an anchor so repeating 1/30 does not drift. */
export function regenerateFlux(world: World): void {
  if (!PHASE_POLICY[world.phase].fluxRegeneration) return;
  for (const player of world.players) {
    if (player === null || !player.alive) continue;
    const expected = Math.min(
      BALANCE.flux.max,
      player.fluxRegenAnchor +
        player.fluxRegenTicks * DERIVED.flux.regenPerTick,
    );
    // A morph, pickup, reward or respawn rebases the next regeneration run.
    if (player.flux !== expected) {
      player.fluxRegenAnchor = player.flux;
      player.fluxRegenTicks = 0;
    }
    player.fluxRegenTicks += 1;
    gainFlux(
      player,
      player.fluxRegenTicks * DERIVED.flux.regenPerTick,
      player.fluxRegenAnchor,
    );
    if (player.flux === BALANCE.flux.max) {
      player.fluxRegenAnchor = player.flux;
      player.fluxRegenTicks = 0;
    }
  }
}
