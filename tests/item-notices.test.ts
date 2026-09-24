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

  it('keeps the jammed middle wardrobe door silent', () => {
    const middleDoorCase = hostSource.match(
      /case 'wardrobeMiddle':[\s\S]*?case 'wardrobeRight':/,
    )?.[0];
    expect(middleDoorCase).toContain('衣櫃中門卡死了，無法打開。');
    expect(middleDoorCase).not.toContain("playHostSound('wardrobeCreak'");
    expect(middleDoorCase).not.toContain("room.openWardrobe('middle')");
  });

  it('matches the wardrobe state overlay to the room grade and feathers its edges', () => {
    const wardrobeOverlayCss = prototypeSource.match(/\.wardrobe-state-overlay\s*\{[^}]*\}/)?.[0];
    expect(wardrobeOverlayCss).toContain(
      'filter: brightness(0.66) contrast(1.12) saturate(0.7);',
    );
    expect(wardrobeOverlayCss).toContain('ellipse 18% 34% at 39% 41%');
    expect(wardrobeOverlayCss).not.toContain('clip-path:');
  });

  it('uses the left-side objective UI instead of pendant and battery notices', () => {
    expect(prototypeSource).toContain('id="story-objective"');
    expect(hostSource).toContain("completePendantObjective('find')");
    expect(hostSource).toContain("completePendantObjective('install')");
    expect(hostSource).toContain("completePendantObjective('use')");
    expect(hostSource).not.toContain("completePendantObjective('equipFirefighterGear')");
    expect(hostSource).toContain('離開 307、進入走廊後再穿戴。');
    expect(hostSource).not.toContain('舊電池已裝入錄音吊飾。');
    expect(hostSource).not.toContain('吊飾響起一段熟悉的旋律。');
    expect(hostSource).not.toContain('使用中：錄音吊飾');
    expect(hostSource).not.toContain('使用中：舊電池');
  });

  it('hides the objective during an unprotected corridor smoke death', () => {
    expect(prototypeSource).toContain('id="smoke-death"');
    expect(hostSource).toMatch(
      /function startCorridorSmokeDeath\(\)[\s\S]*?hidePendantObjective\(\);[\s\S]*?smokeDeathEl\.classList\.add\('show'\);/,
    );
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
    expect(hostSource).toContain(
      "if (!overlayEl.classList.contains('hidden') || bedGrabActive || smokeDeathActive)",
    );
    expect(hostSource).toMatch(
      /overlayEl\.classList\.add\('hidden'\);\s*setStatus\('手機已連線。請校正中心。'\);\s*refreshPendantObjective\(\);/,
    );
  });

  it('hides the objective throughout the monster encounter and death flow', () => {
    expect(prototypeSource).toContain('body.bed-grab-active #story-objective');
    expect(hostSource).toContain(
      "if (!overlayEl.classList.contains('hidden') || bedGrabActive || smokeDeathActive)",
    );
    expect(hostSource).toMatch(
      /bedGrabActive = true;\s*bedEventPhase = 'reach';\s*hidePendantObjective\(\);/,
    );
    expect(hostSource).toMatch(
      /function finishBedGrabSuccess\(\)[\s\S]*?bedGrabActive = false;[\s\S]*?refreshPendantObjective\(\);/,
    );
  });
});
