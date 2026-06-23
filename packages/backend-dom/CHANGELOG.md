# @glissade/backend-dom

## 0.21.0-pre.4

### Patch Changes

- 0.21: backend-dom — tune DOM text baseline (0.8em → 0.84em)

  Follow-up to the pre.3 text fix: the rendered text sat ~0.04em too low versus the canvas baseline (a single systematic offset, not per-font; ~4px at display/title sizes). The baseline lift is now 0.84em, landing DOM text on the canvas baseline within ~1px. Horizontal alignment is unchanged.

  - @glissade/core@0.21.0-pre.4
  - @glissade/scene@0.21.0-pre.4

## 0.21.0-pre.3

### Patch Changes

- 0.21: backend-dom — fix DOM text positioning (alignment + baseline)

  The DOM backend rendered text noticeably misplaced versus the canvas tier. Two fixes:

  - **Alignment:** a shrink-wrapped text `<div>` is left-anchored, so CSS `text-align` did nothing — centered/right text was shifted right by half/all of its width. Alignment now maps to a `translateX` of the text's own width (`center` → −50%, `right` → −100%), matching canvas `textAlign` anchoring around `x`.
  - **Baseline:** `line-height: 1` keeps the baseline a predictable ~0.8em below the box top; the font is now set via longhand properties (so the `font` shorthand no longer resets that line-height).

  Preview/non-parity is unchanged structurally; the canvas/Skia path is untouched (all 262 goldens byte-identical).

  - @glissade/core@0.21.0-pre.3
  - @glissade/scene@0.21.0-pre.3

## 0.21.0-pre.2

### Patch Changes

- @glissade/core@0.21.0-pre.2
- @glissade/scene@0.21.0-pre.2

## 0.21.0-pre.1

### Patch Changes

- 0.21: backend-dom Stage S3 — the retained-DOM reconciler

  `DomBackend.render()` now REUSES + PATCHES a DOM tree retained across frames instead of rebuilding it (`replaceChildren`). So an in-progress inline-edit caret/focus/selection, host overlay elements, host-attached event listeners, and CSS transitions all survive a re-render — making the DOM tier a real click-to-edit surface (read `data-node-id` → mutate the scene via `.set()`; one-way, scene is the model).

  - **Keyed reuse:** sibling-scoped `(node-id | ∅, op, occurrence)` keys; the same element is reused + patched per node across frames; compare-then-write skips unchanged attrs/styles/text. Deterministic FNV-1a def ids keep gradient/clip references stable across frames and reorders.
  - **Foreign-DOM isolation:** reconciler ownership = membership in per-cursor `children` Maps, so foreign DOM the host injects (overlays, selection chrome) is never moved or removed. `dispose()` is the only wholesale clear.
  - **Caret preservation:** patch-only-on-change mutates the managed Text node's `.data` in place (never `textContent=`), plus an `isEditing()` freeze while a node is the focused contentEditable; the anchor skips foreign nodes and a focused node is never relocated, so an unchanged re-render with a foreign sibling never blurs the edit.

  Designed + implemented via a multi-agent workflow (design panel → synthesis → implement → adversarial verify); the adversarial pass caught and fixed a focus-drop in the placement logic before merge. Additive and golden-neutral — all 262 goldens byte-identical; base embed and `@glissade/browser` IIFE budgets untouched. The no-build `glissade-dom` IIFE bundle remains a separate follow-up.

  - @glissade/core@0.21.0-pre.1
  - @glissade/scene@0.21.0-pre.1

## 0.21.0-pre.0

### Minor Changes

- c954768: 0.21: new package `@glissade/backend-dom` — a DOM/SVG render backend (Stage S2, forward render)

  A new leaf backend that consumes the identical `DisplayList` IR the canvas2d/skia backends consume, but emits **HTML/SVG elements** instead of pixels — a **preview / non-parity** realtime tier for accessibility, selectable text, CSS-native embedding, and zero-raster structural preview. It is never on the `gs render` export path (export stays on the raster path).

  - `DomBackend` implements the full `RenderBackend` op set via a direct command walk (HTML divs for structure/transform/group/text; inline `<svg>` islands for path/gradient/clip/image geometry; `E` ellipse segs → SVG arcs). Real selectable text nodes.
  - Out-of-band node identity: `setIds(emitWithIds(...).ids)` stamps `data-node-id` for click-to-edit hosts (read identity → mutate the scene via `.set()`; one-way scene → DOM).
  - Honest degradation: mesh / non-linear gradient interpolation degrade to a best-effort solid and stamp `data-approx="true"`; shaders ignored (`caps.shaders=false`); `readPixels()` throws (no pixel buffer). `measureText` uses a hidden DOM element (with a documented line-break divergence from the canvas/export path).
  - **Stage S2 (forward render — rebuilds each frame)**; the retained-DOM reconciler (cross-frame patching keyed on `data-node-id`, required for in-progress inline-edit/selection/focus to survive) is **Stage S3**, a follow-up. Validated by the consumer spec on the board (the design-agent's editable-host workflow).

  Additive and golden-neutral — never instantiated by `evaluate`/canvas/Skia, so all 262 goldens stay byte-identical; off the base-embed and `@glissade/browser` IIFE budgets (npm/bundler consumer only).

  Docs cleanups (scene patch): clarify the Path `data`/`d` coercion (both accept `PathValue`, reject raw SVG `d` strings — only the rejection layer differs); enrich `docs/controlled-drive.md` with the host-owned `dt`-based rAF loop, the live-`.set()` guarantee, a note that glissade's springs are closed-form / deterministic-under-seek, and that controlled mode drives any backend (incl. the new DOM tier). The friendlier no-`new` DX guard (F3) stays deferred — ES class semantics throw before the constructor body, so it needs callable factory wrappers across 8 classes (taxes the tight base/IIFE budgets); better served later by an eslint rule or a `.d.ts` call-signature.

### Patch Changes

- Updated dependencies [c954768]
  - @glissade/scene@0.21.0-pre.0
  - @glissade/core@0.21.0-pre.0
