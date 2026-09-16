import { describe, expect, it } from 'vitest';
import { BED_AUDIO_CUES } from '../src/prototype/bed-audio-cues';

describe('bed event audio cues', () => {
  it('starts the monster voice after the source file lead-in', () => {
    expect(BED_AUDIO_CUES.monsterVoiceStartAt).toBeGreaterThan(0);
    expect(BED_AUDIO_CUES.monsterVoiceStartAt).toBeLessThan(1);
  });

  it('plays the monster appearance cue at full volume', () => {
    expect(BED_AUDIO_CUES.monsterAppearanceVolume).toBe(1);
  });

  it('layers the player scream after the death sound has begun', () => {
    expect(BED_AUDIO_CUES.playerScreamDelayMs).toBe(550);
    expect(BED_AUDIO_CUES.playerScreamDelayMs).toBeGreaterThan(0);
  });
});
