import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bed death audio asset', () => {
  it('uses the supplied single-take monster eating scream without synthesized extension', () => {
    const mp3 = readFileSync(
      resolve('public/assets/audio/bed-monster-eating-scream-v2.mp3'),
    );

    expect(mp3.length).toBe(85_440);
    expect(mp3.at(0)).toBe(0xff);
    expect(mp3.at(1)! & 0xe0).toBe(0xe0);
  });
});
