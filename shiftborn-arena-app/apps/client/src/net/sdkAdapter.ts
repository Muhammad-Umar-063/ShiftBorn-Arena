import { Client, Room, ServerError, type FetchFn } from '@colyseus/sdk';
import { CloseCode } from '@shiftborn/shared';
import {
  NetSim, type NetScheduler, type NetSimSettings,
} from './netsim.js';

const APPLICATION_CODES = new Set<number>(Object.values(CloseCode));

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The pinned SDK converts HTTP 400 to code 400. Keep a validated app code. */
export function applicationCodeFetch(fetchImpl: FetchFn): FetchFn {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.status === 400 && response.headers.get('content-type')?.includes('json')) {
      try {
        const body: unknown = await response.clone().json();
        if (record(body) && typeof body.code === 'number' &&
          APPLICATION_CODES.has(body.code))
          throw new ServerError(body.code, 'Matchmaking rejected');
      } catch (error: unknown) {
        if (error instanceof ServerError) throw error;
        // Leave malformed/unrecognized responses to the SDK's ordinary path.
      }
    }
    return response;
  };
}

export interface WireOptions {
  readonly settings: NetSimSettings;
  readonly now?: () => number;
  readonly scheduler?: NetScheduler;
  readonly random?: () => number;
}

/** Per-room public/protected SDK adapter; no global socket or SDK patching. */
export class BufferedRoom<State = unknown> extends Room<unknown, State> {
  private sim: NetSim | null = null;
  private rawSend: ((bytes: Uint8Array) => void) | null = null;

  constructor(name: string, private readonly wire: WireOptions) { super(name); }

  override connect(endpoint: string, options?: unknown, headers?: unknown): void {
    this.sim = new NetSim(
      this.wire.settings,
      (bytes) => this.rawSend?.(bytes),
      (bytes) => super.onMessageCallback({ data: bytes } as MessageEvent),
      this.wire.now, this.wire.scheduler, this.wire.random,
    );
    super.connect(endpoint, options, headers);
    this.rawSend = this.connection.send.bind(this.connection);
    this.connection.send = (bytes) => this.sim?.outbound(new Uint8Array(bytes));
    // Application retries own the exact schedule and deadline.
    this.reconnection.enabled = false;
  }

  protected override onMessageCallback(event: MessageEvent): void {
    const data: unknown = event.data;
    if (data instanceof ArrayBuffer) this.sim?.inbound(new Uint8Array(data));
    else if (data instanceof Uint8Array) this.sim?.inbound(data);
  }

  disposeWire(): void {
    this.sim?.dispose();
    this.sim = null;
    if (this.rawSend !== null && this.connection)
      this.connection.send = this.rawSend;
  }
}

export class BufferedClient extends Client {
  constructor(
    endpoint: string,
    private readonly wire: WireOptions,
    private readonly onRoomCreated: (room: BufferedRoom<unknown>) => void,
    fetchImpl: FetchFn = globalThis.fetch.bind(globalThis),
  ) {
    super(endpoint, { fetchFn: applicationCodeFetch(fetchImpl) });
  }

  protected override createRoom<State>(roomName: string): Room<unknown, State> {
    const room = new BufferedRoom<State>(roomName, this.wire);
    this.onRoomCreated(room as BufferedRoom<unknown>);
    return room;
  }
}
