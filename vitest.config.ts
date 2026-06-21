import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against package sources, never stale dist builds.
const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Subpath aliases MUST precede their bare-package alias: the string alias
      // greedily prefix-matches, so '@glissade/scene' would otherwise swallow
      // '@glissade/scene/layout'. Mirror this ordering for any new subentry.
      '@glissade/core/clips': src('core').replace('index.ts', 'clips.ts'),
      '@glissade/core/i18n': src('core').replace('index.ts', 'i18n.ts'),
      '@glissade/core/studio-host': src('core').replace('index.ts', 'studioHost.ts'),
      '@glissade/core/font-ingest': src('core').replace('index.ts', 'font-ingest.ts'),
      '@glissade/scene/layout': src('scene').replace('index.ts', 'layout.ts'),
      '@glissade/core': src('core'),
      '@glissade/scene': src('scene'),
      '@glissade/react': src('react'),
      '@glissade/backend-canvas2d': src('backend-canvas2d'),
      '@glissade/element': src('element'),
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
    // Default environment stays node so the golden/parity suite renders
    // byte-identically; studio component tests opt into jsdom per-file with a
    // `// @vitest-environment jsdom` docblock (only `.tsx` files do this).
    environment: 'node',
    include: [
      'packages/*/test/**/*.test.ts',
      'packages/*/test/**/*.test.tsx',
      // root CI-gate scripts (check-deps / check-size) — their planted-violation
      // regression guards live here, alongside the .mjs they harden.
      'scripts/test/**/*.test.mjs',
    ],
  },
});
