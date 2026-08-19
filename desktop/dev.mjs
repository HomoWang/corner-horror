import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopConfig } from './config.mjs';

const desktopDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(desktopDir, '..');
const viteBin = join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const electronCli = join(projectRoot, 'node_modules', 'electron', 'cli.js');

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('無法取得桌面開發連接埠。'));
        return;
      }
      const port = address.port;
      probe.close(() => resolvePort(port));
    });
  });
}

function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  return new Promise((resolveReady, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolveReady();
          return;
        }
      } catch {
        // Vite is still starting.
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('等待桌面開發伺服器逾時。'));
        return;
      }
      setTimeout(poll, 200);
    };
    poll();
  });
}

const port = await findFreePort();
const devOrigin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  VITE_WS_URL: desktopConfig.relayWebSocketUrl,
  VITE_CONTROLLER_URL: desktopConfig.controllerBaseUrl,
};

const vite = spawn(
  process.execPath,
  [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: projectRoot, env, stdio: 'inherit' },
);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!vite.killed) vite.kill();
  process.exitCode = code;
}

vite.once('exit', (code) => {
  if (!shuttingDown && code !== 0) shutdown(code ?? 1);
});

try {
  await waitForServer(`${devOrigin}/prototype.html`);
  const electron = spawn(process.execPath, [electronCli, projectRoot], {
    cwd: projectRoot,
    env: {
      ...env,
      CORNER_HORROR_DEV_URL: `${devOrigin}/prototype.html?desktop=1`,
    },
    stdio: 'inherit',
  });
  electron.once('exit', (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(error);
  shutdown(1);
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));
