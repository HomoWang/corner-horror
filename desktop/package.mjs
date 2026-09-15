import { spawn } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';
import { desktopConfig } from './config.mjs';

const desktopDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(desktopDir, '..');
const stageDir = join(projectRoot, '.desktop-stage');
const releaseDir = join(projectRoot, 'release');
const pendingReleaseDir = join(projectRoot, 'release-pending');
const viteBin = join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const controllerVersion = `desktop-${Date.now()}`;

function assertProjectChild(path) {
  const relativePath = relative(projectRoot, path);
  if (!relativePath || relativePath.startsWith('..') || resolve(path) === projectRoot) {
    throw new Error(`拒絕清除非專案輸出路徑：${path}`);
  }
}

function run(command, args, env = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`指令執行失敗，結束代碼：${code ?? 'unknown'}`));
    });
  });
}

assertProjectChild(stageDir);
assertProjectChild(releaseDir);
assertProjectChild(pendingReleaseDir);

await run(process.execPath, [viteBin, 'build', '--mode', 'desktop', '--configLoader', 'runner'], {
  ...process.env,
  VITE_WS_URL: desktopConfig.relayWebSocketUrl,
  VITE_CONTROLLER_URL: desktopConfig.controllerBaseUrl,
  VITE_CONTROLLER_VERSION: controllerVersion,
});

await rm(stageDir, { recursive: true, force: true });
let packageOutputDir = releaseDir;
try {
  await rm(releaseDir, { recursive: true, force: true });
} catch (error) {
  if (!['EBUSY', 'EPERM'].includes(error?.code)) throw error;
  packageOutputDir = pendingReleaseDir;
  await rm(pendingReleaseDir, { recursive: true, force: true });
  console.warn('現有測試版仍在執行，改將新版輸出至 release-pending。');
}
await mkdir(join(stageDir, 'desktop'), { recursive: true });
await cp(join(projectRoot, 'dist'), join(stageDir, 'dist'), { recursive: true });
await cp(join(projectRoot, 'desktop', 'main.mjs'), join(stageDir, 'desktop', 'main.mjs'), {
  recursive: false,
});
await cp(join(projectRoot, 'desktop', 'config.mjs'), join(stageDir, 'desktop', 'config.mjs'), {
  recursive: false,
});
await cp(join(projectRoot, 'desktop', 'preload.cjs'), join(stageDir, 'desktop', 'preload.cjs'), {
  recursive: false,
});
await writeFile(
  join(stageDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'room-307',
      productName: '307',
      version: '0.1.0',
      type: 'module',
      main: 'desktop/main.mjs',
    },
    null,
    2,
  )}\n`,
  'utf8',
);

await packager({
  dir: stageDir,
  name: 'Room307',
  platform: 'win32',
  arch: 'x64',
  out: packageOutputDir,
  overwrite: true,
  asar: true,
  prune: true,
  appVersion: '0.1.0',
  win32metadata: {
    CompanyName: 'Room 307',
    FileDescription: '307 Horror Puzzle',
    ProductName: '307',
  },
});

console.log(
  `\nWindows 測試版已建立：${join(packageOutputDir, 'Room307-win32-x64', 'Room307.exe')}`,
);
