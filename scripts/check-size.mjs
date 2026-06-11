/**
 * Bundle-size budgets (DESIGN.md §4.4), enforced in CI: each embed-path
 * package is bundled standalone (esbuild, minified) and its gzipped size
 * checked against the spec budget. Base embed path (core + scene + canvas2d
 * + player) must stay ≤ 35 kB; element adds ≤ 5 kB.
 */

import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// kB (gzipped) per §4.4 sub-budgets
const BUDGETS = {
  core: 11, // raised 8→10→11 (v2 §B.6: derivative registry + retarget math; tree-shaken out of real embeds); total stays 35
  scene: 12,
  'backend-canvas2d': 8,
  player: 4,
  element: 5,
  interact: 6, // v2 §C.6 CI target: machine + listeners + hitTest + pointerDriver ≤ 6 kB gz (opt-in)
  'interact/audio': 2, // v2 §C.6: offline audio as a separate export ≤ 2 kB gz
};

/** Packages whose sum is the §4.4 base embed path; element and interact are opt-in layers. */
const BASE = new Set(['core', 'scene', 'backend-canvas2d', 'player']);

let failed = false;
let baseTotal = 0;

for (const [pkg, budgetKb] of Object.entries(BUDGETS)) {
  const result = await build({
    entryPoints: [
      pkg.includes('/')
        ? `${root}packages/${pkg.split('/')[0]}/dist/${pkg.split('/')[1]}.js`
        : `${root}packages/${pkg}/dist/index.js`,
    ],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    // measure each package alone: workspace deps are externals
    external: ['@glissade/*'],
    logLevel: 'silent',
  });
  const gz = gzipSync(result.outputFiles[0].contents).length / 1024;
  const ok = gz <= budgetKb;
  if (BASE.has(pkg)) baseTotal += gz;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${pkg.padEnd(18)} ${gz.toFixed(2).padStart(6)} kB gz  (budget ${budgetKb} kB)`);
}

const baseOk = baseTotal <= 35;
if (!baseOk) failed = true;
console.log(`${baseOk ? 'ok  ' : 'FAIL'} base embed path     ${baseTotal.toFixed(2).padStart(6)} kB gz  (budget 35 kB)`);

process.exit(failed ? 1 : 0);
