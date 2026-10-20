import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import pino, { type Logger } from 'pino';
import type { ServerConfig } from './config.js';
import { ArenaRoom } from './rooms/ArenaRoom.js';

// NETWORK_PROTOCOL §14: maximum complete WebSocket message size is 4 KiB.
export const MAX_WS_MESSAGE_BYTES = 4 * 1024;

interface HealthRequest {
  get(name: string): string | undefined;
}

interface HealthResponse {
  set(name: string, value: string): unknown;
  removeHeader(name: string): unknown;
  json(body: { status: 'healthy'; buildId: string }): unknown;
}

/** Construction is side-effect free; the caller decides when to listen. */
export function createServer(
  config: ServerConfig,
  logger: Logger = pino({ level: config.logLevel }),
  roomClass: typeof ArenaRoom = ArenaRoom,
): Server {
  const server = new Server({
    greet: false,
    logger,
    // ARCHITECTURE §5.5: only the configured browser origin may open a socket.
    transport: new WebSocketTransport({
      maxPayload: MAX_WS_MESSAGE_BYTES,
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
            response.removeHeader('Access-Control-Allow-Origin');
          }
          response.json({ status: 'healthy', buildId: config.buildId });
        },
      );
    },
  });
  server.define('arena', roomClass);
  return server;
}
