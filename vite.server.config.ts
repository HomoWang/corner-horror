import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'server/standalone.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      external: ['ws'],
      output: {
        entryFileNames: 'index.mjs',
      },
    },
  },
});
