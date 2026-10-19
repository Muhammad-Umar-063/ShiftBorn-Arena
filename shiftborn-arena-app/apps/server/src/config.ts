export type QuickplayMode = 'frenzy' | 'zoneFrenzy' | 'alternate';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type LogLevel =
  'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface ServerConfig {
  readonly port: number;
  readonly publicOrigin: string;
  readonly quickplayMode: QuickplayMode;
  readonly botDifficulty: BotDifficulty;
  readonly matchLogDir: string;
  readonly devCheats: boolean;
  readonly logLevel: LogLevel;
  readonly buildId: string;
}

function oneOf<T extends string>(
  name: string,
  value: string,
  accepted: readonly T[],
): T {
  if (!accepted.includes(value as T)) {
    throw new Error(`${name} must be one of: ${accepted.join(', ')}`);
  }
  return value as T;
}

function nonblank(name: string, value: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must be a nonblank string`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return port;
}

function parseOrigin(value: string): string {
  const format =
    'PUBLIC_ORIGIN must be an absolute HTTP or HTTPS origin without path, query, fragment, or credentials';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(format);
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.hostname ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    value !== value.trim()
  ) {
    throw new Error(format);
  }
  return url.origin;
}

// ARCHITECTURE §5.5: parse once before any listening socket is opened.
export function loadServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerConfig {
  const port = parsePort(env.PORT ?? '2567');
  const publicOrigin = parseOrigin(
    env.PUBLIC_ORIGIN ?? 'http://localhost:5173',
  );
  const quickplayMode = oneOf(
    'QUICKPLAY_MODE',
    env.QUICKPLAY_MODE ?? 'frenzy',
    ['frenzy', 'zoneFrenzy', 'alternate'] as const,
  );
  const botDifficulty = oneOf(
    'BOT_DIFFICULTY',
    env.BOT_DIFFICULTY ?? 'normal',
    ['easy', 'normal', 'hard'] as const,
  );
  const matchLogDir = nonblank(
    'MATCH_LOG_DIR',
    env.MATCH_LOG_DIR ?? './data/matches',
  );
  const devCheats =
    oneOf('DEV_CHEATS', env.DEV_CHEATS ?? '0', ['0', '1'] as const) === '1';
  const logLevel = oneOf('LOG_LEVEL', env.LOG_LEVEL ?? 'info', [
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ] as const);
  const buildId = nonblank('BUILD_ID', env.BUILD_ID ?? 'dev');

  return {
    port,
    publicOrigin,
    quickplayMode,
    botDifficulty,
    matchLogDir,
    devCheats,
    logLevel,
    buildId,
  };
}
