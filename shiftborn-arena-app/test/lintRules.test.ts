import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function rulesFor(source: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath });
  return (
    result?.messages.flatMap((message) =>
      message.ruleId === null ? [] : [message.ruleId],
    ) ?? []
  );
}

describe('AT-REPO-03 dependency and export lint', () => {
  it('AT-REPO-03 rejects a sim import of three', async () => {
    const rules = await rulesFor(
      "import { Vector3 } from 'three'; export const value = Vector3;",
      'packages/sim/src/lintFixture.ts',
    );
    expect(rules).toContain('no-restricted-imports');
  });

  it('AT-REPO-03 rejects a sim import from apps', async () => {
    const rules = await rulesFor(
      "import { serverPackage } from '../../../apps/server/src/index.js'; export const value = serverPackage;",
      'packages/sim/src/lintFixture.ts',
    );
    expect(rules).toContain('no-restricted-imports');
  });

  it('AT-REPO-03 rejects shared external imports and cross-app imports', async () => {
    const shared = await rulesFor(
      "import { Vector3 } from 'three'; export const value = Vector3;",
      'packages/shared/src/lintFixture.ts',
    );
    const server = await rulesFor(
      "import { clientPackage } from '@shiftborn/client'; export const value = clientPackage;",
      'apps/server/src/lintFixture.ts',
    );
    const client = await rulesFor(
      "import { serverPackage } from '@shiftborn/server'; export const value = serverPackage;",
      'apps/client/src/lintFixture.ts',
    );
    expect(shared).toContain('no-restricted-imports');
    expect(server).toContain('no-restricted-imports');
    expect(client).toContain('no-restricted-imports');
  });

  it('AT-REPO-03 rejects default exports', async () => {
    const rules = await rulesFor(
      'const value = 1; export default value;',
      'packages/sim/src/lintFixture.ts',
    );
    expect(rules).toContain('no-restricted-syntax');
  });

  it('AT-REPO-03 permits a clean sim import from shared', async () => {
    const rules = await rulesFor(
      "import { sharedPackage } from '@shiftborn/shared'; export const value = sharedPackage;",
      'packages/sim/src/lintFixture.ts',
    );
    expect(rules).toEqual([]);
  });
});

describe('AT-REPO-04 sim purity lint', () => {
  const forbiddenProperties = [
    'Math.random()',
    'Date.now()',
    'performance.now()',
  ];
  for (const expression of forbiddenProperties) {
    it(`AT-REPO-04 rejects ${expression}`, async () => {
      const rules = await rulesFor(
        `export const value = ${expression};`,
        'packages/sim/src/lintFixture.ts',
      );
      expect(rules).toContain('no-restricted-properties');
    });
  }

  const forbiddenGlobals = [
    'setTimeout(() => {}, 1)',
    'setInterval(() => {}, 1)',
    'requestAnimationFrame(() => {})',
    'document.title',
    'window.location',
    'console.log(1)',
  ];
  for (const expression of forbiddenGlobals) {
    it(`AT-REPO-04 rejects ${expression}`, async () => {
      const rules = await rulesFor(
        `export const value = ${expression};`,
        'packages/sim/src/lintFixture.ts',
      );
      expect(rules).toContain('no-restricted-globals');
    });
  }

  it('AT-REPO-04 permits a clean sim file', async () => {
    const rules = await rulesFor(
      'export const value = 1;',
      'packages/sim/src/lintFixture.ts',
    );
    expect(rules).toEqual([]);
  });
});
