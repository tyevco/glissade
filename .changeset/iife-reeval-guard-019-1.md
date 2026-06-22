---
'@glissade/browser': patch
'@glissade/element': patch
'@glissade/scene': patch
---

0.19.1 pitstop — IIFE re-eval guard for `<gs-player>` (no render change; the 262 goldens stay byte-identical):

- **Re-evaluating the `@glissade/browser` IIFE in a realm that already loaded it no longer throws.** A second `<script src>` include (or any re-eval) used to abort at `customElements.define('gs-player', …)` ("already defined") *before* the IIFE could reassign `window.glissade`, so the page silently kept the OLD bundle. `defineGsPlayer()` guards the register (`if (!customElements.get(tag)) customElements.define(...)`), so re-eval is now a clean no-op and `window.glissade` reassigns. A `@glissade/browser` smoke test locks the idempotency (`glissade.defineGsPlayer()` called twice never throws; the original registration survives).

Deferred to 0.20 (NOT in this pitstop): exposing the layout **constructors** (`Stack`/`Row`/`Column`/`Layout`) on the IIFE. They live in the same module (`@glissade/scene/layout`) as `loadYogaLayoutEngine`, whose dynamic `import('yoga-layout/load')` esbuild **cannot** keep async in a single-file IIFE (no code-splitting in `format: 'iife'`) — it inlines Yoga's wasm-base64 statically, ballooning the bundle from ~46.6 to ~99 kB gz (47.5 kB even for the ctors alone), far past the 47 kB budget. Putting the ctors on the IIFE requires first splitting the lightweight node ctors out of the module that carries the Yoga loader — a 0.20 source refactor, not a pitstop re-export.
