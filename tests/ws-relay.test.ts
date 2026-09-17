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

  on(event: string, callback: (...args: unknown[]) => void): void {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(callback);
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
  it('forwards controller input to the host and host state to the controller', () => {
    const relay = new WsRelay();
    const host = new FakeSocket();
    const controller = new FakeSocket();
    relay.handleConnection(host);
    relay.handleConnection(controller);
    hello(host, 'host');
    hello(controller, 'controller');
    host.sent = [];
    controller.sent = [];

    controller.emit('message', JSON.stringify({ type: 'proto-interact' }));
    controller.emit(
      'message',
      JSON.stringify({ type: 'proto-shake', intensity: 0.8, t: 1_750_000_000_000 }),
    );
    controller.emit(
      'message',
      JSON.stringify({ type: 'proto-item-action', item: 'receipt', action: 'inspect' }),
    );
    controller.emit('message', JSON.stringify({ type: 'proto-pause' }));
    host.emit('message', JSON.stringify({ type: 'proto-vibrate', pattern: [35] }));
    host.emit(
      'message',
      JSON.stringify({
        type: 'proto-controller-state',
        inventoryOpen: false,
        slots: [null, null, null, null, null, null, null, null, null, null, null, null],
      }),
    );

    expect(host.messages()).toEqual([
      { type: 'proto-interact' },
      { type: 'proto-shake', intensity: 0.8, t: 1_750_000_000_000 },
      { type: 'proto-item-action', item: 'receipt', action: 'inspect' },
      { type: 'proto-pause' },
    ]);
    expect(controller.messages()).toEqual([
      { type: 'proto-vibrate', pattern: [35] },
      {
        type: 'proto-controller-state',
        inventoryOpen: false,
        slots: [null, null, null, null, null, null, null, null, null, null, null, null],
      },
    ]);
  });

  it('safely replaces an older controller', () => {
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
