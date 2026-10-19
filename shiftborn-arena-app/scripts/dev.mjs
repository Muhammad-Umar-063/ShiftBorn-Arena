import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = resolve(root, 'apps/server');
const clientRoot = resolve(root, 'apps/client');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const active = new Set();
const expectedStops = new WeakSet();
let stopping = false;
let server;
let restartQueue = Promise.resolve();

function stopChild(child) {
  if (
    !child ||
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  )
    return;
  expectedStops.add(child);
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function shutdown(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of active) stopChild(child);
  await Promise.all([...active].map((child) => child.closed));
  process.exitCode = exitCode;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => void shutdown(0));
}

function writeLines(name, stream, onLine) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        process.stdout.write(`[${name}] ${line}\n`);
        onLine?.(line);
      }
    }
  });
  stream.on('end', () => {
    if (pending.trim()) process.stdout.write(`[${name}] ${pending}\n`);
  });
}

function launch(name, command, args, onLine, cwd = root) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  active.add(child);
  writeLines(name, child.stdout, onLine);
  writeLines(name, child.stderr);
  child.closed = new Promise((resolveClose) => {
    child.once('error', (error) => {
      process.stderr.write(`[${name}] ${error.message}\n`);
    });
    child.once('close', (code, signal) => {
      active.delete(child);
      resolveClose({ code, signal });
      if (!stopping && !expectedStops.has(child) && name !== 'build') {
        process.stderr.write(
          `[${name}] exited unexpectedly (${signal ?? code})\n`,
        );
        void shutdown(1);
      }
    });
  });
  return child;
}

async function build(filter) {
  const child = launch('build', pnpm, ['--filter', filter, 'build']);
  const { code } = await child.closed;
  if (code !== 0 && !stopping)
    throw new Error(`${filter} initial build failed`);
}

async function restartServer() {
  if (stopping) return;
  if (server) {
    stopChild(server);
    await server.closed;
  }
  if (stopping) return;
  server = launch('server', process.execPath, [
    '--env-file-if-exists=.env',
    'apps/server/dist/index.js',
  ]);
}

async function main() {
  // A clean clone has no ignored dist files; build dependencies before watching.
  await build('@shiftborn/shared');
  if (stopping) return;
  await build('@shiftborn/sim');
  if (stopping) return;
  await build('@shiftborn/server');
  if (stopping) return;

  launch(
    'server:watch',
    process.execPath,
    [
      resolve(root, 'node_modules/typescript/bin/tsc'),
      '--watch',
      '--pretty',
      'false',
      '--preserveWatchOutput',
      '-p',
      'tsconfig.json',
    ],
    (line) => {
      if (/Found 0 errors\. Watching for file changes\./.test(line)) {
        restartQueue = restartQueue.then(restartServer).catch((error) => {
          process.stderr.write(`[server] restart failed: ${String(error)}\n`);
          return shutdown(1);
        });
      }
    },
    serverRoot,
  );
  if (stopping) return;
  launch(
    'client',
    process.execPath,
    [resolve(clientRoot, 'node_modules/vite/bin/vite.js')],
    undefined,
    clientRoot,
  );
}

main().catch((error) => {
  process.stderr.write(`[dev] ${String(error)}\n`);
  void shutdown(1);
});
