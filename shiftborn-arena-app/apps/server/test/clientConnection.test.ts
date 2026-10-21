import { createServer as createTcpServer } from 'node:net';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  BALANCE, CloseCode, Controller, EventId, PROTOCOL_VERSION, ServerMessageId,
} from '@shiftborn/shared';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { controllerCode } from '../src/rooms/mirror.js';
import { createServer } from '../src/server.js';
import type { ConnectionAttempt, ConnectionIntent } from '../../client/src/app/appState.js';
import { Connection, type ConnectionEvent } from '../../client/src/net/Connection.js';
import { BufferedClient } from '../../client/src/net/sdkAdapter.js';
import type { NetScheduler } from '../../client/src/net/netsim.js';

class ObservedRoom extends ArenaRoom {
  static rooms: ObservedRoom[] = [];
  override onCreate(options: Parameters<ArenaRoom['onCreate']>[0]): void {
    super.onCreate(options);
    ObservedRoom.rooms.push(this);
  }
  get currentTick(): number { return this.world.tick; }
  controllerFor(id: string): string | undefined {
    return this.world.players.find((value) => value?.id === id)?.controller;
  }
  probeMedian(id: string): number | undefined {
    return this.probeTracker.medianFor(id);
  }
  sendTestMessages(): void {
    const client = this.clients[0];
    if (client === undefined) throw new Error('client missing');
    client.send(ServerMessageId.Ev, [this.world.tick, [EventId.ProjectileExpire, 9]]);
    client.send(ServerMessageId.Control, [controllerCode(Controller.Human)]);
    client.send(ServerMessageId.AfkWarn, [7]);
    client.send(ServerMessageId.Notice, { kind: 'test', text: 'ready' });
    client.send(ServerMessageId.DevResult, { ok: true, text: 'done' });
  }
  closeTestClient(code: number): void {
    const client = this.clients[0];
    if (client === undefined) throw new Error('client missing');
    client.leave(code);
  }
}

async function freePort(): Promise<number> {
  const socket = createTcpServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (typeof address !== 'object' || address === null) throw new Error('port missing');
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return address.port;
}

async function until(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for connection');
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

async function withServer(run: (port: number) => Promise<void>): Promise<void> {
  const port = await freePort();
  ObservedRoom.rooms = [];
  const server = createServer(
    { ...loadServerConfig({}), port }, pino({ level: 'silent' }), ObservedRoom,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    await run(port);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
  }
}

function join(connection: Connection, intent: ConnectionIntent) {
  const events: ConnectionEvent[] = [];
  const abort = new AbortController();
  let joined = false;
  let failure: number | undefined;
  const attempt: ConnectionAttempt = {
    signal: abort.signal,
    joined: () => { joined = true; },
    failed: (code) => { failure = code; },
  };
  connection.subscribe((event) => events.push(event));
  connection.launch(intent, attempt);
  return { events, abort, get joined() { return joined; }, get failure() { return failure; } };
}

describe('T-031 production client and server socket', () => {
  it('joins quick play, receives early Welcome, and continues Schema ticks', async () => {
    await withServer(async (port) => {
      const connection = new Connection({ endpoint: `ws://127.0.0.1:${port}`, frames: null });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        await until(() => result.joined || result.failure !== undefined);
        expect(result.failure).toBeUndefined();
        expect(result.joined).toBe(true);
        const ready = result.events.find((event) => event.kind === 'ready');
        expect(ready?.kind).toBe('ready');
        if (ready?.kind !== 'ready') throw new Error('missing ready event');
        expect(ready.welcome.playerId).toBe(connection.activeRoom?.sessionId);
        const firstTick = ready.state.tick;
        await until(() => (connection.authoritativeState?.tick ?? 0) > firstTick + 2);
        expect(connection.authoritativeState?.players[ready.welcome.playerId]?.seat)
          .toBe(ready.welcome.seat);
        expect(connection.clock.rttSamples().length).toBeGreaterThan(0);
        expect(connection.clock.medianRttMs()).toBeLessThan(1000);
        expect(BALANCE.tick.rateHz).toBe(30);
        result.abort.abort();
      } finally { connection.dispose(); }
    });
  }, 12000);

  it('preserves matchmaking application codes from HTTP responses', async () => {
    await withServer(async (port) => {
      const client = new BufferedClient(`ws://127.0.0.1:${port}`,
        { settings: { lagMs: 0, jitterMs: 0, lossPercent: 0 } }, () => undefined);
      await expect(client.joinOrCreate('arena', {
        code: 'BAD', protocolVersion: PROTOCOL_VERSION,
      })).rejects.toMatchObject({ code: CloseCode.InvalidRoomCode });
      await expect(client.joinOrCreate('arena', {
        code: '', protocolVersion: PROTOCOL_VERSION + 1,
      })).rejects.toMatchObject({ code: CloseCode.VersionMismatch });
    });
  }, 12000);

  it('AT-NET-14 joins Create and Join into the same room with distinct validated identities', async () => {
    await withServer(async (port) => {
      const endpoint = `ws://127.0.0.1:${port}`;
      const first = new Connection({ endpoint, frames: null });
      const second = new Connection({ endpoint, frames: null });
      try {
        const a = join(first, { kind: 'create', name: 'Alice', code: 'ABC234' });
        await until(() => a.joined);
        const b = join(second, { kind: 'join', name: 'Bob', code: 'ABC234' });
        await until(() => b.joined);
        expect(first.activeRoom?.roomId).toBe(second.activeRoom?.roomId);
        expect(first.activeRoom?.sessionId).not.toBe(second.activeRoom?.sessionId);
        expect(a.events.some((event) => event.kind === 'ready')).toBe(true);
        expect(b.events.some((event) => event.kind === 'ready')).toBe(true);
        a.abort.abort();
        b.abort.abort();
      } finally { first.dispose(); second.dispose(); }
    });
  }, 12000);

  it.each(['', '?lag=100', '?lag=200', '?lag=150&loss=2', '?lag=150&jitter=20'])
  ('T-031 delivers live Schema patches through netsim %s (partial AT-NET-17 evidence)', async (search) => {
    await withServer(async (port) => {
      let randomCalls = 0;
      let holds = 0;
      const connection = new Connection({
        endpoint: `ws://127.0.0.1:${port}`, search, frames: null,
        random: () => {
          randomCalls += 1;
          if (search.includes('loss=2') && randomCalls % 100 === 0) {
            holds += 1;
            return 0.01;
          }
          return 0.5;
        },
      });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        await until(() => result.joined || result.failure !== undefined, 6000);
        expect(result.failure).toBeUndefined();
        const initialTick = connection.authoritativeState?.tick ?? -1;
        await until(() => (connection.authoritativeState?.tick ?? -1) >=
          initialTick + (search.includes('loss=2') ? 90 : 5), 7000);
        expect(result.events.filter((event) => event.kind === 'state').length)
          .toBeGreaterThan(1);
        expect(connection.activeRoom?.connection.isOpen).toBe(true);
        if (search.includes('loss=2')) expect(holds).toBeGreaterThan(0);
        result.abort.abort();
      } finally { connection.dispose(); }
    });
  }, 12000);

  it('AT-NET-11 recovers a dropped socket through the server token with the same seat and stats', async () => {
    await withServer(async (port) => {
      const delays: number[] = [];
      const scheduler: NetScheduler = {
        set(callback, delayMs) {
          delays.push(delayMs);
          return setTimeout(callback, delayMs);
        },
        clear(handle) { clearTimeout(handle as ReturnType<typeof setTimeout>); },
      };
      const connection = new Connection({
        endpoint: `ws://127.0.0.1:${port}`, frames: null, scheduler,
      });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        await until(() => result.joined);
        const ready = result.events.find((event) => event.kind === 'ready');
        if (ready?.kind !== 'ready') throw new Error('missing ready');
        const before = { id: ready.welcome.playerId, seat: ready.welcome.seat,
          points: ready.state.players[ready.welcome.playerId]?.points };
        connection.activeRoom?.connection.close(3001);
        await until(() => result.events.some((event) => event.kind === 'reconnecting'));
        expect(delays).toContain(30_000);
        expect(delays).toContain(500);
        expect(connection.sendInput([1, 0, 0, 0, 0, 0])).toBe(false);
        await until(() => result.events.some((event) => event.kind === 'recovered'), 5000);
        const recovered = result.events.find((event) => event.kind === 'recovered');
        expect(recovered?.kind).toBe('recovered');
        if (recovered?.kind !== 'recovered') throw new Error('missing recovery');
        expect(recovered.welcome.playerId).toBe(before.id);
        expect(recovered.welcome.seat).toBe(before.seat);
        expect(recovered.state.players[before.id]?.points).toBe(before.points);
        expect(result.events.some((event) => event.kind === 'resync')).toBe(true);
        result.abort.abort();
      } finally { connection.dispose(); }
    });
  }, 12000);

  it('uses one fixed 30-second recovery deadline even when a retry is in flight', async () => {
    await withServer(async (port) => {
      let now = 1000;
      let nextId = 0;
      const timers = new Map<number, { due: number; callback: () => void }>();
      const scheduler: NetScheduler = {
        set(callback, delayMs) {
          const id = ++nextId;
          timers.set(id, { due: now + delayMs, callback });
          return id;
        },
        clear(handle) { timers.delete(handle as number); },
      };
      const advance = (ms: number): void => {
        const target = now + ms;
        while (true) {
          const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
          if (next === undefined || next[1].due > target) break;
          now = next[1].due;
          timers.delete(next[0]);
          next[1].callback();
        }
        now = target;
      };
      const connection = new Connection({
        endpoint: `ws://127.0.0.1:${port}`, frames: null,
        now: () => now, scheduler,
      });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        await until(() => result.joined);
        connection.activeRoom?.connection.close(3001);
        await until(() => result.events.some((event) => event.kind === 'reconnecting'));
        advance(30_000);
        expect(result.events.filter((event) => event.kind === 'lost')).toHaveLength(1);
        expect(connection.activeRoom).toBeNull();
        expect(timers.size).toBe(0);
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        expect(result.events.some((event) => event.kind === 'recovered')).toBe(false);
        result.abort.abort();
      } finally { connection.dispose(); }
    });
  }, 10000);

  it('does not retry a terminal server close or a consented leave', async () => {
    await withServer(async (port) => {
      const connection = new Connection({ endpoint: `ws://127.0.0.1:${port}`, frames: null });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        await until(() => result.joined);
        const room = ObservedRoom.rooms.find((candidate) =>
          candidate.roomId === connection.activeRoom?.roomId);
        if (room === undefined) throw new Error('room missing');
        room.closeTestClient(CloseCode.InvalidInput);
        await until(() => result.events.some((event) => event.kind === 'terminal'));
        expect(result.events.find((event) => event.kind === 'terminal'))
          .toEqual({ kind: 'terminal', code: CloseCode.InvalidInput });
        await new Promise<void>((resolve) => setTimeout(resolve, 600));
        expect(result.events.some((event) => event.kind === 'reconnecting')).toBe(false);
        result.abort.abort();
      } finally { connection.dispose(); }
    });
    await withServer(async (port) => {
      const connection = new Connection({ endpoint: `ws://127.0.0.1:${port}`, frames: null });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        await until(() => result.joined);
        result.abort.abort();
        await new Promise<void>((resolve) => setTimeout(resolve, 600));
        expect(result.events.some((event) => event.kind === 'reconnecting')).toBe(false);
        expect(connection.activeRoom).toBeNull();
      } finally { connection.dispose(); }
    });
  }, 12000);

  it('AT-NET-12 sends visibility changes, resyncs on return, and echoes the server probe', async () => {
    await withServer(async (port) => {
      let hidden = false;
      const listeners = new Set<() => void>();
      const visibility = {
        get hidden() { return hidden; },
        addEventListener(_type: 'visibilitychange', listener: () => void) { listeners.add(listener); },
        removeEventListener(_type: 'visibilitychange', listener: () => void) { listeners.delete(listener); },
      };
      const connection = new Connection({
        endpoint: `ws://127.0.0.1:${port}`, visibility, frames: null,
      });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        await until(() => result.joined);
        const id = connection.activeRoom?.sessionId;
        const room = ObservedRoom.rooms.find((candidate) =>
          candidate.roomId === connection.activeRoom?.roomId);
        if (id === undefined || room === undefined) throw new Error('room missing');
        hidden = true;
        for (const listener of listeners) listener();
        await until(() => room.controllerFor(id) === Controller.Proxy);
        hidden = false;
        for (const listener of listeners) listener();
        await until(() => room.controllerFor(id) === Controller.Human);
        expect(result.events.some((event) => event.kind === 'resync')).toBe(true);
        await until(() => room.probeMedian(id) !== undefined, 4000);
        expect(room.probeMedian(id)).toBeGreaterThanOrEqual(0);
        result.abort.abort();
        expect(listeners.size).toBe(0);
      } finally { connection.dispose(); }
    });
  }, 10000);

  it('routes ordered numeric messages with typed data and cleans subscriptions on leave', async () => {
    await withServer(async (port) => {
      const connection = new Connection({ endpoint: `ws://127.0.0.1:${port}`, frames: null });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        await until(() => result.joined);
        const room = ObservedRoom.rooms.find((candidate) =>
          candidate.roomId === connection.activeRoom?.roomId);
        if (room === undefined) throw new Error('room missing');
        const start = result.events.length;
        room.sendTestMessages();
        await until(() => result.events.some((event) => event.kind === 'devResult'));
        expect(result.events.slice(start).filter((event) =>
          ['events', 'control', 'afkWarn', 'notice', 'devResult'].includes(event.kind))
          .map((event) => event.kind))
          .toEqual(['events', 'control', 'afkWarn', 'notice', 'devResult']);
        expect(result.events.slice(start).find((event) => event.kind === 'events'))
          .toMatchObject({ kind: 'events', batch: { events: [[EventId.ProjectileExpire, 9]] } });
        expect(result.events.find((event) => event.kind === 'afkWarn'))
          .toEqual({ kind: 'afkWarn', secondsLeft: 7 });
        result.abort.abort();
        const count = result.events.length;
        expect(connection.activeRoom).toBeNull();
        expect(result.events).toHaveLength(count);
      } finally { connection.dispose(); }
    });
  }, 10000);

  it('discards a cancelled join and never enters a match afterward', async () => {
    await withServer(async (port) => {
      const connection = new Connection({ endpoint: `ws://127.0.0.1:${port}`, frames: null });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        result.abort.abort();
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        expect(result.joined).toBe(false);
        expect(connection.activeRoom).toBeNull();
        expect(result.events).toEqual([]);
      } finally { connection.dispose(); }
    });
  }, 10000);

  it('AT-NET-19 keeps the production clock within two true server ticks at 150 ms plus jitter', async () => {
    await withServer(async (port) => {
      let randomIndex = 0;
      const connection = new Connection({
        endpoint: `ws://127.0.0.1:${port}`, search: '?lag=150&jitter=20',
        frames: null, random: () => ((randomIndex++ * 17) % 20) / 20,
      });
      try {
        const result = join(connection, { kind: 'quick', name: 'Tester', code: '' });
        await until(() => result.joined, 6000);
        await until(() => connection.clock.rttSamples().length >= 2, 7000);
        const room = ObservedRoom.rooms.find((candidate) =>
          candidate.roomId === connection.activeRoom?.roomId);
        if (room === undefined) throw new Error('server room missing');
        const errors: number[] = [];
        for (let sample = 0; sample < 10; sample += 1) {
          const estimate = connection.clock.estimatedTick();
          if (estimate === null) throw new Error('missing clock estimate');
          errors.push(Math.abs(estimate - room.currentTick));
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
        }
        expect(Math.max(...errors)).toBeLessThanOrEqual(2);
        result.abort.abort();
      } finally { connection.dispose(); }
    });
  }, 12000);
});
