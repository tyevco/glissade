---
'@glissade/scene': minor
'@glissade/browser': patch
---

critique — layout-critique arc Cut 2: `MISALIGNED` + `UNEVEN_SPACING` sibling diagnostics via EXPLICIT declared groups.

`critique(scene, timeline, { alignGroups })` now checks author-declared alignment groups. Each `AlignGroup` (`{ id?, members: string[] (>= 2), axis?: 'row' | 'column' }`) is read at its **settled frame** — the maximum grid frame where every member is present AND at rest (its integer device bbox equals the next frame's, so entrance-stagger / exit-whoosh / rotation-settle transients are excluded; a member never simultaneously present-and-still fails loud). At that frame:

- **`MISALIGNED`** — the members' cross-axis centers span more than `alignTolerance` px (default 2). Names the offender furthest from the median center; `detail.axis` is the declared axis, else inferred from the larger center spread (tie → `'row'`). Pure-geometry `position` fixHint.
- **`UNEVEN_SPACING`** — the inter-member gaps along the main axis span more than `gapTolerance` px (default 2). Names the trailing member of the offending gap + the bounding pair; `position` + `gap` fixHints.

Both are `severity:'warning'`, `source:'critique'`, off the render path (never mutate a node → goldens byte-identical), on integer geometry with a deterministic median-reference / max-deviation offender (tie-broken by node id) and canonical `detail.frame` sort. Unknown member ids, sub-2-member groups, and non-integer/negative tolerances fail loud with `CritiqueError`. New `AlignGroup` type on `@glissade/scene/diagnostics` and re-exported onto the browser IIFE; new `alignGroups`/`alignTolerance`/`gapTolerance` options + the `AlignGroup` type registered in `describe()`. Auto-inference of groups is deferred — declare them explicitly. Adds a `layout-critique` golden showcasing the caught defect.
