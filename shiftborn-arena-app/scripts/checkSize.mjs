import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const sizeLimitBytes = 5 * 1024 * 1024;

async function gzippedSize(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await gzippedSize(path);
    } else if (entry.isFile()) {
      total += gzipSync(await readFile(path)).byteLength;
    }
  }
  return total;
}

export async function checkClientSize(distDirectory) {
  const directory = await stat(distDirectory).catch((error) => {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  });
  if (directory === undefined) {
    return undefined;
  }
  if (!directory.isDirectory()) {
    throw new Error(`Client dist path is not a directory: ${distDirectory}`);
  }
  const total = await gzippedSize(distDirectory);
  if (total >= sizeLimitBytes) {
    throw new Error(
      `Client dist is ${total} bytes gzipped; it must be under 5 MB.`,
    );
  }
  return total;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const total = await checkClientSize(
      resolve(process.argv[2] ?? 'apps/client/dist'),
    );
    if (total === undefined) {
      console.log(
        'Client dist is absent; size check passes until the client builds.',
      );
    } else {
      console.log(
        `Client dist gzipped size: ${total} bytes (limit: ${sizeLimitBytes} bytes).`,
      );
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
