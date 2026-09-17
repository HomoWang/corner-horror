import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hostSource = readFileSync(resolve('src/prototype/host.ts'), 'utf8');
const prototypeSource = readFileSync(resolve('prototype.html'), 'utf8');

describe('item interaction notices', () => {
  it('does not expose production annotations in player-facing notices', () => {
    expect(hostSource).not.toContain('(文字)');
    expect(hostSource).not.toContain('(聲音)');
    expect(hostSource).not.toContain('(低聲)');
    expect(hostSource).not.toContain('(記憶)');
  });

  it('plays a real wardrobe creak without showing a written creak', () => {
    expect(hostSource).toContain("wardrobeCreak: publicUrl('assets/audio/scary-door-opening.mp3')");
    expect(hostSource).toContain("playHostSound('wardrobeCreak'");
    expect(hostSource).not.toContain('衣櫃左門(聲音)');
    expect(hostSource).not.toContain('衣櫃中門(聲音)');
    expect(hostSource).not.toContain('衣櫃右門(聲音)');
  });

  it('uses the left-side objective UI instead of pendant and battery notices', () => {
    expect(prototypeSource).toContain('id="story-objective"');
    expect(hostSource).toContain("completePendantObjective('find')");
    expect(hostSource).toContain("completePendantObjective('install')");
    expect(hostSource).toContain("completePendantObjective('use')");
    expect(hostSource).not.toContain('舊電池已裝入錄音吊飾。');
    expect(hostSource).not.toContain('吊飾響起一段熟悉的旋律。');
    expect(hostSource).not.toContain('使用中：錄音吊飾');
    expect(hostSource).not.toContain('使用中：舊電池');
  });

  it('keeps the objective above close-up views and animates its entrance and exit', () => {
    expect(prototypeSource).toMatch(/#hud\s*{\s*display:\s*none;/);
    expect(prototypeSource).toContain('top: 25vh;');
    expect(prototypeSource).toContain('z-index: 47;');
    expect(prototypeSource).toContain('filter: blur(0.16rem);');
    expect(prototypeSource).toContain('transition:');
    expect(hostSource).toContain("storyObjectiveEl.classList.remove('show')");
    expect(hostSource).toContain('window.setTimeout(reveal, 420)');
  });

  it('does not show the objective over the QR connection screen', () => {
    expect(hostSource).toContain("if (!overlayEl.classList.contains('hidden'))");
    expect(hostSource).toMatch(
      /overlayEl\.classList\.add\('hidden'\);\s*setStatus\('手機已連線。請校正中心。'\);\s*refreshPendantObjective\(\);/,
    );
  });
});
