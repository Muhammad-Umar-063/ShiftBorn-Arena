import { createServer as createTcpServer } from 'node:net';
import { ErrorCode, type Client } from '@colyseus/core';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  BALANCE,
  balanceHash,
  CloseCode,
  EventId,
  PROTOCOL_VERSION,
  Phase,
  ServerMessageId,
} from '@shiftborn/shared';
import { addPlayer } from '@shiftborn/sim';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';
import { authenticatePlayer, authenticatedPlayer } from '../src/rooms/auth.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { createServer } from '../src/server.js';

class AuthHarnessRoom extends ArenaRoom {
  protected override botFillEnabled = false;

  readonly joinedNames: string[] = [];

  onJoin(client: Client): void {
    this.joinedNames.push(authenticatedPlayer(client.auth)?.name ?? 'missing');
  }

  get testWorld() {
    return this.world;
  }

  stopTestLoop(): void {
    this.fixedLoop.stop();
  }

  bindTestPlayer(seat: number): void {
    const client = this.clients[0];
    if (client === undefined) throw new Error('missing client');
    addPlayer(this.world, {
      id: client.sessionId,
      name: this.joinedNames[0] ?? 'missing',
      isBot: false,
      seat,
    });
    this.bindInputSource(client, client.sessionId, seat);
  }

  setTestTick(tick: number): void {
    this.world.tick = tick;
    this.mirrorNow();
  }

  rebindTestPlayer(): void {
    const client = this.clients[0];
    const player = this.world.players[2];
    if (client === undefined || player === null || player === undefined)
      throw new Error('missing bound player');
    this.bindInputSource(client, player.id, player.seat);
  }

  advanceTestTick(): void {
    this.runSimulationStep();
  }

  sendTestLifecycleEvent(): void {
    this.broadcastEncodedEventsAtCurrentTick([[EventId.ProjectileExpire, 9]]);
  }

  attemptWelcomeWithoutBinding(): void {
    const client = this.clients[0];
    if (client === undefined) throw new Error('missing client');
    this.sendWelcome(client, { playerId: client.sessionId, seat: 2 });
  }
}

async function freePort(): Promise<number> {
  const socket = createTcpServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (typeof address !== 'object' || address === null)
    throw new Error('port missing');
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return address.port;
}

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for socket');
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

async function withRoom(
  test: (
    room: AuthHarnessRoom,
    server: ColyseusTestServer,
    port: number,
  ) => Promise<void>,
): Promise<void> {
  const port = await freePort();
  const server = createServer(
    { ...loadServerConfig({ BUILD_ID: 'trusted-build' }), port },
    pino({ level: 'silent' }),
    AuthHarnessRoom,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    const room = await testServer.createRoom<AuthHarnessRoom>('arena', {
      code: '',
    });
    room.stopTestLoop();
    await test(room, testServer, port);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
  }
}

describe('T-023 real Colyseus authentication and welcome', () => {
  it('AT-NET-05 rejects invalid versions with wire code 4000 before room join', async () => {
    await withRoom(async (room, server, port) => {
      for (const options of [
        {},
        { protocolVersion: PROTOCOL_VERSION + 1 },
        { protocolVersion: String(PROTOCOL_VERSION) },
        { protocolVersion: PROTOCOL_VERSION + 0.5 },
      ]) {
        // Pinned SDK maps matchmaking failures to their HTTP status (400).
        await expect(server.connectTo(room, options)).rejects.toMatchObject({
          code: 400,
        });
        const response = await fetch(
          `http://127.0.0.1:${port}/matchmake/joinById/${room.roomId}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(options),
          },
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          code: CloseCode.VersionMismatch,
          error: 'Protocol version mismatch',
        });
        expect(room.clients).toHaveLength(0);
        expect(room.testWorld.players.every((player) => player === null)).toBe(
          true,
        );
      }
      const valid = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: '',
        name: ' Alice ',
      });
      expect(room.joinedNames).toEqual(['Alice']);
      await valid.leave(true);
    });
  }, 10000);

  it('AT-SEC-02 sanitizes names in auth and rejects overlength without leaking input', async () => {
    const raw = Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      code: '',
      name: '<b>X</b>',
    });
    expect(authenticatePlayer(raw, '')).toEqual(authenticatePlayer(raw, ''));
    expect(authenticatePlayer(raw, '').name).toMatch(/^[A-Za-z0-9 _-]{1,16}$/);
    expect(raw.name).toBe('<b>X</b>');
    expect(() =>
      authenticatePlayer(
        { protocolVersion: PROTOCOL_VERSION, code: '', name: 'X'.repeat(17) },
        '',
      ),
    ).toThrowError();
    try {
      authenticatePlayer(
        { protocolVersion: PROTOCOL_VERSION, code: '', name: 'X'.repeat(17) },
        '',
      );
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.AUTH_FAILED });
      expect(String(error)).not.toContain('X'.repeat(17));
    }
    await withRoom(async (room, server) => {
      await expect(
        server.connectTo(room, {
          protocolVersion: PROTOCOL_VERSION,
          code: '',
          name: 'X'.repeat(17),
        }),
      ).rejects.toMatchObject({ code: ErrorCode.AUTH_FAILED });
      const client = await server.connectTo(room, raw);
      expect(room.joinedNames[0]).toMatch(/^[A-Za-z0-9 _-]{1,16}$/);
      expect(room.joinedNames[0]).not.toContain('<');
      await client.leave(true);
    });
  }, 10000);

  it('sends ID 100 welcome only for a real binding and refreshes it on rebind', async () => {
    await withRoom(async (room, server) => {
      const client = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: '',
        name: 'Bob',
        buildId: 'untrusted-build',
      });
      const welcomes: unknown[] = [];
      client.onMessage(ServerMessageId.Welcome, (payload: unknown) =>
        welcomes.push(payload),
      );
      expect(() => room.attemptWelcomeWithoutBinding()).toThrow(/binding/);
      expect(welcomes).toEqual([]);
      room.setTestTick(37);
      room.bindTestPlayer(2);
      await until(() => welcomes.length === 1);
      expect(welcomes[0]).toEqual({
        protocolVersion: PROTOCOL_VERSION,
        buildId: 'trusted-build',
        playerId: client.sessionId,
        seat: 2,
        isHost: false,
        roomCode: '',
        mapId: room.testWorld.map.id,
        balanceVersion: BALANCE.version,
        balanceHash: balanceHash(),
        serverTick: 37,
        tickRate: BALANCE.tick.rateHz,
        patchRate: BALANCE.tick.patchRateHz,
        testerCode: client.sessionId.slice(0, 6),
      });
      room.setTestTick(38);
      room.rebindTestPlayer();
      await until(() => welcomes.length === 2);
      expect(welcomes[1]).toMatchObject({ serverTick: 38, seat: 2 });
      expect(JSON.stringify(welcomes)).not.toContain('untrusted-build');
      await client.leave(true);
    });
  }, 10000);

  it('sends one ID 102 batch with the pre-step tick and does not duplicate empty ticks', async () => {
    await withRoom(async (room, server) => {
      const client = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: '',
      });
      const batches: unknown[] = [];
      client.onMessage(ServerMessageId.Ev, (payload: unknown) =>
        batches.push(payload),
      );
      room.setTestTick(room.testWorld.phaseEndTick);
      const before = room.testWorld.tick;
      room.advanceTestTick();
      await until(() => batches.length === 1);
      expect(batches[0]).toEqual([
        before,
        [EventId.Phase, Phase.Playing, room.testWorld.phaseEndTick],
      ]);
      room.advanceTestTick();
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      expect(batches).toHaveLength(1);
      room.sendTestLifecycleEvent();
      await until(() => batches.length === 2);
      expect(batches[1]).toEqual([
        room.testWorld.tick,
        [EventId.ProjectileExpire, 9],
      ]);
      room.advanceTestTick();
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      expect(batches).toHaveLength(2);
      expect(Object.keys(room.state)).not.toContain('projectiles');
      await client.leave(true);
    });
  }, 10000);
});
