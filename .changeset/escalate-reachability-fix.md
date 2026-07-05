---
'@glissade/scene': patch
---

**0.63 fix — the meaning-veto's ESCALATE partition is now reachable.** `assess()`
partitioned a non-accepted warning into `escalated` only when *all* its levers were
content-class (`isContentOnly`, which requires `hints.length > 0`). A warning with
**no** mechanical lever — `RENDER_ONLY_EXPORT` (a render-only feature that won't
survive Lottie export: motion-blur / echo / shake / partial-reveal) — has no
`fixHints`, so it fell through every partition branch and passed silently as
`clean: true`. The safety half of the loop (content-only / no-fix → a human decides)
was unreachable dead code.

The escalate rule is now broader and cleaner: **a non-accepted warning the loop
could not mechanically auto-close** (`severity === 'warning' && !isGeometryFixable`)
escalates — covering both the all-content case (the meaning veto) and the
no-mechanical-lever case (`RENDER_ONLY_EXPORT`, a pure human-judgment fidelity
decision: accept the export-fidelity loss, or restructure the scene). `escalated`
still never blocks `clean` — the loop has done all it mechanically can; the human
owns the rest. Info-level parity notes remain advisory (they don't escalate).

**And the geometry levers `assess()` DOES auto-apply are now feasibility-bounded.**
Previously an auto-applied geometry fix had no bounds, so the loop could converge to
a "clean" but unshippable result — a caption shrunk below legibility, or a wrap box
grown off-canvas (a readable *string* but an unreadable *caption*). Now a geometry
lever is offered only while it stays in-bounds: `fontSize` will not shrink below the
legibility floor (`MIN_LEGIBLE_PX`, matching `fitText({ minPx })`'s default), and a
resize (`width` / `box.h`) will not grow past the canvas. When BOTH are out of
bounds, only the content lever remains → the overflow **escalates** (the meaning
boundary one level deeper: the loop refuses to auto-produce an unshippable caption,
and hands the shorten-the-text decision to a human). Estimated metrics keep both
levers (too coarse to drop one on). `docs/authoring-loop.md` now states the
ship-gate precisely: `clean` is the loop's *termination* signal; ship iff
`clean && v.escalated.length === 0`.

Both halves caught by the capstone's own verification loop (edcc's SHAPE seat found
the dead partition; ai-training's content seat proved the unbounded-geometry gap on
real dialog) BEFORE release — the self-verifying engine verifying itself. Pure
diagnostic-metadata logic: all 415 goldens byte-identical, base embed unchanged
(38.67/39), determinism b4e6060006 intact.
