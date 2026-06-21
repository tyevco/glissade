// @glissade/browser — the combined realtime browser embed surface (DESIGN.md §4.4).
//
// Re-exports the full embed path (core + scene + player + canvas2d + element)
// from one entry. The tsdown build emits the npm-ESM `dist/index.js`;
// `scripts/build-browser.mjs` then bundles that ESM into a single minified IIFE
// (`dist/glissade.browser.js`) exposing `window.glissade.*` for <script src> /
// no-build use.
//
// `core`, `scene`, and `player` have no public-name collisions (the same as the
// `glissade` umbrella — `Paint`/`ColorStop` resolve to the same core symbol that
// scene merely re-exports). `backend-canvas2d` is re-exported by NAME (only its
// two embed-relevant value exports, `Canvas2DBackend` + `setShaderRunner`) so a
// `export *` can't drag in its internal type surface or collide. `element` is
// imported for its side effect — its module load calls
// `customElements.define('gs-player', …)`, so the bundle auto-registers
// `<gs-player>` — and re-exported for `GsPlayerElement` / `defineGsPlayer`.

export * from '@glissade/core';
// The clip tier (presence/each/morph/clip/clipList + the stdlib) lives on the
// `@glissade/core/clips` subpath — tree-shaken off the base index for the core
// budget. The single-file convenience bundle SHOULD expose the whole authoring
// surface, so re-export it here (NOT from the core base index, which would pull
// it into the core/index size budget).
export * from '@glissade/core/clips';
export * from '@glissade/scene';
// The SVG `d`-string parser lives on the tree-shaken `@glissade/scene/path`
// subpath (off the base scene index for the scene budget). The single-file
// convenience bundle SHOULD expose it, so re-export it here — `pathFromSvg` +
// `parseSvgPathData` land on `window.glissade` for `new Path({ data:
// G.pathFromSvg('M0 0 …') })`.
export * from '@glissade/scene/path';
// `splitText` (0.19 kinetic typography) lives on the tree-shaken
// `@glissade/scene/type` subpath (off the base scene index for the scene
// budget). The no-build consumer that REQUESTED it (explainer-video kinetic
// typography) works only against this IIFE, so it must reach window.glissade —
// `G.splitText(props, { by:'word', measurer: backend })`. (Stack/Row/Column stay
// npm-only: those pull Yoga, which can't ride the bundle; splitText only needs
// the measurer.) +0.44 kB, within the browser budget.
export { splitText } from '@glissade/scene/type';
// The machine-readable API manifest (0.18) lives on the tree-shakeable
// `@glissade/scene/describe` subpath (off the base scene index). The single-file
// convenience bundle SHOULD expose it for discoverability, so re-export it here —
// `glissade.describe()` lands on `window.glissade`, and the build writes its
// JSON.stringify(describe()) to dist/glissade.api.json.
export * from '@glissade/scene/describe';
export * from '@glissade/player';
export { Canvas2DBackend, setShaderRunner } from '@glissade/backend-canvas2d';
// `renderToDataURL` (0.19): the one-shot "screenshot a frame as a data URL" DX
// helper an AI consumer reached for when it couldn't drive a live <canvas>. It
// is DX/screenshot TOOLING, so it lives on the tree-shakeable
// `@glissade/backend-canvas2d/snapshot` subpath — OFF the base embed (the base
// playback path never needs it). The single-file convenience bundle MUST expose
// it though: the Claude-Design no-build consumer works ONLY against this IIFE,
// so a helper absent from window.glissade is unusable to it — and screenshot
// verification is exactly the no-build AI consumer's need. So re-export it here
// (`window.glissade.renderToDataURL` / `snapshotCanvas`); the browser budget was
// raised 46→47 for this +0.36 kB (the convenience bundle, not the base embed).
// Browser-only (OffscreenCanvas/toDataURL).
export { renderToDataURL, snapshotCanvas } from '@glissade/backend-canvas2d/snapshot';
export * from '@glissade/element';
