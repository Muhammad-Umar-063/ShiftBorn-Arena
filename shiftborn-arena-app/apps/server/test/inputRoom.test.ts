import { createServer as createTcpServer } from 'node:net';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  BALANCE,
  ClientAimSourceCode,
  ClientMessageId,
  CloseCode,
  Form,
  InputButton,
  Phase,
  PROTOCOL_VERSION,
} from '@shiftborn/shared';
import { addPlayer } from '@shiftborn/sim';
import { startMatch } from '../../../packages/sim/src/match.js';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';
import { InputQueue } from '../src/net/inputQueue.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { createServer, MAX_WS_MESSAGE_BYTES } from '../src/server.js';

class InputHarnessRoom extends ArenaRoom {
  protected override botFillEnabled = false;

  override onJoin(): void {
    // T-022 tests explicitly bound input sources independent of seat policy.
  }

  readonly testQueues = new Map<number, InputQueue>();

  preparePlayer(seat: number): void {
    addPlayer(this.world, {
      id: `player-${seat}`,
      name: `Player ${seat}`,
      isBot: false,
      seat,
    });
    const player = this.world.players[seat];
    if (player === null || player === undefined)
      throw new Error('missing player');
    player.alive = true;
    player.flux = BALANCE.flux.max;
    this.world.phase = Phase.Playing;
    this.world.phaseEndTick = this.world.tick + BALANCE.tick.rateHz * 30;
    this.mirrorNow();
  }

  bindTestClient(seat: number): InputQueue {
    const client = this.clients[seat];
    if (client === undefined) throw new Error('missing client');
    const queue = this.bindInputSource(client, `player-${seat}`, seat);
    this.testQueues.set(seat, queue);
    return queue;
  }

  rebindTestClient(seat: number, queue: InputQueue): InputQueue {
    const client = this.clients[seat];
    if (client === undefined) throw new Error('missing client');
    return this.bindInputSource(client, `player-${seat}`, seat, queue);
  }

  stopTestLoop(): void {
    this.fixedLoop.stop();
  }

  advanceTestTick(): void {
    this.runSimulationStep();
  }

  startTestMatch(): void {
    startMatch(this.world);
    this.mirrorNow();
  }

  get testWorld() {
    return this.world;
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

function input(seq: number, buttons = 0): number[] {
  return [seq, 0, 0, 0, buttons, ClientAimSourceCode.Mouse,
    120, ...Array(8).fill(0)];
}

async function withRoom(
  test: (room: InputHarnessRoom, server: ColyseusTestServer) => Promise<void>,
): Promise<void> {
  const port = await freePort();
  const server = createServer(
    { ...loadServerConfig({}), port },
    pino({ level: 'silent' }),
    InputHarnessRoom,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    const room = await testServer.createRoom<InputHarnessRoom>('arena', {
      code: '',
    });
    room.stopTestLoop();
    await test(room, testServer);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
  }
}

describe('T-022 real Colyseus input pipeline', () => {
  it('AT-NET-03 accepts numeric ID 1, merges a released morph edge, and mirrors lastInputSeq', async () => {
    await withRoom(async (room, server) => {
      room.preparePlayer(0);
      const client = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: '',
      });
      const queue = room.bindTestClient(0);
      const prepared = room.testWorld.players[0];
      if (prepared === null || prepared === undefined) throw new Error('missing player');
      // D-074 progression is covered by AT-LOAD tests; this test checks the morph edge path.
      prepared.unlocked.beast = true;
      client.send(ClientMessageId.Input, [
        ...input(3),
        ...input(2),
        ...input(1, InputButton.MorphBeast),
      ]);
      client.send(ClientMessageId.Input, [
        ...input(6),
        ...input(5),
        ...input(4),
      ]);
      await until(() => queue.lastReceivedSeq === 6);
      room.advanceTestTick();
      const player = room.testWorld.players[0];
      expect(player?.lastInputSeq).toBe(2);
      expect(player?.lastHeldButtons).toBe(0);
      expect(player?.morph?.target).toBe(Form.Beast);
      expect(room.state.players.get('player-0')?.lastInputSeq).toBe(2);
      expect(room.state.players.get('player-0')?.morphTarget).toBe(1);
      room.advanceTestTick();
      expect(player?.lastInputSeq).toBe(4);
      expect(room.rebindTestClient(0, queue)).toBe(queue);
      room.advanceTestTick();
      room.advanceTestTick();
      expect(player?.lastInputSeq).toBe(6);
      client.send(ClientMessageId.Input, input(7));
      await until(() => queue.lastReceivedSeq === 7);
      room.advanceTestTick();
      expect(player?.lastInputSeq).toBe(7);
      room.startTestMatch();
      expect(player?.lastInputSeq).toBe(7);
      expect(queue.lastReceivedSeq).toBe(7);
      client.send(ClientMessageId.Input, input(8));
      await until(() => queue.lastReceivedSeq === 8);
      room.advanceTestTick();
      expect(player?.lastInputSeq).toBe(8);
      await client.leave(true);
    });
  }, 10000);

  it('AT-SEC-01 drops unknown and malformed messages, kicks only the abusive client with 4003', async () => {
    await withRoom(async (room, server) => {
      room.preparePlayer(0);
      room.preparePlayer(1);
      const bad = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: '',
      });
      const good = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: '',
      });
      const badQueue = room.bindTestClient(0);
      const goodQueue = room.bindTestClient(1);
      const left = new Promise<number>((resolve) => bad.onLeave(resolve));
      bad.send(999, []);
      await until(() => badQueue.counters.unknownMessage === 1);
      bad.send(ClientMessageId.Ping, []);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      // T-027 validates Ping; its malformed tuple shares the abuse counter.
      expect(badQueue.counters.total).toBe(2);
      for (let index = 0; index < 48; index += 1)
        bad.send(ClientMessageId.Input, [1, 2]);
      expect(await left).toBe(CloseCode.InvalidInput);
      expect(badQueue.counters.malformedPacket).toBe(48);
      expect(badQueue.counters.total).toBe(50);
      expect(badQueue.isClosed).toBe(true);
      good.send(ClientMessageId.Input, input(1));
      await until(() => goodQueue.lastReceivedSeq === 1);
      room.advanceTestTick();
      expect(room.testWorld.players[1]?.lastInputSeq).toBe(1);
      expect(goodQueue.counters.total).toBe(0);
      await good.leave(true);
    });
  }, 10000);

  it('AT-SEC-01 enforces the 4 KiB WebSocket maxPayload contract', async () => {
    expect(MAX_WS_MESSAGE_BYTES).toBe(4 * 1024);
    await withRoom(async (room, server) => {
      room.preparePlayer(0);
      const client = await server.connectTo(room, {
        protocolVersion: PROTOCOL_VERSION,
        code: '',
      });
      const queue = room.bindTestClient(0);
      const left = new Promise<number>((resolve) => client.onLeave(resolve));
      client.send(
        ClientMessageId.Input,
        Array.from({ length: MAX_WS_MESSAGE_BYTES + 1 }, () => 1),
      );
      expect(await left).toBe(1009);
      expect(queue.lastReceivedSeq).toBe(0);
      expect(room.testWorld.tick).toBeGreaterThanOrEqual(0);
    });
  }, 10000);
});
