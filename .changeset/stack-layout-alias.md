---
'@glissade/scene': minor
---

feat(scene): `Stack` — a discoverable factory alias over the Yoga `Layout` node

`Stack(props)` is a thin convenience on the already-shipped `@glissade/scene/layout`
entry that constructs a `Layout` with stack-ergonomic defaults — NOT a new class and
NOT new signals, so it inherits Layout's memoized, pure, dependency-tracked resolve
verbatim. A `Stack(props)` and the equivalent hand-written `Layout({...})` produce
identical child positions.

Defaults that diverge from `Layout` (everything else passes through):

- `direction` defaults to `'column'` (the common vertical stack).
- `align` defaults to `'start'` — a true left edge for a label column — vs Layout's
  `'center'`.

Yoga stays on the separately-budgeted `@glissade/scene/layout` entry; `Stack` adds no
bytes to the base embed. New `docs/layout.md` surfaces the layout entry, the
`await loadYogaLayoutEngine()` requirement, and a tree-shakeable subpath map
(`@glissade/scene/layout`, `@glissade/scene/path`, `@glissade/core/clips`).
