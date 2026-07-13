import { normalizeRoomCode } from '../src/shared/session';
import { WsRelay } from './ws-relay';

export class RoomRelayRegistry {
  private readonly rooms = new Map<string, WsRelay>();

  get(roomValue: unknown): WsRelay | null {
    const room = normalizeRoomCode(roomValue);
    if (!room) return null;
    let relay = this.rooms.get(room);
    if (!relay) {
      relay = new WsRelay();
      this.rooms.set(room, relay);
    }
    return relay;
  }
}
