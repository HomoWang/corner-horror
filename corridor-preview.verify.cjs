const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Shao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { PNG } = require('C:/Users/Shao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs');

const baseUrl = process.env.CORRIDOR_PREVIEW_URL || 'http://127.0.0.1:5182/corridor-3d-preview.html';
const url = new URL(baseUrl);
url.searchParams.set('nopair', '1');
url.searchParams.set('autoequip', '1');
const outputDirectory = path.join(__dirname, 'qa');
fs.mkdirSync(outputDirectory, { recursive: true });

function analyzeScreenshot(buffer) {
  const image = PNG.sync.read(buffer);
  let litPixels = 0;
  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let count = 0;
  for (let y = 0; y < image.height; y += 8) {
    for (let x = 0; x < image.width; x += 8) {
      const index = (image.width * y + x) * 4;
      const luminance = image.data[index] * 0.2126 + image.data[index + 1] * 0.7152 + image.data[index + 2] * 0.0722;
      if (luminance > 3) litPixels += 1;
      luminanceTotal += luminance;
      luminanceSquaredTotal += luminance * luminance;
      count += 1;
    }
  }
  const average = luminanceTotal / count;
  return {
    width: image.width,
    height: image.height,
    litRatio: litPixels / count,
    average,
    variance: luminanceSquaredTotal / count - average * average,
  };
}

async function runViewport(page, name, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.modelReady === 'true');
  await page.waitForTimeout(1500);

  const canvasCount = await page.locator('#corridor-preview canvas').count();
  if (canvasCount !== 1) throw new Error(`${name}: expected one WebGL canvas, found ${canvasCount}.`);
  const doorCount = Number(await page.locator('body').getAttribute('data-door-count'));
  const geometryCount = Number(await page.locator('body').getAttribute('data-geometry-count'));
  if (doorCount !== 7) throw new Error(`${name}: expected 7 corridor doors, found ${doorCount}.`);
  if (geometryCount < 30) throw new Error(`${name}: corridor geometry is incomplete (${geometryCount}).`);
  const bloodReady = await page.locator('body').getAttribute('data-blood-ready');
  if (bloodReady !== 'true') throw new Error(`${name}: ceiling blood drip was not initialized.`);
  await page.waitForFunction(() => document.body.dataset.bloodState === 'falling', null, { timeout: 4500 });
  const bloodYBefore = Number(await page.locator('body').getAttribute('data-blood-drop-y'));
  await page.waitForTimeout(120);
  const bloodYAfter = Number(await page.locator('body').getAttribute('data-blood-drop-y'));
  if (!(bloodYAfter < bloodYBefore)) {
    throw new Error(`${name}: blood droplet is not moving downward (${bloodYBefore} -> ${bloodYAfter}).`);
  }

  const initialZ = Number(await page.locator('body').getAttribute('data-player-z'));
  const initialImage = await page.screenshot();
  const initial = analyzeScreenshot(initialImage);
  fs.writeFileSync(path.join(outputDirectory, `corridor-model-${name}-initial.png`), initialImage);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1250);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(250);
  const movedZ = Number(await page.locator('body').getAttribute('data-player-z'));
  if (!(movedZ < initialZ - 0.8)) {
    throw new Error(`${name}: forward movement failed (${initialZ} -> ${movedZ}).`);
  }

  await page.mouse.move(Math.floor(width / 2), 1);
  await page.waitForTimeout(1250);
  const condensation = Number(await page.locator('body').getAttribute('data-condensation'));
  if (!(condensation > 0.25)) {
    throw new Error(`${name}: high-view condensation warning did not activate (${condensation}).`);
  }

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(620);
  await page.keyboard.up('KeyD');
  const yaw = Number(await page.locator('body').getAttribute('data-player-yaw'));
  if (Math.abs(yaw) < 0.45) throw new Error(`${name}: continuous turning failed (${yaw}).`);

  const movedImage = await page.screenshot();
  const moved = analyzeScreenshot(movedImage);
  fs.writeFileSync(path.join(outputDirectory, `corridor-model-${name}-moved.png`), movedImage);
  if (initial.litRatio < 0.08 || initial.variance < 12 || moved.litRatio < 0.08) {
    throw new Error(`${name}: rendered corridor is blank or lacks contrast.`);
  }
  return { initial, moved, initialZ, movedZ, yaw, condensation, bloodYBefore, bloodYAfter, doorCount, geometryCount };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && /WebGL|shader|THREE\.WebGLProgram/i.test(text)) errors.push(text);
  });
  const desktop = await runViewport(page, 'desktop', 1280, 720);
  const narrow = await runViewport(page, 'narrow', 430, 800);
  await browser.close();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ desktop, narrow }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
