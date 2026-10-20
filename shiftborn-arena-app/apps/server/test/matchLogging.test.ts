import { execFile } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  BALANCE, ClientMessageId, CloseCode, Controller, DERIVED, InputButton, Phase,
  PROTOCOL_VERSION, ServerMessageId,
} from '@shiftborn/shared';
import { replayMatchLog, ReplayMismatch } from '../../../tools/replay/src/replay.js';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';
import { ArenaRoom } from '../src/rooms/ArenaRoom.js';
import { createServer } from '../src/server.js';

const execFileAsync = promisify(execFile);

class LoggingRoom extends ArenaRoom {
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

  queue(id: string) {
    return this.sessionForId(id)?.queue;
  }

  median(id: string): number | undefined {
    return this.probeTracker.medianFor(id);
  }

  markExternal(): void {
    this.markReplayCheckpoint();
  }
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

async function withRoom(run: (room: LoggingRoom, server: ColyseusTestServer, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'shiftborn-log-'));
  const port = await freePort();
  const server = createServer(
    { ...loadServerConfig({ MATCH_LOG_DIR: dir }), port },
    pino({ level: 'silent' }), LoggingRoom,
  );
  let testServer: ColyseusTestServer | undefined;
  try {
    await server.listen(port, '127.0.0.1');
    testServer = new ColyseusTestServer(server);
    const room = await testServer.createRoom<LoggingRoom>('arena', { code: 'ABC234' });
    await run(room, testServer, dir);
  } finally {
    await testServer?.cleanup();
    await testServer?.shutdown();
    await rm(dir, { recursive: true, force: true });
  }
}

async function logPath(dir: string, id: string): Promise<string> {
  const days = await readdir(dir);
  for (const day of days) {
    const path = join(dir, day, `${id}.jsonl`);
    if ((await readdir(join(dir, day))).includes(`${id}.jsonl`)) return path;
  }
  throw new Error('match log missing');
}

describe('T-028 actual room recorder and replay', () => {
  it('AT-TEL-01 Stage A, AT-TEL-02, AT-DET-06 record and replay a match with RTT and lifecycle checkpoint', async () => {
    await withRoom(async (room, server, dir) => {
      const client = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION,
        name: 'Tester', inputScheme: 'mouse',
        rawToken: 'TOKEN_SENTINEL', ip: '203.0.113.42', header: 'HEADER_SENTINEL',
      });
      const id = room.testWorld.matchId;
      const shooter = room.testWorld.players.find((player) => player?.id === client.sessionId);
      const target = room.testWorld.players.find((player) => player?.isBot);
      if (shooter === undefined || shooter === null || target === undefined || target === null)
        throw new Error('missing players');
      for (const player of room.testWorld.players) {
        if (player?.isBot && player !== target) {
          player.alive = false;
          player.respawnTick = 10000;
        }
      }
      for (let index = 0; index < DERIVED.net.pingIntervalTicks; index += 1) room.tick();
      expect(room.testWorld.tick).toBe(DERIVED.net.pingIntervalTicks);
      shooter.pos = { x: 0, y: 0 };
      target.pos = { x: 2, y: 0 };
      target.hpFrac = 0.05;
      target.protectedEndTick = 0;
      room.testWorld.phaseEndTick = room.testWorld.tick;
      room.markExternal();
      const probes: unknown[] = [];
      client.onMessage(ServerMessageId.Probe, (payload: unknown) => probes.push(payload));
      room.tick();
      await until(() => probes.length === 1);
      expect(room.testWorld.phase).toBe(Phase.Playing);
      target.protectedEndTick = 0;
      room.markExternal();
      room.clockMs += 200;
      client.send(ClientMessageId.ProbeReply, probes[0]);
      await until(() => room.median(client.sessionId) === 200);
      const firingTick = room.testWorld.tick;
      client.send(ClientMessageId.Input, [1, 0, 0, 0, InputButton.Fire, 0]);
      await until(() => room.queue(client.sessionId)?.lastReceivedSeq === 1);
      room.tick();
      expect(room.testWorld.events.some((event) => event.type === 'damage')).toBe(true);
      expect(room.testWorld.events.some((event) => event.type === 'death')).toBe(true);
      client.send(ClientMessageId.Input, [2, 0, 0, 0, InputButton.MorphBeast, 0]);
      await until(() => room.queue(client.sessionId)?.lastReceivedSeq === 2);
      room.tick();
      expect(room.testWorld.events.some((event) => event.type === 'morphStart')).toBe(true);
      for (let index = 0; index < DERIVED.morph.durationTicks; index += 1) room.tick();
      client.send(ClientMessageId.ClientStats, {
        fpsMedian: 60, fpsP5: 42, rttMs: 9999, corrections: 2,
        inputScheme: 'mouse', windowW: 1280, windowH: 720,
        browser: 'Chromium', hiddenMs: 0, errors: 0,
        playerId: 'TOKEN_SENTINEL',
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 15));
      client.send(ClientMessageId.Vis, [1]);
      await until(() => shooter.controller === Controller.Proxy);
      const proxyTick = room.testWorld.tick;
      room.tick();
      client.send(ClientMessageId.Vis, [0]);
      await until(() => shooter.controller === Controller.Human);
      room.tick();
      room.testWorld.phaseEndTick = room.testWorld.tick;
      room.markExternal();
      room.tick();
      expect(room.testWorld.phase).toBe(Phase.Results);
      room.tick();
      await room.onDispose();
      const path = await logPath(dir, id);
      const lines = (await readFile(path, 'utf8')).trimEnd().split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(lines[0]?.type).toBe('match_start');
      expect(lines.filter((line) => line.type === 'match_start')).toHaveLength(1);
      expect(lines.filter((line) => line.type === 'morph')).toHaveLength(1);
      expect(lines.filter((line) => line.type === 'damage')).toHaveLength(1);
      expect(lines.filter((line) => line.type === 'death')).toHaveLength(1);
      expect(lines.filter((line) => line.type === 'match_end')).toHaveLength(1);
      expect(lines.filter((line) => line.type === 'client_stats')).toHaveLength(1);
      expect(lines.every((line) => Number.isSafeInteger(line.t))).toBe(true);
      expect(lines.find((line) => line.type === 'client_stats')?.playerId)
        .toBe(client.sessionId);
      expect(lines[0]?.roomSeed).toBe(room.testWorld.roomSeed);
      expect(lines[0]?.matchIndex).toBe(0);
      const inputPath = `${path.slice(0, -'.jsonl'.length)}.inputs.jsonl.gz`;
      const compressed = await readFile(inputPath);
      expect([...compressed.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
      const inputText = gunzipSync(compressed).toString('utf8');
      const records = inputText.trimEnd().split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records[0]?.kind).toBe('header');
      expect(records.filter((record) => record.kind === 'header')).toHaveLength(1);
      expect(records.filter((record) => record.kind === 'checkpoint').length).toBeGreaterThan(0);
      expect(records.filter((record) => record.kind === 'checkpoint').length)
        .toBeLessThan(room.testWorld.tick);
      expect(records.filter((record) => record.kind === 'tick')).toHaveLength(room.testWorld.tick);
      const firing = records.find((record) => record.kind === 'tick' && record.t === firingTick);
      expect((firing?.spawnAdvanceTicksBySeat as number[])[shooter.seat])
        .toBe(DERIVED.weapons.spawnAdvanceMaxTicks);
      expect((firing?.inputs as unknown[]).length).toBe(BALANCE.match.seats);
      expect((firing?.inputPressedButtonsBySeat as (number | null)[])[shooter.seat])
        .toBe(InputButton.Fire);
      const repeated = records.find((record) => record.kind === 'tick' &&
        record.t === firingTick + 2);
      expect((repeated?.inputs as ({ seq: number } | null)[])[shooter.seat]?.seq).toBe(2);
      expect((repeated?.inputPressedButtonsBySeat as (number | null)[])[shooter.seat]).toBe(0);
      const proxy = records.find((record) => record.kind === 'tick' && record.t === proxyTick);
      expect((proxy?.controllers as (Controller | null)[])[shooter.seat]).toBe(Controller.Proxy);
      expect((proxy?.spawnAdvanceTicksBySeat as number[])[shooter.seat]).toBe(0);
      expect(inputText).not.toContain('TOKEN_SENTINEL');
      expect(inputText).not.toContain('203.0.113.42');
      expect(inputText).not.toContain('HEADER_SENTINEL');
      expect(await readFile(path, 'utf8')).not.toContain('TOKEN_SENTINEL');
      const replayed = await replayMatchLog(path);
      expect(replayed.ticksReplayed).toBe(room.testWorld.tick);
      expect(replayed.finalHash).toBe(records.at(-1)?.finalHash);
      const pnpm = process.env.npm_execpath;
      if (pnpm === undefined) throw new Error('pnpm executable missing');
      const cli = await execFileAsync(pnpm, ['replay', path], {
        cwd: process.cwd(),
        env: { ...process.env, PATH: `${dirname(pnpm)}:${dirname(process.execPath)}:${process.env.PATH ?? ''}` },
      });
      expect(cli.stdout).toContain('matching final hash');
      const copied = join(dir, 'tampered.jsonl');
      const copiedInputs = join(dir, 'tampered.inputs.jsonl.gz');
      await copyFile(path, copied);
      const mutated = records.map((record) => ({ ...record }));
      const firstTick = mutated.find((record) => record.kind === 'tick');
      if (firstTick === undefined) throw new Error('missing replay tick');
      firstTick.hash = '0000000000000000';
      await writeFile(copiedInputs, gzipSync(`${mutated.map((record) => JSON.stringify(record)).join('\n')}\n`));
      await expect(replayMatchLog(copied)).rejects.toBeInstanceOf(ReplayMismatch);
      await expect(execFileAsync(pnpm, ['replay', copied], {
        cwd: process.cwd(),
        env: { ...process.env, PATH: `${dirname(pnpm)}:${dirname(process.execPath)}:${process.env.PATH ?? ''}` },
      })).rejects.toThrow(/first divergent tick.*expected.*actual/);
    });
  }, 30000);

  it('AT-TEL-01 rotates consecutive matches and AT-TEL-02 replays an unfinished prefix', async () => {
    await withRoom(async (room, server, dir) => {
      const client = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION,
        name: 'Tester', inputScheme: 'keys',
      });
      const firstId = room.testWorld.matchId;
      room.tick();
      client.send(ClientMessageId.HostSettings, {
        botFill: false, botDifficulty: 1, nextMode: 0,
      });
      await until(() => room.state.settings.botFill === false);
      room.testWorld.phaseEndTick = room.testWorld.tick;
      room.markExternal();
      room.tick();
      expect(room.testWorld.phase).toBe(Phase.Playing);
      room.testWorld.phaseEndTick = room.testWorld.tick;
      room.markExternal();
      room.tick();
      expect(room.testWorld.phase).toBe(Phase.Results);
      room.testWorld.phaseEndTick = room.testWorld.tick;
      room.markExternal();
      room.tick();
      const secondId = room.testWorld.matchId;
      expect(secondId).not.toBe(firstId);
      expect(room.testWorld.phase).toBe(Phase.Countdown);
      room.tick();
      await room.onDispose();
      const firstPath = await logPath(dir, firstId);
      const secondPath = await logPath(dir, secondId);
      const firstLines = (await readFile(firstPath, 'utf8')).trimEnd().split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const secondLines = (await readFile(secondPath, 'utf8')).trimEnd().split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(firstLines.filter((line) => line.type === 'match_end')).toHaveLength(1);
      expect(secondLines[0]?.type).toBe('match_start');
      expect(secondLines.some((line) => line.type === 'match_end')).toBe(false);
      expect((await replayMatchLog(firstPath)).ticksReplayed).toBe(4);
      expect((await replayMatchLog(secondPath)).ticksReplayed).toBe(1);
      const secondInput = `${secondPath.slice(0, -'.jsonl'.length)}.inputs.jsonl.gz`;
      const secondRecords = gunzipSync(await readFile(secondInput)).toString('utf8')
        .trimEnd().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(secondRecords.at(-1)?.natural).toBe(false);
      expect(secondLines[0]?.roomSeed).toBe(room.testWorld.roomSeed);
      expect(secondLines[0]?.matchIndex).toBe(1);
      expect(room.testWorld.players.filter((player) => player?.isBot)).toHaveLength(0);
      const secondTick = secondRecords.find((record) => record.kind === 'tick');
      expect((secondTick?.controllers as (Controller | null)[]).filter((value) => value === null))
        .toHaveLength(BALANCE.match.seats - 1);
      await client.leave(true);
    });
  }, 10000);

  it('AT-TEL-01 invalid client stats share 4003 accounting and never log raw payloads', async () => {
    await withRoom(async (room, server, dir) => {
      const bad = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION, name: 'Bad',
      });
      const good = await server.connectTo(room, {
        code: 'ABC234', protocolVersion: PROTOCOL_VERSION, name: 'Good',
      });
      const id = room.testWorld.matchId;
      const left = new Promise<number>((resolve) => bad.onLeave(resolve));
      for (let index = 0; index < 50; index += 1)
        bad.send(ClientMessageId.ClientStats, {
          fpsMedian: 'TOKEN_SENTINEL', browser: '203.0.113.42',
        });
      expect(await left).toBe(CloseCode.InvalidInput);
      const pongs: unknown[] = [];
      good.onMessage(ServerMessageId.Pong, (payload: unknown) => pongs.push(payload));
      good.send(ClientMessageId.Ping, [0]);
      await until(() => pongs.length === 1);
      room.tick();
      await room.onDispose();
      const plain = await readFile(await logPath(dir, id), 'utf8');
      expect(plain).not.toContain('TOKEN_SENTINEL');
      expect(plain).not.toContain('203.0.113.42');
      expect(plain).not.toContain('client_stats');
      await good.leave(true);
    });
  }, 10000);
});
