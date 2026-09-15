export const BED_SHAKE_TARGET = 5.4;

export function addBedShakeProgress(current: number, intensity: number): number {
  const boundedIntensity = Math.max(0, Math.min(1, intensity));
  return Math.min(BED_SHAKE_TARGET, current + 0.72 + boundedIntensity * 0.55);
}

export function hasEscapedBedGrab(progress: number): boolean {
  return progress >= BED_SHAKE_TARGET;
}
