import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  BALANCE, Mode, REPLAY_FORMAT_VERSION, GREYBOX_V1,
  balanceHash,
} from '@shiftborn/shared';
import { createWorld, hashWorld, snapshotWorld, step } from '@shiftborn/sim';
import { describe, expect, it } from 'vitest';
import { replayMatchLog, ReplayMismatch } from '../src/replay.js';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'shiftborn-replay-'));
  const world = createWorld({ map: GREYBOX_V1, roomSeed: 37, mode: Mode.Frenzy });
  const path = join(dir, `${world.matchId}.jsonl`);
  const inputPath = `${path.slice(0, -'.jsonl'.length)}.inputs.jsonl.gz`;
  const firstHash = hashWorld(world);
  const header = {
    kind: 'header', version: REPLAY_FORMAT_VERSION, matchId: world.matchId,
    mapId: world.map.id, roomSeed: world.roomSeed,
    matchIndex: world.matchIndex, mode: world.mode,
    initialSnapshot: snapshotWorld(world), initialHash: firstHash,
    balanceVersion: BALANCE.version, balanceHash: balanceHash(), buildId: 'test',
  };
  const ticks: Record<string, unknown>[] = [];
  for (let index = 0; index < 2; index += 1) {
    const t = world.tick;
    step(world, [], {});
    ticks.push({
      kind: 'tick', t, inputs: Array.from({ length: BALANCE.match.seats }, () => null),
      controllers: Array.from({ length: BALANCE.match.seats }, () => null),
      inputPressedButtonsBySeat: Array.from({ length: BALANCE.match.seats }, () => null),
      spawnAdvanceTicksBySeat: Array.from({ length: BALANCE.match.seats }, () => 0),
      hash: hashWorld(world),
    });
  }
  const end = { kind: 'end', t: world.tick, finalHash: hashWorld(world), natural: false };
  const matchStart = {
    t: 0, type: 'match_start', matchId: world.matchId, roomId: 'test-room',
    roomCode: '', mode: Mode.Frenzy, roomSeed: world.roomSeed,
    matchIndex: 0, balanceVersion: BALANCE.version, mapId: GREYBOX_V1.id,
    buildId: 'test', seats: Array.from({ length: BALANCE.match.seats }, () => null),
    botDifficulty: 1,
  };
  const save = async (records: unknown[], matchLines: unknown[] = [matchStart]) => {
    await writeFile(path, `${matchLines.map((line) => JSON.stringify(line)).join('\n')}\n`);
    await writeFile(inputPath, gzipSync(`${records.map((line) => JSON.stringify(line)).join('\n')}\n`));
  };
  await save([header, ...ticks, end]);
  return { dir, path, inputPath, header, ticks, end, matchStart, save };
}

describe('AT-TEL-02 and AT-DET-06 replay validation', () => {
  it('replays a valid prefix without modifying input bytes', async () => {
    const data = await fixture();
    try {
      const before = await readFile(data.inputPath);
      const result = await replayMatchLog(data.path);
      expect(result.ticksReplayed).toBe(2);
      expect(result.finalHash).toBe(data.end.finalHash);
      expect(await readFile(data.inputPath)).toEqual(before);
    } finally {
      await rm(data.dir, { recursive: true, force: true });
    }
  });

  it('rejects unsupported versions, unknown maps, missing and malformed files', async () => {
    const data = await fixture();
    try {
      await data.save([{ ...data.header, version: 999 }, ...data.ticks, data.end]);
      await expect(replayMatchLog(data.path)).rejects.toThrow(/header/);
      await data.save([{ ...data.header, mapId: 'unknown' }, ...data.ticks, data.end]);
      await expect(replayMatchLog(data.path)).rejects.toThrow(/header/);
      await writeFile(data.path, '{broken\n');
      await expect(replayMatchLog(data.path)).rejects.toThrow(/malformed JSON/);
      await data.save([data.header, ...data.ticks, data.end]);
      await writeFile(data.inputPath, Buffer.from([0x1f, 0x8b, 0x08]));
      await expect(replayMatchLog(data.path)).rejects.toThrow();
      await rm(data.inputPath);
      await expect(replayMatchLog(data.path)).rejects.toThrow();
    } finally {
      await rm(data.dir, { recursive: true, force: true });
    }
  });

  it('rejects duplicate, missing, out-of-order, invalid and post-end records', async () => {
    const data = await fixture();
    try {
      const valid = [data.header, ...data.ticks, data.end];
      for (const records of [
        [data.header, data.header, ...data.ticks, data.end],
        [data.header, data.ticks[1], data.ticks[0], data.end],
        [data.header, data.ticks[0], data.ticks[0], data.end],
        [data.header, data.ticks[1], data.end],
        [...valid, data.ticks[0]],
        [data.header, { ...data.ticks[0], controllers: [] }, data.ticks[1], data.end],
        [data.header, { ...data.ticks[0], inputs: [null] }, data.ticks[1], data.end],
      ]) {
        await data.save(records);
        await expect(replayMatchLog(data.path)).rejects.toThrow();
      }
      await data.save(valid, [data.matchStart, data.matchStart]);
      await expect(replayMatchLog(data.path)).rejects.toThrow(/match_start/);
    } finally {
      await rm(data.dir, { recursive: true, force: true });
    }
  });

  it('reports the first divergent tick with both hashes', async () => {
    const data = await fixture();
    try {
      const changed = { ...data.ticks[0], hash: '0000000000000000' };
      await data.save([data.header, changed, data.ticks[1], data.end]);
      await expect(replayMatchLog(data.path)).rejects.toBeInstanceOf(ReplayMismatch);
      await expect(replayMatchLog(data.path)).rejects.toThrow(
        /first divergent tick 0: expected 0000000000000000, actual [0-9a-f]{16}/,
      );
    } finally {
      await rm(data.dir, { recursive: true, force: true });
    }
  });
});
