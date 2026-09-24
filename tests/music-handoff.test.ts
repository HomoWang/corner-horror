import { describe, expect, it } from 'vitest';
import {
  createChapterMusicHandoff,
  musicHandoffPosition,
} from '../src/shared/music-handoff';

describe('chapter music handoff', () => {
  it('continues from the same timeline across a chapter navigation gap', () => {
    const handoff = createChapterMusicHandoff(18, 60, 1_000, true);
    expect(musicHandoffPosition(handoff, 3_500)).toBe(20.5);
  });

  it('wraps a looping track and does not advance a paused track', () => {
    const playing = createChapterMusicHandoff(59, 60, 1_000, true);
    const paused = createChapterMusicHandoff(22, 60, 1_000, false);
    expect(musicHandoffPosition(playing, 3_000)).toBe(1);
    expect(musicHandoffPosition(paused, 9_000)).toBe(22);
  });
});
