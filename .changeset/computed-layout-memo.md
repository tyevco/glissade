---
'@glissade/scene': patch
---

Back the `scene/layout` memo with a core `computed()` signal (pALZ, DESIGN §3).

The hand-rolled `#memoKey`/`JSON.stringify`-compare memo in `Layout` is replaced
by a dependency-tracked `computed()` keyed on the *participating* signals: the
computed reads exactly the container props and child intrinsic-size signals it
consumes, so the signal graph records those as deps and re-invokes Yoga only
when one of THEM changes. Mutating a non-participating signal (e.g. the
container's or a child's `opacity`) no longer re-runs `compute()`; the old memo
recomputed its key but the stringify-compare hid the wasted invalidation —
now invalidation is precise.

Layout RESULTS are unchanged (goldens byte-identical) — the memo is a pure
performance layer. The `computedSize(customMeasurer)` escape hatch bypasses the
cache: a caller-supplied non-default measurer computes fresh & uncached so it
can never read (or poison) a memo keyed on the scene-singleton measurer.

No public API change.
