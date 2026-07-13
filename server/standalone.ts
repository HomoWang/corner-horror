import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { RoomRelayRegistry } from './room-relays';
import type { RelaySocket } from './ws-relay';

const port = Number.parseInt(process.env.PORT ?? '10000', 10);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const rooms = new RoomRelayRegistry();
const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

function originAllowed(origin: string | undefined): boolean {
  return allowedOrigins.size === 0 || (origin !== undefined && allowedOrigins.has(origin));
}

function rejectUpgrade(socket: { write(data: string): void; destroy(): void }, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ok: true, service: 'corner-horror-relay' }));
    return;
  }
  res.statusCode = 404;
  res.end('Not found');
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    rejectUpgrade(socket, '404 Not Found');
    return;
  }
  if (!originAllowed(req.headers.origin)) {
    rejectUpgrade(socket, '403 Forbidden');
    return;
  }
  const relay = rooms.get(url.searchParams.get('room'));
  if (!relay) {
    rejectUpgrade(socket, '400 Bad Request');
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    relay.handleConnection(ws as unknown as RelaySocket);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`corner-horror relay listening on ${port}`);
});
