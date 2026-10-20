import { readFile, stat } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { hashWorld, restoreWorld, step } from '@shiftborn/sim';
import { AimSource, Controller, type InputFrame } from '@shiftborn/shared';
import {
  parseCheckpoint, parseEnd, parseHeader, parseMatchLine, parseTick,
} from './format.js';

const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_RECORDS = 100000;

export class ReplayMismatch extends Error {
  constructor(
    readonly tick: number,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`first divergent tick ${tick}: expected ${expected}, actual ${actual}`);
    this.name = 'ReplayMismatch';
  }
}

export interface ReplayResult {
  readonly matchId: string;
  readonly ticksReplayed: number;
  readonly finalHash: string;
}

function parseJsonl(text: string, label: string): unknown[] {
  if (!text.endsWith('\n')) throw new TypeError(`${label} is missing its final newline`);
  const lines = text.slice(0, -1).split('\n');
  if (lines.length < 1 || lines.length > MAX_RECORDS ||
    lines.some((line) => line.length === 0))
    throw new TypeError(`${label} has invalid line count`);
  return lines.map((line, index): unknown => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new TypeError(`${label} has malformed JSON at line ${index + 1}`);
    }
  });
}

function checkHash(tick: number, expected: string, actual: string): void {
  if (expected !== actual) throw new ReplayMismatch(tick, expected, actual);
}

/** AT-DET-06: execute each authoritative step and check the first divergence. */
export async function replayMatchLog(matchPath: string): Promise<ReplayResult> {
  if (!matchPath.endsWith('.jsonl') || matchPath.endsWith('.inputs.jsonl'))
    throw new TypeError('expected a match .jsonl path');
  const inputPath = `${matchPath.slice(0, -'.jsonl'.length)}.inputs.jsonl.gz`;
  const matchSize = await stat(matchPath);
  if (matchSize.size > MAX_COMPRESSED_BYTES)
    throw new RangeError('match log exceeds size limit');
  const matchData = await readFile(matchPath, 'utf8');
  const matchLines = parseJsonl(matchData, 'match log').map(parseMatchLine);
  const start = matchLines[0];
  if (start?.type !== 'match_start' ||
    matchLines.slice(1).some((line) => line.type === 'match_start'))
    throw new TypeError('match log must start with one match_start');
  const ends = matchLines.filter((line) => line.type === 'match_end');
  if (ends.length > 1) throw new TypeError('duplicate match_end');
  const naturalEnd = ends[0];
  const inputSize = await stat(inputPath);
  if (inputSize.size > MAX_COMPRESSED_BYTES)
    throw new RangeError('input log exceeds compressed size limit');
  const compressed = await readFile(inputPath);
  const decoded = gunzipSync(compressed, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
  const records = parseJsonl(decoded.toString('utf8'), 'input log');
  const header = parseHeader(records[0]);
  if (header.matchId !== start.matchId || header.roomSeed !== start.roomSeed ||
    header.matchIndex !== start.matchIndex || header.mapId !== start.mapId ||
    header.balanceVersion !== start.balanceVersion)
    throw new TypeError('match and input headers disagree');
  let world = restoreWorld(header.initialSnapshot);
  checkHash(world.tick, header.initialHash, hashWorld(world));
  let ticksReplayed = 0;
  let sawEnd = false;
  let sawMatchEnd = false;
  let checkpointAt: number | null = null;
  let finalHash = '';
  for (let index = 1; index < records.length; index += 1) {
    const value = records[index];
    if (sawEnd) throw new TypeError('record after replay end');
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new TypeError('invalid replay record');
    const kind = (value as Record<string, unknown>).kind;
    if (kind === 'checkpoint') {
      const checkpoint = parseCheckpoint(value);
      if (checkpoint.t !== world.tick || checkpointAt === world.tick)
        throw new TypeError('invalid checkpoint tick');
      checkHash(world.tick, checkpoint.beforeHash, hashWorld(world));
      const restored = restoreWorld(checkpoint.snapshot);
      if (restored.roomSeed !== world.roomSeed ||
        restored.matchIndex !== world.matchIndex ||
        restored.matchId !== world.matchId)
        throw new TypeError('checkpoint changed match identity');
      checkHash(world.tick, checkpoint.afterHash, hashWorld(restored));
      world = restored;
      checkpointAt = world.tick;
    } else if (kind === 'tick') {
      const tick = parseTick(value);
      if (tick.t !== world.tick) throw new TypeError('missing or out-of-order replay tick');
      for (let seat = 0; seat < tick.controllers.length; seat += 1) {
        const controller = world.players[seat]?.controller ?? null;
        if (tick.controllers[seat] !== controller)
          throw new TypeError(`controller mismatch at tick ${tick.t}, seat ${seat}`);
        const frame = tick.inputs[seat];
        if ((controller === null || controller === Controller.Proxy) && frame !== null ||
          controller === Controller.Bot && frame?.aimSource !== AimSource.Bot ||
          controller === Controller.Human && frame?.aimSource === AimSource.Bot ||
          controller !== Controller.Human && tick.spawnAdvanceTicksBySeat[seat] !== 0)
          throw new TypeError(`invalid seat input at tick ${tick.t}, seat ${seat}`);
      }
      const inputs: InputFrame[] = [];
      const pressed: (number | undefined)[] = [];
      for (let seat = 0; seat < tick.inputs.length; seat += 1) {
        const frame = tick.inputs[seat];
        if (frame !== null && frame !== undefined) inputs[seat] = { ...frame };
        const edge = tick.inputPressedButtonsBySeat[seat];
        if (edge !== null && edge !== undefined) pressed[seat] = edge;
      }
      step(world, inputs, {
        inputPressedButtonsBySeat: pressed,
        spawnAdvanceTicksBySeat: [...tick.spawnAdvanceTicksBySeat],
      });
      const actual = hashWorld(world);
      checkHash(tick.t, tick.hash, actual);
      ticksReplayed += 1;
      if (naturalEnd !== undefined && naturalEnd.t === tick.t) {
        if (typeof naturalEnd.finalHash !== 'string')
          throw new TypeError('invalid match_end hash');
        checkHash(tick.t, naturalEnd.finalHash, actual);
        sawMatchEnd = true;
      }
      checkpointAt = null;
    } else if (kind === 'end') {
      const end = parseEnd(value);
      if (end.t !== world.tick || end.natural !== (naturalEnd !== undefined))
        throw new TypeError('invalid replay end');
      finalHash = hashWorld(world);
      checkHash(end.t, end.finalHash, finalHash);
      sawEnd = true;
    } else {
      throw new TypeError('unknown or duplicate replay record');
    }
  }
  if (!sawEnd || (naturalEnd !== undefined && !sawMatchEnd))
    throw new TypeError('missing replay end or match_end tick');
  return { matchId: header.matchId, ticksReplayed, finalHash };
}
