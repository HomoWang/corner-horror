// Vite plugin：把 WS relay 掛在 Vite 自己的 httpServer 上（同 port、同憑證），
// 並提供 /api/net 回傳區網 IP 供 host 頁組 controller 的 QR URL。

import os from 'node:os';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import { RoomRelayRegistry } from './room-relays';
import type { RelaySocket } from './ws-relay';

/** 取區網 IPv4；偏好常見私有網段（虛擬網卡常佔 172.x 等其他段） */
export function getLanIp(): string | null {
  const candidates: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push(net.address);
    }
  }
  return (
    candidates.find((ip) => ip.startsWith('192.168.')) ??
    candidates.find((ip) => ip.startsWith('10.')) ??
    candidates[0] ??
    null
  );
}

export function wsRelayPlugin(): Plugin {
  return {
    name: 'corner-horror:ws-relay',
    configureServer(server) {
      const rooms = new RoomRelayRegistry();
      const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

      server.httpServer?.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url ?? '/', 'https://localhost');
        if (url.pathname !== '/ws') return; // 其餘 upgrade（含 Vite HMR）放行
        const relay = rooms.get(url.searchParams.get('room'));
        if (!relay) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          relay.handleConnection(ws as unknown as RelaySocket);
        });
      });

      server.middlewares.use('/api/net', (_req, res) => {
        const address = server.httpServer?.address();
        const port =
          typeof address === 'object' && address !== null ? address.port : 5173;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ip: getLanIp(), port }));
      });
    },
  };
}
