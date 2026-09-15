import { describe, expect, it } from 'vitest';
import { advanceHorizontalCut, beginHorizontalCut } from '../src/prototype/horizontal-cut-gesture';

describe('horizontal cardboard-box cutting gesture', () => {
  it('starts across the broad lid-seam interaction area', () => {
    expect(beginHorizontalCut(0.18, 0.5, 0)).not.toBeNull();
    expect(beginHorizontalCut(0.82, 0.5, 0)).not.toBeNull();
    expect(beginHorizontalCut(0.5, 0.98, 0)).toBeNull();
  });

  it('completes after a deliberate left-to-right stroke', () => {
    const started = beginHorizontalCut(0.18, 0.5, 0)!;
    const midway = advanceHorizontalCut(started, 0.4, 0.52, 160);
    expect(midway.status).toBe('active');
    const completed = advanceHorizontalCut(midway.gesture, 0.68, 0.49, 320);
    expect(completed.status).toBe('completed');
    expect(completed.gesture.progress).toBe(1);
  });

  it('also accepts a right-to-left stroke', () => {
    const started = beginHorizontalCut(0.82, 0.48, 0)!;
    const completed = advanceHorizontalCut(started, 0.32, 0.5, 260);
    expect(completed.status).toBe('completed');
    expect(completed.gesture.direction).toBe(-1);
  });

  it('rejects an instantaneous jump but completes after a held stroke', () => {
    const started = beginHorizontalCut(0.16, 0.5, 0)!;
    const tooFast = advanceHorizontalCut(started, 0.66, 0.5, 60);
    expect(tooFast.status).toBe('active');
    expect(advanceHorizontalCut(tooFast.gesture, 0.66, 0.5, 150).status).toBe('completed');
  });

  it('cancels when the cursor leaves the lid-seam corridor', () => {
    const started = beginHorizontalCut(0.2, 0.5, 0)!;
    expect(advanceHorizontalCut(started, 0.42, 0.98, 200).status).toBe('cancelled');
  });

  it('cancels a clear reversal after direction is established', () => {
    const started = beginHorizontalCut(0.2, 0.5, 0)!;
    const right = advanceHorizontalCut(started, 0.44, 0.5, 160);
    expect(advanceHorizontalCut(right.gesture, 0.25, 0.5, 280).status).toBe('cancelled');
  });
});
