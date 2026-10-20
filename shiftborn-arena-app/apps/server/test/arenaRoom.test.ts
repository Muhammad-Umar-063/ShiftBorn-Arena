import { createServer as createTcpServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { ColyseusTestServer } from '@colyseus/testing';
import { BALANCE } from '@shiftborn/shared';
import { addPlayer } from '@shiftborn/sim';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { createRoomSeed } from '../src/rooms/roomSeed.js';
import type { ArenaStateRecord } from '../src/rooms/schema.js';
import { createServer } from '../src/server.js';

class HarnessRoom extends ArenaRoom {
  get testWorld() {
    return this.world;
  }
  get loopRunning() {
    return this.fixedLoop.isRunning;
  }
  addTestPlayer(): void {
    addPlayer(this.world, {
      id: 'test-player',
      name: 'Tester',
      isBot: false,
      seat: 0,
    });
    const player = this.world.players[0];
    if (player === null || player === undefined)
      throw new Error('missing test player');
    player.alive = true;
    player.pos = { x: 2, y: -3 };
    this.mirrorNow();
  }
  moveTestPlayer(): void {
    const player = this.world.players[0];
    if (player === null || player === undefined)
      throw new Error('missing test player');
    player.pos = { x: 3.5, y: -4.25 };
    this.mirrorNow();
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

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('T-021 ArenaRoom real Colyseus integration', () => {
  it('generates safe crypto room seeds', () => {
    const seeds = Array.from({ length: 8 }, createRoomSeed);
    expect(seeds.every((seed) => Number.isSafeInteger(seed) && seed >= 0)).toBe(
      true,
    );
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('registers arena, advances 30 Hz, patches 20 Hz, and mirrors a test player', async () => {
    const port = await freePort();
    const config = { ...loadServerConfig({}), port };
    const server = createServer(config, undefined, HarnessRoom);
    let testServer: ColyseusTestServer | undefined;
    let leaveClient: (() => Promise<unknown>) | undefined;
    let room: HarnessRoom | undefined;
    try {
      await server.listen(port, '127.0.0.1');
      testServer = new ColyseusTestServer(server);
      room = await testServer.createRoom<HarnessRoom>('arena');
      const client = await testServer.connectTo(room);
      leaveClient = () => client.leave(true);
      const clientState = client.state as ArenaStateRecord;
      expect(room.roomName).toBe('arena');
      expect(room.patchRate).toBe(1000 / BALANCE.tick.patchRateHz);
      expect(Number.isSafeInteger(room.testWorld.roomSeed)).toBe(true);
      expect(room.state.tick).toBe(room.testWorld.tick);
      expect(clientState.tick).toBeGreaterThanOrEqual(0);
      room.addTestPlayer();
      const patchTimes: number[] = [];
      client.onStateChange(() => patchTimes.push(performance.now()));
      const startTick = room.testWorld.tick;
      const started = performance.now();
      await sleep(1200);
      const durationS = (performance.now() - started) / 1000;
      const tickRate = (room.testWorld.tick - startTick) / durationS;
      const patchRate = patchTimes.length / durationS;
      expect(tickRate).toBeGreaterThan(27);
      expect(tickRate).toBeLessThan(33);
      expect(patchRate).toBeGreaterThan(17);
      expect(patchRate).toBeLessThan(23);
      expect(room.tickMetrics.samples).toBeGreaterThan(25);
      expect(room.tickMetrics.meanMs).toBeGreaterThanOrEqual(0);
      expect(clientState.players.get('test-player')?.x).toBeCloseTo(2, 3);
      expect(clientState.players.get('test-player')?.y).toBeCloseTo(-3, 3);
      room.moveTestPlayer();
      await sleep(125);
      expect(clientState.players.get('test-player')?.x).toBeCloseTo(3.5, 3);
      expect(clientState.players.get('test-player')?.y).toBeCloseTo(-4.25, 3);
    } finally {
      await leaveClient?.();
      await testServer?.cleanup();
      await testServer?.shutdown();
    }
    expect(room?.loopRunning).toBe(false);
  }, 10000);
});
