import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('chapter two trauma asset', () => {
  it('ships the charred trauma face referenced by the corridor entry', () => {
    const html = readFileSync(resolve('corridor-3d-preview.html'), 'utf8');
    const image = readFileSync(
      resolve('public/assets/corridor-preview/charred-trauma-face-v1.png'),
    );
    expect(html).toContain('./assets/corridor-preview/charred-trauma-face-v1.png');
    expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(image.length).toBeGreaterThan(500_000);
  });

  it('closes the corridor entrance and reuses the chapter one background music', () => {
    const html = readFileSync(resolve('corridor-3d-preview.html'), 'utf8');
    const source = readFileSync(resolve('src/corridor-preview.ts'), 'utf8');
    expect(html).toContain('./assets/audio/room307-background-v1.mp3');
    expect(source).toContain('entranceEndWallMaterial');
    expect(source).toContain('CORRIDOR.modelStartZ + 0.08');
    expect(source).toContain('在手機物品欄點選完整消防裝備');
  });
});
