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
      '@glissade/core/expr': src('core').replace('index.ts', 'expr.ts'),
      '@glissade/core/studio-host': src('core').replace('index.ts', 'studioHost.ts'),
      '@glissade/core/sidecar': src('core').replace('index.ts', 'sidecar.ts'),
      '@glissade/core': src('core'),
      '@glissade/scene/layout-ctors': src('scene').replace('index.ts', 'layoutCtors.ts'),
      '@glissade/scene/layout': src('scene').replace('index.ts', 'layout.ts'),
      '@glissade/scene/grid': src('scene').replace('index.ts', 'grid.ts'),
      '@glissade/scene/chart': src('scene').replace('index.ts', 'chart.ts'),
      '@glissade/scene/gauge': src('scene').replace('index.ts', 'gauge.ts'),
      '@glissade/scene/component': src('scene').replace('index.ts', 'component.ts'),
      '@glissade/scene/type': src('scene').replace('index.ts', 'type.ts'),
      '@glissade/scene/diagnostics': src('scene').replace('index.ts', 'diagnostics.ts'),
      '@glissade/scene/recipes': src('scene').replace('index.ts', 'recipes.ts'),
      '@glissade/scene/tokens': src('scene').replace('index.ts', 'tokens.ts'),
      '@glissade/scene/motion': src('scene').replace('index.ts', 'motion.ts'),
      '@glissade/scene/gradient': src('scene').replace('index.ts', 'gradient.ts'),
      '@glissade/scene': src('scene'),
      '@glissade/backend-canvas2d': src('backend-canvas2d'),
      '@glissade/player': src('player'),
      '@glissade/react': src('react'),
      '@glissade/interact': src('interact'),
      '@glissade/export-web': src('export-web'),
    },
  },
});
