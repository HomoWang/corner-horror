const ROOM_PATTERN = /^[a-z0-9]{16,32}$/;

export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return ROOM_PATTERN.test(normalized) ? normalized : null;
}

export function createRoomCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildWebSocketUrl(room: string, endpoint: string | undefined, pageHref: string): string {
  const normalizedRoom = normalizeRoomCode(room);
  if (!normalizedRoom) throw new Error('Invalid room code');

  const pageUrl = new URL(pageHref);
  const configuredEndpoint = endpoint?.trim();
  const socketUrl = configuredEndpoint
    ? new URL(configuredEndpoint, pageUrl)
    : new URL('/ws', pageUrl.origin);

  if (socketUrl.protocol === 'http:') socketUrl.protocol = 'ws:';
  if (socketUrl.protocol === 'https:') socketUrl.protocol = 'wss:';
  if (socketUrl.protocol !== 'ws:' && socketUrl.protocol !== 'wss:') {
    throw new Error('WebSocket endpoint must use ws, wss, http, or https');
  }
  socketUrl.searchParams.set('room', normalizedRoom);
  return socketUrl.toString();
}
