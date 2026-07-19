import { describe, expect, it } from 'vitest';
import {
  initialRaidQuality,
  nextRaidQuality,
  raidParticleBudget,
  raidPixelRatio,
} from '../src/shared/raid-performance';

describe('raid performance policy', () => {
  it('starts conservatively on low-memory or low-core devices', () => {
    expect(initialRaidQuality(2, 8)).toBe('low');
    expect(initialRaidQuality(8, 3)).toBe('low');
    expect(initialRaidQuality(4, 8)).toBe('medium');
    expect(initialRaidQuality(8, 8)).toBe('high');
  });

  it('only downgrades quality when measured frame rate is low', () => {
    expect(nextRaidQuality('high', 60)).toBe('high');
    expect(nextRaidQuality('high', 50)).toBe('medium');
    expect(nextRaidQuality('medium', 39)).toBe('low');
    expect(nextRaidQuality('low', 60)).toBe('low');
  });

  it('reduces both resolution and particles together', () => {
    expect(raidPixelRatio('low')).toBeLessThan(raidPixelRatio('high'));
    expect(raidParticleBudget('low')).toBeLessThan(raidParticleBudget('high'));
  });
});
