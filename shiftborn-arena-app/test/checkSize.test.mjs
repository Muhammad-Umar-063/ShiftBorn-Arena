import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkClientSize } from '../scripts/checkSize.mjs';

const directories = [];

function fixtureDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'shiftborn-size-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('AT-REPO-07 client gzipped size', () => {
  it('passes before the client dist exists', async () => {
    await expect(
      checkClientSize(join(fixtureDirectory(), 'missing')),
    ).resolves.toBeUndefined();
  });

  it('counts files in nested directories', async () => {
    const directory = fixtureDirectory();
    mkdirSync(join(directory, 'assets'));
    writeFileSync(
      join(directory, 'assets', 'small.js'),
      'export const ready = true;',
    );
    await expect(checkClientSize(directory)).resolves.toBeGreaterThan(0);
  });

  it('fails when a test asset pushes the gzipped build over 5 MB', async () => {
    const directory = fixtureDirectory();
    writeFileSync(join(directory, 'large.bin'), randomBytes(5 * 1024 * 1024));
    await expect(checkClientSize(directory)).rejects.toThrow('under 5 MB');
  });
});
