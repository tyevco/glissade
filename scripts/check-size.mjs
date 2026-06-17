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
  core: 14, // raised 8→10→11→12→14 (v2 §B.6 derivative/retarget math; 0.7 correctness: sync-unit ids, audio-offset helper, clamp + sidecar-label warnings; 0.9 §3.6 FontRegistry + hand-rolled cmap reader (formats 4/12) + font validation — DEV/export-path only, never in evaluate(), tree-shaken out of real embeds; base embed path stays ~31/35)
  scene: 15, // raised 12→13→14→15 (0.5.x authoring features; 0.7 determinism: render-mode guards + cache-cold audit — DEV/export-only, tree-shaken from real embeds; base total stays ≤ 35)
  'scene/layout': 55, // §3.2: Yoga (wasm-base64 + bindings) ships ONLY in this separate entry, never the base scene bundle
  'backend-canvas2d': 8,
  player: 4,
  element: 5,
  interact: 6, // v2 §C.6 CI target: machine + listeners + hitTest + pointerDriver ≤ 6 kB gz (opt-in)
  'interact/audio': 2, // v2 §C.6: offline audio as a separate export ≤ 2 kB gz
  'effects-webgpu': 4, // §3.7 browser-only shader runner (incl. built-in WGSL strings)
};

/** Packages whose sum is the §4.4 base embed path; element and interact are opt-in layers. */
const BASE = new Set(['core', 'scene', 'backend-canvas2d', 'player']);

/**
 * §C.6 measures interact "per entry point": the 6 kB target covers machine +
 * listeners + hitTest + pointerDriver, and builder/preset/trace tooling must
 * TREE-SHAKE out of bundles that don't call it. Bundling a subset entry
 * verifies that claim on every PR instead of asserting it.
 */
const SUBSET_EXPORTS = {
  interact: ['createMachine', 'createListeners', 'hitTest', 'pointerDriver', 'splitVec2', 'springFilter'],
};

let failed = false;
let baseTotal = 0;

for (const [pkg, budgetKb] of Object.entries(BUDGETS)) {
  const subset = SUBSET_EXPORTS[pkg];
  const result = await build({
    ...(subset
      ? {
          stdin: {
            contents: `export { ${subset.join(', ')} } from './packages/${pkg}/dist/index.js';`,
            resolveDir: root,
            sourcefile: 'subset-entry.js',
          },
        }
      : {
          entryPoints: [
            pkg.includes('/')
              ? `${root}packages/${pkg.split('/')[0]}/dist/${pkg.split('/')[1]}.js`
              : `${root}packages/${pkg}/dist/index.js`,
          ],
        }),
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

// §3.2 guard: the BASE scene bundle must NOT pull in Yoga — flexbox layout is a
// separately-budgeted entry (@glissade/scene/layout). A static import would
// silently blow the embed budget, so assert it on every run via the metafile.
const sceneIndex = await build({
  entryPoints: [`${root}packages/scene/dist/index.js`],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  external: ['@glissade/*'],
  metafile: true,
  logLevel: 'silent',
});
const yogaInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) => i.includes('yoga-layout'));
const yogaOk = yogaInBase.length === 0;
if (!yogaOk) failed = true;
console.log(`${yogaOk ? 'ok  ' : 'FAIL'} base scene excludes yoga-layout${yogaOk ? '' : ` (leaked: ${yogaInBase.length} input(s))`}`);

process.exit(failed ? 1 : 0);
