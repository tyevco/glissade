/**
 * Build the OPTIONAL `glissade-dom` IIFE bundle (0.21; dom-backend memo).
 *
 * Bundles the tsdown ESM output (`packages/browser/dist/dom.js`) into ONE
 * minified IIFE, `packages/browser/dist/glissade-dom.browser.js`, with every
 * `@glissade/*` dep INLINED. It is a SECOND `<script src>` a no-build editor page
 * loads AFTER `glissade.browser.js`: it AUGMENTS the existing `window.glissade`
 * with `DomBackend` + `emitWithIds` (the DOM render tier), keeping the lean base
 * playback bundle DomBackend-free. The entry self-augments (no `globalName`), with
 * load-order + version-skew fail-loud guards (see packages/browser/src/dom.ts).
 *
 *   node scripts/build-browser-dom.mjs   # run after `pnpm build` (consumes dist/dom.js)
 */

import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = join(root, 'packages', 'browser', 'dist', 'dom.js');
const outfile = join(root, 'packages', 'browser', 'dist', 'glissade-dom.browser.js');

const version = JSON.parse(
  readFileSync(join(root, 'packages', 'browser', 'package.json'), 'utf8'),
).version;

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  minify: true,
  // No `globalName`: src/dom.ts self-augments `window.glissade` (Object.assign),
  // so this IIFE just runs that side effect — it must NOT reassign a global.
  format: 'iife',
  platform: 'browser',
  target: 'es2017',
  // Stamp the bundle version so dom.ts can detect a base/dom version skew.
  define: { __GLISSADE_DOM_VERSION__: JSON.stringify(version), 'process.env.NODE_ENV': '"production"' },
  sourcemap: true,
  write: true,
  metafile: true,
  logLevel: 'info',
});

// Guard: no bare `@glissade/*` import may survive (everything must be inlined).
const out = Object.keys(result.metafile.outputs).find((o) => o.endsWith('glissade-dom.browser.js'));
const leaked = Object.keys(result.metafile.outputs[out]?.imports ?? {}).filter((i) => i.startsWith('@glissade/'));
if (leaked.length > 0) {
  console.error(`FAIL: @glissade/* bare imports leaked into the glissade-dom IIFE: ${leaked.join(', ')}`);
  process.exit(1);
}

const raw = readFileSync(outfile);
const gz = gzipSync(raw).length / 1024;
console.log(
  `\n@glissade/browser (glissade-dom)  ${gz.toFixed(2)} kB gz  /  ${(raw.length / 1024).toFixed(2)} kB raw  →  ${outfile.slice(root.length)}`,
);
