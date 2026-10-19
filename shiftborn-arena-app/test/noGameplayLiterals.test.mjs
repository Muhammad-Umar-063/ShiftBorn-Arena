import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceDirectory = fileURLToPath(
  new URL('../packages/sim/src/', import.meta.url),
);
const deniedLiteral = /(?<![\w.])(?:35|8\.5|140|110|0\.75|1\.25)(?![\w.])/g;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('AT-REPO-08 no hard-coded gameplay literals in sim source', () => {
  it('detects standalone denied values without matching longer numbers', () => {
    for (const value of ['35', '8.5', '140', '110', '0.75', '1.25']) {
      expect(`const value = ${value};`).toMatch(deniedLiteral);
    }
    for (const value of ['135', '18.5', '1100', '0.750']) {
      expect(`const value = ${value};`).not.toMatch(deniedLiteral);
    }
  });

  it('scans only packages/sim/src TypeScript files', () => {
    const violations = sourceFiles(sourceDirectory).flatMap((path) => {
      const lines = readFileSync(path, 'utf8').split('\n');
      return lines.flatMap((line, index) => {
        const matches = [...line.matchAll(deniedLiteral)];
        return matches.map((match) => `${path}:${index + 1}: ${match[0]}`);
      });
    });
    expect(violations).toEqual([]);
  });
});
