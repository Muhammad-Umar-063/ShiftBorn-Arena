import { CloseCode, isValidRoomCode, sanitizePlayerName } from '@shiftborn/shared';

export type ConnectionIntent =
  | { readonly kind: 'quick'; readonly name: string; readonly code: '' }
  | { readonly kind: 'create' | 'join'; readonly name: string; readonly code: string };

export type AppState =
  | { readonly kind: 'landing' }
  | { readonly kind: 'connecting'; readonly intent: ConnectionIntent }
  | { readonly kind: 'inMatch'; readonly intent: ConnectionIntent }
  | { readonly kind: 'reconnecting'; readonly intent: ConnectionIntent }
  | {
      readonly kind: 'error';
      readonly reason: 'timeout' | 'close' | 'lost';
      readonly closeCode?: number;
      readonly intent: ConnectionIntent;
    };

export interface TimerApi {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export interface ConnectionAttempt {
  readonly signal: AbortSignal;
  joined(): void;
  failed(code?: number): void;
}

export type ConnectionLauncher = (
  intent: ConnectionIntent, attempt: ConnectionAttempt,
) => void | Promise<void>;

export interface ErrorPresentation {
  readonly message: string;
  readonly action: 'reload' | 'quick' | 'home' | 'retry';
  readonly label: string;
}

const DEFAULT_TIMERS: TimerApi = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const CONNECTION_TIMEOUT_MS = 10_000;

export function errorPresentation(state: Extract<AppState, { kind: 'error' }>): ErrorPresentation {
  if (state.reason === 'timeout') return {
    message: 'Could not connect. Try again.', action: 'retry', label: 'Try again',
  };
  if (state.reason === 'lost') return {
    message: 'Connection lost', action: 'retry', label: 'Play again',
  };
  switch (state.closeCode) {
    case CloseCode.VersionMismatch:
      return { message: 'A new version is available.', action: 'reload', label: 'Reload' };
    case CloseCode.RoomFull:
      return { message: 'That room is full.', action: 'quick', label: 'Play' };
    case CloseCode.InvalidRoomCode:
      return { message: 'Room code not found.', action: 'home', label: 'Back to join' };
    case CloseCode.InvalidInput:
      return { message: 'Disconnected.', action: 'retry', label: 'Play again' };
    case CloseCode.ServerShuttingDown:
      return { message: 'The server is restarting.', action: 'retry', label: 'Play again' };
    case CloseCode.InternalRoomError:
    default:
      return { message: 'Something went wrong.', action: 'retry', label: 'Play again' };
  }
}

function safeIntent(intent: ConnectionIntent): ConnectionIntent {
  if (intent.name.length > 16 || sanitizePlayerName(intent.name, '') !== intent.name ||
    !isValidRoomCode(intent.code) ||
    (intent.kind === 'quick') !== (intent.code === ''))
    throw new TypeError('invalid connection intent');
  return { ...intent };
}

/** T-030: one active attempt; every callback is guarded by its generation. */
export class AppStateController {
  state: AppState = { kind: 'landing' };
  private generation = 0;
  private pending: {
    readonly id: number;
    readonly controller: AbortController;
    readonly timer: unknown;
  } | null = null;
  private joinedController: AbortController | null = null;
  private disposed = false;

  constructor(
    private readonly onChange: (state: AppState) => void,
    private readonly launch: ConnectionLauncher = () => undefined,
    private readonly timers: TimerApi = DEFAULT_TIMERS,
  ) {}

  start(request: ConnectionIntent): void {
    if (this.disposed) return;
    const intent = safeIntent(request);
    this.clearPending(true);
    this.joinedController?.abort();
    this.joinedController = null;
    const id = ++this.generation;
    const controller = new AbortController();
    const timer = this.timers.set(() => this.timeout(id), CONNECTION_TIMEOUT_MS);
    this.pending = { id, controller, timer };
    this.transition({ kind: 'connecting', intent });
    try {
      const launched = this.launch(intent, {
        signal: controller.signal,
        joined: () => this.joined(id),
        failed: (code?: number) => this.failed(id, code),
      });
      if (launched !== undefined) void Promise.resolve(launched).catch(() => this.failed(id));
    } catch {
      this.failed(id);
    }
  }

  cancel(): void {
    if (this.state.kind !== 'connecting') return;
    this.clearPending(true);
    this.transition({ kind: 'landing' });
  }

  showCloseError(code?: number): void {
    if (this.disposed || (this.state.kind !== 'inMatch' &&
      this.state.kind !== 'reconnecting')) return;
    const intent = this.state.intent;
    this.joinedController?.abort();
    this.joinedController = null;
    this.transition({ kind: 'error', reason: 'close', closeCode: code, intent });
  }

  showReconnecting(): void {
    if (this.disposed || this.state.kind !== 'inMatch') return;
    this.transition({ kind: 'reconnecting', intent: this.state.intent });
  }

  recovered(): void {
    if (this.disposed || this.state.kind !== 'reconnecting') return;
    this.transition({ kind: 'inMatch', intent: this.state.intent });
  }

  connectionLost(): void {
    if (this.disposed || this.state.kind !== 'reconnecting') return;
    const intent = this.state.intent;
    this.joinedController?.abort();
    this.joinedController = null;
    this.transition({ kind: 'error', reason: 'lost', intent });
  }

  actOnError(reload: () => void): void {
    if (this.state.kind !== 'error') return;
    const presentation = errorPresentation(this.state);
    const intent = this.state.intent;
    if (presentation.action === 'reload') reload();
    else if (presentation.action === 'home') this.transition({ kind: 'landing' });
    else if (presentation.action === 'quick')
      this.start({ kind: 'quick', name: intent.name, code: '' });
    else this.start({ ...intent });
  }

  home(): void {
    if (this.disposed) return;
    this.clearPending(true);
    this.joinedController?.abort();
    this.joinedController = null;
    this.transition({ kind: 'landing' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearPending(true);
    this.joinedController?.abort();
    this.joinedController = null;
  }

  private joined(id: number): void {
    if (this.pending?.id !== id || this.state.kind !== 'connecting') return;
    const intent = this.state.intent;
    this.joinedController = this.pending.controller;
    this.clearPending(false);
    this.transition({ kind: 'inMatch', intent });
  }

  private failed(id: number, code?: number): void {
    if (this.pending?.id !== id || this.state.kind !== 'connecting') return;
    const intent = this.state.intent;
    this.clearPending(true);
    this.transition({ kind: 'error', reason: 'close', closeCode: code, intent });
  }

  private timeout(id: number): void {
    if (this.pending?.id !== id || this.state.kind !== 'connecting') return;
    const intent = this.state.intent;
    this.clearPending(true);
    this.transition({ kind: 'error', reason: 'timeout', intent });
  }

  private clearPending(abort: boolean): void {
    if (this.pending === null) return;
    this.timers.clear(this.pending.timer);
    if (abort) this.pending.controller.abort();
    this.pending = null;
  }

  private transition(state: AppState): void {
    this.state = state;
    this.onChange(state);
  }
}
