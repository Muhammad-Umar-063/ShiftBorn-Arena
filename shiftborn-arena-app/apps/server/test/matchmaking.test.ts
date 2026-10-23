import { createServer as createTcpServer } from 'node:net';
import { matchMaker, type Client } from '@colyseus/core';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  BALANCE,
  BotDifficultyCode,
  ClientMessageId,
  CloseCode,
  DERIVED,
  Mode,
  Phase,
  PROTOCOL_VERSION,
  ServerMessageId,
} from '@shiftborn/shared';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerConfig, type ServerConfig } from '../src/config.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { createServer } from '../src/server.js';

class MatchHarnessRoom extends ArenaRoom {
  lockCalls = 0;
  unlockCalls = 0;
  override onCreate(options: Parameters<ArenaRoom['onCreate']>[0]): void {
    super.onCreate(options);
    this.fixedLoop.stop();
  }

  get testWorld() {
    return this.world;
  }
  tick(): void {
    this.runSimulationStep();
  }
  setPlayingRemaining(ticks: number): void {
    this.world.phase = Phase.Playing;
    this.world.phaseEndTick = this.world.tick + ticks;
    this.mirrorNow();
  }
  setResultsDue(): void {
    this.world.phase = Phase.Results;
    this.world.phaseEndTick = this.world.tick;
    this.mirrorNow();
  }
  get activeBotFill(): boolean {
    return this.botFillEnabled;
  }
  override lock(): Promise<void> {
    this.lockCalls += 1;
    return super.lock();
  }
  override unlock(): Promise<void> {
    this.unlockCalls += 1;
    return super.unlock();
  }
  queueFor(id: string) {
    return this.inputQueueForSession(id);
  }
  resendWelcome(id: string): void {
    const client = this.clients.find((item: Client) => item.sessionId === id);
    const player = this.world.players.find((item) => item?.id === id);
    if (client === undefined || player === null || player === undefined)
      throw new Error('missing bound client');
    this.sendWelcome(client, { playerId: id, seat: player.seat });
  }
}

type SocketRoom = Awaited<
  ReturnType<ColyseusTestServer['sdk']['joinOrCreate']>
>;
type Context = {
  readonly testServer: ColyseusTestServer;
  readonly port: number;
  join(code: string, options?: Record<string, unknown>): Promise<SocketRoom>;
  room(id: string): MatchHarnessRoom;
};

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
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

async function withServer(
  run: (context: Context) => Promise<void>,
  env: Readonly<Record<string, string | undefined>> = {},
): Promise<void> {
  const port = await freePort();
  const config: ServerConfig = { ...loadServerConfig(env), port };
  const server = createServer(
    config,
    pino({ level: 'silent' }),
    MatchHarnessRoom,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    const running = testServer;
    const context: Context = {
      testServer: running,
      port,
      async join(code, options = {}) {
        const socket = await running.sdk.joinOrCreate('arena', {
          code,
          protocolVersion: PROTOCOL_VERSION,
          name: 'Tester',
          ...options,
        });
        return socket;
      },
      room(id) {
        const room = running.getRoomById(id) as MatchHarnessRoom | undefined;
        if (room === undefined) throw new Error('room missing');
        return room;
      },
    };
    await run(context);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
  }
}

describe('AT-NET-14 real matchmaking and code rooms', () => {
  it('groups exact codes, keeps quick play separate, and packs the fullest room', async () => {
    await withServer(async ({ join, room }) => {
      const a = await join('ABC234', { testerTag: 'R1' });
      const b = await join('ABC234', { testerTag: 'R2', inputScheme: 'keys' });
      const c = await join('XYZ234');
      const q1 = await join('');
      const q2 = await join('', { name: 'Other', testerTag: 'R3' });
      expect(a.roomId).toBe(b.roomId);
      expect(a.roomId).not.toBe(c.roomId);
      expect(a.roomId).not.toBe(q1.roomId);
      expect(q1.roomId).toBe(q2.roomId);
      const empty = await matchMaker.createRoom('arena', { code: '' });
      expect(empty.roomId).not.toBe(q1.roomId);
      expect(room(a.roomId).metadata).toEqual({ code: 'ABC234' });
      expect(room(q1.roomId).metadata).toEqual({ code: '' });
      expect(room(a.roomId).state.hostId).toBe(a.sessionId);
      expect(room(q1.roomId).state.hostId).toBe('');
      const welcome: unknown[] = [];
      a.onMessage(ServerMessageId.Welcome, (payload: unknown) =>
        welcome.push(payload),
      );
      room(a.roomId).resendWelcome(a.sessionId);
      await until(() => welcome.length === 1);
      expect(welcome[0]).toMatchObject({
        roomCode: 'ABC234',
        isHost: true,
        playerId: a.sessionId,
      });
      const q3 = await join('');
      expect(q3.roomId).toBe(q1.roomId);
    });
  });

  it('rejects malformed and missing codes before creating an orphan room', async () => {
    await withServer(async ({ testServer, port }) => {
      for (const options of [
        {},
        { code: 23 },
        { code: 'abc234' },
        { code: 'ABC0IO' },
        { code: ' ABC234' },
        { code: 'ABC234 ' },
      ]) {
        await expect(
          testServer.sdk.joinOrCreate('arena', {
            protocolVersion: PROTOCOL_VERSION,
            ...options,
          }),
        ).rejects.toMatchObject({ code: 400 });
        const response = await fetch(
          `http://127.0.0.1:${port}/matchmake/joinOrCreate/arena`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              protocolVersion: PROTOCOL_VERSION,
              ...options,
            }),
          },
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          code: CloseCode.InvalidRoomCode,
          error: 'Invalid room code',
        });
      }
      expect(await matchMaker.query({ name: 'arena' })).toHaveLength(0);
    });
  });

  it('keeps a full code room discoverable and rejects ninth or simultaneous extra humans', async () => {
    await withServer(async ({ join, room }) => {
      const sockets: SocketRoom[] = [];
      for (let seat = 0; seat < BALANCE.match.seats; seat += 1)
        sockets.push(await join('ABC234'));
      const id = sockets[0]?.roomId;
      if (id === undefined) throw new Error('room missing');
      expect(new Set(sockets.map((socket) => socket.roomId))).toEqual(
        new Set([id]),
      );
      await expect(join('ABC234')).rejects.toMatchObject({
        code: CloseCode.RoomFull,
      });
      expect(
        (await Promise.allSettled([join('ABC234'), join('ABC234')])).every(
          (result) => result.status === 'rejected',
        ),
      ).toBe(true);
      expect(
        (await matchMaker.query({ name: 'arena' })).filter(
          (entry) => entry.metadata?.code === 'ABC234',
        ),
      ).toHaveLength(1);
      expect(
        room(id).testWorld.players.filter((player) => player && !player.isBot),
      ).toHaveLength(8);
      expect(
        new Set(room(id).testWorld.players.map((player) => player?.id)).size,
      ).toBe(8);
    });
  });

  it('serializes simultaneous first joins for one code', async () => {
    await withServer(async ({ join }) => {
      const [a, b] = await Promise.all([join('ABC234'), join('ABC234')]);
      expect(a.roomId).toBe(b.roomId);
      const rooms = await matchMaker.query({ name: 'arena' });
      expect(
        rooms.filter((entry) => entry.metadata?.code === 'ABC234'),
      ).toHaveLength(1);
    });
  });

  it('routes a ninth quick-play human to a new room and ignores untrusted defaults', async () => {
    await withServer(async ({ join, room }) => {
      const first = await join('', {
        trustedBuildId: 'spoof',
        trustedBotDifficulty: 'hard',
        trustedQuickplayMode: 'zoneFrenzy',
      });
      expect(room(first.roomId).state.mode).toBe(0);
      expect(room(first.roomId).state.settings.botDifficulty).toBe(
        BotDifficultyCode.Normal,
      );
      for (let seat = 1; seat < BALANCE.match.seats; seat += 1)
        expect((await join('')).roomId).toBe(first.roomId);
      const ninth = await join('');
      expect(ninth.roomId).not.toBe(first.roomId);
    });
  });
});

describe('AT-NET-15 and AT-MATCH-07 late-join boundary', () => {
  it('admits 61-second joins, locks quick play at 60, skips it, and unlocks at RESULTS', async () => {
    await withServer(async ({ join, room }) => {
      const quick = await join('');
      const active = room(quick.roomId);
      active.setPlayingRemaining(DERIVED.match.lateJoinCutoffTicks + 1);
      const early = await join('');
      expect(early.roomId).toBe(quick.roomId);
      expect(
        active.testWorld.players.find(
          (player) => player?.id === early.sessionId,
        )?.alive,
      ).toBe(true);
      active.tick();
      expect(active.state.tick).toBe(1);
      await until(() => active.locked);
      expect(active.lockCalls).toBe(1);
      active.tick();
      expect(active.lockCalls).toBe(1);
      const late = await join('');
      expect(late.roomId).not.toBe(quick.roomId);
      active.setResultsDue();
      active.tick();
      await until(() => !active.locked);
      expect(active.unlockCalls).toBe(1);
      const reopened = await join('');
      expect(reopened.roomId).toBe(quick.roomId);
    });
  });

  it('accepts code-room late humans dead and starts them once at next countdown', async () => {
    await withServer(async ({ join, room }) => {
      const first = await join('ABC234');
      const active = room(first.roomId);
      active.setPlayingRemaining(DERIVED.match.lateJoinCutoffTicks);
      const exact = await join('ABC234');
      const exactPlayer = active.testWorld.players.find(
        (item) => item?.id === exact.sessionId,
      );
      expect(exactPlayer?.alive).toBe(false);
      active.setPlayingRemaining(
        DERIVED.match.lateJoinCutoffTicks - BALANCE.tick.rateHz,
      );
      const late = await join('ABC234');
      const player = active.testWorld.players.find(
        (item) => item?.id === late.sessionId,
      );
      expect(player?.alive).toBe(false);
      expect(active.locked).toBe(false);
      expect(active.lockCalls).toBe(0);
      late.send(ClientMessageId.Input, [1, 127, 0, 0, 1, 0,
        120, ...Array(8).fill(0)]);
      await until(() => active.queueFor(late.sessionId)?.lastReceivedSeq === 1);
      active.tick();
      expect(player?.lastInputSeq).toBe(-1);
      expect(active.queueFor(late.sessionId)?.frames).toHaveLength(1);
      active.setResultsDue();
      active.tick();
      expect(active.testWorld.phase).toBe(Phase.Countdown);
      expect(player?.alive).toBe(true);
      expect(active.queueFor(late.sessionId)?.frames).toHaveLength(0);
      expect(
        active.testWorld.events.filter(
          (event) => event.type === 'spawn' && event.seat === player?.seat,
        ),
      ).toHaveLength(1);
      expect(
        active.testWorld.events.filter(
          (event) => event.type === 'spawn' && event.seat === exactPlayer?.seat,
        ),
      ).toHaveLength(1);
      active.setResultsDue();
      const resultJoin = await join('ABC234');
      const resultPlayer = active.testWorld.players.find(
        (item) => item?.id === resultJoin.sessionId,
      );
      expect(resultPlayer?.alive).toBe(false);
      active.tick();
      expect(
        active.testWorld.events.filter(
          (event) =>
            event.type === 'spawn' && event.seat === resultPlayer?.seat,
        ),
      ).toHaveLength(1);
    });
  });
});

describe('AT-MATCH-08 and AT-SEC-03 host settings', () => {
  it('holds settings pending, applies them at COUNTDOWN, and hands host to lowest seat', async () => {
    await withServer(async ({ join, room }) => {
      const host = await join('ABC234');
      const guest = await join('ABC234');
      const active = room(host.roomId);
      const guestNotices: unknown[] = [];
      guest.onMessage(ServerMessageId.Notice, (payload: unknown) =>
        guestNotices.push(payload),
      );
      expect(active.state.hostId).toBe(host.sessionId);
      expect(active.state.settings.botDifficulty).toBe(
        BotDifficultyCode.Normal,
      );
      guest.send(ClientMessageId.HostSettings, {
        botFill: false,
        botDifficulty: 2,
        nextMode: 1,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(active.state.settings.botFill).toBe(true);
      host.send(ClientMessageId.HostSettings, {
        botFill: false,
        botDifficulty: 2,
        nextMode: 1,
      });
      await until(() => active.state.settings.botFill === false);
      await until(() => guestNotices.length === 1);
      expect(guestNotices[0]).toEqual({
        kind: 'settingsPending',
        text: 'Changes apply at the next match.',
      });
      expect(active.testWorld.mode).toBe(Mode.Frenzy);
      expect(active.activeBotFill).toBe(true);
      expect(active.state.settings.botDifficulty).toBe(BotDifficultyCode.Hard);
      active.setResultsDue();
      active.tick();
      expect(active.testWorld.mode).toBe(Mode.ZoneFrenzy);
      expect(active.activeBotFill).toBe(false);
      expect(
        active.testWorld.players.filter((player) => player?.isBot),
      ).toHaveLength(0);
      expect(
        active.testWorld.events.filter((event) => event.type === 'spawn'),
      ).toHaveLength(2);
      await until(() => guestNotices.length === 2);
      expect(guestNotices[1]).toEqual({
        kind: 'settingsApplied',
        text: 'Room settings applied.',
      });
      await host.leave(true);
      await until(() => active.state.hostId === guest.sessionId);
      await until(() => guestNotices.length === 3);
      expect(guestNotices[2]).toEqual({
        kind: 'hostChanged',
        text: 'The room host changed.',
      });
      expect(active.state.settings.botDifficulty).toBe(BotDifficultyCode.Hard);
    });
  }, 10000);

  it('fills empty seats at the next match and alternates trusted quick-play mode', async () => {
    await withServer(
      async ({ join, room }) => {
        const quick = await join('');
        const active = room(quick.roomId);
        expect(active.state.mode).toBe(0);
        expect(active.state.settings.nextMode).toBe(1);
        expect(active.state.settings.botDifficulty).toBe(
          BotDifficultyCode.Hard,
        );
        active.setResultsDue();
        active.tick();
        expect(active.state.mode).toBe(1);
        expect(active.state.settings.nextMode).toBe(0);
        active.setResultsDue();
        active.tick();
        expect(active.state.mode).toBe(0);
        expect(active.state.settings.nextMode).toBe(1);
      },
      { QUICKPLAY_MODE: 'alternate', BOT_DIFFICULTY: 'hard' },
    );
  });

  it('preserves pending settings across host departure and refills bots once when enabled', async () => {
    await withServer(async ({ join, room }) => {
      const host = await join('ABC234');
      const guest = await join('ABC234');
      const active = room(host.roomId);
      host.send(ClientMessageId.HostSettings, {
        botFill: false,
        botDifficulty: BotDifficultyCode.Easy,
        nextMode: 1,
      });
      await until(() => active.state.settings.botFill === false);
      await host.leave(true);
      await until(() => active.state.hostId === guest.sessionId);
      expect(
        active.testWorld.players.filter((player) => player?.isBot),
      ).toHaveLength(7);
      expect(active.state.settings.botDifficulty).toBe(BotDifficultyCode.Easy);
      active.setResultsDue();
      active.tick();
      expect(active.testWorld.mode).toBe(Mode.ZoneFrenzy);
      expect(
        active.testWorld.players.filter((player) => player?.isBot),
      ).toHaveLength(0);
      guest.send(ClientMessageId.HostSettings, {
        botFill: true,
        botDifficulty: BotDifficultyCode.Hard,
        nextMode: 0,
      });
      await until(() => active.state.settings.botFill === true);
      expect(
        active.testWorld.players.filter((player) => player?.isBot),
      ).toHaveLength(0);
      active.setResultsDue();
      active.tick();
      expect(active.testWorld.mode).toBe(Mode.Frenzy);
      expect(
        active.testWorld.players.filter((player) => player?.isBot),
      ).toHaveLength(7);
      expect(
        active.testWorld.events.filter((event) => event.type === 'spawn'),
      ).toHaveLength(8);
      expect(
        active.testWorld.events.some((event) => event.type === 'death'),
      ).toBe(false);
    });
  });

  it('drops quick-play and non-host requests and accounts malformed host messages', async () => {
    await withServer(async ({ join, room }) => {
      const quick = await join('');
      const codeHost = await join('ABC234');
      const guest = await join('ABC234');
      const codeRoom = room(codeHost.roomId);
      const request = { botFill: false, botDifficulty: 2, nextMode: 1 };
      quick.send(ClientMessageId.HostSettings, request);
      guest.send(ClientMessageId.HostSettings, request);
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(room(quick.roomId).state.settings.botFill).toBe(true);
      expect(codeRoom.state.settings.botFill).toBe(true);
      codeHost.send(ClientMessageId.HostSettings, {
        botFill: 'false',
        botDifficulty: 2,
        nextMode: 1,
      });
      await until(
        () =>
          codeRoom.queueFor(codeHost.sessionId)?.counters.unknownMessage === 1,
      );
      expect(codeRoom.state.settings.botFill).toBe(true);
    });
  });
});
