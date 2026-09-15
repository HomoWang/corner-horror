import { describe, expect, it } from 'vitest';
import { parseMessage } from '../src/shared/protocol';

describe('parseMessage', () => {
  it('accepts connection lifecycle messages', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', role: 'host' }))).toEqual({
      type: 'hello',
      role: 'host',
    });
    expect(parseMessage(JSON.stringify({ type: 'hello', role: 'controller' }))).toEqual({
      type: 'hello',
      role: 'controller',
    });
    expect(parseMessage(JSON.stringify({ type: 'ready' }))).toEqual({ type: 'ready' });
    expect(parseMessage(JSON.stringify({ type: 'status', controller: true }))).toEqual({
      type: 'status',
      controller: true,
    });
    expect(parseMessage(JSON.stringify({ type: 'kick' }))).toEqual({ type: 'kick' });
  });

  it('validates pointer, movement, navigation, and interaction input', () => {
    expect(
      parseMessage(JSON.stringify({ type: 'proto-pointer', x: 2, y: -2, t: 10 })),
    ).toEqual({ type: 'proto-pointer', x: 1, y: -1, t: 10 });
    expect(parseMessage(JSON.stringify({ type: 'proto-move', x: 0.4, y: -0.3 }))).toEqual({
      type: 'proto-move',
      x: 0.4,
      y: -0.3,
    });
    expect(
      parseMessage(JSON.stringify({ type: 'proto-shake', intensity: 1.8, t: 20 })),
    ).toEqual({ type: 'proto-shake', intensity: 1, t: 20 });
    expect(parseMessage(JSON.stringify({ type: 'proto-navigate', direction: 'left' }))).toEqual({
      type: 'proto-navigate',
      direction: 'left',
    });
    expect(parseMessage(JSON.stringify({ type: 'proto-interact' }))).toEqual({
      type: 'proto-interact',
    });
    expect(parseMessage(JSON.stringify({ type: 'proto-use', pressed: true }))).toEqual({
      type: 'proto-use',
      pressed: true,
    });
    expect(parseMessage(JSON.stringify({ type: 'proto-shake', intensity: 'high', t: 20 }))).toBeNull();
    expect(
      parseMessage(JSON.stringify({ type: 'proto-navigate', direction: 'diagonal' })),
    ).toBeNull();
  });

  it('validates inventory actions and six-slot controller state', () => {
    expect(
      parseMessage(
        JSON.stringify({ type: 'proto-item-action', item: 'receipt', action: 'inspect' }),
      ),
    ).toEqual({ type: 'proto-item-action', item: 'receipt', action: 'inspect' });
    expect(
      parseMessage(
        JSON.stringify({ type: 'proto-item-action', item: 'antenna', action: 'use' }),
      ),
    ).toEqual({ type: 'proto-item-action', item: 'antenna', action: 'use' });
    expect(
      parseMessage(
        JSON.stringify({
          type: 'proto-controller-state',
          inventoryOpen: true,
          slots: ['receipt', 'tape', null, null, null, null],
          selectedItem: 'tape',
          detailItem: 'receipt',
        }),
      ),
    ).toEqual({
      type: 'proto-controller-state',
      inventoryOpen: true,
      slots: ['receipt', 'tape', null, null, null, null],
      selectedItem: 'tape',
      detailItem: 'receipt',
    });
    expect(
      parseMessage(JSON.stringify({ type: 'proto-item-action', item: 'key', action: 'use' })),
    ).toBeNull();
    for (const restoredItem of [
      'oldBattery',
      'smallKey',
      'boxCutter',
      'firefighterGear',
      'firefighterMask',
      'completeFirefighterGear',
    ]) {
      expect(
        parseMessage(
          JSON.stringify({ type: 'proto-item-action', item: restoredItem, action: 'use' }),
        ),
      ).toEqual({ type: 'proto-item-action', item: restoredItem, action: 'use' });
    }
    for (const removedItem of ['pencil']) {
      expect(
        parseMessage(
          JSON.stringify({ type: 'proto-item-action', item: removedItem, action: 'use' }),
        ),
      ).toBeNull();
    }
  });

  it('validates phone vibration patterns', () => {
    expect(parseMessage(JSON.stringify({ type: 'proto-vibrate', pattern: [220, 130, 220] }))).toEqual({
      type: 'proto-vibrate',
      pattern: [220, 130, 220],
    });
    expect(parseMessage(JSON.stringify({ type: 'proto-vibrate', pattern: [3000] }))).toBeNull();
  });

  it('rejects malformed and legacy story messages', () => {
    expect(parseMessage(42)).toBeNull();
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'hello', role: 'admin' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'story', screen: 'legacy-screen' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
  });
});
