import { describe, expect, it } from 'vitest';
import {
  chapterTwoProgressPercent,
  completeChapterTwoTrigger,
  corridorHighLookLimit,
  createChapterTwoStartState,
  isChapterTwoSaveState,
  shouldTriggerHypoxiaDeath,
} from '../src/chapter-two';

describe('chapter two corridor state', () => {
  it('starts at the corridor entrance with only T01 completed', () => {
    const state = createChapterTwoStartState();
    expect(state.completedTriggers).toEqual(['T01']);
    expect(state.pose).toEqual({ x: 0, z: 1.2, yaw: 0 });
    expect(chapterTwoProgressPercent(state)).toBe(7);
  });

  it('records a trigger only once', () => {
    const first = completeChapterTwoTrigger(createChapterTwoStartState(), 'T02');
    const second = completeChapterTwoTrigger(first, 'T02');
    expect(second.completedTriggers.filter((trigger) => trigger === 'T02')).toHaveLength(1);
  });

  it('uses the stricter smoke limit in the middle corridor', () => {
    expect(corridorHighLookLimit(-6)).toBe(1);
    expect(corridorHighLookLimit(-12)).toBe(0.5);
    expect(shouldTriggerHypoxiaDeath(1.76, -12)).toBe(true);
    expect(shouldTriggerHypoxiaDeath(1.76, -6)).toBe(false);
  });

  it('rejects incomplete chapter two saves', () => {
    const state = createChapterTwoStartState();
    expect(isChapterTwoSaveState(state)).toBe(true);
    expect(isChapterTwoSaveState({ ...state, fireDoorOpened: 'yes' })).toBe(false);
  });
});
