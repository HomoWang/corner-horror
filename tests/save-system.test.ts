import { describe, expect, it } from 'vitest';
import {
  chapterOneProgressPercent,
  clearSaveSlot,
  createEmptySaveArchive,
  normalizeSaveArchive,
  SAVE_SLOT_COUNT,
  writeSaveSlot,
  type GameSaveRecord,
} from '../src/prototype/save-system';

function record(): GameSaveRecord {
  return {
    version: 1,
    chapter: 'chapter-1',
    checkpoint: 'chapter-1-start',
    savedAt: '2026-09-17T12:00:00.000Z',
    playtimeMs: 5000,
    state: {
      room: {
        view: 'wardrobe',
        wardrobeOpen: [],
        safeOpen: false,
        tapeInserted: false,
        couplePhotoMounted: false,
        collected: [],
      },
      inventorySlots: Array(12).fill(null),
      collectedItems: [],
      selectedItem: null,
      safeUnlocked: false,
      safeCodeFailures: 0,
      photoClueRead: false,
      pendantActivated: false,
      pendantPowered: false,
      deskDrawerUnlocked: false,
      deskDrawerOpened: false,
      cardboardBoxOpened: false,
      tapePlayed: false,
      antennaInstalled: false,
      radioBroadcastHeard: false,
      doorUnlockAnnounced: false,
      doorScarePlayed: false,
      doorScareCompleted: false,
    },
  };
}

describe('save archive', () => {
  it('always exposes five manual save slots', () => {
    expect(createEmptySaveArchive().slots).toHaveLength(SAVE_SLOT_COUNT);
    expect(normalizeSaveArchive({ schemaVersion: 1, slots: [] }).slots).toHaveLength(5);
  });

  it('writes and clears one slot without changing the others', () => {
    const saved = writeSaveSlot(createEmptySaveArchive(), 2, record());
    expect(saved.slots[2]?.playtimeMs).toBe(5000);
    expect(saved.slots.filter(Boolean)).toHaveLength(1);
    expect(clearSaveSlot(saved, 2).slots.every((slot) => slot === null)).toBe(true);
  });

  it('overwrites an occupied slot while preserving the other slots', () => {
    const first = record();
    const second = { ...record(), savedAt: '2026-09-18T08:30:00.000Z', playtimeMs: 42000 };
    const other = { ...record(), playtimeMs: 9000 };
    const withTwoSlots = writeSaveSlot(writeSaveSlot(createEmptySaveArchive(), 0, first), 1, other);
    const overwritten = writeSaveSlot(withTwoSlots, 0, second);

    expect(overwritten.slots[0]?.savedAt).toBe(second.savedAt);
    expect(overwritten.slots[0]?.playtimeMs).toBe(42000);
    expect(overwritten.slots[1]?.playtimeMs).toBe(9000);
    expect(overwritten.slots.filter(Boolean)).toHaveLength(2);
  });

  it('rejects malformed saves instead of loading partial state', () => {
    const archive = normalizeSaveArchive({
      schemaVersion: 1,
      checkpoint: { version: 1, chapter: 'chapter-1' },
      slots: [{ version: 1, chapter: 'chapter-1' }],
    });
    expect(archive.checkpoint).toBeNull();
    expect(archive.slots.every((slot) => slot === null)).toBe(true);
  });

  it('calculates chapter progress from persistent milestones', () => {
    const save = record();
    expect(chapterOneProgressPercent(save.state)).toBe(0);
    save.state.safeUnlocked = true;
    save.state.room.couplePhotoMounted = true;
    save.state.pendantPowered = true;
    save.state.pendantActivated = true;
    save.state.tapePlayed = true;
    save.state.antennaInstalled = true;
    save.state.radioBroadcastHeard = true;
    expect(chapterOneProgressPercent(save.state)).toBe(100);
  });
});
