/** CONTROLS_UI §2: physical codes are translated once at the DOM boundary. */
export type InputAction =
  | 'moveNorth' | 'moveSouth' | 'moveWest' | 'moveEast'
  | 'aimNorth' | 'aimSouth' | 'aimWest' | 'aimEast'
  | 'fire' | 'ability' | 'morphRunner' | 'morphBeast' | 'morphTurret'
  | 'lockToggle' | 'scoreboard' | 'menu' | 'cameraView'
  | 'debugOverlay' | 'hitboxView' | 'devConsole'
  | 'menuPrevious' | 'menuNext' | 'menuConfirm' | 'menuBack';

export const GAME_BINDINGS: Readonly<Record<string, readonly InputAction[]>> = Object.freeze({
  KeyW: ['moveNorth'], KeyA: ['moveWest'], KeyS: ['moveSouth'], KeyD: ['moveEast'],
  ArrowUp: ['aimNorth'], ArrowDown: ['aimSouth'],
  ArrowLeft: ['aimWest'], ArrowRight: ['aimEast'],
  Mouse0: ['fire'], Space: ['fire'],
  Digit1: ['morphRunner'], Digit2: ['morphBeast'], Digit3: ['morphTurret'],
  KeyE: ['ability'], KeyQ: ['lockToggle'], Tab: ['scoreboard'],
  Escape: ['menu'], KeyP: ['menu'], KeyV: ['cameraView'],
  F3: ['debugOverlay'], F4: ['hitboxView'], Backquote: ['devConsole'],
});

export const MENU_BINDINGS: Readonly<Record<string, readonly InputAction[]>> = Object.freeze({
  ArrowUp: ['menuPrevious'], ArrowLeft: ['menuPrevious'],
  KeyW: ['menuPrevious'], KeyA: ['menuPrevious'],
  ArrowDown: ['menuNext'], ArrowRight: ['menuNext'],
  KeyS: ['menuNext'], KeyD: ['menuNext'],
  Enter: ['menuConfirm'], Space: ['menuConfirm'], Escape: ['menuBack'],
});

export const RESERVED_CODES = Object.freeze([
  'Mouse2', 'KeyR', 'KeyX', 'KeyF', 'KeyZ', 'KeyB',
] as const);

export function actionsForCode(code: string, context: 'gameplay' | 'menu' = 'gameplay'):
  readonly InputAction[] {
  return (context === 'gameplay' ? GAME_BINDINGS : MENU_BINDINGS)[code] ?? [];
}
