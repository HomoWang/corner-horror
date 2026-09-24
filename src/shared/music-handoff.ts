export const CHAPTER_MUSIC_HANDOFF_KEY = 'room307-chapter-music-handoff-v1';

export interface ChapterMusicHandoff {
  positionSeconds: number;
  durationSeconds: number;
  savedAtMs: number;
  shouldResume: boolean;
}

export function createChapterMusicHandoff(
  positionSeconds: number,
  durationSeconds: number,
  savedAtMs: number,
  shouldResume: boolean,
): ChapterMusicHandoff {
  return {
    positionSeconds: Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0,
    durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0,
    savedAtMs: Number.isFinite(savedAtMs) ? savedAtMs : 0,
    shouldResume,
  };
}

export function musicHandoffPosition(handoff: ChapterMusicHandoff, nowMs: number): number {
  const elapsed = handoff.shouldResume
    ? Math.max(0, nowMs - handoff.savedAtMs) / 1000
    : 0;
  const position = handoff.positionSeconds + elapsed;
  return handoff.durationSeconds > 0 ? position % handoff.durationSeconds : position;
}

export function readChapterMusicHandoff(storage: Storage): ChapterMusicHandoff | null {
  try {
    const raw = storage.getItem(CHAPTER_MUSIC_HANDOFF_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ChapterMusicHandoff>;
    if (
      typeof value.positionSeconds !== 'number' ||
      typeof value.durationSeconds !== 'number' ||
      typeof value.savedAtMs !== 'number' ||
      typeof value.shouldResume !== 'boolean'
    ) return null;
    return createChapterMusicHandoff(
      value.positionSeconds,
      value.durationSeconds,
      value.savedAtMs,
      value.shouldResume,
    );
  } catch {
    return null;
  }
}

export function writeChapterMusicHandoff(storage: Storage, handoff: ChapterMusicHandoff): void {
  storage.setItem(CHAPTER_MUSIC_HANDOFF_KEY, JSON.stringify(handoff));
}

export function clearChapterMusicHandoff(storage: Storage): void {
  storage.removeItem(CHAPTER_MUSIC_HANDOFF_KEY);
}
