import { describe, expect, it } from 'vitest';
import { buildWebSocketUrl, normalizeRoomCode } from '../src/shared/session';

describe('session connection helpers', () => {
  it('normalizes valid room codes and rejects guessable or malformed values', () => {
    expect(normalizeRoomCode(' 0123456789ABCDEF ')).toBe('0123456789abcdef');
    expect(normalizeRoomCode('short')).toBeNull();
    expect(normalizeRoomCode('0123456789abcde!')).toBeNull();
  });

  it('builds a same-origin WebSocket URL for local development', () => {
    expect(
      buildWebSocketUrl('0123456789abcdef', undefined, 'https://192.168.1.2:5173/index.html'),
    ).toBe('wss://192.168.1.2:5173/ws?room=0123456789abcdef');
  });

  it('uses and normalizes a configured production relay URL', () => {
    expect(
      buildWebSocketUrl(
        '0123456789abcdef',
        'https://corner-horror-relay-homowang.onrender.com/ws',
        'https://homowang.github.io/corner-horror/',
      ),
    ).toBe(
      'wss://corner-horror-relay-homowang.onrender.com/ws?room=0123456789abcdef',
    );
  });
});
