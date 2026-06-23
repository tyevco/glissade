---
'@glissade/backend-dom': minor
'@glissade/scene': patch
---

0.21: new package `@glissade/backend-dom` — a DOM/SVG render backend (Stage S2, forward render)

A new leaf backend that consumes the identical `DisplayList` IR the canvas2d/skia backends consume, but emits **HTML/SVG elements** instead of pixels — a **preview / non-parity** realtime tier for accessibility, selectable text, CSS-native embedding, and zero-raster structural preview. It is never on the `gs render` export path (export stays on the raster path).

- `DomBackend` implements the full `RenderBackend` op set via a direct command walk (HTML divs for structure/transform/group/text; inline `<svg>` islands for path/gradient/clip/image geometry; `E` ellipse segs → SVG arcs). Real selectable text nodes.
- Out-of-band node identity: `setIds(emitWithIds(...).ids)` stamps `data-node-id` for click-to-edit hosts (read identity → mutate the scene via `.set()`; one-way scene → DOM).
- Honest degradation: mesh / non-linear gradient interpolation degrade to a best-effort solid and stamp `data-approx="true"`; shaders ignored (`caps.shaders=false`); `readPixels()` throws (no pixel buffer). `measureText` uses a hidden DOM element (with a documented line-break divergence from the canvas/export path).
- **Stage S2 (forward render — rebuilds each frame)**; the retained-DOM reconciler (cross-frame patching keyed on `data-node-id`, required for in-progress inline-edit/selection/focus to survive) is **Stage S3**, a follow-up. Validated by the consumer spec on the board (the design-agent's editable-host workflow).

Additive and golden-neutral — never instantiated by `evaluate`/canvas/Skia, so all 262 goldens stay byte-identical; off the base-embed and `@glissade/browser` IIFE budgets (npm/bundler consumer only).

Docs cleanups (scene patch): clarify the Path `data`/`d` coercion (both accept `PathValue`, reject raw SVG `d` strings — only the rejection layer differs); enrich `docs/controlled-drive.md` with the host-owned `dt`-based rAF loop, the live-`.set()` guarantee, a note that glissade's springs are closed-form / deterministic-under-seek, and that controlled mode drives any backend (incl. the new DOM tier). The friendlier no-`new` DX guard (F3) stays deferred — ES class semantics throw before the constructor body, so it needs callable factory wrappers across 8 classes (taxes the tight base/IIFE budgets); better served later by an eslint rule or a `.d.ts` call-signature.
