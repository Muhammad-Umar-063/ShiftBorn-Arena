import { execFile } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  BALANCE, BotDifficultyCode, ClientMessageId, CloseCode, Form, Mode, Phase,
  PROTOCOL_VERSION, ServerMessageId,
} from '@shiftborn/shared';
import { hashWorld } from '@shiftborn/sim';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { replayMatchLog } from '../../../tools/replay/src/replay.js';
import { loadServerConfig } from '../src/config.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { createServer } from '../src/server.js';

const execFileAsync = promisify(execFile);

class DevRoom extends ArenaRoom {
  override onCreate(options: Parameters<ArenaRoom['onCreate']>[0]): void {
    super.onCreate(options);
    this.fixedLoop.stop();
  }

  tick(): void { this.runSimulationStep(); }
  get testWorld() { return this.world; }
  pending(): number { return this.pendingDevCommandCount(); }
  frozen(): boolean { return this.botsAreFrozen(); }
  markExternal(): void { this.markReplayCheckpoint(); }
  queue(id: string) { return this.sessionForId(id)?.queue; }
}

async function freePort(): Promise<number> {
  const socket = createTcpServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (typeof address !== 'object' || address === null) throw new Error('missing port');
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

async function withRoom(
  enabled: boolean,
  run: (room: DevRoom, server: ColyseusTestServer, dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'shiftborn-cheats-'));
  const port = await freePort();
  const server = createServer(
    { ...loadServerConfig({ DEV_CHEATS: enabled ? '1' : '0', MATCH_LOG_DIR: dir }), port },
    pino({ level: 'silent' }), DevRoom,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    const room = await testServer.createRoom<DevRoom>('arena', { code: 'ABC234' });
    await run(room, testServer, dir);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
    await rm(dir, { recursive: true, force: true });
  }
}

async function matchPath(dir: string, matchId: string): Promise<string> {
  for (const day of await readdir(dir)) {
    const path = join(dir, day, `${matchId}.jsonl`);
    if ((await readdir(join(dir, day))).includes(`${matchId}.jsonl`)) return path;
  }
  throw new Error('match log missing');
}

describe('T-029 authoritative dev commands', () => {
  it('AT-SEC-03 disabled commands cannot be enabled by join options or affect another client', async () => {
    await withRoom(false, async (room, server, dir) => {
      const bad = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION, name: 'Bad',
        trustedDevCheats: true,
      });
      const good = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION, name: 'Good',
      });
      const badResults: unknown[] = [];
      const goodPongs: unknown[] = [];
      bad.onMessage(ServerMessageId.DevResult, (value: unknown) => badResults.push(value));
      good.onMessage(ServerMessageId.Pong, (value: unknown) => goodPongs.push(value));
      const matchId = room.testWorld.matchId;
      const before = hashWorld(room.testWorld);
      for (const cmd of ['/flux 0', '/give pulsePistol', '/unlock']) bad.send(ClientMessageId.DevCmd, { cmd });
      await until(() => room.queue(bad.sessionId)?.counters.total === 3);
      expect(hashWorld(room.testWorld)).toBe(before);
      expect(room.pending()).toBe(0);
      room.tick();
      expect(badResults).toHaveLength(0);
      const badPlayer = room.testWorld.players.find((player) => player?.id === bad.sessionId);
      const goodPlayer = room.testWorld.players.find((player) => player?.id === good.sessionId);
      expect(badPlayer?.flux).toBe(goodPlayer?.flux);
      const left = new Promise<number>((resolve) => bad.onLeave(resolve));
      for (let index = 0; index < 47; index += 1)
        bad.send(ClientMessageId.DevCmd, { cmd: '/endmatch' });
      expect(await left).toBe(CloseCode.InvalidInput);
      expect(badResults).toHaveLength(0);
      good.send(ClientMessageId.Ping, [1]);
      await until(() => goodPongs.length === 1);
      expect(goodPongs[0]).toEqual([1, room.testWorld.tick, expect.any(Number)]);
      await room.onDispose();
      const path = await matchPath(dir, matchId);
      const input = gunzipSync(await readFile(`${path.slice(0, -6)}.inputs.jsonl.gz`))
        .toString('utf8');
      expect(input).not.toContain('/flux');
      expect(input).not.toContain('/endmatch');
      const checkpoints = input.trimEnd().split('\n').map((line) => JSON.parse(line) as
        Record<string, unknown>).filter((record) => record.kind === 'checkpoint');
      expect(checkpoints).toHaveLength(2); // joins and final bot handoff only
      await expect(replayMatchLog(path)).resolves.toMatchObject({ matchId });
      expect(room.testWorld.phase).toBe(Phase.Countdown);
    });
  });

  it('AT-SEC-03 executes all ten commands at the next tick with private results and replayable checkpoints', async () => {
    await withRoom(true, async (room, server, dir) => {
      const first = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION, name: 'First',
      });
      const second = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION, name: 'Second',
      });
      const otherRoom = await server.createRoom<DevRoom>('arena', { code: 'DEF234' });
      const firstResults: { ok: boolean; text: string }[] = [];
      const secondResults: { ok: boolean; text: string }[] = [];
      first.onMessage(ServerMessageId.DevResult, (value: { ok: boolean; text: string }) =>
        firstResults.push(value));
      second.onMessage(ServerMessageId.DevResult, (value: { ok: boolean; text: string }) =>
        secondResults.push(value));
      const matchId = room.testWorld.matchId;
      const firstPlayer = room.testWorld.players.find((player) => player?.id === first.sessionId);
      const secondPlayer = room.testWorld.players.find((player) => player?.id === second.sessionId);
      if (firstPlayer === undefined || firstPlayer === null ||
        secondPlayer === undefined || secondPlayer === null)
        throw new Error('missing humans');
      async function command(text: string, bySecond = false) {
        const client = bySecond ? second : first;
        const results = bySecond ? secondResults : firstResults;
        const prior = results.length;
        client.send(ClientMessageId.DevCmd, { cmd: text });
        await until(() => room.pending() === 1);
        room.tick();
        await until(() => results.length === prior + 1);
        return results[prior];
      }
      const fluxBefore = firstPlayer.flux;
      first.send(ClientMessageId.DevCmd, { cmd: '/flux 11' });
      await until(() => room.pending() === 1);
      expect(firstPlayer.flux).toBe(fluxBefore);
      room.tick();
      await until(() => firstResults.length === 1);
      expect(firstResults[0]?.ok).toBe(true);
      expect(firstPlayer.flux).toBe(11);
      expect(secondResults).toHaveLength(0);
      expect((await command('/give pulsePistol'))?.ok).toBe(true);
      expect(firstPlayer.guns.pulsePistol).toEqual({ owned: true, mag: 20, reserve: 60 });
      expect(secondPlayer.guns.pulsePistol.owned).toBe(false);
      expect((await command('/unlock'))?.ok).toBe(true);
      expect(firstPlayer.unlocked).toEqual({ runner: true, beast: true, turret: true });
      expect((await command('/hp .5'))?.ok).toBe(true);
      expect(firstPlayer.hpFrac).toBe(0.5);
      expect((await command('/form turret'))?.ok).toBe(true);
      expect(firstPlayer.form).toBe(Form.Turret);
      expect(firstPlayer.flux).toBe(11);
      expect((await command('/tp 0 0'))?.ok).toBe(true);
      expect(firstPlayer.pos).toEqual({ x: 0, y: 0 });
      expect((await command('/difficulty hard'))?.ok).toBe(true);
      expect(room.state.settings.botDifficulty).toBe(BotDifficultyCode.Hard);
      expect(otherRoom.state.settings.botDifficulty).toBe(BotDifficultyCode.Normal);
      expect((await command('/mode zone'))?.ok).toBe(true);
      expect(room.testWorld.pendingMode).toBe(Mode.ZoneFrenzy);
      expect(room.state.settings.nextMode).toBe(1);
      expect((await command('/bots 5'))?.ok).toBe(true);
      expect(room.testWorld.players.filter((player) => player?.isBot)).toHaveLength(5);
      expect(room.testWorld.players[5]).toBeNull();
      expect(otherRoom.testWorld.players.filter((player) => player?.isBot)).toHaveLength(BALANCE.match.seats);
      expect((await command('/bots 6'))?.ok).toBe(true);
      expect(room.testWorld.players.filter((player) => player?.isBot)).toHaveLength(6);
      expect(room.testWorld.players[5]?.isBot).toBe(true);
      const bot = room.testWorld.players.find((player) => player?.isBot);
      if (bot === undefined || bot === null) throw new Error('missing bot');
      bot.vel = { x: 5, y: 0 };
      room.markExternal();
      expect((await command('/freeze'))?.ok).toBe(true);
      expect(room.frozen()).toBe(true);
      expect(bot.vel).toEqual({ x: 0, y: 0 });
      expect((await command('/bots 7'))?.ok).toBe(false);
      expect((await command('/hp 0', true))?.ok).toBe(true);
      expect(secondPlayer.alive).toBe(false);
      expect((await command('/kill'))?.ok).toBe(true);
      expect(firstPlayer.alive).toBe(false);
      expect((await command('/endmatch'))?.ok).toBe(false);
      const beforeUnknown = firstResults.length;
      first.send(ClientMessageId.DevCmd, { cmd: '/dummies on' });
      await until(() => firstResults.length === beforeUnknown + 1);
      expect(firstResults.at(-1)).toEqual({ ok: false, text: 'Unknown command.' });
      first.send(ClientMessageId.DevCmd, { cmd: 7 });
      await until(() => room.queue(first.sessionId)?.counters.total === 1);
      room.testWorld.phaseEndTick = room.testWorld.tick;
      room.markExternal();
      room.tick();
      expect(room.testWorld.phase).toBe(Phase.Playing);
      expect((await command('/endmatch'))?.ok).toBe(true);
      expect(room.testWorld.phase).toBe(Phase.Results);
      expect(secondResults).toHaveLength(1);
      room.testWorld.phaseEndTick = room.testWorld.tick;
      room.markExternal();
      room.tick();
      expect(room.testWorld.phase).toBe(Phase.Countdown);
      expect(room.testWorld.mode).toBe(Mode.ZoneFrenzy);
      expect(room.testWorld.matchId).not.toBe(matchId);
      await room.onDispose();
      const path = await matchPath(dir, matchId);
      const replayed = await replayMatchLog(path);
      expect(replayed.finalHash).toBe(hashWorld(room.testWorld));
      await expect(replayMatchLog(await matchPath(dir, room.testWorld.matchId)))
        .resolves.toMatchObject({ matchId: room.testWorld.matchId });
      const input = gunzipSync(await readFile(`${path.slice(0, -6)}.inputs.jsonl.gz`))
        .toString('utf8');
      expect(input).not.toContain('/flux');
      expect(input).not.toContain('/endmatch');
      const checkpoints = input.trimEnd().split('\n').map((line) => JSON.parse(line) as
        Record<string, unknown>).filter((record) => record.kind === 'checkpoint');
      expect(checkpoints.length).toBeGreaterThan(3);
      expect(checkpoints.length).toBeLessThan(room.testWorld.tick);
      const devStates = checkpoints.map((record) => record.roomState).filter((state) =>
        state !== undefined) as { botsFrozen: boolean; active: { botDifficulty: number } }[];
      expect(devStates.some((state) => state.active.botDifficulty === BotDifficultyCode.Hard))
        .toBe(true);
      expect(devStates.some((state) => state.botsFrozen)).toBe(true);
      const pnpm = process.env.npm_execpath;
      if (pnpm === undefined) throw new Error('pnpm executable missing');
      const cli = await execFileAsync(pnpm, ['replay', path], {
        cwd: process.cwd(),
        env: { ...process.env, PATH: `${dirname(pnpm)}:${dirname(process.execPath)}:${process.env.PATH ?? ''}` },
      });
      expect(cli.stdout).toContain('matching final hash');
    });
  }, 30_000);

  it('AT-SEC-03 stale queued commands are ignored after disposal', async () => {
    await withRoom(true, async (room, server) => {
      const client = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION, name: 'Tester',
      });
      client.send(ClientMessageId.DevCmd, { cmd: '/flux 0' });
      await until(() => room.pending() === 1);
      const before = hashWorld(room.testWorld);
      await room.onDispose();
      expect(room.pending()).toBe(0);
      room.tick();
      expect(hashWorld(room.testWorld)).toBe(before);
    });
  });

  it('AT-SEC-03 stale queued commands cannot mutate a seat after final leave', async () => {
    await withRoom(true, async (room, server) => {
      const client = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION, name: 'Tester',
      });
      const seat = room.testWorld.players.find((player) => player?.id === client.sessionId)?.seat;
      if (seat === undefined) throw new Error('missing human');
      client.send(ClientMessageId.DevCmd, { cmd: '/flux 0' });
      await until(() => room.pending() === 1);
      const originalFlux = room.testWorld.players[seat]?.flux;
      await client.leave(true);
      await until(() => room.testWorld.players[seat]?.isBot === true);
      room.tick();
      expect(room.pending()).toBe(0);
      expect(room.testWorld.players[seat]?.flux).toBe(originalFlux);
    });
  });
});
