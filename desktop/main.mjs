import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { desktopConfig } from './config.mjs';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const desktopDir = fileURLToPath(new URL('.', import.meta.url));
const appRoot = resolve(desktopDir, '..');
let staticServer = null;
let gameWindow = null;
const maxSaveBytes = 1024 * 1024;

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webm', 'video/webm'],
  ['.woff2', 'font/woff2'],
]);

function installRelayOriginHeader() {
  const relayUrl = new URL(desktopConfig.relayWebSocketUrl);
  const filter = { urls: [`${relayUrl.protocol}//${relayUrl.host}/*`] };

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    for (const key of Object.keys(requestHeaders)) {
      if (key.toLowerCase() === 'origin') delete requestHeaders[key];
    }
    requestHeaders.Origin = desktopConfig.relayAllowedOrigin;
    callback({ requestHeaders });
  });
}

function saveFilePath() {
  return join(app.getPath('userData'), 'save-v1.json');
}

function isSerializableSave(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8') <= maxSaveBytes;
  } catch {
    return false;
  }
}

function installPersistenceHandlers() {
  ipcMain.handle('room307:save:load', async () => {
    try {
      const parsed = JSON.parse(await readFile(saveFilePath(), 'utf8'));
      return isSerializableSave(parsed) ? parsed : null;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
      console.error('Unable to load save data', error);
      return null;
    }
  });

  ipcMain.handle('room307:save:write', async (_event, value) => {
    if (!isSerializableSave(value)) throw new Error('Invalid save data');
    const path = saveFilePath();
    const temporaryPath = `${path}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rm(path, { force: true });
    await rename(temporaryPath, path);
    return true;
  });

  ipcMain.handle('room307:save:clear', async () => {
    await rm(saveFilePath(), { force: true });
    return true;
  });
}

function safeAssetPath(root, pathname) {
  const requested = pathname === '/' ? '/prototype.html' : pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null;
  }

  const relative = normalize(decoded.replace(/^[/\\]+/, ''));
  const candidate = resolve(root, relative);
  const normalizedRoot = resolve(root);
  if (candidate !== normalizedRoot && !candidate.startsWith(`${normalizedRoot}${sep}`)) return null;
  return candidate;
}

async function startStaticServer() {
  const root = join(appRoot, 'dist');
  if (!existsSync(join(root, 'prototype.html'))) {
    throw new Error('找不到桌面版網頁檔案，請先執行 desktop:package。');
  }

  staticServer = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const assetPath = safeAssetPath(root, pathname);
    if (!assetPath || !existsSync(assetPath) || !statSync(assetPath).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes.get(extname(assetPath).toLowerCase()) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    createReadStream(assetPath).pipe(response);
  });

  await new Promise((resolveListen, reject) => {
    staticServer.once('error', reject);
    staticServer.listen(0, '127.0.0.1', resolveListen);
  });

  const address = staticServer.address();
  if (!address || typeof address === 'string') throw new Error('桌面伺服器啟動失敗。');
  return `http://127.0.0.1:${address.port}/prototype.html?desktop=1`;
}

async function createGameWindow() {
  installRelayOriginHeader();
  const gameUrl = process.env.CORNER_HORROR_DEV_URL || (await startStaticServer());
  const window = new BrowserWindow({
    title: desktopConfig.title,
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 576,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#050303',
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(desktopDir, 'preload.cjs'),
      sandbox: true,
    },
  });
  gameWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle(desktopConfig.title);
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
    if (input.type === 'keyDown' && input.key === 'Escape' && window.isFullScreen()) {
      event.preventDefault();
      window.setFullScreen(false);
    }
  });
  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });
  window.once('closed', () => {
    gameWindow = null;
  });

  await window.loadURL(gameUrl);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!gameWindow) return;
    if (gameWindow.isMinimized()) gameWindow.restore();
    gameWindow.focus();
  });

  app.whenReady().then(() => {
    installPersistenceHandlers();
    return createGameWindow();
  }).catch((error) => {
    console.error(error);
    app.quit();
  });
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => staticServer?.close());
