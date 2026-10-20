import { createServer as createTcpServer } from 'node:net';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  CloseCode,
  Phase,
  PROTOCOL_VERSION,
  ServerMessageId,
  BALANCE,
} from '@shiftborn/shared';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { createServer } from '../src/server.js';

class ShutdownRoom extends ArenaRoom {
  disposed = false;
  shutdownCalls = 0;
  waitMs: number | null = null;
  private releaseResultsWait: (() => void) | null = null;

  override onCreate(options: Parameters<ArenaRoom['onCreate']>[0]): void {
    super.onCreate(options);
    this.fixedLoop.stop();
  }

  override onBeforeShutdown(): void {
    this.shutdownCalls += 1;
    super.onBeforeShutdown();
  }

  override async onDispose(): Promise<void> {
    this.disposed = true;
    await super.onDispose();
  }

  protected override waitForResultsOrTimeout(
    milliseconds: number,
  ): Promise<void> {
    this.waitMs = milliseconds;
    return new Promise<void>((resolve) => {
      this.releaseResultsWait = resolve;
    });
  }

  releaseWait(): void {
    this.releaseResultsWait?.();
    this.releaseResultsWait = null;
  }

  setResultsRemaining(ticks: number): void {
    this.world.phase = Phase.Results;
    this.world.phaseEndTick = this.world.tick + ticks;
    this.mirrorNow();
  }

  get loopRunning(): boolean {
    return this.fixedLoop.isRunning;
  }

  get sessionCount(): number {
    return this.world.players.filter(
      (player) => player !== null && !player.isBot,
    ).length;
  }
}

async function freePort(): Promise<number> {
  const socket = createTcpServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (typeof address !== 'object' || address === null)
    throw new Error('missing port');
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return address.port;
}

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

async function withServer(
  run: (room: ShutdownRoom, testServer: ColyseusTestServer) => Promise<void>,
): Promise<void> {
  const port = await freePort();
  const server = createServer(
    { ...loadServerConfig({}), port },
    pino({ level: 'silent' }),
    ShutdownRoom,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    const room = await testServer.createRoom<ShutdownRoom>('arena', {
      code: 'ABC234',
    });
    await run(room, testServer);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
  }
}

async function join(server: ColyseusTestServer, room: ShutdownRoom) {
  return server.connectTo(room, {
    code: 'ABC234',
    protocolVersion: PROTOCOL_VERSION,
    name: 'Tester',
  });
}

describe('T-026 graceful shutdown through the pinned Colyseus server', () => {
  it('locks, sends notice, closes with 4004 and stops a non-RESULTS room', async () => {
    await withServer(async (room, testServer) => {
      const client = await join(testServer, room);
      client.reconnection.enabled = false;
      const messages: unknown[] = [];
      client.onMessage(ServerMessageId.Notice, (message: unknown) =>
        messages.push(message),
      );
      const left = new Promise<number>((resolve) => client.onLeave(resolve));

      await testServer.server.gracefullyShutdown(false);
      expect(await left).toBe(CloseCode.ServerShuttingDown);
      expect(messages).toEqual([
        {
          kind: 'shutdown',
          text: 'The server is restarting. Play again in a moment.',
        },
      ]);
      expect(room.locked).toBe(true);
      expect(room.waitMs).toBeNull();
      expect(room.shutdownCalls).toBe(1);
      expect(room.disposed).toBe(true);
      expect(room.loopRunning).toBe(false);
      expect(room.sessionCount).toBe(0);
    });
  }, 10000);

  it('waits only the remaining current RESULTS time and repeated calls are safe', async () => {
    await withServer(async (room, testServer) => {
      const client = await join(testServer, room);
      client.reconnection.enabled = false;
      room.setResultsRemaining(BALANCE.tick.rateHz / 2);
      const notices: unknown[] = [];
      client.onMessage(ServerMessageId.Notice, (message: unknown) =>
        notices.push(message),
      );
      const left = new Promise<number>((resolve) => client.onLeave(resolve));

      const shutting = testServer.server.gracefullyShutdown(false);
      await until(() => room.waitMs !== null);
      await until(() => notices.length === 1);
      expect(room.waitMs).toBe(500);
      expect(room.locked).toBe(true);
      expect(room.disposed).toBe(false);
      room.onBeforeShutdown();
      expect(notices).toHaveLength(1);
      room.releaseWait();
      await shutting;
      expect(await left).toBe(CloseCode.ServerShuttingDown);
      expect(room.disposed).toBe(true);
      expect(room.loopRunning).toBe(false);
    });
  }, 10000);

  it('rejects a pending reconnect and closes the remaining client with 4004', async () => {
    await withServer(async (room, testServer) => {
      const dropped = await join(testServer, room);
      const connected = await join(testServer, room);
      dropped.reconnection.enabled = false;
      connected.reconnection.enabled = false;
      dropped.connection.close();
      await until(
        () => room.state.players.get(dropped.sessionId)?.connected === false,
      );
      expect(room.disposed).toBe(false);
      const left = new Promise<number>((resolve) => connected.onLeave(resolve));

      await testServer.server.gracefullyShutdown(false);
      expect(await left).toBe(CloseCode.ServerShuttingDown);
      expect(room.disposed).toBe(true);
      expect(room.loopRunning).toBe(false);
    });
  }, 10000);
});
