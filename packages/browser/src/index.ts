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
export * from '@glissade/player';
export { Canvas2DBackend, setShaderRunner } from '@glissade/backend-canvas2d';
export * from '@glissade/element';
