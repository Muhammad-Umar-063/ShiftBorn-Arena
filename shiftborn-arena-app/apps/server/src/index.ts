import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import pino from 'pino';
import { loadServerConfig } from './config.js';

interface HealthRequest {
  get(name: string): string | undefined;
}

interface HealthResponse {
  set(name: string, value: string): unknown;
  removeHeader(name: string): unknown;
  json(body: { status: 'healthy'; buildId: string }): unknown;
}

async function start(): Promise<void> {
  const config = loadServerConfig(process.env);
  const logger = pino({ level: config.logLevel });
  const server = new Server({
    greet: false,
    logger,
    // ARCHITECTURE §5.5: only the configured browser origin may open a socket.
    transport: new WebSocketTransport({
      beforeUpgrade(request) {
        const origin = request.headers.get('origin');
        if (origin && origin !== config.publicOrigin) {
          return new Response('Origin not allowed', { status: 403 });
        }
      },
    }),
    express(app) {
      app.get(
        '/healthz',
        (request: HealthRequest, response: HealthResponse) => {
          response.set('Vary', 'Origin');
          if (request.get('origin') === config.publicOrigin) {
            response.set('Access-Control-Allow-Origin', config.publicOrigin);
          } else {
            // Colyseus enables wildcard CORS on its Express app by default.
            response.removeHeader('Access-Control-Allow-Origin');
          }
          response.json({ status: 'healthy', buildId: config.buildId });
        },
      );
    },
  });

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
