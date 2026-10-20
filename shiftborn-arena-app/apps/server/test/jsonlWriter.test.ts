import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { JsonlWriter } from '../src/logging/jsonlWriter.js';

async function withDir(run: (dir: string, errors: string[]) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'shiftborn-writer-'));
  const errors: string[] = [];
  try {
    await run(dir, errors);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function logger(errors: string[]) {
  return pino({ level: 'error' }, { write(line: string) { errors.push(line); } });
}

describe('AT-TEL-02 asynchronous JSONL writer', () => {
  it('creates nested plain and gzip logs, preserves order and closes twice safely', async () => {
    await withDir(async (dir, errors) => {
      const plainPath = join(dir, 'day', 'match.jsonl');
      const gzipPath = join(dir, 'day', 'match.inputs.jsonl.gz');
      const plain = new JsonlWriter(plainPath, false, logger(errors));
      const gzip = new JsonlWriter(gzipPath, true, logger(errors));
      for (let t = 0; t < 100; t += 1) {
        expect(plain.write({ t })).toBe(true);
        expect(gzip.write({ t })).toBe(true);
      }
      const closing = plain.close();
      expect(plain.close()).toBe(closing);
      await Promise.all([closing, gzip.close()]);
      expect(plain.write({ t: 101 })).toBe(false);
      const expected = Array.from({ length: 100 }, (_, t) => JSON.stringify({ t })).join('\n') + '\n';
      expect(await readFile(plainPath, 'utf8')).toBe(expected);
      expect(gunzipSync(await readFile(gzipPath)).toString('utf8')).toBe(expected);
      expect(errors).toEqual([]);
    });
  });

  it('reports an existing file or directory failure without overwriting', async () => {
    await withDir(async (dir, errors) => {
      const existing = join(dir, 'existing.jsonl');
      await writeFile(existing, 'original\n');
      const collision = new JsonlWriter(existing, false, logger(errors));
      collision.write({ t: 1 });
      await collision.close();
      expect(await readFile(existing, 'utf8')).toBe('original\n');
      const invalid = new JsonlWriter(join(existing, 'child.jsonl'), false, logger(errors));
      invalid.write({ t: 2 });
      await invalid.close();
      expect(errors.filter((line) => line.includes('match_log_write_error'))).toHaveLength(2);
    });
  });

  it('bounds buffered output and reports excess backpressure', async () => {
    await withDir(async (dir, errors) => {
      const writer = new JsonlWriter(join(dir, 'large.jsonl'), false, logger(errors));
      expect(writer.write({ value: 'x'.repeat(2 << 20) })).toBe(false);
      await writer.close();
      expect(errors.some((line) => line.includes('backpressure limit exceeded'))).toBe(true);
    });
  });
});
