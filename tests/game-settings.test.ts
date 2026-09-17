import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS, normalizeGameSettings } from '../src/prototype/game-settings';

describe('game settings', () => {
  it('uses accessible defaults when stored settings are missing', () => {
    expect(normalizeGameSettings(null)).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it('clamps user-controlled numeric values', () => {
    const settings = normalizeGameSettings({
      masterVolume: 3,
      musicVolume: -2,
      effectsVolume: 0.4,
      brightness: 0.1,
      sensitivity: 8,
      interfaceScale: 2,
      subtitles: false,
      reduceMotion: true,
    });
    expect(settings.masterVolume).toBe(1);
    expect(settings.musicVolume).toBe(0);
    expect(settings.effectsVolume).toBe(0.4);
    expect(settings.brightness).toBe(0.65);
    expect(settings.sensitivity).toBe(1.6);
    expect(settings.interfaceScale).toBe(1.15);
    expect(settings.subtitles).toBe(false);
    expect(settings.reduceMotion).toBe(true);
  });
});
