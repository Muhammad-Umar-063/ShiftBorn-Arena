import pino from 'pino';
import { loadServerConfig } from './config.js';
import { createServer } from './server.js';

async function start(): Promise<void> {
  const config = loadServerConfig(process.env);
  const logger = pino({ level: config.logLevel });
  const server = createServer(config, logger);

  try {
    await server.listen(config.port);
    logger.info(
      { port: config.port, buildId: config.buildId },
      'Shiftborn Arena server ready',
    );
  } catch (error) {
    logger.fatal({ err: error, port: config.port }, 'Server startup failed');
    process.exitCode = 1;
  }
}

void start().catch((error: unknown) => {
  process.stderr.write(`Server startup failed: ${String(error)}\n`);
  process.exitCode = 1;
});
