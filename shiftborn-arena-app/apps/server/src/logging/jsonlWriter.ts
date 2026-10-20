import { once } from 'node:events';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { finished } from 'node:stream/promises';
import { createGzip, type Gzip } from 'node:zlib';
import type { Logger } from 'pino';

const MAX_PENDING_BYTES = 1 << 20;

/** Ordered, bounded asynchronous output; room ticks only enqueue copied JSON. */
export class JsonlWriter {
  private readonly lines: string[] = [];
  private pendingBytes = 0;
  private output: WriteStream | null = null;
  private gzip: Gzip | null = null;
  private pumpPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;
  private failed = false;
  private readonly ready: Promise<void>;

  constructor(
    private readonly path: string,
    private readonly compressed: boolean,
    private readonly logger: Logger,
  ) {
    this.ready = this.open().catch((error: unknown) => this.fail(error));
  }

  private async open(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const output = createWriteStream(this.path, { flags: 'wx' });
    this.output = output;
    output.on('error', (error: Error) => this.fail(error));
    if (this.compressed) {
      const gzip = createGzip();
      this.gzip = gzip;
      gzip.on('error', (error: Error) => this.fail(error));
      gzip.pipe(output);
    }
  }

  write(record: unknown): boolean {
    if (this.failed || this.closePromise !== null) return false;
    let line: string;
    try {
      line = `${JSON.stringify(record)}\n`;
      if (line === 'undefined\n') throw new TypeError('invalid JSONL record');
    } catch (error: unknown) {
      this.fail(error);
      return false;
    }
    const bytes = Buffer.byteLength(line);
    if (this.pendingBytes + bytes > MAX_PENDING_BYTES) {
      this.fail(new Error('match log backpressure limit exceeded'));
      return false;
    }
    this.lines.push(line);
    this.pendingBytes += bytes;
    this.startPump();
    return true;
  }

  private startPump(): void {
    if (this.pumpPromise !== null || this.failed) return;
    this.pumpPromise = this.pump().catch((error: unknown) => this.fail(error))
      .finally(() => {
        this.pumpPromise = null;
        if (this.lines.length > 0 && !this.failed) this.startPump();
      });
  }

  private async pump(): Promise<void> {
    await this.ready;
    const input = this.gzip ?? this.output;
    if (input === null || this.failed) return;
    while (this.lines.length > 0 && !this.failed) {
      const line = this.lines.shift();
      if (line === undefined) break;
      this.pendingBytes -= Buffer.byteLength(line);
      if (!input.write(line)) await once(input, 'drain');
    }
  }

  private fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    this.lines.length = 0;
    this.pendingBytes = 0;
    this.logger.error({ err: error, path: this.path }, 'match_log_write_error');
    this.gzip?.destroy();
    this.output?.destroy();
  }

  close(): Promise<void> {
    if (this.closePromise !== null) return this.closePromise;
    this.closePromise = this.finish().catch((error: unknown) => this.fail(error));
    return this.closePromise;
  }

  private async finish(): Promise<void> {
    await this.ready;
    while (this.pumpPromise !== null) await this.pumpPromise;
    const input = this.gzip ?? this.output;
    const output = this.output;
    if (input === null || output === null || this.failed) return;
    input.end();
    await finished(output);
  }
}
