import { createServer as createTcpServer } from 'node:net';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  BALANCE, ClientMessageId, CloseCode, Controller, DERIVED,
  EventId, InputButton, Phase, PROTOCOL_VERSION, ServerMessageId,
} from '@shiftborn/shared';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { createServer } from '../src/server.js';

class RttRoom extends ArenaRoom {
  clockMs = 1000;

  override onCreate(options: Parameters<ArenaRoom['onCreate']>[0]): void {
    super.onCreate(options);
    this.fixedLoop.stop();
  }

  protected override monotonicNowMs(): number {
    return this.clockMs;
  }

  tick(): void {
    this.runSimulationStep();
  }

  get testWorld() {
    return this.world;
  }

  median(id: string): number | undefined {
    return this.probeTracker.medianFor(id);
  }

  samples(id: string): readonly number[] {
    return this.probeTracker.samplesFor(id);
  }

  queue(id: string) {
    return this.sessionForId(id)?.queue;
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

async function withRoom(run: (room: RttRoom, server: ColyseusTestServer) => Promise<void>) {
  const port = await freePort();
  const server = createServer(
    { ...loadServerConfig({}), port }, pino({ level: 'silent' }), RttRoom,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    const room = await testServer.createRoom<RttRoom>('arena', { code: 'ABC234' });
    await run(room, testServer);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
  }
}

async function join(server: ColyseusTestServer, room: RttRoom) {
  return server.connectTo(room, {
    code: 'ABC234', protocolVersion: PROTOCOL_VERSION, name: 'Tester',
  });
}

describe('T-027 real Colyseus ping and probe wiring', () => {
  it('AT-NET-19 server half: private numeric Pong and Probe, measured RTT, and shared abuse limit', async () => {
    await withRoom(async (room, server) => {
      const first = await join(server, room);
      const second = await join(server, room);
      const firstPongs: unknown[] = [];
      const secondPongs: unknown[] = [];
      const firstProbes: unknown[] = [];
      const secondProbes: unknown[] = [];
      first.onMessage(ServerMessageId.Pong, (payload: unknown) => firstPongs.push(payload));
      second.onMessage(ServerMessageId.Pong, (payload: unknown) => secondPongs.push(payload));
      first.onMessage(ServerMessageId.Probe, (payload: unknown) => firstProbes.push(payload));
      second.onMessage(ServerMessageId.Probe, (payload: unknown) => secondProbes.push(payload));

      room.testWorld.tick = DERIVED.net.pingIntervalTicks - 1;
      first.send(ClientMessageId.Ping, [12.5]);
      await until(() => firstPongs.length === 1);
      expect(firstPongs[0]).toEqual([12.5, room.testWorld.tick, 1000]);
      expect(secondPongs).toHaveLength(0);
      expect(Number.isFinite((firstPongs[0] as number[])[2])).toBe(true);
      room.tick();
      expect(firstProbes).toHaveLength(0);
      room.tick();
      await until(() => firstProbes.length === 1 && secondProbes.length === 1);
      const firstToken = (firstProbes[0] as number[])[0];
      const secondToken = (secondProbes[0] as number[])[0];
      expect(firstToken).not.toBe(secondToken);
      room.tick();
      expect(firstProbes).toHaveLength(1);
      first.send(ClientMessageId.ProbeReply, [secondToken]);
      await until(() => room.queue(first.sessionId)?.counters.total === 1);
      room.clockMs += 200;
      first.send(ClientMessageId.ProbeReply, [firstToken]);
      await until(() => room.median(first.sessionId) === 200);
      expect(room.median(second.sessionId)).toBeUndefined();
      first.send(ClientMessageId.ProbeReply, [firstToken]);
      await until(() => room.queue(first.sessionId)?.counters.total === 2);
      first.send(ClientMessageId.Ping, []);
      await until(() => room.queue(first.sessionId)?.counters.total === 3);
      const left = new Promise<number>((resolve) => first.onLeave(resolve));
      for (let index = 0; index < 47; index += 1)
        first.send(ClientMessageId.ProbeReply, [-1]);
      expect(await left).toBe(CloseCode.InvalidInput);
      expect(room.queue(first.sessionId)?.counters.total).toBe(50);
      second.send(ClientMessageId.Ping, [0]);
      await until(() => secondPongs.length === 1);
      expect(secondPongs[0]).toEqual([0, room.testWorld.tick, room.clockMs]);
      await second.leave(true);
    });
  }, 10000);

  it('AT-WPN-14 uses the normal input path and server RTT for three collision-checked extra steps', async () => {
    await withRoom(async (room, server) => {
      const shooterClient = await join(server, room);
      const otherClient = await join(server, room);
      const shooter = room.testWorld.players.find((player) => player?.id === shooterClient.sessionId);
      const other = room.testWorld.players.find((player) => player?.id === otherClient.sessionId);
      if (shooter === undefined || shooter === null || other === undefined || other === null)
        throw new Error('missing players');
      for (const player of room.testWorld.players) {
        if (player?.isBot) {
          player.alive = false;
          player.respawnTick = 10000;
        }
      }
      shooter.pos = { x: 0, y: 0 };
      shooter.vel = { x: 0, y: 0 };
      other.pos = { x: 0, y: 4 };
      other.vel = { x: 0, y: 0 };
      shooter.protectedEndTick = 0;
      other.protectedEndTick = 0;
      room.testWorld.tick = DERIVED.net.pingIntervalTicks;
      room.testWorld.phase = Phase.Playing;
      room.testWorld.phaseEndTick = room.testWorld.tick + DERIVED.match.durationTicks;
      const probes: unknown[] = [];
      shooterClient.onMessage(ServerMessageId.Probe, (payload: unknown) => probes.push(payload));
      room.tick();
      await until(() => probes.length === 1);
      room.clockMs += 200;
      shooterClient.send(ClientMessageId.ProbeReply, probes[0]);
      await until(() => room.median(shooter.id) === 200);
      expect(room.samples(other.id)).toEqual([]);
      const batches: unknown[] = [];
      shooterClient.onMessage(ServerMessageId.Ev, (payload: unknown) => batches.push(payload));
      shooterClient.send(ClientMessageId.Input, [1, 0, 0, 0, InputButton.Fire, 0]);
      otherClient.send(ClientMessageId.ClientStats, {
        fpsMedian: 60, fpsP5: 45, rttMs: 9999, corrections: 0,
        inputScheme: 'mouse', windowW: 1280, windowH: 720,
        browser: 'Chromium', hiddenMs: 0, errors: 0,
      });
      otherClient.send(ClientMessageId.Input, [1, 0, 0, 0, InputButton.Fire, 0]);
      await until(() => room.queue(shooter.id)?.lastReceivedSeq === 1 && room.queue(other.id)?.lastReceivedSeq === 1);
      room.tick();
      const spawns = room.testWorld.events.filter((event) => event.type === 'projectileSpawn');
      expect(spawns).toHaveLength(2);
      const shot = spawns.find((event) => event.ownerSeat === shooter.seat);
      const otherShot = spawns.find((event) => event.ownerSeat === other.seat);
      expect(shot?.advancedTicks).toBe(DERIVED.weapons.spawnAdvanceMaxTicks);
      expect(otherShot?.advancedTicks).toBe(0);
      expect(room.testWorld.events.some((event) => event.type === 'projectileImpact')).toBe(true);
      expect(room.testWorld.projectiles.some((projectile) => projectile.ownerId === shooter.id)).toBe(false);
      expect(room.testWorld.projectiles.find((projectile) => projectile.ownerId === other.id)?.traveledM)
        .toBeCloseTo(DERIVED.weapons.pulsePistol.projSpeedMPerTick, 10);
      await until(() => batches.length > 0);
      expect(JSON.stringify(batches)).toContain(String(EventId.ProjectileSpawn));
      // Move the same shooter to an open lane; the next real firing tick
      // proves the three extra steps and the ordinary projectile step.
      shooter.pos = { x: 0, y: 4 };
      other.pos = { x: -25, y: 25 };
      let openLaneShot = false;
      for (let tick = 0; tick < BALANCE.tick.rateHz; tick += 1) {
        room.tick();
        if (room.testWorld.events.some((event) =>
          event.type === 'projectileSpawn' && event.ownerSeat === shooter.seat)) {
          openLaneShot = true;
          break;
        }
      }
      expect(openLaneShot).toBe(true);
      expect(room.testWorld.projectiles.find((projectile) => projectile.ownerId === shooter.id)?.traveledM)
        .toBeCloseTo((DERIVED.weapons.spawnAdvanceMaxTicks + 1) *
          DERIVED.weapons.pulsePistol.projSpeedMPerTick, 10);
      otherClient.send(ClientMessageId.Vis, [1]);
      await until(() => other.controller === Controller.Proxy);
      expect(room.median(other.id)).toBeUndefined();
      await shooterClient.leave(true);
      await otherClient.leave(true);
    });
  }, 10000);
});
