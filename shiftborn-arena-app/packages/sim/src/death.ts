import { DERIVED, Form, type Cause } from '@shiftborn/shared';
import { emitEvent } from './events.js';
import { cancelMorphOnDeath } from './morph.js';
import type { World } from './world.js';

/** Captured at the first lethal hit; later state changes cannot rewrite credit. */
export interface PendingDeath {
  readonly victimId: string;
  readonly victimSeat: number;
  readonly victimForm: Form;
  readonly killerId: string;
  readonly killerSeat: number;
  readonly killerName: string;
  readonly killerForm: Form;
  readonly cause: Cause;
  readonly finalDamage: number;
  readonly deathTick: number;
}

export function counterForm(form: Form): Form {
  switch (form) {
    case Form.Runner:
      return Form.Beast;
    case Form.Beast:
      return Form.Turret;
    case Form.Turret:
      return Form.Runner;
  }
}

/** GR-15 step 9: damage already marked each victim dead in step 8. */
export function finalizeDeaths(world: World): void {
  const pending = world.pendingDeaths;
  world.pendingDeaths = [];
  for (let seat = 0; seat < world.players.length; seat += 1) {
    const death = pending.find((entry) => entry.victimSeat === seat);
    const victim = world.players[seat];
    if (
      death === undefined ||
      victim === null ||
      victim === undefined ||
      victim.id !== death.victimId ||
      victim.alive
    )
      continue;
    cancelMorphOnDeath(victim);
    victim.ability = null;
    victim.knockback = null;
    victim.stunEndTick = world.tick;
    victim.stats.deaths += 1;
    const killer = world.players.find(
      (player) => player?.id === death.killerId,
    );
    if (killer !== undefined && killer !== null) killer.stats.kos += 1;

    const eligibleIds = new Set(
      victim.damageLog
        .filter(
          (entry) =>
            entry.tick >= death.deathTick - DERIVED.match.assistWindowTicks &&
            entry.tick <= death.deathTick &&
            entry.attackerId !== death.killerId,
        )
        .map((entry) => entry.attackerId),
    );
    const assisters: { id: string; seat: number }[] = [];
    for (const player of world.players) {
      if (player === null || !eligibleIds.has(player.id)) continue;
      player.stats.assists += 1;
      assisters.push({ id: player.id, seat: player.seat });
    }
    // T-018 inserts Flux rewards and the death drop here.
    emitEvent(world, {
      type: 'death',
      victimId: death.victimId,
      victimSeat: death.victimSeat,
      victimForm: death.victimForm,
      killerId: death.killerId,
      killerSeat: death.killerSeat,
      killerName: death.killerName,
      killerForm: death.killerForm,
      cause: death.cause,
      finalDamage: death.finalDamage,
      counterForm: counterForm(death.killerForm),
      assisters,
    });
    victim.respawnTick = death.deathTick + DERIVED.match.respawnTicks;
  }
}
