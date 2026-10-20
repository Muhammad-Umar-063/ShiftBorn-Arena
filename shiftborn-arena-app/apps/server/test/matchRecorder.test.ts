import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BALANCE, GREYBOX_V1, Mode } from '@shiftborn/shared';
import { createWorld, step } from '@shiftborn/sim';
import { replayMatchLog } from '../../../tools/replay/src/replay.js';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { MatchRecorder } from '../src/logging/matchRecorder.js';

describe('AT-TEL-01 UTC folder and safe match file ownership', () => {
  it('keeps a match in its start-date directory across a three-step burst', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'shiftborn-date-'));
    try {
      const world = createWorld({ map: GREYBOX_V1, roomSeed: 14, mode: Mode.Frenzy });
      const recorder = new MatchRecorder(world, {
        roomId: 'room', roomCode: '', buildId: 'build', botDifficulty: 1,
        inputSchemes: new Map(),
      }, dir, pino({ level: 'silent' }), new Date('2026-10-20T23:59:59.999Z'));
      expect(recorder.matchPath).toContain('/2026-10-20/');
      for (let index = 0; index < 3; index += 1) {
        const before = recorder.prepareStep(world);
        const events = step(world, [], {});
        recorder.recordStep(world, before, events, [], [],
          Array.from({ length: BALANCE.match.seats }, () => 0));
      }
      await recorder.close(world);
      expect((await readFile(recorder.matchPath, 'utf8')).split('\n')[0])
        .toContain('match_start');
      expect((await replayMatchLog(recorder.matchPath)).ticksReplayed).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects traversal and separators in a match ID before opening files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'shiftborn-name-'));
    try {
      const world = createWorld({ map: GREYBOX_V1, roomSeed: 14, mode: Mode.Frenzy });
      world.matchId = '../escape';
      expect(() => new MatchRecorder(world, {
        roomId: 'room', roomCode: '', buildId: 'build', botDifficulty: 1,
        inputSchemes: new Map(),
      }, dir, pino({ level: 'silent' }))).toThrow(/unsafe match ID/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
