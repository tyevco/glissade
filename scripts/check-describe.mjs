#!/usr/bin/env node
/**
 * describe()↔bundle drift gate (0.47 "verifiable ground-truth") — the CI
 * productization of `@glissade/browser`'s smoke cross-check (iterate
 * describe().helpers, assert each resolves on the IIFE surface), generalized to the
 * WHOLE window.glissade surface (nodes + helpers + the `surface` taxonomy) and
 * arity + type-only checks. Modeled on `check:readme` / `gen-api-docs --check`:
 * imports the BUILT dist directly and exits non-zero on any violation.
 *
 *   pnpm check:describe   → fail if describe()'s curated surface drifts from what
 *                           actually ships on the built @glissade/browser bundle.
 *
 * This is the AUTHORITATIVE gate: it loads the whole `@glissade/browser` bundle (the
 * real IIFE surface, incl. the browser-only snapshot helpers a headless
 * `gs describe --lint` can't import), so it verifies every documented member.
 * Requires `pnpm build` first (scene/browser/cli dist).
 */

// Shim just enough DOM for @glissade/element's module-load side-effect
// (customElements.define('gs-player', …)) so the browser bundle imports headlessly.
// Set BEFORE the (dynamic) browser import so the shim is in place when the element
// module evaluates `class extends HTMLElement` — a static import would hoist above it.
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() { return undefined; } };

import { describe } from '../packages/scene/dist/describe.js';
import { describeLint } from '../packages/cli/dist/describeLint.js';

const browser = await import('../packages/browser/dist/index.js');
const manifest = describe();
// The ESM namespace is read-only; copy into a plain record for the lint's lookups.
const surface = Object.assign({}, browser);
const violations = describeLint(manifest, surface);

if (violations.length > 0) {
  console.error(`FAIL check:describe — ${violations.length} describe()↔window.glissade drift(s):`);
  for (const v of violations) console.error(`  ✗ [${v.kind}] ${v.name}: ${v.detail}`);
  console.error('     Fix the curated list in packages/scene/src/describe.ts (HELPERS / the surface section) to match the real @glissade/browser export.');
  process.exit(1);
}

const n = (manifest.surface ?? []).length;
console.log(`ok   check:describe — describe() manifest matches the @glissade/browser surface (${manifest.helpers.length} helpers, ${n} surface entries verified)`);
process.exit(0);
