import { createServer as createTcpServer } from 'node:net';
import { type Client } from '@colyseus/core';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  BALANCE,
  ClientMessageId,
  CloseCode,
  Controller,
  DERIVED,
  Phase,
  PROTOCOL_VERSION,
  ServerMessageId,
} from '@shiftborn/shared';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { createServer } from '../src/server.js';

class LifecycleRoom extends ArenaRoom {
  drops = 0;
  reconnects = 0;
  leaves = 0;
  disposed = false;
  readonly controlSends: { id: string; controller: Controller }[] = [];
  readonly warningSends: { id: string; secondsLeft: number }[] = [];
  readonly welcomeSends: string[] = [];
  readonly reconnectionWindows: number[] = [];

  override onCreate(options: Parameters<ArenaRoom['onCreate']>[0]): void {
    super.onCreate(options);
    this.fixedLoop.stop();
  }
  override onDrop(client: Client): void {
    this.drops += 1;
    super.onDrop(client);
  }
  override onReconnect(client: Client): void {
    this.reconnects += 1;
    super.onReconnect(client);
  }
  override onLeave(client: Client): void {
    this.leaves += 1;
    super.onLeave(client);
  }
  override onDispose(): void {
    this.disposed = true;
    super.onDispose();
  }
  protected override reconnectionWindowSeconds(): number {
    const seconds = super.reconnectionWindowSeconds();
    this.reconnectionWindows.push(seconds);
    return seconds;
  }
  protected override sendControl(client: Client, controller: Controller): void {
    this.controlSends.push({ id: client.sessionId, controller });
    super.sendControl(client, controller);
  }
  protected override sendAfkWarning(client: Client, secondsLeft: number): void {
    this.warningSends.push({ id: client.sessionId, secondsLeft });
    super.sendAfkWarning(client, secondsLeft);
  }
  protected override sendWelcome(
    client: Client,
    binding: { readonly playerId: string; readonly seat: number },
  ): void {
    this.welcomeSends.push(client.sessionId);
    super.sendWelcome(client, binding);
  }

  get testWorld() {
    return this.world;
  }
  get loopRunning() {
    return this.fixedLoop.isRunning;
  }
  testSession(id: string) {
    return this.sessionForId(id);
  }
  tick(): void {
    this.runSimulationStep();
  }
  setPlayingTick(tick: number): void {
    this.world.tick = tick;
    this.world.phase = Phase.Playing;
    this.world.phaseEndTick = tick + DERIVED.match.durationTicks;
    this.mirrorNow();
  }
  mark(): void {
    this.mirrorNow();
  }
}

class FastExpiryRoom extends LifecycleRoom {
  protected override reconnectionWindowSeconds(): number {
    return 0.05;
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

async function withRoom<T extends LifecycleRoom>(
  roomClass: typeof LifecycleRoom,
  run: (room: T, server: ColyseusTestServer) => Promise<void>,
): Promise<void> {
  const port = await freePort();
  const server = createServer(
    { ...loadServerConfig({}), port },
    pino({ level: 'silent' }),
    roomClass,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    const room = await testServer.createRoom<T>('arena', { code: 'ABC234' });
    await run(room, testServer);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
  }
}

async function join(server: ColyseusTestServer, room: LifecycleRoom) {
  return server.connectTo(room, {
    code: 'ABC234',
    protocolVersion: PROTOCOL_VERSION,
    name: 'Tester',
  });
}

function input(seq: number, moveX = 0, buttons = 0): number[] {
  return [seq, moveX, 0, 0, buttons, 0];
}

describe('AT-NET-11 real socket reconnect and expiry', () => {
  it('retains the same seat, life, host and input sequence across a drop', async () => {
    await withRoom<LifecycleRoom>(LifecycleRoom, async (room, server) => {
      const client = await join(server, room);
      const id = client.sessionId;
      const token = client.reconnectionToken;
      client.send(ClientMessageId.Input, input(1));
      await until(() => room.testSession(id)?.queue.lastReceivedSeq === 1);
      room.tick();
      const player = room.testWorld.players.find((item) => item?.id === id);
      if (player === null || player === undefined)
        throw new Error('missing player');
      player.stats.kos = 4;
      player.hpFrac = 0.37;
      const originalSeat = player.seat;
      room.mark();
      client.send(ClientMessageId.Input, input(2, 0, 1));
      await until(() => room.testSession(id)?.queue.lastReceivedSeq === 2);
      client.reconnection.enabled = false;
      client.connection.close();
      await until(() => room.drops === 1);
      expect(room.reconnectionWindows).toEqual([BALANCE.net.reconnectS]);
      expect(room.testSession(id)?.queue.lastReceivedSeq).toBe(2);
      expect(room.testSession(id)?.queue.frames).toHaveLength(0);
      expect(room.testSession(id)?.queue.lastHeldButtons).toBe(0);
      expect(room.testWorld.players[originalSeat]).toBe(player);
      expect(player.controller).toBe(Controller.Proxy);
      expect(room.state.players.get(id)?.connected).toBe(false);
      expect(room.state.hostId).toBe(id);
      const rejoined = await server.sdk.reconnect(token);
      await until(() => room.reconnects === 1);
      expect(rejoined.sessionId).toBe(id);
      expect(room.testWorld.players[originalSeat]).toBe(player);
      expect(player.hpFrac).toBe(0.37);
      expect(player.stats.kos).toBe(4);
      expect(player.controller).toBe(Controller.Human);
      expect(room.state.players.get(id)?.connected).toBe(true);
      expect(room.controlSends).toEqual([{ id, controller: Controller.Human }]);
      expect(room.welcomeSends).toEqual([id, id]);
      room.tick();
      expect(player.lastInputSeq).toBe(1);
      rejoined.send(ClientMessageId.Input, input(3, 127));
      await until(() => room.testSession(id)?.queue.lastReceivedSeq === 3);
      room.tick();
      expect(player.lastInputSeq).toBe(3);
      await rejoined.leave(true);
    });
  }, 10000);

  it('expires a dropped host into a normal bot, then disposes bot-only room', async () => {
    await withRoom<FastExpiryRoom>(FastExpiryRoom, async (room, server) => {
      const client = await join(server, room);
      const id = client.sessionId;
      const seat = room.testWorld.players.find(
        (player) => player?.id === id,
      )?.seat;
      if (seat === undefined) throw new Error('missing seat');
      client.reconnection.enabled = false;
      client.connection.close();
      await until(() => room.drops === 1);
      expect(room.testWorld.players[seat]?.controller).toBe(Controller.Proxy);
      expect(room.disposed).toBe(false);
      await until(() => room.leaves === 1);
      expect(room.testWorld.players[seat]?.isBot).toBe(true);
      expect(room.state.hostId).toBe('');
      expect(room.testSession(id)).toBeUndefined();
      await until(() => room.disposed);
      expect(room.loopRunning).toBe(false);
    });
  }, 10000);

  it('keeps the host during a grace period and hands it over on expiry', async () => {
    await withRoom<FastExpiryRoom>(FastExpiryRoom, async (room, server) => {
      const host = await join(server, room);
      const guest = await join(server, room);
      const hostId = host.sessionId;
      const seat = room.testWorld.players.find(
        (player) => player?.id === hostId,
      )?.seat;
      if (seat === undefined) throw new Error('missing host seat');
      host.reconnection.enabled = false;
      host.connection.close();
      await until(() => room.drops === 1);
      expect(room.state.hostId).toBe(hostId);
      expect(room.testWorld.players[seat]?.controller).toBe(Controller.Proxy);
      await until(() => room.leaves === 1);
      expect(room.state.hostId).toBe(guest.sessionId);
      expect(room.testWorld.players[seat]?.isBot).toBe(true);
      expect(room.disposed).toBe(false);
      await guest.leave(true);
      await until(() => room.disposed);
    });
  }, 10000);
});

describe('AT-NET-12 visibility and AT-NET-13 AFK', () => {
  it('switches only the sender to Proxy and back on exact vis messages', async () => {
    await withRoom<LifecycleRoom>(LifecycleRoom, async (room, server) => {
      const first = await join(server, room);
      const second = await join(server, room);
      const firstControls: unknown[] = [];
      const secondControls: unknown[] = [];
      first.onMessage(ServerMessageId.Control, (payload: unknown) =>
        firstControls.push(payload),
      );
      second.onMessage(ServerMessageId.Control, (payload: unknown) =>
        secondControls.push(payload),
      );
      first.send(ClientMessageId.Vis, [1]);
      await until(() => room.controlSends.length === 1);
      await until(() => firstControls.length === 1);
      expect(room.controlSends[0]).toEqual({
        id: first.sessionId,
        controller: Controller.Proxy,
      });
      expect(firstControls).toEqual([[2]]);
      expect(secondControls).toEqual([]);
      expect(room.state.players.get(first.sessionId)?.controller).toBe(2);
      expect(room.state.players.get(first.sessionId)?.connected).toBe(true);
      expect(room.state.players.get(second.sessionId)?.controller).toBe(0);
      first.send(ClientMessageId.Vis, [1]);
      first.send(ClientMessageId.Input, input(1, 127));
      await until(
        () => room.testSession(first.sessionId)?.queue.lastReceivedSeq === 1,
      );
      expect(room.controlSends).toHaveLength(1);
      expect(room.testSession(first.sessionId)?.queue.frames).toHaveLength(0);
      first.send(ClientMessageId.Vis, [0]);
      await until(() => room.controlSends.length === 2);
      await until(() => firstControls.length === 2);
      expect(room.controlSends[1]).toEqual({
        id: first.sessionId,
        controller: Controller.Human,
      });
      expect(firstControls).toEqual([[2], [0]]);
      first.send(ClientMessageId.Vis, [0]);
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(room.controlSends).toHaveLength(2);
      expect(secondControls).toEqual([]);
      await first.leave(true);
      await second.leave(true);
    });
  }, 10000);

  it('warns at 30 s, proxies at 45 s, and applies only the waking frame', async () => {
    await withRoom<LifecycleRoom>(LifecycleRoom, async (room, server) => {
      const first = await join(server, room);
      const firstWarnings: unknown[] = [];
      const firstControls: unknown[] = [];
      first.onMessage(ServerMessageId.AfkWarn, (payload: unknown) =>
        firstWarnings.push(payload),
      );
      first.onMessage(ServerMessageId.Control, (payload: unknown) =>
        firstControls.push(payload),
      );
      room.setPlayingTick(DERIVED.net.afkWarnTicks - 1);
      const second = await join(server, room);
      const secondWarnings: unknown[] = [];
      const secondControls: unknown[] = [];
      second.onMessage(ServerMessageId.AfkWarn, (payload: unknown) =>
        secondWarnings.push(payload),
      );
      second.onMessage(ServerMessageId.Control, (payload: unknown) =>
        secondControls.push(payload),
      );
      room.tick();
      await until(() => firstWarnings.length === 1);
      expect(firstWarnings).toEqual([[15]]);
      expect(secondWarnings).toEqual([]);
      expect(room.warningSends).toEqual([
        {
          id: first.sessionId,
          secondsLeft: BALANCE.net.afkBotS - BALANCE.net.afkWarnS,
        },
      ]);
      room.tick();
      expect(room.warningSends).toHaveLength(1);
      room.setPlayingTick(DERIVED.net.afkBotTicks - 1);
      room.tick();
      await until(() => firstControls.length === 1);
      expect(firstControls).toEqual([[2]]);
      expect(secondControls).toEqual([]);
      expect(room.controlSends).toEqual([
        { id: first.sessionId, controller: Controller.Proxy },
      ]);
      first.send(ClientMessageId.Input, input(1));
      await until(
        () => room.testSession(first.sessionId)?.queue.lastReceivedSeq === 1,
      );
      room.tick();
      expect(
        room.testWorld.players.find((item) => item?.id === first.sessionId)
          ?.controller,
      ).toBe(Controller.Proxy);
      first.send(ClientMessageId.Input, input(2, 127));
      await until(
        () => room.testSession(first.sessionId)?.queue.lastReceivedSeq === 2,
      );
      for (let seq = 3; seq <= 11; seq += 1)
        first.send(ClientMessageId.Input, input(seq));
      await until(
        () => room.testSession(first.sessionId)?.queue.lastReceivedSeq === 11,
      );
      room.tick();
      const player = room.testWorld.players.find(
        (item) => item?.id === first.sessionId,
      );
      expect(player?.controller).toBe(Controller.Human);
      expect(player?.lastInputSeq).toBe(2);
      expect(room.testSession(first.sessionId)?.queue.frames).toHaveLength(0);
      expect(room.controlSends.at(-1)).toEqual({
        id: first.sessionId,
        controller: Controller.Human,
      });
      await until(() => firstControls.length === 2);
      expect(firstControls).toEqual([[2], [0]]);
      expect(secondControls).toEqual([]);
      expect(
        room.warningSends.every((sent) => sent.id === first.sessionId),
      ).toBe(true);
      await first.leave(true);
      await second.leave(true);
    });
  }, 10000);

  it('counts malformed vis with the existing abuse counter', async () => {
    await withRoom<LifecycleRoom>(LifecycleRoom, async (room, server) => {
      const client = await join(server, room);
      for (const payload of [[true], ['1'], [1, 0], {}, [NaN]])
        client.send(ClientMessageId.Vis, payload);
      await until(
        () =>
          room.testSession(client.sessionId)?.queue.counters.unknownMessage ===
          5,
      );
      expect(room.state.players.get(client.sessionId)?.controller).toBe(0);
      await client.leave(true);
    });
  }, 10000);

  it('kicks at 50 malformed vis messages without offering reconnection', async () => {
    await withRoom<LifecycleRoom>(LifecycleRoom, async (room, server) => {
      const client = await join(server, room);
      const id = client.sessionId;
      const left = new Promise<number>((resolve) => client.onLeave(resolve));
      for (let index = 0; index < 50; index += 1)
        client.send(ClientMessageId.Vis, [true]);
      expect(await left).toBe(CloseCode.InvalidInput);
      await until(() => room.leaves === 1);
      // The pinned core invokes onDrop for this close code, but the room
      // recognizes its explicit final-close marker and skips reconnection.
      expect(room.drops).toBe(1);
      expect(room.reconnectionWindows).toEqual([]);
      expect(room.testSession(id)).toBeUndefined();
      await until(() => room.disposed);
    });
  }, 10000);
});

describe('AT-NET-16 room disposal', () => {
  it('keeps one of two humans alive and disposes after the last consented leave', async () => {
    await withRoom<LifecycleRoom>(LifecycleRoom, async (room, server) => {
      const first = await join(server, room);
      const second = await join(server, room);
      await first.leave(true);
      expect(room.disposed).toBe(false);
      expect(room.state.hostId).toBe(second.sessionId);
      await second.leave(true);
      await until(() => room.disposed);
      expect(room.loopRunning).toBe(false);
    });
  }, 10000);
});
