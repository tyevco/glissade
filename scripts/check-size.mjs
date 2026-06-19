/**
 * Bundle-size budgets (DESIGN.md §4.4), enforced in CI: each embed-path
 * package is bundled standalone (esbuild, minified) and its gzipped size
 * checked against the spec budget. Base embed path (core + scene + canvas2d
 * + player) must stay ≤ 36 kB (raised 35→36 in 0.12 for the §3 mesh Paint
 * kernel — a real, non-tree-shakeable render path, the milestone's determinism
 * tentpole; see the scene budget note); element adds ≤ 5 kB.
 */

import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// kB (gzipped) per §4.4 sub-budgets
const BUDGETS = {
  core: 15, // raised 8→10→11→12→14→15 (v2 §B.6 derivative/retarget math; 0.7 correctness: sync-unit ids, audio-offset helper, clamp + sidecar-label warnings; 0.9 §3.6 FontRegistry + hand-rolled cmap reader (formats 4/12) + font validation — DEV/export-path only, never in evaluate(), tree-shaken out of real embeds; 0.10.1 §2.2 paint value type: gradient (linear/radial) Paint + keyframe interpolation (lerp/lift/snap) — a first-class animatable value like path/color, registered so it can't tree-shake, ~0.5 kB; base embed path stays ~33/35)
  'core/clips': 7, // §2 motion clips: build-time authoring sugar (clip/clipList + the popIn/slideIn/pulse/driftLoop literals + 0.13 morph) on a tree-shakeable sub-path, never in the base index. Standalone bundle inlines the same-package track/valueTypes/targetRef helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured size ~6.0 kB is mostly that shared compile path, not the clip literals; base core stays 14.5/15 with clips fully tree-shaken out. Raised 6→7 for 0.13 morph (shared-element box-FLIP sugar over clip)
  scene: 18, // raised 12→13→14→15→16→17→18 (0.5.x authoring features; 0.7 determinism: render-mode guards + cache-cold audit; 0.10 §3.5 cross-frame raster cache: cacheKey serializer + FNV-1a + the bitmap LRU in the shared Raster2D; 0.10.1 gradient Paint raster — linear/radial fill resolution + the smooth/gaussian stop densifier (oklab-eased ramp); 0.12 §3 mesh Paint kernel — the shared deterministic Shepard/gaussian IDW rasterizer (meshGradient.ts) + the clip+drawImage blit branch in Raster2D, ~0.8 kB. This is the REAL render path (one CPU kernel both backends run, no SkSL fork), not tree-shakeable; it is the determinism tentpole of the milestone)
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
    // Inject NODE_ENV the way every production bundler does, so the studio-preview
    // `__forceState` escape hatch (gated on `process.env.NODE_ENV !== 'production'`
    // in @glissade/interact) is dead-code-eliminated from the measured bundle.
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  const out = result.outputFiles[0].contents;
  const gz = gzipSync(out).length / 1024;
  const ok = gz <= budgetKb;
  if (BASE.has(pkg)) baseTotal += gz;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${pkg.padEnd(18)} ${gz.toFixed(2).padStart(6)} kB gz  (budget ${budgetKb} kB)`);

  // §A.2: the studio-preview `__forceState` escape hatch must NOT survive into a
  // production bundle — a build-time NODE_ENV define (above) is expected to DCE the
  // dev branch. Assert it's gone from the minified interact output (Vemj).
  if (pkg === 'interact') {
    const minified = new TextDecoder().decode(out);
    const stripped = !minified.includes('__forceState');
    if (!stripped) failed = true;
    console.log(
      `${stripped ? 'ok  ' : 'FAIL'} interact strips __forceState${stripped ? '' : ' (leaked into production bundle)'}`,
    );
  }
}

const baseOk = baseTotal <= 36;
if (!baseOk) failed = true;
console.log(`${baseOk ? 'ok  ' : 'FAIL'} base embed path     ${baseTotal.toFixed(2).padStart(6)} kB gz  (budget 36 kB)`);

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

// §3.6 / §4.4 guard: the font INGEST deps (the woff2 decoder + the hb-subset
// variable-axis instancer) are EXPORT/prepare-path only — they live on the
// @glissade/core/font-ingest entry, reached exclusively via a dynamic import().
// They must NEVER leak into any embed-path bundle (core/index, scene, canvas2d,
// player, element). A static import would silently pull a wasm decoder into the
// browser embed, so assert their absence on every run via the metafile — exactly
// the yoga-exclusion shape above.
const FONT_INGEST_DEPS = /subset-font|harfbuzz|wawoff2|fontverter|woff2sfnt|fontIngest|font-ingest/i;
for (const pkg of ['core', 'scene', 'backend-canvas2d', 'player', 'element']) {
  let leaked = [];
  try {
    const res = await build({
      entryPoints: [`${root}packages/${pkg}/dist/index.js`],
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      external: ['@glissade/*'],
      metafile: true,
      logLevel: 'silent',
    });
    leaked = Object.keys(res.metafile.inputs).filter((i) => FONT_INGEST_DEPS.test(i));
  } catch (err) {
    // A STATIC import of subset-font drags its Node-only built-ins (fs/path) into
    // a browser bundle and esbuild fails to resolve them — that build failure IS
    // the leak signal. (The sanctioned path is a dynamic import() with a
    // non-literal specifier, which esbuild never statically pulls in.)
    leaked = [`bundle failed (font-ingest dep reached the embed graph): ${String(err.message ?? err).split('\n')[0]}`];
  }
  const ok = leaked.length === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${pkg.padEnd(18)} excludes font-ingest deps${ok ? '' : ` (leaked: ${leaked.join(', ')})`}`,
  );
}

process.exit(failed ? 1 : 0);
