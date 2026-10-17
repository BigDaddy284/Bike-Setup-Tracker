import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  base: './', // loaded from file:// inside Electron
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
  },
});
