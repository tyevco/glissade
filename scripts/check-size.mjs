/**
 * Bundle-size budgets (DESIGN.md §4.4), enforced in CI: each embed-path
 * package is bundled standalone (esbuild, minified) and its gzipped size
 * checked against the spec budget. Base embed path (core + scene + canvas2d
 * + player) must stay ≤ 39 kB (raised 35→36 in 0.12 for the §3 mesh Paint
 * kernel — a real, non-tree-shakeable render path, the milestone's determinism
 * tentpole; 36→37 in 0.13 for scene's each() instancing — see the scene budget
 * note; 37→38 in 0.14 for the §2.2 scalar→vec2 bind-time guard — see the core
 * budget note; 38→39 in 0.18 for the §2.6 builder authoring-ergonomics tier —
 * tl.stagger (non-uniform each + anchored cascades), tl.sequence/at with the
 * .call() callback-forwarding + sibling-collision fix, and the stagger cursor
 * fixes: all non-tree-shakeable builder API every consumer uses. The 35→39
 * creep is flagged for the deferred 1.0 budget review); element adds ≤ 5 kB.
 *
 * 0.20 BASE-EMBED BUDGET REVIEW (pre.0): the base embed had crept to 38.79/39 —
 * FULL, blocking every embed-touching 0.20 feature. We RECOVERED headroom the
 * proven way (mirroring the yoga/path/type/snapshot splits): relocate code that
 * is NOT on the evaluate/render path off the base barrels onto tree-shakeable
 * subpaths. Three moves: `@glissade/core/sidecar` (the §6.2 studio sidecar — ~1
 * kB gz off core), `@glissade/scene/diagnostics` (the §3.3 diff/snapshot
 * substrate + cacheColdAudit + tokenHighlight — DEV/CLI only) and
 * `@glissade/scene/motion` (the §3 motion-path follow helper — a user-facing
 * opt-in, re-exported onto the browser IIFE so window.glissade.motionPath
 * survives). The §3.5 cacheKey replacer `collapseReplacer` is the ONE piece of
 * that cluster on the render path; it was split into its own `collapseReplacer.ts`
 * (byte-identical) and stays on the base scene index. Result: base embed
 * 38.79 → ~34.93 gz. We KEEP the ceiling at 39 (NOT raised) — the recovered
 * headroom is the 0.20 feature budget. POSTURE (the rule the new metafile guards
 * below enforce): evaluate/render-path code spends real base budget;
 * studio/dev/diagnostic/optional-helper code → a subpath.
 *
 * CI-FAITHFUL MEASUREMENT (root-cause of the historical fail-then-fix delta):
 * CI measured the base embed ~0.16 kB HEAVIER than local (a 0.19.1 +0.16 warn
 * read 38.86 local / 39.02 CI and red-failed). Both run node 22, so it was NOT
 * a node float. Root cause: `esbuild` (the minifier THIS script measures with)
 * was pinned with a CARET (`^0.28.0`) — esbuild patch releases routinely shift
 * minified output by tens-to-hundreds of bytes, so CI resolving a different
 * 0.28.x than the local lockfile produced a different gz. FIX: esbuild AND
 * tsdown (the builder that emits the measured `dist`) are now pinned EXACT in
 * the root + cli package.json — one toolchain, one byte count, local == CI.
 * This script measures the BUILT `dist`, so `pnpm build` (+ `pnpm build:browser`
 * for the IIFE) MUST run first; an unbuilt entry is skipped, not silently stale.
 * The number printed is the conservative `export *` worst case (every barrel
 * symbol retained) — a real tree-shaken embed is smaller, so the budget has
 * honest margin baked in.
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
  core: 17, // raised 8→10→11→12→14→15→16→17 (v2 §B.6 derivative/retarget math; 0.7 correctness: sync-unit ids, audio-offset helper, clamp + sidecar-label warnings; 0.9 §3.6 FontRegistry + hand-rolled cmap reader (formats 4/12) + font validation — DEV/export-path only, never in evaluate(), tree-shaken out of real embeds; 0.10.1 §2.2 paint value type: gradient (linear/radial) Paint + keyframe interpolation (lerp/lift/snap) — a first-class animatable value like path/color, registered so it can't tree-shake, ~0.5 kB; 0.14 §2.2 scalar→vec2 bind-time guard — BindTypeMismatchError + the per-track type check in bindTimeline that hard-throws a scalar-on-vec2 / type↔shape mismatch instead of silently NaN-ing the matrix, ~0.1 kB. A runtime correctness FLOOR for the silent-NaN class — on the synchronous embed path (bindTimeline runs at bind), so it can't tree-shake; base embed path stays ~37/38; 16→17 in 0.19 for the builder authoring sugar — unknown-option guard (rejectUnknownOpts) + per-target stagger fn-form + tl.tracks clip-tier bridge, ~0.1 kB additive builder API. NOTE: CI minifies ~0.1 kB heavier than local (16.07 > 16 in CI, 15.98 locally); the binding base-embed 39 ceiling is the real embed guard and stays 38.4, unaffected by this sub-budget raise)
  'core/clips': 8, // §2 motion clips: build-time authoring sugar (clip/clipList + the popIn/slideIn/pulse/driftLoop literals + 0.13 morph (shared-element box-FLIP) + 0.13 presence (enter/exit scheduling)) on a tree-shakeable sub-path, never in the base index. Standalone bundle inlines the same-package track/valueTypes/targetRef helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared compile path, not the literals; base core stays ~15.4/16 with clips fully tree-shaken out. Raised 6→7 for the 0.13 clip tier (morph + presence). Raised 7→8 in 0.18 for the presence inline-literal sugar (PresenceTransition + transitionToClip: the opacity/offset+edge/scale→clip compiler that lets authors spell enter/exit as a terse literal instead of hand-building clip() channels — PURE build-time sugar, compiles to the same tracks, ~0.25 kB)
  'core/sidecar': 6, // 0.20: the §6.2 editor sidecar (merge/migrate/orphan/key-id machinery) — STUDIO-only, never on the evaluate/embed path. Relocated off the base core index in the 0.20 budget review onto this tree-shakeable subpath (~1 kB gz recovered on base core). The standalone bundle inlines the same-package track/spring/targetRef helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured ~5 kB is mostly that shared path, not the sidecar's own surface; base core stays sidecar-free (asserted by the metafile guard below).
  'core/i18n': 2, // 0.14 localization core: requireParity (pure id-set diff) + localize (pure doc→doc resolver) + t() (ambient-table build-time sugar). Tree-shakeable sub-path off the base index — the resolver bytes never touch the embed budget. timeline/track are TYPE-only imports, so the standalone bundle is essentially just these three functions.
  scene: 20, // raised 12→13→14→15→16→17→18→19→20 (0.5.x authoring features; 0.7 determinism: render-mode guards + cache-cold audit; 0.10 §3.5 cross-frame raster cache: cacheKey serializer + FNV-1a + the bitmap LRU in the shared Raster2D; 0.10.1 gradient Paint raster — linear/radial fill resolution + the smooth/gaussian stop densifier (oklab-eased ramp); 0.12 §3 mesh Paint kernel — the shared deterministic Shepard/gaussian IDW rasterizer (meshGradient.ts) + the clip+drawImage blit branch in Raster2D, ~0.8 kB. This is the REAL render path (one CPU kernel both backends run, no SkSL fork), not tree-shakeable; it is the determinism tentpole of the milestone; 18→19 in 0.13 for each() — deterministic parametric instancing (layout arithmetic + seeded mix + id stamping), ~1 kB. The clip runtime it fans is imported TYPE-ONLY, so the @glissade/core/clips bytes stay in the consumer bundle, NOT scene — verified: the scene metafile carries no clip/clipStdlib input; 19→20 in 0.14 for collectLocalizedTextUsages — the FIX 3 (0.14 NO-GO canary) post-localize string-track font-usage collector that the --strict CJK-tofu gate needs; it reuses the existing node-walk + Text instanceof path, ~0.01 kB over the tight 19 budget)
  'scene/layout': 55, // §3.2: Yoga (wasm-base64 + bindings) ships ONLY in this separate entry, never the base scene bundle
  'scene/path': 3, // 0.17.1: the SVG `d`-string parser (parseSvgPathData + pathFromSvg) ships ONLY on this separate entry, never the base scene index — `Path({ data })` on a bare string throws pointing here. Keeping it off the base dropped the embed back under the 38 line.
  'scene/diagnostics': 7, // 0.20: the §3.3 DEV/CLI determinism-diagnostic surface — diffDisplayLists / formatDisplayDiff / serializeDisplayList / parseDisplaySnapshot, auditCacheCold, and tokenHighlight. Side-effect-free, NEVER reached by evaluate(); relocated off the base scene index in the 0.20 budget review onto this tree-shakeable subpath. (`collapseReplacer` — the byte-preserving §3.5 cacheKey replacer — is the one piece on the render path; it stays in collapseReplacer.ts on the base index and is re-exported here.) The standalone bundle inlines the same-package displayList/node helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured ~5.4 kB is mostly that shared path; base scene stays diagnostics-free (asserted by the metafile guard below).
  'scene/motion': 7, // 0.20: the §3 motion-path follow helper — followPath / motionPath / pointAtLength / pathLength. A USER-FACING opt-in (the design agent reaches for window.glissade.motionPath), but NOT on the base evaluate/render path — only path-following scenes import it. Relocated off the base scene index onto this tree-shakeable subpath in the 0.20 budget review, and re-exported onto the @glissade/browser IIFE so window.glissade.motionPath survives. The standalone bundle inlines the same-package Path/node helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured ~5.3 kB is mostly that shared node-construction path, not motionPath's own surface; base scene stays motion-free (asserted by the metafile guard below).
  'scene/type': 5, // 0.19: splitText() — build-time split-text sub-targets (word/line/grapheme → a Group of positioned per-part child Texts). Ships ONLY on this separate entry, never the base scene index — ZERO base-scene cost, mirroring each()/scene/layout/scene/path. The standalone bundle inlines the same-package Text/Group/measurement helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared node-construction path, not splitText's own ~1 kB.
  'backend-canvas2d': 8,
  'backend-canvas2d/snapshot': 3, // 0.19: the `renderToDataURL` / `snapshotCanvas` data-URL DX seam (Blob→data: encode + the evaluate→render→snapshot one-shot) ships ONLY on this separate entry, never the base backend-canvas2d index — a no-build playback embed never needs to screenshot. Keeping it off the base index returned the base embed to ~38.44 (it had crept to 38.84 when the snapshot code lived on the index). Standalone bundle inlines the same-package backend index it renders through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared backend path, not the encode helper.
  player: 4,
  element: 5,
  interact: 6, // v2 §C.6 CI target: machine + listeners + hitTest + pointerDriver ≤ 6 kB gz (opt-in)
  'interact/audio': 2, // v2 §C.6: offline audio as a separate export ≤ 2 kB gz
  'effects-webgpu': 4, // §3.7 browser-only shader runner (incl. built-in WGSL strings)
  browser: 47, // §4.4 single-file IIFE: the WHOLE embed path INLINED (core+scene+canvas2d+player+element) PLUS the @glissade/core/clips tier (presence/each/morph/clip + stdlib) for window.glissade discoverability — measured from the prebuilt dist/glissade.browser.js (42.3 kB measured w/ clips + headroom; was 39.3 kB before clips). 45→46 in 0.18 pre.6 for describe() construction-completeness: the richer API manifest (construction props + the curated Layout family schema + the assets-shape createScene string + the negative-space prop entries) is a static data table re-exported onto window.glissade for AI discoverability — it is NOT on the base embed path (describe stays tree-shaken off the base scene index; base embed measured UNCHANGED at 38.15 kB), only this convenience bundle inlines it (45.12 kB measured). 46→47 in 0.19 to expose renderToDataURL/snapshotCanvas on window.glissade (the +0.36 kB screenshot DX seam): the Claude-Design no-build consumer works ONLY against the IIFE, so a feature absent from window.glissade is unusable to it — the snapshot helper's primary audience IS this bundle. This is the CONVENIENCE bundle, NOT the sacred base embed (which stays tree-shaken-lean at 38.6/39); browser measures ~45.96. Not measured by the standalone loop below (that externalizes @glissade/*, which would leave an empty shell) — see the dedicated block after the loop.
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
  // The single-file IIFE is INLINED, not externalized — bundling it through the
  // standalone (external @glissade/*) path below would measure an empty shell.
  // It is measured from its prebuilt dist in the dedicated block after the loop.
  if (pkg === 'browser') continue;
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
    // measure each package alone: workspace deps are externals. The off-embed,
    // prepare/render-path `core/i18n` subpath (FIX 3, 0.15) lazily loads
    // `node:async_hooks` for its per-locale AsyncLocalStorage scope — a node
    // builtin that is never part of a browser embed (and is reached only via
    // `runWithMessageTable`, off every base path). Externalize node builtins ONLY
    // for that subpath so the browser-target bundler doesn't try to resolve it;
    // the base embed packages keep node builtins resolvable so a real accidental
    // node-import in a browser package still fails the bundle.
    external: pkg === 'core/i18n' ? ['@glissade/*', 'node:*'] : ['@glissade/*'],
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

const baseOk = baseTotal <= 39;
if (!baseOk) failed = true;
console.log(`${baseOk ? 'ok  ' : 'FAIL'} base embed path     ${baseTotal.toFixed(2).padStart(6)} kB gz  (budget 39 kB)`);

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

// 0.17.1 guard: the base scene bundle must NOT pull in the SVG `d`-string parser
// — it's a separately-budgeted entry (@glissade/scene/path). `Path({ data })` on a
// bare string throws pointing there rather than dragging the parser onto every
// embed, so assert via the metafile that path.ts never enters the base graph.
const pathInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) => /scene\/(src|dist)\/path\./.test(i));
const pathOk = pathInBase.length === 0;
if (!pathOk) failed = true;
console.log(`${pathOk ? 'ok  ' : 'FAIL'} base scene excludes path parser${pathOk ? '' : ` (leaked: ${pathInBase.join(', ')})`}`);

// 0.19 guard: the base scene bundle must NOT pull in splitText() — it's a
// separately-budgeted entry (@glissade/scene/type). It's a leaf module index
// never imports, so assert via the metafile that type.ts stays off the base graph.
const typeInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) => /scene\/(src|dist)\/type\./.test(i));
const typeOk = typeInBase.length === 0;
if (!typeOk) failed = true;
console.log(`${typeOk ? 'ok  ' : 'FAIL'} base scene excludes splitText${typeOk ? '' : ` (leaked: ${typeInBase.join(', ')})`}`);

// 0.20 guard: the base scene bundle must NOT pull in the DEV/CLI diagnostic
// cluster — diffDisplayLists/serializeDisplayList (displayDiff.ts), auditCacheCold
// (cacheColdAudit.ts), or tokenHighlight (tokenHighlight.ts) — it's the
// separately-budgeted @glissade/scene/diagnostics entry. None is reached by
// evaluate(); a stray re-import onto the base index would silently re-bloat the
// embed (that's exactly how the base crept to 38.79). `collapseReplacer.ts` (the
// §3.5 cacheKey replacer) is the ONE render-path member and is EXEMPT — it stays
// on the base index by design. Assert the rest stay off via the metafile.
const diagInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) =>
  /scene\/(src|dist)\/(displayDiff|cacheColdAudit|tokenHighlight|diagnostics)\./.test(i),
);
const diagOk = diagInBase.length === 0;
if (!diagOk) failed = true;
console.log(`${diagOk ? 'ok  ' : 'FAIL'} base scene excludes diagnostics${diagOk ? '' : ` (leaked: ${diagInBase.join(', ')})`}`);

// 0.20 guard: the base scene bundle must NOT pull in the motion-path follow
// helper (motionPath.ts / motion.ts) — it's the separately-budgeted
// @glissade/scene/motion entry (a user-facing opt-in, re-exported onto the
// browser IIFE). Index never imports it, so assert via the metafile that it
// stays off the base graph.
const motionInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) =>
  /scene\/(src|dist)\/(motionPath|motion)\./.test(i),
);
const motionOk = motionInBase.length === 0;
if (!motionOk) failed = true;
console.log(`${motionOk ? 'ok  ' : 'FAIL'} base scene excludes motion${motionOk ? '' : ` (leaked: ${motionInBase.join(', ')})`}`);

// 0.20 guard: the base CORE index must NOT pull in the §6.2 editor sidecar
// (sidecar.ts) — it's the separately-budgeted @glissade/core/sidecar entry,
// STUDIO-only and never on the evaluate/embed path. A stray re-import would
// silently re-bloat the embed (sidecar is ~15.6 kB raw / ~1 kB gz on the core
// budget). Assert via the metafile that sidecar.ts never enters the base core
// graph — the yoga/path/diagnostics exclusion shape, applied to core.
const coreIndex = await build({
  entryPoints: [`${root}packages/core/dist/index.js`],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  external: ['@glissade/*'],
  metafile: true,
  logLevel: 'silent',
});
const sidecarInBase = Object.keys(coreIndex.metafile.inputs).filter((i) => /core\/(src|dist)\/sidecar\./.test(i));
const sidecarOk = sidecarInBase.length === 0;
if (!sidecarOk) failed = true;
console.log(`${sidecarOk ? 'ok  ' : 'FAIL'} base core excludes sidecar${sidecarOk ? '' : ` (leaked: ${sidecarInBase.join(', ')})`}`);

// 0.19 guard: the base backend-canvas2d index must NOT pull in the snapshot /
// data-URL DX seam (`renderToDataURL` / `snapshotCanvas` + the Blob→data: encode)
// — it's a separately-budgeted entry (@glissade/backend-canvas2d/snapshot). A
// no-build playback embed never screenshots, so it must tree-shake off the base
// embed; if it crept back onto the index the base embed grows ~0.4 kB (it did,
// 38.44→38.84, before this split). Assert via the metafile that snapshot.ts never
// enters the base backend graph, AND grep the minified output for the data-URL
// encode tokens (a belt-and-suspenders check the encode code didn't inline).
const canvas2dIndex = await build({
  entryPoints: [`${root}packages/backend-canvas2d/dist/index.js`],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  external: ['@glissade/*'],
  metafile: true,
  logLevel: 'silent',
});
const snapshotInBase = Object.keys(canvas2dIndex.metafile.inputs).filter((i) =>
  /backend-canvas2d\/(src|dist)\/snapshot\./.test(i),
);
const canvas2dOut = new TextDecoder().decode(canvas2dIndex.outputFiles[0].contents);
// The encode path's distinctive tokens — `convertToBlob` + `btoa` are the
// Blob→data:URL round-trip, present only in snapshot.ts. (`toDataURL` lives in
// readPixels-adjacent code? no — only snapshot uses it, so it's a fair sentinel.)
const encodeTokens = ['convertToBlob', 'btoa', 'renderToDataURL'].filter((t) => canvas2dOut.includes(t));
const snapshotOk = snapshotInBase.length === 0 && encodeTokens.length === 0;
if (!snapshotOk) failed = true;
console.log(
  `${snapshotOk ? 'ok  ' : 'FAIL'} base backend-canvas2d excludes snapshot/data-URL code${
    snapshotOk
      ? ''
      : ` (leaked: ${[...snapshotInBase, ...encodeTokens.map((t) => `token:${t}`)].join(', ')})`
  }`,
);

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

// §4.4: the single-file `@glissade/browser` IIFE is built separately (the whole
// embed path inlined into `dist/glissade.browser.js` via scripts/build-browser.mjs).
// Measure that PREBUILT artifact directly — gz must stay ≤ the browser budget.
// Skip gracefully (don't fail) when it's absent (unbuilt: `pnpm build:browser`
// hasn't run), so a plain `pnpm build && check:size` doesn't false-fail.
{
  const browserFile = `${root}packages/browser/dist/glissade.browser.js`;
  let raw;
  try {
    raw = readFileSync(browserFile);
  } catch {
    raw = null;
  }
  if (raw === null) {
    console.log(`skip browser             (dist/glissade.browser.js not built — run pnpm build:browser)`);
  } else {
    const budgetKb = BUDGETS.browser;
    const gz = gzipSync(raw).length / 1024;
    const ok = gz <= budgetKb;
    if (!ok) failed = true;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${'browser'.padEnd(18)} ${gz.toFixed(2).padStart(6)} kB gz  (budget ${budgetKb} kB, ${(raw.length / 1024).toFixed(2)} kB raw)`,
    );

    // §3.2 / §4.4 guard: Yoga's wasm MUST stay OUT of the single-file IIFE. The
    // layout ctors + loadYogaLayoutEngine live in @glissade/scene/layout, whose
    // dynamic import('yoga-layout/load') esbuild CANNOT keep async in an IIFE
    // (no code-splitting in format:'iife') — it would inline the wasm-base64
    // binding statically and balloon the bundle ~46.6→~99 kB gz. Mirror the
    // "base scene excludes yoga-layout" metafile guard with a token scan of the
    // prebuilt artifact: `calculateLayout`/`setFlexDirection` are distinctive
    // yoga-binding identifiers, present ONLY when Yoga got inlined. If layout
    // ctors are ever re-exported onto the IIFE, this fails loudly (the 0.20
    // refactor must split the ctors from the engine import first).
    const browserOut = new TextDecoder().decode(raw);
    const yogaTokens = ['calculateLayout', 'setFlexDirection', 'yoga-wasm'].filter((t) =>
      browserOut.includes(t),
    );
    const yogaOut = yogaTokens.length === 0;
    if (!yogaOut) failed = true;
    console.log(
      `${yogaOut ? 'ok  ' : 'FAIL'} browser IIFE excludes yoga binding${
        yogaOut ? '' : ` (inlined: ${yogaTokens.map((t) => `token:${t}`).join(', ')})`
      }`,
    );
  }
}

process.exit(failed ? 1 : 0);
}
