import { AimSource, BALANCE, MAX_SHOT_INTENTS_PER_FRAME, encodeInputPacket,
  type ClientInputFrame } from '@shiftborn/shared';
import type { GroundPoint } from '../render/coordinates.js';
import { aimFromGround, angleToUint16, pointerGroundPoint,
  type GroundProjector } from './aim.js';
import { actionsForCode, type InputAction } from './bindings.js';
import { InputState } from './InputState.js';

export type ReticleState = 'normal' | 'cooldown' | 'overheated' | 'outOfRange';
export interface DisplayedPlayer extends GroundPoint { readonly aim: number }
export interface InputTransport { sendInput(packet: readonly number[]): boolean }
export interface InputManagerOptions {
  readonly transport: InputTransport;
  readonly fireMode: () => 'hold' | 'toggle';
  readonly player: () => DisplayedPlayer | null;
  readonly camera: () => GroundProjector | null;
  readonly perspective: () => 'tpp' | 'fpp';
  readonly onAim?: (radians: number, distanceM: number) => void;
  readonly onAction?: (action: InputAction) => void;
  readonly onFrame?: (frame: ClientInputFrame) => void;
  readonly onUrgentInput?: () => void;
  readonly devBuild?: boolean;
  readonly serverCheatsAllowed?: () => boolean;
}

const PREVENT_DEFAULT_CODES = new Set(['Space', 'ArrowUp', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'Tab', 'Backquote']);
const MAX_SEQUENCE = 0xffffffff;
const SHOT_INTENT_MS = 500; // NETWORK_PROTOCOL §8.2 confirmation window.

function editable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null);
}

/** T-034 DOM translation boundary. The renderer calls tick from its sole RAF loop. */
export class InputManager {
  readonly actions = new InputState();
  private canvas: HTMLCanvasElement | null = null;
  private stage: HTMLElement | null = null;
  private reticle: HTMLDivElement | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private pointerOver = false;
  private hasAim = false;
  private aimRadians = 0;
  private nextSequence = 1;
  private readonly history: ClientInputFrame[] = [];
  private readonly shotIntents: Array<{ seq: number; atMs: number }> = [];
  private active = false;
  private modalOpen = false;
  private disposed = false;
  private latestFrame: ClientInputFrame | null = null;

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (this.disposed || !this.active || this.modalOpen || editable(event.target) ||
      event.ctrlKey || event.metaKey || event.altKey) return;
    if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    let urgent = false;
    for (const action of actionsForCode(event.code)) {
      if (action === 'devConsole' && !this.options.serverCheatsAllowed?.()) continue;
      if ((action === 'debugOverlay' || action === 'hitboxView') && !this.options.devBuild)
        continue;
      if (!this.actions.press(action, event.code, this.options.fireMode())) continue;
      if (action === 'moveNorth' || action === 'moveSouth' ||
        action === 'moveWest' || action === 'moveEast' ||
        action === 'ability' || action === 'morphRunner' ||
        action === 'morphBeast' || action === 'morphTurret' || action === 'fire')
        urgent = true;
      if (action === 'cameraView' || action === 'menu' || action === 'lockToggle' ||
        action === 'debugOverlay' || action === 'hitboxView' || action === 'devConsole')
        this.options.onAction?.(action);
    }
    if (urgent) this.options.onUrgentInput?.();
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    for (const action of actionsForCode(event.code)) this.actions.release(action, event.code);
  };
  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.active || this.canvas === null) return;
    this.pointerX = event.clientX; this.pointerY = event.clientY;
    this.pointerOver = true;
    this.refreshPointerPresentation();
  };
  private readonly pointerEnter = (event: PointerEvent): void => {
    if (!this.active || this.canvas === null) return;
    this.pointerX = event.clientX; this.pointerY = event.clientY;
    this.pointerOver = true;
    this.refreshPointerPresentation();
  };
  private readonly pointerLeave = (): void => {
    this.pointerOver = false;
    if (this.canvas !== null) this.canvas.style.cursor = '';
    if (this.reticle !== null) this.reticle.hidden = true;
  };
  private readonly pointerDown = (event: PointerEvent): void => {
    if (!this.active || this.modalOpen || event.button !== 0) return;
    event.preventDefault();
    if (this.actions.press('fire', 'Mouse0', this.options.fireMode()))
      this.options.onUrgentInput?.();
  };
  private readonly pointerUp = (event: PointerEvent): void => {
    if (event.button === 0) this.actions.release('fire', 'Mouse0');
  };
  private readonly contextMenu = (event: MouseEvent): void => { event.preventDefault(); };
  private readonly blur = (): void => { this.clearInput(); };
  private readonly visibilityChanged = (): void => {
    if (document.hidden) this.suspend();
  };
  private readonly focusIn = (event: FocusEvent): void => {
    if (editable(event.target)) this.clearInput();
  };

  constructor(private readonly options: InputManagerOptions) {
    document.addEventListener('keydown', this.keyDown);
    document.addEventListener('keyup', this.keyUp);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    document.addEventListener('focusin', this.focusIn);
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('blur', this.blur);
  }

  attach(canvas: HTMLCanvasElement, stage: HTMLElement): void {
    this.detach();
    this.canvas = canvas; this.stage = stage;
    canvas.tabIndex = -1;
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerenter', this.pointerEnter);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('contextmenu', this.contextMenu);
    const reticle = document.createElement('div');
    reticle.className = 'game-reticle';
    reticle.setAttribute('aria-hidden', 'true');
    reticle.hidden = true;
    stage.append(reticle);
    this.reticle = reticle;
  }

  detach(): void {
    const canvas = this.canvas;
    if (canvas !== null) {
      canvas.removeEventListener('pointermove', this.pointerMove);
      canvas.removeEventListener('pointerenter', this.pointerEnter);
      canvas.removeEventListener('pointerleave', this.pointerLeave);
      canvas.removeEventListener('pointerdown', this.pointerDown);
      canvas.removeEventListener('contextmenu', this.contextMenu);
      canvas.style.cursor = '';
    }
    this.reticle?.remove();
    this.reticle = null; this.canvas = null; this.stage = null;
    this.pointerOver = false;
    this.actions.release('fire', 'Mouse0');
  }

  setReticleState(state: ReticleState): void {
    if (this.reticle !== null) this.reticle.dataset.state = state;
  }

  /** Reflect the selected view even when the pointer has not moved. */
  refreshPointerPresentation(): void {
    if (this.canvas === null || this.reticle === null || this.stage === null) return;
    // D-065: FPP mouse aim is disabled pending the OQ-018 control rule.
    const aiming = this.active && !this.modalOpen && this.pointerOver &&
      this.options.perspective() === 'tpp';
    this.canvas.style.cursor = aiming ? 'none' : '';
    this.reticle.hidden = !aiming;
    if (!aiming) return;
    const rect = this.stage.getBoundingClientRect();
    this.reticle.style.left = `${this.pointerX - rect.left}px`;
    this.reticle.style.top = `${this.pointerY - rect.top}px`;
  }

  setActive(active: boolean): void {
    if (this.disposed) return;
    this.active = active && !document.hidden;
    if (!this.active) this.clearInput();
  }

  /** Keep sending neutral frames so a lost packet cannot leave server-held fire active. */
  setModalOpen(open: boolean): void {
    if (this.disposed) return;
    this.modalOpen = open;
    if (open) this.clearInput();
    this.refreshPointerPresentation();
    if (open) this.options.onUrgentInput?.();
  }

  suspend(): void { this.setActive(false); this.history.length = 0; }

  recover(lastInputSeq: number): void {
    if (this.disposed) return;
    this.clearInput();
    this.history.length = 0;
    if (Number.isInteger(lastInputSeq) && lastInputSeq >= 0)
      this.nextSequence = Math.max(this.nextSequence, lastInputSeq + 1);
    this.active = !document.hidden;
  }

  /** Called at BALANCE.tick.rateHz by ArenaRenderer; no timer is created here. */
  tick(): ClientInputFrame | null {
    if (!this.active || this.disposed || document.hidden) return null;
    const player = this.options.player();
    if (player === null || this.nextSequence > MAX_SEQUENCE) return null;
    if (!this.hasAim) { this.aimRadians = player.aim; this.hasAim = true; }
    let distanceM = 0;
    const canvas = this.canvas;
    // D-065: keep the last aim in FPP until the OQ-018 rule is approved.
    if (!this.modalOpen && this.pointerOver && canvas !== null &&
      this.options.perspective() === 'tpp') {
      const camera = this.options.camera();
      const point = camera === null ? null : pointerGroundPoint(this.pointerX,
        this.pointerY, canvas.getBoundingClientRect(), camera);
      const result = aimFromGround(point, player, this.aimRadians);
      this.aimRadians = result.radians;
      distanceM = result.distanceM;
    }
    this.options.onAim?.(this.aimRadians, distanceM);
    this.pruneShotIntents(performance.now());
    const movement = this.modalOpen ? { moveX: 0, moveY: 0 } :
      this.actions.sampleMovement();
    const frame: ClientInputFrame = { aimDist: 120,
      seq: this.nextSequence, ...movement, aim: angleToUint16(this.aimRadians),
      buttons: this.modalOpen ? 0 : this.actions.sampleButtons(this.options.fireMode()),
      aimSource: AimSource.Mouse,
      ...(this.shotIntents.length > 0
        ? { shotIntents: this.shotIntents.map((intent) => intent.seq) } : {}),
    };
    const packet = encodeInputPacket([frame, ...this.history.slice(0,
      BALANCE.net.inputRedundancy - 1)]);
    if (packet === null || !this.options.transport.sendInput(packet)) {
      this.suspend();
      return null;
    }
    this.nextSequence += 1;
    this.history.unshift(frame);
    this.history.length = Math.min(this.history.length, BALANCE.net.inputRedundancy - 1);
    this.latestFrame = frame;
    this.options.onFrame?.(frame);
    return frame;
  }

  get sampledFrame(): ClientInputFrame | null { return this.latestFrame; }
  get nextSeq(): number { return this.nextSequence; }
  get isActive(): boolean { return this.active; }
  isActionHeld(action: InputAction): boolean { return this.actions.held(action); }

  /** The newly predicted shot is repeated in subsequent input frames until confirmation. */
  rememberShotIntents(shots: readonly { readonly inputSeq: number }[], atMs: number): void {
    if (this.disposed || !Number.isFinite(atMs)) return;
    this.pruneShotIntents(atMs);
    for (const shot of shots) {
      if (!Number.isSafeInteger(shot.inputSeq) || shot.inputSeq < 1 ||
        this.shotIntents.some((intent) => intent.seq === shot.inputSeq)) continue;
      this.shotIntents.push({ seq: shot.inputSeq, atMs });
    }
    while (this.shotIntents.length > MAX_SHOT_INTENTS_PER_FRAME)
      this.shotIntents.shift();
  }

  confirmShotIntent(seq: number): void {
    const index = this.shotIntents.findIndex((intent) => intent.seq === seq);
    if (index >= 0) this.shotIntents.splice(index, 1);
  }

  resetShotIntents(): void { this.shotIntents.length = 0; }

  private pruneShotIntents(atMs: number): void {
    while (this.shotIntents.length > 0 &&
      atMs - this.shotIntents[0]!.atMs >= SHOT_INTENT_MS)
      this.shotIntents.shift();
  }

  clearInput(): void {
    this.actions.clear();
    this.history.length = 0;
    this.shotIntents.length = 0;
    this.pointerOver = false;
    if (this.canvas !== null) this.canvas.style.cursor = '';
    if (this.reticle !== null) this.reticle.hidden = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.modalOpen = false;
    this.clearInput();
    this.detach();
    document.removeEventListener('keydown', this.keyDown);
    document.removeEventListener('keyup', this.keyUp);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    document.removeEventListener('focusin', this.focusIn);
    window.removeEventListener('pointerup', this.pointerUp);
    window.removeEventListener('blur', this.blur);
    this.history.length = 0;
  }

}
