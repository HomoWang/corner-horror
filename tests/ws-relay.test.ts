import { describe, expect, it } from 'vitest';
import { WsRelay, type RelaySocket } from '../server/ws-relay';

class FakeSocket implements RelaySocket {
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.emit('close');
  }

  on(event: string, cb: (...args: unknown[]) => void): void {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(cb);
    this.listeners.set(event, callbacks);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const callback of this.listeners.get(event) ?? []) callback(...args);
  }

  messages(): unknown[] {
    return this.sent.map((raw) => JSON.parse(raw) as unknown);
  }
}

function hello(socket: FakeSocket, role: 'host' | 'controller'): void {
  socket.emit('message', JSON.stringify({ type: 'hello', role }));
}

describe('WsRelay', () => {
  it('forwards controller input to host and host story output to controller only', () => {
    const relay = new WsRelay();
    const host = new FakeSocket();
    const controller = new FakeSocket();
    relay.handleConnection(host);
    relay.handleConnection(controller);
    hello(host, 'host');
    hello(controller, 'controller');
    host.sent = [];
    controller.sent = [];

    controller.emit('message', JSON.stringify({ type: 'orient', q: [0, 0, 0, 1], t: 1 }));
    controller.emit('message', JSON.stringify({ type: 'ready' }));
    controller.emit('message', JSON.stringify({ type: 'story-action', id: 'answer' }));
    host.emit('message', JSON.stringify({ type: 'cue', id: 'ring' }));
    host.emit('message', JSON.stringify({ type: 'story', screen: 'incoming-407' }));

    expect(host.messages()).toEqual([
      { type: 'orient', q: [0, 0, 0, 1], t: 1 },
      { type: 'ready' },
      { type: 'story-action', id: 'answer' },
    ]);
    expect(controller.messages()).toEqual([
      { type: 'cue', id: 'ring' },
      { type: 'story', screen: 'incoming-407' },
    ]);
  });

  it('last-wins replacement is safe even when close emits synchronously', () => {
    const relay = new WsRelay();
    const host = new FakeSocket();
    const first = new FakeSocket();
    const second = new FakeSocket();
    relay.handleConnection(host);
    relay.handleConnection(first);
    relay.handleConnection(second);
    hello(host, 'host');
    hello(first, 'controller');
    host.sent = [];
    hello(second, 'controller');

    expect(first.closed).toBe(true);
    expect(first.messages()).toContainEqual({ type: 'kick' });
    expect(host.messages()).toEqual([{ type: 'status', controller: true }]);
  });

  it('cleans up an errored controller and notifies the host', () => {
    const relay = new WsRelay();
    const host = new FakeSocket();
    const controller = new FakeSocket();
    relay.handleConnection(host);
    relay.handleConnection(controller);
    hello(host, 'host');
    hello(controller, 'controller');
    host.sent = [];

    controller.emit('error', new Error('broken frame'));
    expect(host.messages()).toEqual([{ type: 'status', controller: false }]);
  });
});
