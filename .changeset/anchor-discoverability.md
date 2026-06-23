---
'@glissade/scene': patch
'@glissade/backend-dom': patch
---

describe(): surface node position anchors; backend-dom doc accuracy

The `anchor` prop (pin `position` to any corner/edge, `'top-left'`/`[ax,ay]`, the rotation/scale pivot) already exists and works on every node — but it was undiscoverable, so consumers hit the Rect-center-vs-Text-baseline mismatch and pixel-measured around it (UhOVUlewfVz7). `describe()` now:

- adds **`nodes.<T>.positionAnchor`** — what each node's `position` points at without an explicit anchor (`'center'` for shapes, `'baseline-left'` for Text, `'author-coords'` for Path), so the mismatch is in the manifest, and
- **enumerates the `anchor` presets** in its type (`'center'|'top-left'|…|[ax,ay]`) instead of the opaque `AnchorSpec`, so `anchor:'top-left'` is discoverable as the fix.

`@glissade/backend-dom` doc accuracy: `readPixels()` is documented as **async-reject** (it returns a `Promise` per the `RenderBackend` contract — `await`/`.catch`, not a bare `try/catch`); `measureText` `ascent`/`descent` are documented as estimates, and its measuring span now mounts in the live document so wrapping reflects the real font.
