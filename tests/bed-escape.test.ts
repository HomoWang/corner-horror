import { describe, expect, it } from 'vitest';
import {
  addBedShakeProgress,
  BED_SHAKE_TARGET,
  hasEscapedBedGrab,
} from '../src/prototype/bed-escape';

describe('bed grab escape progress', () => {
  it('requires repeated shake impulses before succeeding', () => {
    let progress = 0;
    for (let index = 0; index < 5; index += 1) progress = addBedShakeProgress(progress, 0.5);
    expect(hasEscapedBedGrab(progress)).toBe(false);
    progress = addBedShakeProgress(progress, 0.5);
    expect(hasEscapedBedGrab(progress)).toBe(true);
  });

  it('clamps invalid intensity and never exceeds the target', () => {
    expect(addBedShakeProgress(0, -4)).toBeCloseTo(0.72);
    expect(addBedShakeProgress(BED_SHAKE_TARGET - 0.1, 8)).toBe(BED_SHAKE_TARGET);
  });
});
