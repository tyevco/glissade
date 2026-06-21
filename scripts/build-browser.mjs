/**
 * Build the single-file `@glissade/browser` IIFE bundle (DESIGN.md §4.4).
 *
 * Takes the tsdown ESM output (`packages/browser/dist/index.js`, which still has
 * bare `@glissade/*` imports) and bundles it into ONE minified IIFE with every
 * `@glissade/*` dep INLINED — no external bare specifiers survive. The result,
 * `packages/browser/dist/glissade.browser.js`, exposes `window.glissade.*` and
 * auto-registers `<gs-player>` (the `@glissade/element` side effect), for
 * `<script src>` / no-build browser use.
 *
 *   node scripts/build-browser.mjs   # run after `pnpm build` (consumes the embed dist)
 */

import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = join(root, 'packages', 'browser', 'dist', 'index.js');
const outfile = join(root, 'packages', 'browser', 'dist', 'glissade.browser.js');

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'glissade',
  platform: 'browser',
  target: 'es2017',
  // INLINE every @glissade/* dep — the whole point of the single-file bundle.
  external: [],
  define: { 'process.env.NODE_ENV': '"production"' },
  sourcemap: true,
  write: true,
  metafile: true,
  logLevel: 'info',
});

// Guard: no bare `@glissade/*` import may survive (everything must be inlined).
const leaked = Object.keys(result.metafile.outputs[
  Object.keys(result.metafile.outputs).find((o) => o.endsWith('glissade.browser.js'))
]?.imports ?? {}).filter((i) => i.startsWith('@glissade/'));
if (leaked.length > 0) {
  console.error(`FAIL: @glissade/* bare imports leaked into the IIFE bundle: ${leaked.join(', ')}`);
  process.exit(1);
}

const raw = (await import('node:fs')).readFileSync(outfile);
const gz = gzipSync(raw).length / 1024;
console.log(
  `\n@glissade/browser  ${gz.toFixed(2)} kB gz  /  ${(raw.length / 1024).toFixed(2)} kB raw  →  ${outfile.slice(root.length)}`,
);

// Emit the committed machine-readable API manifest alongside the IIFE so a tool
// can fetch `glissade.api.json` WITHOUT running JS (the same `describe()` the
// bundle exposes as `window.glissade.describe()`). Imported straight from scene's
// built dist (DOM-free pure introspection) — not from the IIFE, which would run
// the <gs-player> registration side effect under Node.
const { writeFileSync } = await import('node:fs');
const { describe } = await import(join(root, 'packages', 'scene', 'dist', 'describe.js'));
const apiFile = join(root, 'packages', 'browser', 'dist', 'glissade.api.json');
writeFileSync(apiFile, JSON.stringify(describe(), null, 2) + '\n');
console.log(`@glissade/api.json written  →  ${apiFile.slice(root.length)}`);
