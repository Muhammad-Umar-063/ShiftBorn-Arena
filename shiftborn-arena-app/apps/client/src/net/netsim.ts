export interface NetSimSettings {
  readonly lagMs: number;
  readonly jitterMs: number;
  readonly lossPercent: number;
}

export interface NetScheduler {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

const DEFAULT_SCHEDULER: NetScheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function randomUnit(): number {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return (word[0] ?? 0) / 0x1_0000_0000;
}

function nonNegative(search: URLSearchParams, key: string): number {
  const raw = search.get(key);
  if (raw === null || raw.trim() === '') return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function parseNetSim(search: string): NetSimSettings {
  const params = new URLSearchParams(search);
  return {
    lagMs: nonNegative(params, 'lag'),
    jitterMs: nonNegative(params, 'jitter'),
    lossPercent: Math.min(100, nonNegative(params, 'loss')),
  };
}

interface QueuedFrame {
  readonly bytes: Uint8Array;
  readonly dueAt: number;
}

class OrderedQueue {
  private readonly frames: QueuedFrame[] = [];
  private timer: unknown = null;
  private lastDueAt = 0;
  private disposed = false;

  constructor(
    private readonly deliver: (bytes: Uint8Array) => void,
    private readonly now: () => number,
    private readonly scheduler: NetScheduler,
  ) {}

  enqueue(bytes: Uint8Array, delayMs: number): void {
    if (this.disposed) return;
    const dueAt = Math.max(this.lastDueAt, this.now() + delayMs);
    this.lastDueAt = dueAt;
    this.frames.push({ bytes: new Uint8Array(bytes), dueAt });
    if (this.timer === null) this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.scheduler.clear(this.timer);
    this.timer = null;
    this.frames.length = 0;
  }

  private schedule(): void {
    const first = this.frames[0];
    if (first === undefined || this.disposed) return;
    this.timer = this.scheduler.set(() => {
      this.timer = null;
      if (this.disposed) return;
      const at = this.now();
      while (this.frames[0] !== undefined && this.frames[0].dueAt <= at) {
        const frame = this.frames.shift();
        if (frame !== undefined) this.deliver(frame.bytes);
      }
      this.schedule();
    }, Math.max(0, first.dueAt - this.now()));
  }
}

/** NETWORK_PROTOCOL §12: raw byte FIFO delays before SDK Schema decoding. */
export class NetSim {
  private readonly incoming: OrderedQueue | null;
  private readonly outgoing: OrderedQueue | null;
  private readonly enabled: boolean;
  private disposed = false;

  constructor(
    readonly settings: NetSimSettings,
    private readonly sendRaw: (bytes: Uint8Array) => void,
    private readonly receiveRaw: (bytes: Uint8Array) => void,
    private readonly now: () => number = () => performance.now(),
    private readonly scheduler: NetScheduler = DEFAULT_SCHEDULER,
    private readonly random: () => number = randomUnit,
  ) {
    this.enabled = settings.lagMs > 0 || settings.jitterMs > 0 || settings.lossPercent > 0;
    this.incoming = this.enabled ? new OrderedQueue(receiveRaw, now, scheduler) : null;
    this.outgoing = this.enabled ? new OrderedQueue(sendRaw, now, scheduler) : null;
  }

  inbound(bytes: Uint8Array): void { this.route(bytes, this.incoming, this.receiveRaw); }
  outbound(bytes: Uint8Array): void { this.route(bytes, this.outgoing, this.sendRaw); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.incoming?.dispose();
    this.outgoing?.dispose();
  }

  private route(
    bytes: Uint8Array, queue: OrderedQueue | null,
    deliver: (bytes: Uint8Array) => void,
  ): void {
    if (this.disposed) return;
    if (queue === null) { deliver(bytes); return; }
    const jitter = this.settings.jitterMs * this.unit();
    const held = this.unit() < this.settings.lossPercent / 100 ? 200 : 0;
    queue.enqueue(bytes, this.settings.lagMs / 2 + jitter + held);
  }

  private unit(): number {
    const sample = this.random();
    return Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0;
  }
}
