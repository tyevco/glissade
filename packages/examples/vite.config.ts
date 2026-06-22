import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Dev runs against package sources for instant HMR across the workspace.
const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  // hosted showcase (GitHub Pages): multi-page build of every harness page
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)), // the showcase gallery
        demo: fileURLToPath(new URL('./demo.html', import.meta.url)),
        embed: fileURLToPath(new URL('./embed.html', import.meta.url)),
        interact: fileURLToPath(new URL('./interact.html', import.meta.url)),
      },
    },
  },
  worker: { format: 'es' },
  resolve: {
    alias: {
      '@glissade/core/clips': src('core').replace('index.ts', 'clips.ts'),
      '@glissade/core': src('core'),
      '@glissade/scene/layout': src('scene').replace('index.ts', 'layout.ts'),
      '@glissade/scene/type': src('scene').replace('index.ts', 'type.ts'),
      '@glissade/scene/diagnostics': src('scene').replace('index.ts', 'diagnostics.ts'),
      '@glissade/scene/motion': src('scene').replace('index.ts', 'motion.ts'),
      '@glissade/scene': src('scene'),
      '@glissade/backend-canvas2d': src('backend-canvas2d'),
      '@glissade/export-web': src('export-web'),
      '@glissade/element': src('element'),
      '@glissade/player': src('player'),
      '@glissade/interact': src('interact'),
      '@glissade/effects-webgpu': src('effects-webgpu'),
      // pure entry only — './providers' is Node-side and must never resolve here
      '@glissade/narrate': src('narrate'),
    },
  },
});
