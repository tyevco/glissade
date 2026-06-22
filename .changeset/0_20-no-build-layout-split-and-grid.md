---
"@glissade/scene": minor
"@glissade/browser": minor
---

0.20: no-build layout split (Stack/Row/Column on the IIFE, Yoga stays async) + Grid (Fork B: scene/grid track resolver)

Two layout slices, both build-time / off-render (the 262 goldens stay byte-identical).

**No-build layout split.** The Yoga-free layout node ctors (`Layout`/`Stack`/
`Row`/`Column`) moved onto a new tree-shakeable `@glissade/scene/layout-ctors`
subpath, split off the Yoga loader (`loadYogaLayoutEngine`, now in its own
module). The ctors only touch the LayoutEngine seam at *compute* time, never
`import('yoga-layout/load')` at construction, so the single-file
`@glissade/browser` IIFE can now expose `glissade.Stack`/`Row`/`Column`/`Layout`
**without inlining Yoga's wasm** (the loader's dynamic import is externalized in
the IIFE build, keeping the bundle at ~45.3 kB gz instead of ~99). A no-build
page must still `await glissade.loadYogaLayoutEngine()` (with a module resolver
for `yoga-layout/load`) before evaluating a layout scene, else the first compute
throws `LayoutEngineMissingError`.

`@glissade/scene/layout` is **unchanged for existing importers** — it now
re-exports the ctors plus the loader, so `import { Stack, loadYogaLayoutEngine }
from '@glissade/scene/layout'` keeps working exactly as before.

**Grid.** New `Grid({ columns, gap, … })` on a tree-shakeable
`@glissade/scene/grid` subpath (and `glissade.Grid` on the IIFE). A pure
build-time fan-out — like `each()`/`splitText()`, **not** a Yoga feature: it
resolves uniform `fr` / fixed-px column tracks + gaps into cell positions, moves
each child to its cell center via the ordinary `position` signal, and wraps them
in a `Group`. No layout engine, no id stamping, nothing at play time — so it
works in a bare no-build page and composes with the goldens by construction.
Position-only in v1 (cell `stretch` / sizing deferred); `fr` columns need an
explicit `width`, multi-row grids need a `cellHeight` row pitch.

Both stay off the base embed (still 34.93 kB gz); the IIFE budget is unchanged
at 47 kB. See `docs/layout.md` for the no-build and Grid recipes.
