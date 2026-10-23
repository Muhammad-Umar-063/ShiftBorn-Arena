import { BALANCE, Form } from '@shiftborn/shared';
import { emitEvent } from './events.js';
import type { PlayerRecord } from './player.js';
import type { World } from './world.js';

const UNLOCK_ORDER = [
  { form: Form.Beast, kos: BALANCE.progression.beastUnlockKos },
  { form: Form.Turret, kos: BALANCE.progression.turretUnlockKos },
] as const;

/** GR-18.1: a fresh entrant may use only the Runner form. */
export function freshUnlocks(): Record<Form, boolean> {
  return { [Form.Runner]: true, [Form.Beast]: false, [Form.Turret]: false };
}

/** GR-18.2: the forms a credited KO count unlocks, in unlock order. */
export function formsUnlockedAt(kos: number): readonly Form[] {
  const forms: Form[] = [Form.Runner];
  for (const entry of UNLOCK_ORDER) if (kos >= entry.kos) forms.push(entry.form);
  return forms;
}

/** GR-18.2: step 9 calls this after crediting a KO; each unlock happens once. */
export function applyKillUnlocks(world: World, player: PlayerRecord): void {
  for (const entry of UNLOCK_ORDER) {
    if (player.unlocked[entry.form] || player.stats.kos < entry.kos) continue;
    player.unlocked[entry.form] = true;
    emitEvent(world, { type: 'formUnlocked', seat: player.seat, form: entry.form });
  }
}
