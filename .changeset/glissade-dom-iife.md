---
'@glissade/browser': patch
---

0.21: `glissade-dom` — optional no-build IIFE bundle for the DOM backend

A second `<script src>` (`dist/glissade-dom.browser.js`) that a no-build editor page loads *after* `glissade.browser.js`. It **augments** `window.glissade` with the DOM render tier — `DomBackend` (`@glissade/backend-dom`) + `emitWithIds` (`@glissade/scene/identity`, the out-of-band node-id stream) — so click-to-edit (`data-node-id` → `scene.nodes.get(id).set()`) works from pure `<script src>`, with no bundler.

The base playback IIFE stays **lean and `DomBackend`-free** (a `check-size` guard asserts the base bundle excludes it), so playback embeds never pay for the edit/a11y tier. Load order is **fail-loud**: the augmentation bundle throws a clear error if the base bundle is absent or a version skew is detected — never a cryptic `undefined`. `build:browser` now emits both IIFEs.

Additive — all 262 goldens byte-identical; the base embed and base IIFE budgets are untouched.
