import { InputButton } from '@shiftborn/shared';
import type { InputAction } from './bindings.js';

const BUTTON_ACTIONS = {
  fire: InputButton.Fire, ability: InputButton.Ability,
  morphRunner: InputButton.MorphRunner, morphBeast: InputButton.MorphBeast,
  morphTurret: InputButton.MorphTurret,
} as const;
const MOVE_ACTIONS = ['moveNorth', 'moveSouth', 'moveWest', 'moveEast'] as const;

/** Physical source ownership and one-frame latches are independent. */
export class InputState {
  private readonly sources = new Map<InputAction, Set<string>>();
  private readonly latched = new Set<InputAction>();
  private toggledFire = false;

  press(action: InputAction, source: string, fireMode: 'hold' | 'toggle'): boolean {
    let held = this.sources.get(action);
    if (held === undefined) { held = new Set(); this.sources.set(action, held); }
    if (held.has(source)) return false;
    held.add(source);
    if (action === 'fire' && fireMode === 'toggle') this.toggledFire = !this.toggledFire;
    else if (action in BUTTON_ACTIONS ||
      MOVE_ACTIONS.includes(action as (typeof MOVE_ACTIONS)[number])) this.latched.add(action);
    return true;
  }

  release(action: InputAction, source: string): void { this.sources.get(action)?.delete(source); }
  held(action: InputAction): boolean { return (this.sources.get(action)?.size ?? 0) > 0; }
  active(action: InputAction): boolean { return this.held(action) || this.latched.has(action); }

  sampleButtons(fireMode: 'hold' | 'toggle'): number {
    let buttons = 0;
    for (const [action, bit] of Object.entries(BUTTON_ACTIONS) as
      [keyof typeof BUTTON_ACTIONS, number][]) {
      if (action === 'fire' && fireMode === 'toggle' ? this.toggledFire : this.active(action))
        buttons |= bit;
      this.latched.delete(action);
    }
    return buttons;
  }

  sampleMovement(): { readonly moveX: number; readonly moveY: number } {
    const moveX = (this.active('moveEast') ? 127 : 0) -
      (this.active('moveWest') ? 127 : 0);
    const moveY = (this.active('moveNorth') ? 127 : 0) -
      (this.active('moveSouth') ? 127 : 0);
    for (const action of MOVE_ACTIONS) this.latched.delete(action);
    return { moveX, moveY };
  }

  clear(): void {
    this.sources.clear(); this.latched.clear(); this.toggledFire = false;
  }
}
