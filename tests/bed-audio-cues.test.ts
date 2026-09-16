import { describe, expect, it } from 'vitest';
import {
  BED_AUDIO_CUES,
  bedDeathPlaybackRate,
  shouldStartBedPlayerScream,
} from '../src/prototype/bed-audio-cues';

describe('bed event audio cues', () => {
  it('starts the monster voice after the source file lead-in', () => {
    expect(BED_AUDIO_CUES.monsterVoiceStartAt).toBeGreaterThan(0);
    expect(BED_AUDIO_CUES.monsterVoiceStartAt).toBeLessThan(1);
  });

  it('keeps the under-bed monster voice barely audible', () => {
    expect(BED_AUDIO_CUES.monsterVoiceVolume).toBe(0.04);
  });

  it('plays the monster appearance cue at full volume', () => {
    expect(BED_AUDIO_CUES.monsterAppearanceVolume).toBe(1);
  });

  it('keeps the extended monster roar audible beneath the player scream', () => {
    expect(BED_AUDIO_CUES.monsterRoarUnderScreamVolume).toBe(0.72);
    expect(BED_AUDIO_CUES.monsterRoarUnderScreamVolume).toBeLessThan(
      BED_AUDIO_CUES.monsterAppearanceVolume,
    );
  });

  it('starts the player scream only after the monster fills the death frame', () => {
    expect(BED_AUDIO_CUES.playerScreamVideoTime).toBe(4.45);
    expect(shouldStartBedPlayerScream(4.44, false)).toBe(false);
    expect(shouldStartBedPlayerScream(4.45, false)).toBe(true);
    expect(shouldStartBedPlayerScream(6, true)).toBe(false);
  });

  it('speeds up only the attack before the monster reaches the camera', () => {
    expect(bedDeathPlaybackRate(2.02)).toBe(1.35);
    expect(bedDeathPlaybackRate(4.44)).toBe(1.35);
    expect(bedDeathPlaybackRate(4.45)).toBe(1);
  });
});
