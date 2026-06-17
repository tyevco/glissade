import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against package sources, never stale dist builds.
const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@glissade/core/studio-host': src('core').replace('index.ts', 'studioHost.ts'),
      '@glissade/core': src('core'),
      '@glissade/scene/layout': src('scene').replace('index.ts', 'layout.ts'),
      '@glissade/scene': src('scene'),
      '@glissade/backend-canvas2d': src('backend-canvas2d'),
      '@glissade/player': src('player'),
      '@glissade/backend-skia': src('backend-skia'),
      '@glissade/cli': src('cli'),
      '@glissade/export-web': src('export-web'),
      '@glissade/interact': src('interact'),
      '@glissade/effects-webgpu': src('effects-webgpu'),
      '@glissade/narrate/providers': src('narrate').replace('index.ts', 'providers.ts'),
      '@glissade/narrate': src('narrate'),
      '@glissade/lottie': src('lottie'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
