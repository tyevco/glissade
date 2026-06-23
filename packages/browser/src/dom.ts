// @glissade/browser — the OPTIONAL `glissade-dom` augmentation entry (0.21).
//
// `scripts/build-browser-dom.mjs` bundles this into `dist/glissade-dom.browser.js`,
// a SECOND `<script src>` a no-build editor page loads AFTER `glissade.browser.js`.
// It AUGMENTS the existing `window.glissade` with the DOM render tier —
// `DomBackend` (`@glissade/backend-dom`) + `emitWithIds` (`@glissade/scene/identity`,
// the out-of-band node-id stream the reconciler keys on) — without bloating the
// lean base playback bundle (which stays byte-identical, `DomBackend`-free).
//
// It NEVER replaces `window.glissade`; it Object.assigns onto it. Load order is
// fail-loud (the load-order robustness browser-canary specified on card
// QWFOBs7IuIVI): if the base bundle is absent or a different version, it throws a
// clear error instead of leaving a cryptic `undefined`.

import { DomBackend } from '@glissade/backend-dom';
import { emitWithIds } from '@glissade/scene/identity';

// Injected at build time by scripts/build-browser-dom.mjs (esbuild `define`) from
// this package's version, so the two bundles can detect a version skew. The
// `typeof` guard keeps the module importable OUTSIDE the build (e.g. vitest), where
// the identifier is unreplaced — then the skew check simply no-ops.
declare const __GLISSADE_DOM_VERSION__: string;
const domVersion: string | undefined =
  typeof __GLISSADE_DOM_VERSION__ !== 'undefined' ? __GLISSADE_DOM_VERSION__ : undefined;

interface GlissadeGlobal {
  describe?: () => { version: string };
  DomBackend?: unknown;
  emitWithIds?: unknown;
  [k: string]: unknown;
}

const glob = globalThis as unknown as { glissade?: GlissadeGlobal };
const g = glob.glissade;

if (g === undefined || typeof g !== 'object') {
  throw new Error(
    'glissade-dom.browser.js augments window.glissade but it is undefined — load glissade.browser.js FIRST (this is the DOM-tier augmentation bundle, not a standalone bundle).',
  );
}

const baseVersion = typeof g.describe === 'function' ? g.describe().version : undefined;
if (domVersion !== undefined && baseVersion !== undefined && baseVersion !== domVersion) {
  throw new Error(
    `glissade-dom.browser.js (v${domVersion}) does not match the loaded glissade.browser.js (v${baseVersion}) — load matching versions of the two scripts.`,
  );
}

Object.assign(g, { DomBackend, emitWithIds });
