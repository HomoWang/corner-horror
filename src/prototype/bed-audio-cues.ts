export const BED_AUDIO_CUES = {
  monsterVoiceStartAt: 0.82,
  monsterVoiceVolume: 0.04,
  backgroundVolumeUnderBed: 0.08,
  monsterAppearanceVolume: 1,
  deathVolume: 0.7,
  playerScreamVolume: 0.92,
  playerScreamVideoTime: 4.45,
  deathAttackPlaybackRate: 1.35,
} as const;

export function shouldStartBedPlayerScream(
  videoTime: number,
  hasStarted: boolean,
): boolean {
  return !hasStarted && videoTime >= BED_AUDIO_CUES.playerScreamVideoTime;
}

export function bedDeathPlaybackRate(videoTime: number): number {
  return videoTime < BED_AUDIO_CUES.playerScreamVideoTime
    ? BED_AUDIO_CUES.deathAttackPlaybackRate
    : 1;
}
