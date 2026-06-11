import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Dev runs against package sources for instant HMR across the workspace.
const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@glissade/core': src('core'),
      '@glissade/scene/layout': src('scene').replace('index.ts', 'layout.ts'),
      '@glissade/scene': src('scene'),
      '@glissade/backend-canvas2d': src('backend-canvas2d'),
      '@glissade/export-web': src('export-web'),
      '@glissade/element': src('element'),
      '@glissade/player': src('player'),
    },
  },
});
