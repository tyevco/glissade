/**
 * Bundle-size budgets (DESIGN.md §4.4), enforced in CI: each embed-path
 * package is bundled standalone (esbuild, minified) and its gzipped size
 * checked against the spec budget. Base embed path (core + scene + canvas2d
 * + player) must stay ≤ 38 kB (raised 35→36 in 0.12 for the §3 mesh Paint
 * kernel — a real, non-tree-shakeable render path, the milestone's determinism
 * tentpole; 36→37 in 0.13 for scene's each() instancing — see the scene budget
 * note; 37→38 in 0.14 for the §2.2 scalar→vec2 bind-time guard — see the core
 * budget note); element adds ≤ 5 kB.
 */

import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Scan an embed package's built `dist` for a STATIC `@glissade/core/font-ingest`
 * specifier. esbuild externalizes `@glissade/*`, so a static subpath import of
 * the ingest entry never shows up as a bundled metafile input — the metafile
 * guard below is blind to it. The sanctioned reach is a DYNAMIC `import()` only
 * (lazy, never in the synchronous embed graph), so we FAIL on any static
 * `import … from '@glissade/core/font-ingest'` / bare `import '…'` while
 * ignoring `import('…')` call expressions.
 *
 * Returns the list of `{ file, line }` static-import sites (empty = clean).
 */
export function findStaticFontIngestImports(distDir) {
  const spec = '@glissade/core/font-ingest';
  const hits = [];
  let files;
  try {
    files = [...distFiles(distDir)];
  } catch {
    return hits; // no dist (unbuilt) — nothing to scan
  }
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes(spec)) continue;
    for (const m of src.matchAll(
      // static ESM import of the ingest subpath: `… from '…'` (named/namespace,
      // also `export … from`) or a bare side-effect `import '…'`. A dynamic
      // `import('…')` is a call expression — `import` glued to `(`, never to
      // whitespace+quote — so neither branch matches it (the sanctioned path).
      /(?:from\s*|\bimport\s+)['"]@glissade\/core\/font-ingest['"]/g,
    )) {
      const line = src.slice(0, m.index).split('\n').length;
      hits.push({ file, line });
    }
  }
  return hits;
}

function* distFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* distFiles(p);
    else if (/\.(js|mjs)$/.test(entry)) yield p;
  }
}

// kB (gzipped) per §4.4 sub-budgets
const BUDGETS = {
  core: 16, // raised 8→10→11→12→14→15→16 (v2 §B.6 derivative/retarget math; 0.7 correctness: sync-unit ids, audio-offset helper, clamp + sidecar-label warnings; 0.9 §3.6 FontRegistry + hand-rolled cmap reader (formats 4/12) + font validation — DEV/export-path only, never in evaluate(), tree-shaken out of real embeds; 0.10.1 §2.2 paint value type: gradient (linear/radial) Paint + keyframe interpolation (lerp/lift/snap) — a first-class animatable value like path/color, registered so it can't tree-shake, ~0.5 kB; 0.14 §2.2 scalar→vec2 bind-time guard — BindTypeMismatchError + the per-track type check in bindTimeline that hard-throws a scalar-on-vec2 / type↔shape mismatch instead of silently NaN-ing the matrix, ~0.1 kB. A runtime correctness FLOOR for the silent-NaN class — on the synchronous embed path (bindTimeline runs at bind), so it can't tree-shake; base embed path stays ~37/38)
  'core/clips': 7, // §2 motion clips: build-time authoring sugar (clip/clipList + the popIn/slideIn/pulse/driftLoop literals + 0.13 morph (shared-element box-FLIP) + 0.13 presence (enter/exit scheduling)) on a tree-shakeable sub-path, never in the base index. Standalone bundle inlines the same-package track/valueTypes/targetRef helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared compile path, not the literals; base core stays ~14.8/15 with clips fully tree-shaken out. Raised 6→7 for the 0.13 clip tier (morph + presence)
  'core/i18n': 2, // 0.14 localization core: requireParity (pure id-set diff) + localize (pure doc→doc resolver) + t() (ambient-table build-time sugar). Tree-shakeable sub-path off the base index — the resolver bytes never touch the embed budget. timeline/track are TYPE-only imports, so the standalone bundle is essentially just these three functions.
  scene: 19, // raised 12→13→14→15→16→17→18→19 (0.5.x authoring features; 0.7 determinism: render-mode guards + cache-cold audit; 0.10 §3.5 cross-frame raster cache: cacheKey serializer + FNV-1a + the bitmap LRU in the shared Raster2D; 0.10.1 gradient Paint raster — linear/radial fill resolution + the smooth/gaussian stop densifier (oklab-eased ramp); 0.12 §3 mesh Paint kernel — the shared deterministic Shepard/gaussian IDW rasterizer (meshGradient.ts) + the clip+drawImage blit branch in Raster2D, ~0.8 kB. This is the REAL render path (one CPU kernel both backends run, no SkSL fork), not tree-shakeable; it is the determinism tentpole of the milestone; 18→19 in 0.13 for each() — deterministic parametric instancing (layout arithmetic + seeded mix + id stamping), ~1 kB. The clip runtime it fans is imported TYPE-ONLY, so the @glissade/core/clips bytes stay in the consumer bundle, NOT scene — verified: the scene metafile carries no clip/clipStdlib input)
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

// Run the budget/leak gate as a CLI when invoked directly — guarded so a test
// can `import` this module for its exported helpers without triggering the full
// esbuild sweep (which requires a built dist tree).
if (import.meta.url === `file://${process.argv[1]}`) {
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

const baseOk = baseTotal <= 38;
if (!baseOk) failed = true;
console.log(`${baseOk ? 'ok  ' : 'FAIL'} base embed path     ${baseTotal.toFixed(2).padStart(6)} kB gz  (budget 38 kB)`);

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

  // Companion STATIC-source scan: the metafile check above catches font-ingest
  // deps that got BUNDLED, but esbuild externalizes `@glissade/*`, so a static
  // `import … from '@glissade/core/font-ingest'` in this embed package's own
  // dist never appears as a bundled input — invisible to the metafile. Grep the
  // built dist directly and FAIL on any static specifier (dynamic import() is
  // the only sanctioned reach).
  const staticHits = findStaticFontIngestImports(`${root}packages/${pkg}/dist`);
  const staticOk = staticHits.length === 0;
  if (!staticOk) failed = true;
  console.log(
    `${staticOk ? 'ok  ' : 'FAIL'} ${pkg.padEnd(18)} no static font-ingest import${
      staticOk ? '' : ` (leaked: ${staticHits.map((h) => `${h.file.slice(root.length)}:${h.line}`).join(', ')})`
    }`,
  );
}

process.exit(failed ? 1 : 0);
}
