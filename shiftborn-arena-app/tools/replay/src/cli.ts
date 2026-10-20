import { replayMatchLog } from './replay.js';

async function main(): Promise<void> {
  const path = process.argv[2];
  if (path === undefined) throw new TypeError('usage: pnpm replay <match-log>');
  const result = await replayMatchLog(path);
  process.stdout.write(
    `matchId ${result.matchId}\nticks replayed ${result.ticksReplayed}\nmatching final hash ${result.finalHash}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`replay failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
