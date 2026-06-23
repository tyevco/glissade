---
'@glissade/backend-dom': patch
---

0.21: backend-dom Stage S3 — the retained-DOM reconciler

`DomBackend.render()` now REUSES + PATCHES a DOM tree retained across frames instead of rebuilding it (`replaceChildren`). So an in-progress inline-edit caret/focus/selection, host overlay elements, host-attached event listeners, and CSS transitions all survive a re-render — making the DOM tier a real click-to-edit surface (read `data-node-id` → mutate the scene via `.set()`; one-way, scene is the model).

- **Keyed reuse:** sibling-scoped `(node-id | ∅, op, occurrence)` keys; the same element is reused + patched per node across frames; compare-then-write skips unchanged attrs/styles/text. Deterministic FNV-1a def ids keep gradient/clip references stable across frames and reorders.
- **Foreign-DOM isolation:** reconciler ownership = membership in per-cursor `children` Maps, so foreign DOM the host injects (overlays, selection chrome) is never moved or removed. `dispose()` is the only wholesale clear.
- **Caret preservation:** patch-only-on-change mutates the managed Text node's `.data` in place (never `textContent=`), plus an `isEditing()` freeze while a node is the focused contentEditable; the anchor skips foreign nodes and a focused node is never relocated, so an unchanged re-render with a foreign sibling never blurs the edit.

Designed + implemented via a multi-agent workflow (design panel → synthesis → implement → adversarial verify); the adversarial pass caught and fixed a focus-drop in the placement logic before merge. Additive and golden-neutral — all 262 goldens byte-identical; base embed and `@glissade/browser` IIFE budgets untouched. The no-build `glissade-dom` IIFE bundle remains a separate follow-up.
