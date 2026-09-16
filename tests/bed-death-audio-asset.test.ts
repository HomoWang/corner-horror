import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bed death audio asset', () => {
  it('contains one continuous scream long enough for the death sequence', () => {
    const wav = readFileSync(
      resolve('public/assets/audio/bed-monster-death-scream-sustain-v1.wav'),
    );

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

    const channelCount = wav.readUInt16LE(22);
    const sampleRate = wav.readUInt32LE(24);
    const bitsPerSample = wav.readUInt16LE(34);
    const dataBytes = wav.readUInt32LE(40);
    const duration = dataBytes / (sampleRate * channelCount * (bitsPerSample / 8));

    expect(duration).toBeGreaterThanOrEqual(6);
    expect(duration).toBeLessThan(6.2);
  });
});
