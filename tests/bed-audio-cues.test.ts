import { describe, expect, it } from 'vitest';
import {
  BED_AUDIO_CUES,
  shouldStartBedPlayerScream,
} from '../src/prototype/bed-audio-cues';

describe('bed event audio cues', () => {
  it('starts the monster voice after the source file lead-in', () => {
    expect(BED_AUDIO_CUES.monsterVoiceStartAt).toBeGreaterThan(0);
    expect(BED_AUDIO_CUES.monsterVoiceStartAt).toBeLessThan(1);
  });

  it('keeps the monster voice quiet but above the under-bed background mix', () => {
    expect(BED_AUDIO_CUES.monsterVoiceVolume).toBe(0.12);
    expect(BED_AUDIO_CUES.backgroundVolumeUnderBed).toBe(0.08);
    expect(BED_AUDIO_CUES.monsterVoiceVolume).toBeGreaterThan(
      BED_AUDIO_CUES.backgroundVolumeUnderBed,
    );
  });

  it('plays the monster appearance cue at full volume', () => {
    expect(BED_AUDIO_CUES.monsterAppearanceVolume).toBe(1);
  });

  it('starts the player scream only after the monster fills the death frame', () => {
    expect(BED_AUDIO_CUES.playerScreamVideoTime).toBe(4.45);
    expect(shouldStartBedPlayerScream(4.44, false)).toBe(false);
    expect(shouldStartBedPlayerScream(4.45, false)).toBe(true);
    expect(shouldStartBedPlayerScream(6, true)).toBe(false);
  });
});
