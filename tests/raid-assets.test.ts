import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('raid critical asset budget', () => {
  it('keeps the required background below 300 KB', async () => {
    const asset = await stat(new URL('../public/assets/raid-city.webp', import.meta.url));
    expect(asset.size).toBeGreaterThan(50_000);
    expect(asset.size).toBeLessThan(300_000);
  });
});
