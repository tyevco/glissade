import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { glissade } from '../vite-plugin/src/index.js';

const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [react(), glissade({ root: fileURLToPath(new URL('../..', import.meta.url)) })],
  resolve: {
    alias: {
      '@glissade/core': src('core'),
      '@glissade/scene': src('scene'),
      '@glissade/backend-canvas2d': src('backend-canvas2d'),
      '@glissade/player': src('player'),
      '@glissade/react': src('react'),
    },
  },
});
