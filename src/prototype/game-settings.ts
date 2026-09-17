export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  brightness: number;
  sensitivity: number;
  interfaceScale: number;
  subtitles: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  masterVolume: 1,
  musicVolume: 0.72,
  effectsVolume: 1,
  brightness: 0.9,
  sensitivity: 1,
  interfaceScale: 1,
  subtitles: true,
  reduceMotion: false,
};

const SETTINGS_KEY = 'room307-settings-v1';

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

export function normalizeGameSettings(value: unknown): GameSettings {
  const input = typeof value === 'object' && value !== null
    ? value as Partial<GameSettings>
    : {};
  return {
    masterVolume: clamp(input.masterVolume, 0, 1, DEFAULT_GAME_SETTINGS.masterVolume),
    musicVolume: clamp(input.musicVolume, 0, 1, DEFAULT_GAME_SETTINGS.musicVolume),
    effectsVolume: clamp(input.effectsVolume, 0, 1, DEFAULT_GAME_SETTINGS.effectsVolume),
    brightness: clamp(input.brightness, 0.65, 1, DEFAULT_GAME_SETTINGS.brightness),
    sensitivity: clamp(input.sensitivity, 0.6, 1.6, DEFAULT_GAME_SETTINGS.sensitivity),
    interfaceScale: clamp(input.interfaceScale, 0.9, 1.15, DEFAULT_GAME_SETTINGS.interfaceScale),
    subtitles: typeof input.subtitles === 'boolean'
      ? input.subtitles
      : DEFAULT_GAME_SETTINGS.subtitles,
    reduceMotion: typeof input.reduceMotion === 'boolean'
      ? input.reduceMotion
      : DEFAULT_GAME_SETTINGS.reduceMotion,
  };
}

export function loadGameSettings(storage: Storage): GameSettings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    return raw ? normalizeGameSettings(JSON.parse(raw)) : { ...DEFAULT_GAME_SETTINGS };
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function storeGameSettings(storage: Storage, settings: GameSettings): void {
  storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeGameSettings(settings)));
}
