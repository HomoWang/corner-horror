import type { ProtoItemId } from '../shared/protocol';
import {
  chapterTwoProgressPercent,
  isChapterTwoSaveState,
  type ChapterTwoSaveState,
} from '../chapter-two';
import type { PrototypeRoomState, RoomObjectId, ViewId, WardrobeSection } from './room2d';

export const SAVE_SLOT_COUNT = 5;
export const SAVE_ARCHIVE_VERSION = 1;
export const GAME_SAVE_VERSION = 1;

export interface ChapterOneSaveState {
  room: PrototypeRoomState;
  inventorySlots: Array<ProtoItemId | null>;
  collectedItems: ProtoItemId[];
  selectedItem: ProtoItemId | null;
  safeUnlocked: boolean;
  safeCodeFailures: number;
  photoClueRead: boolean;
  pendantActivated: boolean;
  pendantPowered: boolean;
  deskDrawerUnlocked: boolean;
  deskDrawerOpened: boolean;
  cardboardBoxOpened: boolean;
  tapePlayed: boolean;
  antennaInstalled: boolean;
  radioBroadcastHeard: boolean;
  doorUnlockAnnounced: boolean;
  doorScarePlayed: boolean;
  doorScareCompleted: boolean;
  firefighterGearEquipped?: boolean;
}

export interface ChapterOneSaveRecord {
  version: 1;
  chapter: 'chapter-1';
  checkpoint: 'chapter-1-start';
  savedAt: string;
  playtimeMs: number;
  state: ChapterOneSaveState;
}

export interface ChapterTwoSaveRecord {
  version: 1;
  chapter: 'chapter-2';
  checkpoint: 'chapter-2-start';
  savedAt: string;
  playtimeMs: number;
  state: ChapterTwoSaveState;
}

export type GameSaveRecord = ChapterOneSaveRecord | ChapterTwoSaveRecord;

export interface GameSaveArchive {
  schemaVersion: 1;
  checkpoint: GameSaveRecord | null;
  slots: Array<GameSaveRecord | null>;
}

const ITEM_IDS = new Set<ProtoItemId>([
  'receipt',
  'smallKey',
  'oldBattery',
  'tape',
  'pendant',
  'photo',
  'antenna',
  'boxCutter',
  'firefighterGear',
  'firefighterMask',
  'completeFirefighterGear',
]);

const ROOM_OBJECT_IDS = new Set<RoomObjectId>([
  'wardrobe',
  'wardrobeLeft',
  'wardrobeMiddle',
  'wardrobeRight',
  'receipt',
  'table',
  'photo',
  'familyPhoto',
  'firefighterPhoto',
  'girlfriendPhoto',
  'couplePhotoFrame',
  'firefighterAward',
  'safe',
  'cardboardBox',
  'firefighterMask',
  'deskDrawer',
  'tape',
  'antenna',
  'bed',
  'recorder',
  'door',
]);
const VIEW_IDS = new Set<ViewId>(['wardrobe', 'desk', 'back', 'bed']);
const WARDROBE_SECTIONS = new Set<WardrobeSection>(['left', 'middle', 'right']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isItem(value: unknown): value is ProtoItemId {
  return typeof value === 'string' && ITEM_IDS.has(value as ProtoItemId);
}

function isRoomState(value: unknown): value is PrototypeRoomState {
  if (!isRecord(value)) return false;
  return (
    typeof value.view === 'string' &&
    VIEW_IDS.has(value.view as ViewId) &&
    Array.isArray(value.wardrobeOpen) &&
    value.wardrobeOpen.every(
      (part) => typeof part === 'string' && WARDROBE_SECTIONS.has(part as WardrobeSection),
    ) &&
    isBoolean(value.safeOpen) &&
    isBoolean(value.tapeInserted) &&
    isBoolean(value.couplePhotoMounted) &&
    Array.isArray(value.collected) &&
    value.collected.every(
      (id) => typeof id === 'string' && ROOM_OBJECT_IDS.has(id as RoomObjectId),
    )
  );
}

function isChapterOneState(value: unknown): value is ChapterOneSaveState {
  if (!isRecord(value) || !isRoomState(value.room)) return false;
  const booleanKeys: Array<keyof ChapterOneSaveState> = [
    'safeUnlocked',
    'photoClueRead',
    'pendantActivated',
    'pendantPowered',
    'deskDrawerUnlocked',
    'deskDrawerOpened',
    'cardboardBoxOpened',
    'tapePlayed',
    'antennaInstalled',
    'radioBroadcastHeard',
    'doorUnlockAnnounced',
    'doorScarePlayed',
    'doorScareCompleted',
  ];
  return (
    Array.isArray(value.inventorySlots) &&
    value.inventorySlots.length === 12 &&
    value.inventorySlots.every((item) => item === null || isItem(item)) &&
    Array.isArray(value.collectedItems) &&
    value.collectedItems.every(isItem) &&
    (value.selectedItem === null || isItem(value.selectedItem)) &&
    Number.isInteger(value.safeCodeFailures) &&
    (value.safeCodeFailures as number) >= 0 &&
    booleanKeys.every((key) => isBoolean(value[key]))
    && (value.firefighterGearEquipped === undefined || isBoolean(value.firefighterGearEquipped))
  );
}

export function isGameSaveRecord(value: unknown): value is GameSaveRecord {
  if (!isRecord(value)) return false;
  const common =
    value.version === GAME_SAVE_VERSION &&
    typeof value.savedAt === 'string' &&
    Number.isFinite(value.playtimeMs) &&
    (value.playtimeMs as number) >= 0;
  if (!common) return false;
  if (value.chapter === 'chapter-1') {
    return value.checkpoint === 'chapter-1-start' && isChapterOneState(value.state);
  }
  if (value.chapter === 'chapter-2') {
    return value.checkpoint === 'chapter-2-start' && isChapterTwoSaveState(value.state);
  }
  return false;
}

export function createEmptySaveArchive(): GameSaveArchive {
  return {
    schemaVersion: SAVE_ARCHIVE_VERSION,
    checkpoint: null,
    slots: Array.from({ length: SAVE_SLOT_COUNT }, () => null),
  };
}

export function normalizeSaveArchive(value: unknown): GameSaveArchive {
  if (!isRecord(value) || value.schemaVersion !== SAVE_ARCHIVE_VERSION) {
    return createEmptySaveArchive();
  }
  const rawSlots = Array.isArray(value.slots) ? value.slots : [];
  return {
    schemaVersion: SAVE_ARCHIVE_VERSION,
    checkpoint: isGameSaveRecord(value.checkpoint) ? value.checkpoint : null,
    slots: Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => {
      const slot = rawSlots[index];
      return isGameSaveRecord(slot) ? slot : null;
    }),
  };
}

export function writeSaveSlot(
  archive: GameSaveArchive,
  index: number,
  record: GameSaveRecord,
): GameSaveArchive {
  if (!Number.isInteger(index) || index < 0 || index >= SAVE_SLOT_COUNT) return archive;
  const slots = [...archive.slots];
  slots[index] = record;
  return { ...archive, slots };
}

export function clearSaveSlot(archive: GameSaveArchive, index: number): GameSaveArchive {
  if (!Number.isInteger(index) || index < 0 || index >= SAVE_SLOT_COUNT) return archive;
  const slots = [...archive.slots];
  slots[index] = null;
  return { ...archive, slots };
}

export function chapterOneProgressPercent(state: ChapterOneSaveState): number {
  const milestones = [
    state.safeUnlocked,
    state.room.couplePhotoMounted,
    state.pendantPowered,
    state.pendantActivated,
    state.tapePlayed,
    state.antennaInstalled,
    state.radioBroadcastHeard,
    state.collectedItems.includes('completeFirefighterGear'),
    state.firefighterGearEquipped === true,
  ];
  const complete = milestones.filter(Boolean).length;
  return Math.round((complete / milestones.length) * 100);
}

export function gameSaveTitle(record: GameSaveRecord): string {
  if (record.chapter === 'chapter-2') {
    return `第二章｜三樓走廊 ${chapterTwoProgressPercent(record.state)}%`;
  }
  return `第一章｜開端 ${chapterOneProgressPercent(record.state)}%`;
}
