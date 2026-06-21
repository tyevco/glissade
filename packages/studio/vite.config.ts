import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { glissade } from '../vite-plugin/src/index.js';

const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

const examplesAssets = fileURLToPath(new URL('../examples/assets', import.meta.url));

/** Scene modules from examples reference /assets/* — serve that dir here too. */
const serveExamplesAssets = {
  name: 'studio-examples-assets',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use('/assets', (req, res, next) => {
      const file = join(examplesAssets, new URL(req.url ?? '/', 'http://x').pathname);
      if (!file.startsWith(examplesAssets) || !existsSync(file) || !statSync(file).isFile()) return next();
      createReadStream(file).pipe(res);
    });
  },
};

export default defineConfig({
  worker: { format: 'es' }, // module workers (export.worker.ts) in code-split builds
  plugins: [react(), serveExamplesAssets, glissade({ root: fileURLToPath(new URL('../..', import.meta.url)) })],
  resolve: {
    alias: {
      '@glissade/core/clips': src('core').replace('index.ts', 'clips.ts'),
      '@glissade/core/studio-host': src('core').replace('index.ts', 'studioHost.ts'),
      '@glissade/core/clips': src('core').replace('index.ts', 'clips.ts'),
      '@glissade/core': src('core'),
      '@glissade/scene/layout': src('scene').replace('index.ts', 'layout.ts'),
      '@glissade/scene/type': src('scene').replace('index.ts', 'type.ts'),
      '@glissade/scene': src('scene'),
      '@glissade/backend-canvas2d': src('backend-canvas2d'),
      '@glissade/player': src('player'),
      '@glissade/react': src('react'),
      '@glissade/interact': src('interact'),
      '@glissade/export-web': src('export-web'),
    },
  },
});
