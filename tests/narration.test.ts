import { describe, expect, it } from 'vitest';
import { NARRATION_CUES, voiceSettings, type NarrationRole } from '../src/shared/narration';

describe('character narration', () => {
  it('covers every story beat that needs a speaking character', () => {
    expect(Object.keys(NARRATION_CUES)).toHaveLength(20);
    expect(NARRATION_CUES.prologue?.speaker).toBe('管理室錄音');
    expect(NARRATION_CUES['call-window']?.role).toBe('xiaoyu');
    expect(NARRATION_CUES['tape-warning-one']?.role).toBe('mother');
    expect(NARRATION_CUES['ending-open']?.role).toBe('entity');
    expect(NARRATION_CUES['ending-sealed']?.text).toContain('自己的號碼');
  });

  it('keeps every subtitle usable as a delayed spoken cue', () => {
    for (const cue of Object.values(NARRATION_CUES)) {
      expect(cue.speaker.trim().length).toBeGreaterThan(0);
      expect(cue.text.trim().length).toBeGreaterThan(4);
      expect(cue.delayMs ?? 0).toBeGreaterThanOrEqual(0);
      expect(cue.delayMs ?? 0).toBeLessThan(1000);
    }
  });

  it('gives the five characters audibly distinct pitch and pacing', () => {
    const roles: NarrationRole[] = ['manager', 'xiaoyu', 'mother', 'whisper', 'entity'];
    const settings = roles.map(voiceSettings);
    for (const setting of settings) {
      expect(setting.rate).toBeGreaterThanOrEqual(0.5);
      expect(setting.rate).toBeLessThanOrEqual(1);
      expect(setting.pitch).toBeGreaterThan(0);
      expect(setting.pitch).toBeLessThanOrEqual(2);
      expect(setting.volume).toBeGreaterThan(0);
      expect(setting.volume).toBeLessThanOrEqual(1);
    }
    expect(new Set(settings.map((setting) => setting.pitch)).size).toBe(roles.length);
  });
});
