export type RaidQuality = 'low' | 'medium' | 'high';

export function initialRaidQuality(cores: number, memoryGb: number): RaidQuality {
  if (memoryGb <= 3 || cores <= 2) return 'low';
  if (memoryGb <= 5 || cores <= 4) return 'medium';
  return 'high';
}

export function nextRaidQuality(current: RaidQuality, fps: number): RaidQuality {
  if (fps < 42) return 'low';
  if (fps < 53 && current === 'high') return 'medium';
  return current;
}

export function raidPixelRatio(quality: RaidQuality): number {
  if (quality === 'high') return 1.25;
  if (quality === 'medium') return 1;
  return 0.78;
}

export function raidParticleBudget(quality: RaidQuality): number {
  if (quality === 'high') return 260;
  if (quality === 'medium') return 150;
  return 70;
}
