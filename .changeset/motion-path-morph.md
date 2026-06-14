---
'@glissade/scene': minor
---

`followPath` now follows a **morphing** path live: pass it a `Path` node (rather than a snapshot of its data) and it re-samples the current geometry as the route bends along a `'<id>/d'` track — the cursor rides the live line. The arc-length table is memoized by PathValue reference, so a static route (a raw `PathValue`, or a Path node whose data never changes) still builds its table only once; pass a `PathValue` directly for a fixed route. Pure and deterministic (re-sampling is a pure function of the current path); golden-covered.
