import type { FetchFn } from '@colyseus/sdk';
import {
  BALANCE, ClientMessageId, CloseCode, PROTOCOL_VERSION, ServerMessageId,
  balanceHash,
} from '@shiftborn/shared';
import type { ConnectionAttempt, ConnectionIntent } from '../app/appState.js';
import { ClockSync } from './clockSync.js';
import {
  decodeAfkWarn, decodeControl, decodeDevResult, decodeEventBatch,
  decodeNotice, decodeProbe, readAuthoritativeState, validateWelcome,
  type AuthoritativeRead, type DevResult, type EventBatch, type Notice,
  type Welcome,
} from './messageValidation.js';
import { parseNetSim, type NetScheduler } from './netsim.js';
import { BufferedClient, BufferedRoom } from './sdkAdapter.js';

export type ConnectionEvent =
  | { readonly kind: 'ready' | 'recovered'; readonly welcome: Welcome; readonly state: AuthoritativeRead }
  | { readonly kind: 'state'; readonly state: AuthoritativeRead }
  | { readonly kind: 'events'; readonly batch: EventBatch }
  | { readonly kind: 'control'; readonly controller: number }
  | { readonly kind: 'afkWarn'; readonly secondsLeft: number }
  | { readonly kind: 'notice'; readonly notice: Notice }
  | { readonly kind: 'devResult'; readonly result: DevResult }
  | { readonly kind: 'resync'; readonly state: AuthoritativeRead; readonly lastInputSeq: number }
  | { readonly kind: 'reconnecting' | 'lost' }
  | { readonly kind: 'terminal'; readonly code?: number };

export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface ConnectionOptions {
  readonly endpoint: string;
  readonly search?: string;
  readonly inputScheme?: () => 'mouse' | 'keys';
  readonly now?: () => number;
  readonly scheduler?: NetScheduler;
  readonly random?: () => number;
  readonly fetch?: FetchFn;
  readonly visibility?: VisibilitySource | null;
  readonly frames?: FrameScheduler | null;
}

interface Operation {
  room: BufferedRoom<unknown> | null;
  welcome: Welcome | null;
  state: AuthoritativeRead | null;
  readonly attempt: ConnectionAttempt | null;
  readonly recovering: boolean;
  readonly unsubscribers: Array<() => void>;
  closed: boolean;
}

interface Recovery {
  token: string;
  readonly deadlineAt: number;
  readonly playerId: string;
  readonly seat: number;
  index: number;
  inFlight: boolean;
  retryTimer: unknown | null;
  deadlineTimer: unknown | null;
}

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000] as const;
const TERMINAL_CODES = new Set<number>(Object.values(CloseCode));
const DEFAULT_TIMER: NetScheduler = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const DEFAULT_FRAMES: FrameScheduler | null = typeof requestAnimationFrame === 'function'
  ? { request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle) }
  : null;

function closeCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'number' && TERMINAL_CODES.has(code) ? code : undefined;
}

/** T-031 owns transport, retries, clock, and detached authoritative reads. */
export class Connection {
  readonly clock: ClockSync;
  private readonly listeners = new Set<(event: ConnectionEvent) => void>();
  private readonly now: () => number;
  private readonly scheduler: NetScheduler;
  private readonly visibility: VisibilitySource | null;
  private readonly frames: FrameScheduler | null;
  private readonly localHash = balanceHash();
  private readonly search: string;
  private operation: Operation | null = null;
  private current: Operation | null = null;
  private recovery: Recovery | null = null;
  private pingTimer: unknown | null = null;
  private frameHandle: number | null = null;
  private frameId = 0;
  private disposed = false;
  private readonly visibilityChanged = (): void => this.sendVisibility(true);

  private sendVisibility(resyncOnVisible: boolean): void {
    const room = this.current?.room;
    if (room === null || room === undefined || !room.connection.isOpen) return;
    const hidden = this.visibility?.hidden ?? false;
    room.send(ClientMessageId.Vis, [hidden ? 1 : 0]);
    if (!hidden && resyncOnVisible) this.emitResync();
  }

  constructor(private readonly options: ConnectionOptions) {
    this.now = options.now ?? (() => performance.now());
    this.scheduler = options.scheduler ?? DEFAULT_TIMER;
    this.visibility = options.visibility === undefined
      ? (typeof document === 'undefined' ? null : document) : options.visibility;
    this.frames = options.frames === undefined ? DEFAULT_FRAMES : options.frames;
    this.search = options.search ?? (typeof window === 'undefined' ? '' : window.location.search);
    this.clock = new ClockSync(this.now);
  }

  subscribe(listener: (event: ConnectionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  get authoritativeState(): AuthoritativeRead | null { return this.current?.state ?? null; }
  get activeRoom(): BufferedRoom<unknown> | null { return this.current?.room ?? null; }
  get canUseDevConsole(): boolean {
    return !this.disposed && this.recovery === null &&
      this.current?.welcome?.devCheatsEnabled === true &&
      this.current.room?.connection.isOpen === true;
  }

  sendDevCommand(cmd: string): boolean {
    if (!this.canUseDevConsole || typeof cmd !== 'string' ||
      cmd.trim().length === 0) return false;
    this.current?.room?.send(ClientMessageId.DevCmd, { cmd });
    return true;
  }

  launch = (intent: ConnectionIntent, attempt: ConnectionAttempt): void => {
    if (this.disposed || attempt.signal.aborted) return;
    this.leave();
    const op = this.newOperation(attempt, false);
    this.operation = op;
    attempt.signal.addEventListener('abort', () => {
      if (this.operation === op) this.operation = null;
      if (this.current === op) this.current = null;
      this.closeOperation(op, true);
      this.stopSessionTimers();
      this.clearRecovery();
    }, { once: true });
    const tag = new URLSearchParams(this.search).get('tag');
    const options = {
      code: intent.code,
      name: intent.name,
      protocolVersion: PROTOCOL_VERSION,
      inputScheme: this.options.inputScheme?.() ?? 'mouse',
      ...(tag === null || tag === '' ? {} : { testerTag: tag }),
    };
    const client = this.createClient(op);
    void client.joinOrCreate('arena', options).then((room) => {
      if (op.closed && room instanceof BufferedRoom) {
        room.disposeWire();
        this.consentRoom(room);
      }
    }).catch((error: unknown) => this.failOperation(op, closeCode(error)));
  };

  /** T-034 sends validated encoded input packets through this gated seam. */
  sendInput(packet: readonly number[]): boolean {
    const room = this.current?.room;
    if (room === null || room === undefined || !room.connection.isOpen ||
      this.recovery !== null) return false;
    room.send(ClientMessageId.Input, [...packet]);
    return true;
  }

  leave(): void {
    this.clearRecovery();
    this.stopSessionTimers();
    if (this.operation !== null) this.closeOperation(this.operation, true);
    if (this.current !== null) this.closeOperation(this.current, true);
    this.operation = null;
    this.current = null;
    this.clock.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.leave();
    this.listeners.clear();
  }

  private newOperation(attempt: ConnectionAttempt | null, recovering: boolean): Operation {
    return {
      room: null, welcome: null, state: null, attempt, recovering,
      unsubscribers: [], closed: false,
    };
  }

  private createClient(op: Operation): BufferedClient {
    return new BufferedClient(
      this.options.endpoint,
      { settings: parseNetSim(this.search), now: this.now,
        scheduler: this.scheduler, random: this.options.random },
      (room) => this.attachRoom(op, room),
      this.options.fetch,
    );
  }

  private attachRoom(op: Operation, room: BufferedRoom<unknown>): void {
    op.room = room;
    if (op.closed) return;
    const message = (id: number, handler: (value: unknown) => void): void => {
      op.unsubscribers.push(room.onMessage(id, handler));
    };
    message(ServerMessageId.Welcome, (value) => this.onWelcome(op, value));
    message(ServerMessageId.Pong, (value) => {
      if (this.current === op) this.clock.acceptPong(value);
    });
    message(ServerMessageId.Probe, (value) => {
      const token = decodeProbe(value);
      if (token !== null && !op.closed && room.connection.isOpen)
        room.send(ClientMessageId.ProbeReply, [token]);
    });
    message(ServerMessageId.Ev, (value) => {
      const batch = decodeEventBatch(value);
      if (batch !== null && this.current === op) this.emit({ kind: 'events', batch });
    });
    message(ServerMessageId.Control, (value) => {
      const controller = decodeControl(value);
      if (controller !== null && this.current === op)
        this.emit({ kind: 'control', controller });
    });
    message(ServerMessageId.AfkWarn, (value) => {
      const secondsLeft = decodeAfkWarn(value);
      if (secondsLeft !== null && this.current === op)
        this.emit({ kind: 'afkWarn', secondsLeft });
    });
    message(ServerMessageId.Notice, (value) => {
      const notice = decodeNotice(value);
      if (notice !== null && this.current === op) this.emit({ kind: 'notice', notice });
    });
    message(ServerMessageId.DevResult, (value) => {
      const result = decodeDevResult(value);
      if (result !== null && this.current === op)
        this.emit({ kind: 'devResult', result });
    });
    const stateChanged = (state: unknown): void => this.onState(op, state);
    const dropped = (code: number): void => this.onClosed(op, code);
    const left = (code: number): void => this.onClosed(op, code);
    const error = (code: number): void => this.onClosed(op, code);
    room.onStateChange(stateChanged);
    room.onDrop(dropped);
    room.onLeave(left);
    room.onError(error);
    op.unsubscribers.push(
      () => room.onStateChange.remove(stateChanged),
      () => room.onDrop.remove(dropped),
      () => room.onLeave.remove(left),
      () => room.onError.remove(error),
    );
  }

  private onWelcome(op: Operation, value: unknown): void {
    if (op.closed) return;
    const result = validateWelcome(value, this.localHash);
    if (result.kind !== 'valid') {
      this.failOperation(op, result.kind === 'mismatch'
        ? CloseCode.VersionMismatch : CloseCode.InternalRoomError);
      return;
    }
    op.welcome = result.value;
    this.tryReady(op);
  }

  private onState(op: Operation, raw: unknown): void {
    if (op.closed) return;
    const state = readAuthoritativeState(raw);
    if (state === null) {
      this.failOperation(op, CloseCode.InternalRoomError);
      return;
    }
    op.state = state;
    if (this.current === op) this.emit({ kind: 'state', state });
    else this.tryReady(op);
  }

  private tryReady(op: Operation): void {
    const welcome = op.welcome;
    const state = op.state;
    const room = op.room;
    if (op.closed || welcome === null || state === null || room === null ||
      this.operation !== op) return;
    const local = state.players[welcome.playerId];
    if (local === undefined || local.seat !== welcome.seat) return;
    const recovery = this.recovery;
    if (op.recovering && (recovery === null ||
      recovery.playerId !== welcome.playerId || recovery.seat !== welcome.seat)) {
      this.finishLost();
      return;
    }
    this.operation = null;
    this.current = op;
    this.clock.reset();
    this.startSessionTimers();
    this.sendVisibility(false);
    if (op.recovering) {
      this.clearRecovery();
      this.emit({ kind: 'recovered', welcome, state });
      this.emitResync();
    } else {
      op.attempt?.joined();
      this.emit({ kind: 'ready', welcome, state });
    }
    this.emit({ kind: 'state', state });
  }

  private onClosed(op: Operation, code: number): void {
    if (op.closed) return;
    if (this.operation === op) {
      this.failOperation(op, TERMINAL_CODES.has(code) ? code : undefined);
      return;
    }
    if (this.current !== op) return;
    if (TERMINAL_CODES.has(code)) {
      this.current = null;
      this.stopSessionTimers();
      this.closeOperation(op, false);
      this.emit({ kind: 'terminal', code });
      return;
    }
    this.beginRecovery(op);
  }

  private failOperation(op: Operation, code?: number): void {
    if (op.closed) return;
    if (this.current === op) {
      this.current = null;
      this.stopSessionTimers();
      this.closeOperation(op, true);
      this.emit({ kind: 'terminal', code });
      return;
    }
    if (this.operation !== op) return;
    this.operation = null;
    this.closeOperation(op, true);
    if (op.recovering) {
      if (code !== undefined && TERMINAL_CODES.has(code)) {
        this.emit({ kind: 'terminal', code });
        this.clearRecovery();
      } else {
        if (this.recovery !== null) this.recovery.inFlight = false;
        this.scheduleRetry();
      }
    } else op.attempt?.failed(code);
  }

  private beginRecovery(op: Operation): void {
    if (this.recovery !== null) return;
    const welcome = op.welcome;
    const token = op.room?.reconnectionToken;
    this.current = null;
    this.stopSessionTimers();
    this.closeOperation(op, false);
    if (welcome === null || typeof token !== 'string' || token === '') {
      this.emit({ kind: 'lost' });
      return;
    }
    const deadlineAt = this.now() + BALANCE.net.reconnectS * 1000;
    this.recovery = {
      token, deadlineAt, playerId: welcome.playerId, seat: welcome.seat,
      index: 0, inFlight: false, retryTimer: null,
      deadlineTimer: this.scheduler.set(() => this.finishLost(),
        BALANCE.net.reconnectS * 1000),
    };
    this.emit({ kind: 'reconnecting' });
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    const recovery = this.recovery;
    if (recovery === null || recovery.inFlight || recovery.retryTimer !== null) return;
    const delay = RETRY_DELAYS_MS[Math.min(recovery.index, RETRY_DELAYS_MS.length - 1)] ?? 8000;
    recovery.index += 1;
    if (this.now() + delay >= recovery.deadlineAt) return;
    recovery.retryTimer = this.scheduler.set(() => {
      recovery.retryTimer = null;
      if (this.recovery !== recovery || this.now() >= recovery.deadlineAt) return;
      recovery.inFlight = true;
      const op = this.newOperation(null, true);
      this.operation = op;
      const client = this.createClient(op);
      void client.reconnect(recovery.token).then((room) => {
        if (op.closed && room instanceof BufferedRoom) {
          room.disposeWire();
          this.consentRoom(room);
        }
      }).catch((error: unknown) => this.failOperation(op, closeCode(error)));
    }, delay);
  }

  private finishLost(): void {
    if (this.recovery === null) return;
    if (this.operation !== null) this.closeOperation(this.operation, true);
    this.operation = null;
    this.clearRecovery();
    this.emit({ kind: 'lost' });
  }

  private clearRecovery(): void {
    if (this.recovery?.retryTimer !== null && this.recovery?.retryTimer !== undefined)
      this.scheduler.clear(this.recovery.retryTimer);
    if (this.recovery?.deadlineTimer !== null && this.recovery?.deadlineTimer !== undefined)
      this.scheduler.clear(this.recovery.deadlineTimer);
    this.recovery = null;
  }

  private startSessionTimers(): void {
    this.visibility?.addEventListener('visibilitychange', this.visibilityChanged);
    this.sendPing();
    const frame = (): void => {
      if (this.current === null || this.disposed) return;
      this.clock.advanceFrame(++this.frameId);
      this.frameHandle = this.frames?.request(frame) ?? null;
    };
    this.frameHandle = this.frames?.request(frame) ?? null;
  }

  private sendPing(): void {
    const room = this.current?.room;
    if (room === null || room === undefined || !room.connection.isOpen) return;
    const payload = this.clock.issuePing();
    if (payload !== null) room.send(ClientMessageId.Ping, payload);
    this.pingTimer = this.scheduler.set(() => {
      this.pingTimer = null;
      this.sendPing();
    }, BALANCE.net.pingIntervalS * 1000);
  }

  private stopSessionTimers(): void {
    if (this.pingTimer !== null) this.scheduler.clear(this.pingTimer);
    this.pingTimer = null;
    if (this.frameHandle !== null) this.frames?.cancel(this.frameHandle);
    this.frameHandle = null;
    this.visibility?.removeEventListener('visibilitychange', this.visibilityChanged);
  }

  private emitResync(): void {
    const op = this.current;
    const state = op?.state;
    const welcome = op?.welcome;
    if (state === null || state === undefined || welcome === null || welcome === undefined) return;
    const lastInputSeq = state.players[welcome.playerId]?.lastInputSeq ?? 0;
    this.emit({ kind: 'resync', state, lastInputSeq });
  }

  private closeOperation(op: Operation, consented: boolean): void {
    if (op.closed) return;
    op.closed = true;
    for (const unsubscribe of op.unsubscribers) unsubscribe();
    op.unsubscribers.length = 0;
    op.room?.disposeWire();
    if (consented && op.room !== null) this.consentRoom(op.room);
  }

  private consentRoom(room: BufferedRoom<unknown>): void {
    try {
      if (room.connection?.isOpen) void room.leave(true).catch(() => undefined);
      else room.connection?.close();
    } catch { /* a stale transport may already be closed */ }
  }

  private emit(event: ConnectionEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
