import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config.js';

describe('AT-REPO-05 server configuration', () => {
  it('uses every documented default', () => {
    expect(loadServerConfig({})).toEqual({
      port: 2567,
      publicOrigin: 'http://localhost:5173',
      quickplayMode: 'frenzy',
      botDifficulty: 'normal',
      matchLogDir: './data/matches',
      devCheats: false,
      logLevel: 'info',
      buildId: 'dev',
    });
  });

  it('accepts all valid overrides without changing the input', () => {
    const env = Object.freeze({
      PORT: '4321',
      PUBLIC_ORIGIN: 'https://example.com',
      QUICKPLAY_MODE: 'zoneFrenzy',
      BOT_DIFFICULTY: 'hard',
      MATCH_LOG_DIR: '/tmp/matches',
      DEV_CHEATS: '1',
      LOG_LEVEL: 'debug',
      BUILD_ID: 'local-42',
    });
    expect(loadServerConfig(env)).toEqual({
      port: 4321,
      publicOrigin: 'https://example.com',
      quickplayMode: 'zoneFrenzy',
      botDifficulty: 'hard',
      matchLogDir: '/tmp/matches',
      devCheats: true,
      logLevel: 'debug',
      buildId: 'local-42',
    });
    expect(loadServerConfig(env)).toEqual(loadServerConfig(env));
    expect(env.PORT).toBe('4321');
  });

  it.each(['1', '65535'])('accepts boundary PORT %s', (port) => {
    expect(loadServerConfig({ PORT: port }).port).toBe(Number(port));
  });

  it.each(['0', '-1', '65536', '1.5', '', ' ', 'abc'])(
    'rejects invalid PORT %j',
    (port) => {
      expect(() => loadServerConfig({ PORT: port })).toThrow(/PORT.*1.*65535/);
    },
  );

  it.each([
    'localhost:5173',
    'ftp://example.com',
    'https://example.com/path',
    'https://example.com?x=1',
    'https://user:pass@example.com',
    '',
  ])('rejects invalid PUBLIC_ORIGIN %j', (publicOrigin) => {
    expect(() => loadServerConfig({ PUBLIC_ORIGIN: publicOrigin })).toThrow(
      /PUBLIC_ORIGIN.*HTTP.*HTTPS/i,
    );
  });

  it.each(['frenzy', 'zoneFrenzy', 'alternate'])(
    'accepts QUICKPLAY_MODE %s',
    (mode) => {
      expect(loadServerConfig({ QUICKPLAY_MODE: mode }).quickplayMode).toBe(
        mode,
      );
    },
  );

  it.each(['easy', 'normal', 'hard'])('accepts BOT_DIFFICULTY %s', (tier) => {
    expect(loadServerConfig({ BOT_DIFFICULTY: tier }).botDifficulty).toBe(tier);
  });

  it.each([
    ['QUICKPLAY_MODE', 'other', /frenzy.*zoneFrenzy.*alternate/],
    ['BOT_DIFFICULTY', 'expert', /easy.*normal.*hard/],
    ['DEV_CHEATS', 'true', /0.*1/],
    ['DEV_CHEATS', '', /0.*1/],
    ['LOG_LEVEL', 'verbose', /fatal.*error.*warn.*info.*debug.*trace.*silent/],
    ['MATCH_LOG_DIR', '  ', /nonblank/],
    ['BUILD_ID', '\t', /nonblank/],
  ] as const)('rejects invalid %s', (name, value, format) => {
    expect(() => loadServerConfig({ [name]: value })).toThrow(name);
    expect(() => loadServerConfig({ [name]: value })).toThrow(format);
  });
});
