import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { wsRelayPlugin } from './server/vite-ws-plugin';

function deploymentBase(): string {
  if (process.env.GITHUB_ACTIONS !== 'true') return '/';
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repository || repository.toLowerCase().endsWith('.github.io')) return '/';
  return `/${repository}/`;
}

export default defineConfig({
  base: deploymentBase(),
  plugins: [process.env.VITE_NO_SSL === 'true' ? null : basicSsl(), wsRelayPlugin()],
  server: {
    host: true, // 綁 0.0.0.0，區網手機才連得進來
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        host: fileURLToPath(new URL('index.html', import.meta.url)),
        controller: fileURLToPath(new URL('controller.html', import.meta.url)),
      },
    },
  },
});
