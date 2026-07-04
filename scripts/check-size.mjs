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
  'core/clips': 9, // §2 motion clips: build-time authoring sugar (clip/clipList + the popIn/slideIn/pulse/driftLoop literals + 0.13 morph (shared-element box-FLIP) + 0.13 presence (enter/exit scheduling)) on a tree-shakeable sub-path, never in the base index. Standalone bundle inlines the same-package track/valueTypes/targetRef helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared compile path, not the literals; base core stays ~15.4/16 with clips fully tree-shaken out. Raised 6→7 for the 0.13 clip tier (morph + presence). Raised 7→8 in 0.18 for the presence inline-literal sugar (PresenceTransition + transitionToClip: the opacity/offset+edge/scale→clip compiler that lets authors spell enter/exit as a terse literal instead of hand-building clip() channels — PURE build-time sugar, compiles to the same tracks, ~0.25 kB). 8->9 in 0.40: `retime` + its reversedKeys/mirrorEase helpers relocated here off the base core index (the Expr base-budget review) — pure build-time key transforms, string-heavy, ~0.5 kB gz; keeps the SACRED base embed <= 39 (38.44) without a base bump.
  'core/expr': 7, // 0.40 Expr: the deterministic math-formula evaluator (tokenizer + precedence-climbing parser → closure + a pure Math/constant whitelist + seeded rand) behind exprTrack. Tree-shakeable subpath OFF the base embed — a ~1.4 kB parser that must not ride every scene's render path; the base sampler carries only a tiny compiler-register seam (sampleTrack's tr.expr branch + setExprCompiler), and importing @glissade/core/expr activates it. Standalone bundle inlines the same-package track/valueTypes helpers exprTrack builds through (the @glissade/* external only catches CROSS-package deps), so the measured ~2.9 kB is mostly that shared construction path, not the evaluator's own surface; base core stays expr-free (asserted by the metafile guard below). 6->7 in 0.40: CI minified 6.03 > 6.00 local (the recurring ~0.16 kB CI-heavier delta) — bumped to 7 for the delta + headroom.
  'core/sidecar': 6, // 0.20: the §6.2 editor sidecar (merge/migrate/orphan/key-id machinery) — STUDIO-only, never on the evaluate/embed path. Relocated off the base core index in the 0.20 budget review onto this tree-shakeable subpath (~1 kB gz recovered on base core). The standalone bundle inlines the same-package track/spring/targetRef helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured ~5 kB is mostly that shared path, not the sidecar's own surface; base core stays sidecar-free (asserted by the metafile guard below).
  'core/i18n': 2, // 0.14 localization core: requireParity (pure id-set diff) + localize (pure doc→doc resolver) + t() (ambient-table build-time sugar). Tree-shakeable sub-path off the base index — the resolver bytes never touch the embed budget. timeline/track are TYPE-only imports, so the standalone bundle is essentially just these three functions.
  scene: 20, // raised 12→13→14→15→16→17→18→19→20 (0.5.x authoring features; 0.7 determinism: render-mode guards + cache-cold audit; 0.10 §3.5 cross-frame raster cache: cacheKey serializer + FNV-1a + the bitmap LRU in the shared Raster2D; 0.10.1 gradient Paint raster — linear/radial fill resolution + the smooth/gaussian stop densifier (oklab-eased ramp); 0.12 §3 mesh Paint kernel — the shared deterministic Shepard/gaussian IDW rasterizer (meshGradient.ts) + the clip+drawImage blit branch in Raster2D, ~0.8 kB. This is the REAL render path (one CPU kernel both backends run, no SkSL fork), not tree-shakeable; it is the determinism tentpole of the milestone; 18→19 in 0.13 for each() — deterministic parametric instancing (layout arithmetic + seeded mix + id stamping), ~1 kB. The clip runtime it fans is imported TYPE-ONLY, so the @glissade/core/clips bytes stay in the consumer bundle, NOT scene — verified: the scene metafile carries no clip/clipStdlib input; 19→20 in 0.14 for collectLocalizedTextUsages — the FIX 3 (0.14 NO-GO canary) post-localize string-track font-usage collector that the --strict CJK-tofu gate needs; it reuses the existing node-walk + Text instanceof path, ~0.01 kB over the tight 19 budget)
  'scene/layout': 55, // §3.2: Yoga (wasm-base64 + bindings) ships ONLY in this separate entry, never the base scene bundle. 0.20: this entry now re-exports the Yoga-free ctors from layoutCtors.ts PLUS loadYogaLayoutEngine from layoutEngineYoga.ts (the dynamic `import('yoga-layout/load')`), so it STILL inlines Yoga in the standalone bundle — budget unchanged.
  'scene/layoutCtors': 4, // 0.20 no-build layout split (npm subpath `@glissade/scene/layout-ctors`; the budget key matches the dist filename layoutCtors.js): the Yoga-FREE node ctors (Layout/Stack/Row/Column) — they touch the LayoutEngine seam (requireLayoutEngine/setLayoutEngine) only at COMPUTE time, never `import('yoga-layout/load')` at construction. Split off the loader so the @glissade/browser IIFE can expose Stack/Row/Column WITHOUT inlining Yoga's wasm. Standalone bundle inlines the same-package node/displayList helpers it computes through (the @glissade/* external only catches CROSS-package deps); the ctors' own surface is ~1 kB. The "browser IIFE excludes yoga binding" guard verifies the no-inline.
  'scene/component': 4, // 0.36 defineComponent: reusable typed subscenes — a build-time factory generalization of Grid/Chart (props->subtree) + a childId id-scoping helper + a component registry describe() reads. Ships ONLY on this separate entry, never the base scene index; re-exported onto the @glissade/browser IIFE. Standalone bundle inlines the same-package Group/node helpers a component's build() constructs through (the @glissade/* external only catches CROSS-package deps); defineComponent's own surface is ~0.5 kB.
  'scene/grid': 4, // 0.20 Grid (Fork B: scene-side track resolver): a build-time fan-out like each()/splitText — resolves uniform fr/fixed column tracks + gaps into cell positions and emits a Group of ordinary positioned children (stamps NO id, changes NO golden). NOT a Yoga feature — zero layout-engine dep. Ships ONLY on this separate entry, never the base scene index. Standalone bundle inlines the same-package Group/node helpers it constructs through; Grid's own arithmetic surface is ~0.6 kB.
  'scene/gauge': 10, // 0.51: 9→10 for the fail-loud paint-validate guard (the shared Shape construction path now runs `paintType.validate(fill)` on a static Paint literal — new Rect({fill:{kind:'radialgradient'}}) throws a clean PaintError instead of failing cryptically per-backend). gauge inlines that shared node-construction surface, so the guard rides here; it was already brushing the 9 ceiling (8.98 local → 9.03 CI via the recurring ~0.16 kB CI-minify delta), so the guard tipped it over. Same fail-loud-guard-justifies-a-convenience-bump pattern as the 0.20.1 ctor-guard (48→49). SACRED base embed unaffected (38.72/39; the guard is +0.04 there). Precedent: 0.38 Gauge/Meter (radial data-viz): a build-time fan-out like Chart — a spec → N stroked-arc-Path zones + radial tick Rects + a needle Path (rotation = the gauge angle) + separate z-above label Texts (+ optional Circle glow), returning a Group. value→angle (Meter mode) is an inlined linear remap (NOT chart.ts — importing linearScale dragged the whole chart module, so it's inlined; gauge's own geometry is ~2 kB, dist/gauge.js 2.15 kB gz). The STANDALONE bundle inlines the same-package Path+Rect+Text+Circle+Group construction path it builds through (the @glissade/* external only catches CROSS-package deps) — MORE node types than any existing factory (Text is the heavy one), so the measured ~8.85 kB is almost entirely that shared multi-node construction surface, not Gauge's own code. 9 (vs chart's 7, which inlines only Rect+Group) carries that + the CI-minify delta. Ships ONLY on this separate entry (@glissade/scene/gauge), never the base scene index; re-exported onto the @glissade/browser IIFE. SACRED base embed UNCHANGED (a metafile guard asserts the base scene excludes gauge).
  'scene/chart': 7, // 0.32 Chart (the data-motion stack): a build-time fan-out like Grid — binds a table → positioned+sized Rect bars (each pinned to the axis, bottom-anchored so `height` grows from the base), returning a Group. Includes the serializable scales (linearScale/logScale/bandScale/colorRamp). Ships ONLY on this separate entry, never the base scene index — re-exported onto the @glissade/browser IIFE so window.glissade.Chart + the scale factories survive. Standalone bundle inlines the same-package Rect/Group/node construction path it builds bars through (the @glissade/* external only catches CROSS-package deps), so the measured 6.10 kB is mostly that shared construction surface (matching scene/type=6, scene/motion=7), not Chart's own ~1 kB of layout + scale math; budget 7 carries the ~0.16 kB CI-minify delta + headroom. The SACRED base embed is UNCHANGED (38.00/39; a metafile guard asserts the base scene excludes chart).
  'scene/path': 3, // 0.17.1: the SVG `d`-string parser (parseSvgPathData + pathFromSvg) ships ONLY on this separate entry, never the base scene index — `Path({ data })` on a bare string throws pointing here. Keeping it off the base dropped the embed back under the 38 line.
  'scene/diagnostics': 11, // 9->11 in 0.59 (fail-loud ground floor, card Hwp8qhV1hGh_): validate.ts (validateScene + resolveAt + instanceProps + Levenshtein) relocated here OFF the base scene index — DIAGNOSTIC surface, never on the evaluate/render hot path — so the SACRED base embed pays ZERO bytes for it (38.67/39, well under ceiling). Measured 7.78 → 9.13 (validateScene inlines the shared Node/scene/text construction path it walks — the @glissade/* external only catches CROSS-package deps, same-package construction inlines, the standard subpath pattern; its own validator/Levenshtein logic is ~1 kB). Ceiling 11 carries that + the recurring ~0.16-0.34 kB CI-minify delta + headroom. Off-base convenience/subpath, ZERO sacred cost; the "base scene excludes diagnostics" metafile guard now also covers validate.ts. // 7->9 in 0.57 (base-budget review): the font-usage collectors + validateSceneFonts (collectTextUsages/collectLocalizedTextUsages/validateSceneFonts) relocated here OFF the base scene index to recover ~0.38 kB gz and keep the SACRED base embed under 39 (it had crept to 38.85, tipping 39.00 in CI). They are CLI/localize/export-path helpers, never on the evaluate/render hot path — the same DEV/CLI rationale as the diff/audit surface. Measured 5.20 → 7.78 (fontUsage inlines the shared Group/Text/measurement construction path it walks — the @glissade/* external only catches CROSS-package deps, so same-package construction inlines, the standard subpath pattern). Ceiling 9 carries that + the ~0.16-0.34 kB CI-minify delta + headroom. Off-base convenience/subpath, ZERO sacred cost; the "base scene excludes diagnostics" metafile guard now also covers fontUsage.ts. // 0.20: the §3.3 DEV/CLI determinism-diagnostic surface — diffDisplayLists / formatDisplayDiff / serializeDisplayList / parseDisplaySnapshot, auditCacheCold. Side-effect-free, NEVER reached by evaluate(); relocated off the base scene index in the 0.20 budget review onto this tree-shakeable subpath. DEBUG-ONLY (tokenHighlight, a PRODUCTION render component, was split back out onto scene/tokens by the ai-training finding — it no longer rides this debug subpath). (`collapseReplacer` — the byte-preserving §3.5 cacheKey replacer — is the one piece on the render path; it stays in collapseReplacer.ts on the base index and is re-exported here.) The standalone bundle inlines the same-package displayList/node helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared path; base scene stays diagnostics-free (asserted by the metafile guard below).
  'scene/tokens': 7, // 0.20 (ai-training finding): tokenHighlight / TokenHighlight — the PRODUCTION token-highlight render component (visible sub-line token tell-tags in real episodes: four-color category passes, per-token flips). It was MIS-grouped onto scene/diagnostics by the budget review (reading as a debug import for visible UI); split back out onto this OWN production subpath. Still OFF the base scene index (opt-in production UI only token-highlight scenes import — base embed unchanged). npm-subpath-only: re-exporting it onto the @glissade/browser IIFE measured +1.16 kB gz (47.47 → 48.63), busting the 48 kB ceiling, so it is NOT on the convenience bundle (a no-build author imports the npm subpath). The standalone bundle inlines the same-package Text/node/roundedRect helpers it draws through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared render-construction path, not tokenHighlight's own surface; base scene stays tokens-free (asserted by the metafile guard below).
  'scene/motion': 15, // 8->15 in 0.57 (Particles/Emitters, card JNayx3RarmUS): particles() + the drift/sparks/dispense presets added to this subpath. particles COMPOSES each() (fixed slot nodes) + bake() (seeded physics → tracks), so this entry now inlines each.ts (its layout/mix/id-stamping arithmetic, + hashStr from sketch.ts — the rest of sketch tree-shakes) AND the nodes.ts construction path for Circle + Text (the glyph node-template dispense builds) + Group — the SAME "the @glissade/* external only catches CROSS-package deps, so same-package construction inlines" reason scene/type (Text+typewriter) and scene/gauge (Path+Rect+Text+Circle) measure high. Measured 13.60 (of which particles' OWN emitter/preset code is ~1.5 kB; ~11 kB is the shared each+nodes construction surface, +2.2 kB is Text for the glyph appearance). Ceiling 15 (not 14) — 13.60/14 left only 0.40 kB, and the CI-minify delta ran ~0.34 kB in the 0.55 browser red-fail (this razor-thin class burned six dispatches then); 15 buys real headroom over the delta. Off-base convenience/subpath, zero sacred cost. Still ZERO base-scene cost (subpath-only; the "base scene excludes motion" metafile guard now also covers particles.ts) — the SACRED base embed is UNCHANGED (38.85/39). // 7->8 in 0.55 (Camera rig, card ePNwjgDVwRU-): the Camera class (inverse-pose parent transform + focal-point zoom + pan-only parallax by layer depth + fail-loud safe-area/viewport guards) + the standalone `shake` driver (deterministic value-noise pose jitter, folded at emit) added to this subpath. Measured 7.70 (its own ~1.3 kB of camera/shake math on the already-inlined Path/node construction path the subpath reaches through — the @glissade/* external only catches CROSS-package deps). Still ZERO base-scene cost (subpath-only; the "base scene excludes motion" metafile guard now also covers camera/shake). The SACRED base embed is UNCHANGED (38.83/39). 0.20: the §3 motion-path follow helper — followPath / motionPath / pointAtLength / pathLength. A USER-FACING opt-in (the design agent reaches for window.glissade.motionPath), but NOT on the base evaluate/render path — only path-following scenes import it. Relocated off the base scene index onto this tree-shakeable subpath in the 0.20 budget review, and re-exported onto the @glissade/browser IIFE so window.glissade.motionPath survives. The standalone bundle inlines the same-package Path/node helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured ~5.3 kB is mostly that shared node-construction path, not motionPath's own surface; base scene stays motion-free (asserted by the metafile guard below).
  'scene/gradient': 3, // 0.58 (gradient smooth/gaussian export parity, card 8vQlXSkow67u): densifyStops + GRADIENT_RAMP_STEPS re-exported on this tree-shakeable subpath so the Lottie exporter can honor `interpolation: 'smooth'|'gaussian'` (densify the gf ramp to a 64-stop oklab approximation instead of a hard linear ramp) — the same render-vs-export asymmetry class as transparent-crash / gradient-fill. gradient.ts is ALREADY on the base scene index (raster2d imports densifyStops on the render path), so this subpath adds ZERO base cost — it just makes the existing pure densifier reachable to lottie (deps ['core','scene']) without dragging the whole scene index. Standalone bundle inlines only lerpColor's call seam (the @glissade/* external catches the cross-package core dep), so densifyStops' own ~0.4 kB surface measures tiny; ceiling 3 carries the ~0.16 kB CI-minify delta + headroom. Internal parity helper (like /diagnostics), NOT a user-facing factory — SKIPped in check-readme-subpaths.
  'scene/identity': 7, // 0.20 S1 (DOM-backend readiness): the OUT-OF-BAND node-identity producer — emitWithIds() + the instrumented DisplayListBuilder that records a positional NodeIdStream ALONGSIDE the DisplayList (docs/design/dom-backend.md "Seam 1"). OPT-IN and OFF by default: the normal evaluate/render never touches it, and Node.emit's enterNode/exitNode calls are guarded no-ops on createDisplayListBuilder, so every DrawCommand stays byte-identical. Ships ONLY on this separate entry (@glissade/scene/identity), never the base scene index — ZERO base-scene cost, mirroring diagnostics/motion/grid. The standalone bundle inlines the same-package scene/displayList/node helpers it evaluates through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared evaluate path, not emitWithIds's own ~0.5 kB. base scene stays identity-free (asserted by the metafile guard below).
  'scene/type': 8, // 0.19: splitText() — build-time split-text sub-targets (word/line/grapheme → a Group of positioned per-part child Texts). Ships ONLY on this separate entry, never the base scene index — ZERO base-scene cost, mirroring each()/scene/layout/scene/path. The standalone bundle inlines the same-package Text/Group/measurement helpers it compiles through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared node-construction path, not splitText's own ~1 kB. 5→6 in 0.24: it inlines text.ts, which gained the assertFiniteFontSize fail-loud guard (the measureText/font.size contract) — measured 5.08, a real safety addition on the shared measurement path. 6->7 in 0.35: fitText/fitTextSize/fitTextGroup (shrink-to-fit + wrap-to-max-lines) added to this subpath — a build-time binary search over measureWrappedText, sharing the same measurer plumbing as splitText; measured 6.09 (its own ~1 kB of search/FontSpec logic on the already-inlined text.ts path). 7->8 in 0.56: the kinetic type presets (typeOn/revealWords/revealLines/emphasizeWords) — a one-call sugar layer over the shipped primitives — added to this subpath. typeOn wraps typewriter() + textCursor(), so this entry now inlines typewriter.ts AND textCursor.ts (the caret's closed-form draw + matrix helpers), plus the presets' own stagger-composition logic; measured 7.42 (mostly those two newly-inlined base-scene modules, not the presets' ~1 kB). Still ZERO base-scene cost (subpath-only; the "base scene excludes splitText" guard still holds, base embed UNCHANGED at 38.84/39).
  'scene/examples': 19, // 17→19 in 0.56: the kinetic type presets' doctest snippets (typeOn/revealWords/revealLines/emphasizeWords) each exercise the REAL preset API, so the corpus bundle now inlines the /type kinetic surface — which pulls in typewriter.ts + textCursor.ts's construction/draw path (modules not previously reached by the corpus); measured 18.21 local, crossing the 17 ceiling. Bumped to 19 for the ~0.16 kB CI-minify delta + headroom. OPT-IN subpath — the SACRED base embed is UNCHANGED (describe never imports examples; base embed measured 38.84/39). // 16→17 in 0.30: the motion-craft examples (orientToPath/lookAt/retime/echo added 0.26, motionBlur added 0.30) each inline a bit more of the shared construction surface they demonstrate; measured 16.22 in CI (15.84 local + the recurring ~0.16 kB CI-minify delta + motionBlur's Circle/construction path), crossing the 16 ceiling. Bumped to 17 with headroom for the rest of the motion-craft suite. OPT-IN subpath — the SACRED base embed is UNCHANGED (describe never imports examples; base embed measured 37.99/39). // 0.24 (onboarding, card 8jQ9rNqStGDL): the runnable example corpus — copy-pasteable `code` snippets + executable `run` drift-guards, registered with describe() on import so describe({ examples: true }) surfaces them. Ships ONLY on this separate entry, never the base scene index — ZERO base-scene cost (describe NEVER imports examples; it reads a registry the corpus populates, the value-type-registry pattern; the IIFE stays lean — measured base embed + browser UNCHANGED). Each example exercises the REAL construction API, so the standalone bundle inlines nearly the WHOLE same-package construction surface it demonstrates (nodes/scene/grid/layoutCtors/type/motionPath/path — the @glissade/* external only catches CROSS-package deps): measured ~14.2 kB is almost entirely that shared construction path, not the corpus's own ~3 kB. An OPT-IN npm subpath (the doctest harness + a consumer who wants verified examples), off the sacred base embed.
  'backend-canvas2d': 8,
  'backend-dom': 8, // 0.21 (S2): the DOM/SVG RenderBackend — a thin DisplayList→element command walk (preview/non-parity realtime tier). A peer backend, NOT on the base embed and NOT re-exported onto the @glissade/browser IIFE (it's an npm/bundler consumer, not a no-build window.glissade feature), so base embed + IIFE budgets are untouched. The standalone bundle inlines the same-package scene helpers it walks through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared path; the backend's own surface is ~3 kB.
  'backend-canvas2d/snapshot': 3, // 0.19: the `renderToDataURL` / `snapshotCanvas` data-URL DX seam (Blob→data: encode + the evaluate→render→snapshot one-shot) ships ONLY on this separate entry, never the base backend-canvas2d index — a no-build playback embed never needs to screenshot. Keeping it off the base index returned the base embed to ~38.44 (it had crept to 38.84 when the snapshot code lived on the index). Standalone bundle inlines the same-package backend index it renders through (the @glissade/* external only catches CROSS-package deps), so the measured size is mostly that shared backend path, not the encode helper.
  player: 4,
  element: 5,
  interact: 6, // v2 §C.6 CI target: machine + listeners + hitTest + pointerDriver ≤ 6 kB gz (opt-in)
  'interact/audio': 2, // v2 §C.6: offline audio as a separate export ≤ 2 kB gz
  'effects-webgpu': 4, // §3.7 browser-only shader runner (incl. built-in WGSL strings)
  'browser-dom': 20, // 0.21: the OPTIONAL `glissade-dom.browser.js` augmentation IIFE — a 2nd <script src> a no-build editor page loads AFTER glissade.browser.js to add window.glissade.DomBackend + emitWithIds (the DOM render tier). SEPARATE from the lean base playback IIFE (which stays DomBackend-free — the "base IIFE excludes DomBackend" guard below asserts it), so playback embeds never pay for the edit/a11y tier. A self-contained 2nd script inherently re-inlines the scene emit path emitWithIds walks (the @glissade/* external only catches CROSS-package deps; a standalone IIFE inlines same-package scene helpers), so the measured size is mostly that shared evaluate/emit path + DomBackend, not its own surface — the duplication is the accepted cost of the 2-script no-build model (an editor page, not a size-critical playback embed). Measured from the prebuilt artifact in the dedicated block after the loop.
  browser: 73, // 69->73 in 0.57 (Particles/Emitters): particles/drift/sparks/dispense re-exported onto window.glissade so the no-build design agent reaches the seeded baked emitter + presets against the IIFE (its primary audience — a feature absent from window.glissade is unusable to that consumer), plus the four describe().helpers entries. Measured 67.32 → 71.58 (+4.26: the emitter/presets surface + the each.ts + Circle/Text construction path they reach through — modules only partly inlined before — on the tree-shakeable /motion subpath but inlined here). The SACRED base embed is UNCHANGED (38.85/39; the "base scene excludes motion" guard asserts /motion — now incl particles — stays off the base). Ceiling lifted to 73 for the recurring ~0.16–0.32 kB CI-minify delta (the 0.55 note: CI ran 0.32 heavier here once) + real headroom. // 67->69 in 0.56 (kinetic type presets): typeOn/revealWords/revealLines/emphasizeWords re-exported onto window.glissade so the no-build kinetic-typography author reaches the one-call type sugar against the IIFE (its primary audience — a feature absent from window.glissade is unusable to that consumer). Measured 65.79 → 67.32 (+1.53: typeOn inlines typewriter.ts + textCursor.ts's closed-form caret draw — modules NOT previously pulled onto this bundle — plus the four presets' stagger-composition surface and their describe().helpers strings, on the tree-shakeable /type subpath but inlined here). The SACRED base embed is UNCHANGED (38.84/39; the "base scene excludes splitText" guard asserts /type stays off the base). Ceiling lifted to 69 for the recurring ~0.16–0.32 kB CI-minify delta (the 0.55 note: CI ran 0.32 heavier here once) + real headroom. // 64->67 in 0.55 (Camera rig): camera / shake (+ CameraError/shakeOffset) re-exported onto window.glissade so the no-build design agent reaches cinematic camera moves against the IIFE (its primary audience — a feature absent from window.glissade is unusable to it), plus valueNoise (via `export * from '@glissade/core'`) and the three describe().helpers entries. Measured 65.79 local (+~1.5: the camera/shake surface on the inlined /motion construction path + the helper strings). The SACRED base embed is UNCHANGED (38.83/39; a metafile guard asserts the base scene excludes camera/shake/motion). NOTE: an initial 66 (from 65.77 local) RED-FAILED the release — CI minified 66.11 (the recurring CI-heavier delta ran ~0.32 kB here, LARGER than the usual ~0.16 estimate), so the ceiling is 67 to carry the delta + real headroom. GOTCHA: the pre-release local `check:size` SKIPS browser unless `pnpm build:browser` ran first — build the IIFE before check:size to see this bundle. §4.4 single-file IIFE: the WHOLE embed path INLINED (core+scene+canvas2d+player+element) PLUS the @glissade/core/clips tier (presence/each/morph/clip + stdlib) for window.glissade discoverability — measured from the prebuilt dist/glissade.browser.js (42.3 kB measured w/ clips + headroom; was 39.3 kB before clips). 45→46 in 0.18 pre.6 for describe() construction-completeness: the richer API manifest (construction props + the curated Layout family schema + the assets-shape createScene string + the negative-space prop entries) is a static data table re-exported onto window.glissade for AI discoverability — it is NOT on the base embed path (describe stays tree-shaken off the base scene index; base embed measured UNCHANGED at 38.15 kB), only this convenience bundle inlines it (45.12 kB measured). 46→47 in 0.19 to expose renderToDataURL/snapshotCanvas on window.glissade (the +0.36 kB screenshot DX seam): the Claude-Design no-build consumer works ONLY against the IIFE, so a feature absent from window.glissade is unusable to it — the snapshot helper's primary audience IS this bundle. This is the CONVENIENCE bundle, NOT the sacred base embed (which stays tree-shaken-lean at 38.6/39); browser measures ~45.96. 47→48 in 0.20 for the no-build authoring + DX features re-exported onto window.glissade — Stack/Row/Column + loadYogaLayoutEngine (Yoga itself stays an async import, NOT inlined), Grid (the scene/grid track resolver), the describe() helpers section, the friendlier construction-prop bind message, and static variable-font passthrough — all features the no-build Claude-Design consumer works against window.glissade for. The SACRED base embed actually SHRANK this milestone (38.79 → 35.55 via the 0.20 budget-review relocations), so the convenience bundle's growth is decoupled from the embed budget. 48→49 in 0.20.1 for the fail-loud node-constructor guard (Node.checkProps + acceptedConstructionKeys + NodeConstructionError + the per-leaf new.target calls) — it ships in scene, so it rides this bundle; +the corrected/longer splitText describe() usage string + the splitText by-guard. The guard is a real safety feature (rejects silently-dropped ctor props like `new Rect({ size })`, the shipped footgun all three canary seats confirmed). The SACRED base embed stays healthy (35.62 → 36.00/39, +0.38 for the guard's ctor-path code — well under ceiling); only this convenience bundle needed the bump. 49→50 in 0.23 for scene.measureWrappedText on window.glissade (node-free wrapped-text sizing — the design-agent's #1 DOM follow-up; its primary audience is the no-build IIFE consumer) + its describe() helper entry: measured 48.43 → 48.90 local, but CI minifies ~0.16 kB HEAVIER than local (the recurring delta — see the 0.19/0.20.1 notes), so 48.90 local clipped the 49 ceiling at ~49.06 in CI and red-failed the release. The 0.23 feature-minor wave (variable-font axis animation, the onboarding-harness helpers) also rides this convenience bundle; the SACRED base embed stays lean (36.10 → 36.23/39). 50→53 in 0.24 (onboarding, card 8jQ9rNqStGDL, Tyler-approved): the runnable example corpus (@glissade/scene/examples) is registered onto window.glissade so `glissade.describe({ examples: true })` surfaces a copy-pasteable, doctest-verified snippet per node/builder/helper — THE no-build agent's primary onboarding fix (a cold agent's worst time-sink is stale examples; here the canonical snippet literally can't drift, it's run in CI). Measured 49.64 → 51.40 (+1.76: the corpus's own surface + the layoutCtors/motionPath/path construction bits it exercises that weren't already inlined). A side-effect import (examples.js is package.json-sideEffectful so it isn't tree-shaken); the corpus rides ONLY this convenience bundle — the SACRED base embed stays UNCHANGED at 36.74/39 (a metafile guard asserts the base scene excludes examples). Headroom to 53 for the ~0.16 kB CI-minify delta + the deferred fail-loud-sweep additions. Not measured by the standalone loop below (that externalizes @glissade/*, which would leave an empty shell) — see the dedicated block after the loop. 53→56 in 0.26 (motion-craft quick-wins wave): the wave re-exports new authoring/motion helpers onto window.glissade for the no-build consumer — orientToPath/lookAt (rotation drivers, off the base via the /motion subpath but inlined here) and retime (the pure key-time transform: speed/reverse/pingpong). Measured 52.20 (orient) → 52.99 (retime); the ~0.79 kB is those helpers' own surface plus the shared construction path they reach through. 53 had ~0.01 kB headroom after retime, so the ceiling is lifted to 56 to carry the rest of the wave (echo/trails, responsive format) + the recurring ~0.16 kB CI-minify delta. The SACRED base embed stays lean (36.74 → 37.46/39; retime rides the core index alongside stagger/springTo — orient does NOT touch the base, it's on the tree-shakeable /motion subpath, asserted by the metafile guard). 56→58 in 0.32 (the data-motion stack): Chart + the scale factories (linearScale/logScale/bandScale/colorRamp) are re-exported onto window.glissade so the no-build data-viz author can bind a table → animated bar chart against the IIFE (its primary audience — a feature absent from window.glissade is unusable to that consumer). Measured 55.99 → 56.31 (+0.32: Chart's layout + the scales' math + the Rect/Group construction path they reach through, on the tree-shakeable /chart subpath but inlined here). The SACRED base embed is UNCHANGED (37.46 → 38.00/39; a metafile guard asserts the base scene excludes chart); ceiling lifted to 58 for the ~0.16 kB CI-minify delta + headroom. 58->60 in 0.35: fitText/fitTextSize/fitTextGroup re-exported onto window.glissade so the no-build author reaches shrink-to-fit (same /type subpath + measurer plumbing as splitText); measured 58.37 (fitText's binary-search + FontSpec logic on the inlined text-construction path). box-valign rides the base scene index (Text draw path), so it's in the base embed not this bundle; the SACRED base embed is 38.83/39. Ceiling 60 carries the delta + headroom. 60->62 in 0.38 (radial data-viz): Gauge + Meter re-exported onto window.glissade so the no-build author reaches value→needle / scripted-needle gauges (its primary audience — a feature absent from window.glissade is unusable to that consumer). Measured 59.15 → 60.17 (+1.02: Gauge's arc/needle geometry + the Path/Rect/Text/Circle/Group construction path it reaches through — more node types than Chart, on the tree-shakeable /gauge subpath but inlined here). The SACRED base embed is UNCHANGED (38.83/39; a metafile guard asserts the base scene excludes gauge); ceiling lifted to 62 for the ~0.16 kB CI-minify delta (60.17 local → ~60.33 CI) + headroom. 62->64 in 0.40 (Expr): exprTrack + compileExpr (@glissade/core/expr formula evaluator) re-exported onto window.glissade + the exprTrack describe().helpers entry; measured 61.00->62.72 (+1.72: tokenizer/parser + describe string, /expr subpath inlined here). SACRED base embed UNCHANGED 39.00/39 (evaluator off base, only the sampler seam rides it — metafile guard asserts base core excludes expr); ceiling 64 for the delta + headroom.
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
  if (pkg === 'browser' || pkg === 'browser-dom') continue;
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

// 0.40 (Expr) — base HELD AT 39 via a budget-review relocation (the 0.20 playbook).
// Expr adds an irreducible base sampler seam (~0.17 kB: sampleTrack's tr.expr branch
// + compileTimeline's validateTrack skip-keys). To fit it under 39 rather than bump
// the SACRED ceiling, `retime` + its private reversedKeys/mirrorEase helpers (pure
// build-time key transforms, never on the hot path, string-heavy) were relocated OFF
// the base core index onto @glissade/core/clips — recovering ~0.4-0.6 kB gz. Net:
// base embed stays <= 39 WITH Expr's seam. Determinism hash + goldens unchanged.
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
// cluster — diffDisplayLists/serializeDisplayList (displayDiff.ts) or
// auditCacheCold (cacheColdAudit.ts) — it's the separately-budgeted
// @glissade/scene/diagnostics entry. None is reached by evaluate(); a stray
// re-import onto the base index would silently re-bloat the embed (that's exactly
// how the base crept to 38.79). `collapseReplacer.ts` (the §3.5 cacheKey replacer)
// is the ONE render-path member and is EXEMPT — it stays on the base index by
// design. Assert the rest stay off via the metafile.
const diagInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) =>
  /scene\/(src|dist)\/(displayDiff|cacheColdAudit|diagnostics|fontUsage|validate)\./.test(i),
);
const diagOk = diagInBase.length === 0;
if (!diagOk) failed = true;
console.log(`${diagOk ? 'ok  ' : 'FAIL'} base scene excludes diagnostics${diagOk ? '' : ` (leaked: ${diagInBase.join(', ')})`}`);

// 0.20 guard (ai-training finding): the base scene bundle must NOT pull in the
// PRODUCTION token-highlight render component (tokenHighlight.ts) — it's the
// separately-budgeted @glissade/scene/tokens entry (opt-in production UI,
// re-exported onto the browser IIFE). It was split back out of /diagnostics so a
// visible-UI render component no longer reads as a debug import. The base index
// never imports it, so assert via the metafile that tokenHighlight.ts (and its
// tokens.ts barrel) stay off the base graph — the diagnostics/motion/grid
// exclusion shape. A stray re-import would silently re-bloat the embed.
const tokensInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) =>
  /scene\/(src|dist)\/(tokenHighlight|tokens)\./.test(i),
);
const tokensOk = tokensInBase.length === 0;
if (!tokensOk) failed = true;
console.log(`${tokensOk ? 'ok  ' : 'FAIL'} base scene excludes tokens${tokensOk ? '' : ` (leaked: ${tokensInBase.join(', ')})`}`);

// 0.20 guard: the base scene bundle must NOT pull in the motion-path follow
// helper (motionPath.ts / motion.ts) — it's the separately-budgeted
// @glissade/scene/motion entry (a user-facing opt-in, re-exported onto the
// browser IIFE). Index never imports it, so assert via the metafile that it
// stays off the base graph.
const motionInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) =>
  /scene\/(src|dist)\/(motionPath|motion|camera|shake|particles)\./.test(i),
);
const motionOk = motionInBase.length === 0;
if (!motionOk) failed = true;
console.log(`${motionOk ? 'ok  ' : 'FAIL'} base scene excludes motion${motionOk ? '' : ` (leaked: ${motionInBase.join(', ')})`}`);

// 0.20 guard: the base scene bundle must NOT pull in Grid (grid.ts) — it's the
// separately-budgeted @glissade/scene/grid entry (a build-time track resolver,
// re-exported onto the browser IIFE). Index never imports it, so assert via the
// metafile that grid.ts stays off the base graph — the splitText/motion shape.
const gridInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) => /scene\/(src|dist)\/grid\./.test(i));
const gridOk = gridInBase.length === 0;
if (!gridOk) failed = true;
console.log(`${gridOk ? 'ok  ' : 'FAIL'} base scene excludes grid${gridOk ? '' : ` (leaked: ${gridInBase.join(', ')})`}`);

// 0.32 guard: the base scene bundle must NOT pull in Chart (chart.ts) — it's the
// separately-budgeted @glissade/scene/chart entry (a build-time data→bars fan-out,
// re-exported onto the browser IIFE). Index never imports it, so assert via the
// metafile that chart.ts stays off the base graph — the grid/splitText shape.
const chartInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) => /scene\/(src|dist)\/chart\./.test(i));
const chartOk = chartInBase.length === 0;
if (!chartOk) failed = true;
console.log(`${chartOk ? 'ok  ' : 'FAIL'} base scene excludes chart${chartOk ? '' : ` (leaked: ${chartInBase.join(', ')})`}`);

// 0.38 guard: the base scene bundle must NOT pull in Gauge (gauge.ts) — it's the
// separately-budgeted @glissade/scene/gauge entry (a build-time radial data-viz
// fan-out, re-exported onto the browser IIFE). Index never imports it, so assert
// via the metafile that gauge.ts stays off the base graph — the chart/grid shape.
const gaugeInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) => /scene\/(src|dist)\/gauge\./.test(i));
const gaugeOk = gaugeInBase.length === 0;
if (!gaugeOk) failed = true;
console.log(`${gaugeOk ? 'ok  ' : 'FAIL'} base scene excludes gauge${gaugeOk ? '' : ` (leaked: ${gaugeInBase.join(', ')})`}`);

// 0.20 guard: the base scene bundle must NOT pull in the S1 node-identity
// producer (identity.ts) — it's the separately-budgeted @glissade/scene/identity
// entry (the DOM-backend readiness prerequisite, OPT-IN/off by default). The base
// index never imports it, so assert via the metafile that it stays off the base
// graph — the diagnostics/motion/grid exclusion shape. A stray re-import would
// silently re-bloat the embed AND would mean the off-by-default identity seam is
// no longer free on the render path.
const identityInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) =>
  /scene\/(src|dist)\/identity\./.test(i),
);
const identityOk = identityInBase.length === 0;
if (!identityOk) failed = true;
console.log(`${identityOk ? 'ok  ' : 'FAIL'} base scene excludes identity${identityOk ? '' : ` (leaked: ${identityInBase.join(', ')})`}`);

// 0.24 guard (onboarding): the base scene bundle must NOT pull in the runnable
// example corpus (examples.ts) — it's the separately-budgeted
// @glissade/scene/examples entry. describe() reads a registry the corpus
// populates on import (NOT a static import), so neither the base index NOR the
// IIFE pays for ~60 example snippets + their construction imports. Assert via the
// metafile that examples.ts stays off the base graph — the splitText/grid shape.
const examplesInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) => /scene\/(src|dist)\/examples\./.test(i));
const examplesOk = examplesInBase.length === 0;
if (!examplesOk) failed = true;
console.log(`${examplesOk ? 'ok  ' : 'FAIL'} base scene excludes examples${examplesOk ? '' : ` (leaked: ${examplesInBase.join(', ')})`}`);

// 0.20 guard: the base scene bundle must NOT pull in the layout ctors
// (layoutCtors.ts) either — those are the @glissade/scene/layout-ctors entry
// (split off the loader for the IIFE). Index never imports them.
const layoutCtorsInBase = Object.keys(sceneIndex.metafile.inputs).filter((i) =>
  /scene\/(src|dist)\/layoutCtors\./.test(i),
);
const layoutCtorsOk = layoutCtorsInBase.length === 0;
if (!layoutCtorsOk) failed = true;
console.log(
  `${layoutCtorsOk ? 'ok  ' : 'FAIL'} base scene excludes layout ctors${layoutCtorsOk ? '' : ` (leaked: ${layoutCtorsInBase.join(', ')})`}`,
);

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

// 0.40 guard: the base core must NOT pull in the Expr evaluator (expr.ts) — it's
// the separately-budgeted @glissade/core/expr entry (a ~1.4 kB parser). The base
// carries only the compiler-register SEAM in track.ts; the evaluator stays off the
// embed. Assert via the metafile that expr.ts isn't in the base graph.
const exprInBase = Object.keys(coreIndex.metafile.inputs).filter((i) => /core\/(src|dist)\/expr\./.test(i));
const exprOk = exprInBase.length === 0;
if (!exprOk) failed = true;
console.log(`${exprOk ? 'ok  ' : 'FAIL'} base core excludes expr${exprOk ? '' : ` (leaked: ${exprInBase.join(', ')})`}`);

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

    // §3.2 / §4.4 guard: Yoga's WASM must stay OUT of the single-file IIFE. The
    // 0.20 no-build layout split puts the Yoga-free ctors (Layout/Stack/Row/Column,
    // @glissade/scene/layout-ctors) ON the IIFE and re-exports `loadYogaLayoutEngine`
    // for window.glissade. The loader carries `import('yoga-layout/load')`; under
    // esbuild's IIFE format (no code-splitting) inlining it would statically pull
    // Yoga's wasm-base64 binding into the bundle (~46.6→~99 kB gz, the 0.19.1
    // finding). build-browser.mjs EXTERNALIZES `yoga-layout/load` so the dynamic
    // import stays a RUNTIME `import()` and the wasm never inlines.
    //
    // NB: the loader's JS calling code (root.calculateLayout/setFlexDirection) now
    // rides the IIFE (~1.5 kB glue) — so those identifiers are NO LONGER a valid
    // "inlined" signal. The real signature of inlined wasm is the base64 wasm blob
    // (`AGFzbQ` == the `\0asm` magic) — present ONLY when Yoga's binary embeds.
    // We ALSO assert `yoga-layout/load` survives as a runtime `import(` specifier:
    // its presence proves esbuild kept it external (didn't inline it).
    const browserOut = new TextDecoder().decode(raw);
    const wasmInlined = browserOut.includes('AGFzbQ'); // base64 of the wasm magic header
    const loaderExternal = /import\(\s*["']yoga-layout\/load["']\s*\)/.test(browserOut);
    const yogaOut = !wasmInlined && loaderExternal;
    if (!yogaOut) failed = true;
    console.log(
      `${yogaOut ? 'ok  ' : 'FAIL'} browser IIFE excludes yoga binding${
        yogaOut
          ? ''
          : ` (${wasmInlined ? 'wasm blob inlined (AGFzbQ present)' : ''}${
              !loaderExternal ? `${wasmInlined ? '; ' : ''}yoga-layout/load not kept as a runtime import` : ''
            })`
      }`,
    );

    // 0.21 guard: the BASE playback IIFE must stay DomBackend-FREE (browser-canary's
    // byte-stability invariant). The DOM render tier rides the SEPARATE optional
    // `glissade-dom.browser.js` augmentation bundle, never the base. `data-node-id`
    // is a string literal emitted only by @glissade/backend-dom's render walk
    // (survives minification as a string), so its presence in the base bundle would
    // mean DomBackend leaked in — fail loud.
    const domLeaked = browserOut.includes('data-node-id');
    if (domLeaked) failed = true;
    console.log(
      `${domLeaked ? 'FAIL' : 'ok  '} browser IIFE excludes DomBackend${domLeaked ? " (data-node-id present — backend-dom leaked into the base bundle)" : ''}`,
    );
  }
}

// 0.21: the OPTIONAL `glissade-dom.browser.js` augmentation IIFE (DomBackend +
// emitWithIds → window.glissade). Measured directly; skip gracefully when unbuilt.
{
  const domFile = `${root}packages/browser/dist/glissade-dom.browser.js`;
  let raw;
  try {
    raw = readFileSync(domFile);
  } catch {
    raw = null;
  }
  if (raw === null) {
    console.log(`skip browser-dom         (dist/glissade-dom.browser.js not built — run pnpm build:browser)`);
  } else {
    const budgetKb = BUDGETS['browser-dom'];
    const gz = gzipSync(raw).length / 1024;
    const ok = gz <= budgetKb;
    if (!ok) failed = true;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${'browser-dom'.padEnd(18)} ${gz.toFixed(2).padStart(6)} kB gz  (budget ${budgetKb} kB, ${(raw.length / 1024).toFixed(2)} kB raw)`,
    );
  }
}

process.exit(failed ? 1 : 0);
}
