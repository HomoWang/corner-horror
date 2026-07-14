// WS relay 核心邏輯：角色管理（host / controller 各一，last-wins）+ 訊息轉發。
// 不依賴 Vite，之後可原樣移入獨立 Node server（C 階段）。

import { parseMessage, type Role } from '../src/shared/protocol';

/** 最小 socket 介面（ws 的 WebSocket 結構上相容），讓 relay 可脫離網路做單元測試 */
export interface RelaySocket {
  send(data: string): void;
  close(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
}

export class WsRelay {
  private host: RelaySocket | null = null;
  private controller: RelaySocket | null = null;

  handleConnection(ws: RelaySocket): void {
    let role: Role | null = null;
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (role === 'host' && this.host === ws) this.host = null;
      if (role === 'controller' && this.controller === ws) {
        this.controller = null;
        this.sendStatus();
      }
    };

    ws.on('message', (data) => {
      if (cleaned) return;
      const msg = parseMessage(typeof data === 'string' ? data : String(data));
      if (!msg) return;

      if (msg.type === 'hello') {
        if (role === null) {
          role = msg.role;
          this.register(role, ws);
        }
        return;
      }
      // controller 的方向、動作與劇情 UI 回應都只轉發給 host。
      if (
        role === 'controller' &&
        (msg.type === 'orient' ||
          msg.type === 'btn' ||
          msg.type === 'ready' ||
          msg.type === 'story-action')
      ) {
        if (this.host) safeSend(this.host, JSON.stringify(msg));
      }
      if (
        role === 'host' &&
        (msg.type === 'cue' || msg.type === 'story' || msg.type === 'fmv-cue')
      ) {
        if (this.controller) safeSend(this.controller, JSON.stringify(msg));
      }
    });

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  }

  private register(role: Role, ws: RelaySocket): void {
    if (role === 'host') {
      const previous = this.host;
      this.host = ws;
      if (previous) {
        // 也送 kick：否則舊 host 頁會自動重連，兩個 host 分頁互踢成無限迴圈
        safeSend(previous, JSON.stringify({ type: 'kick' }));
        previous.close();
      }
    } else {
      const previous = this.controller;
      this.controller = ws;
      if (previous) {
        safeSend(previous, JSON.stringify({ type: 'kick' }));
        previous.close();
      }
    }
    this.sendStatus();
  }

  private sendStatus(): void {
    if (this.host) {
      safeSend(
        this.host,
        JSON.stringify({ type: 'status', controller: this.controller !== null }),
      );
    }
  }
}

function safeSend(ws: RelaySocket, data: string): void {
  try {
    ws.send(data);
  } catch {
    // 連線正在關閉時 send 會丟例外；忽略，close 事件會做清理
  }
}
