---
'@glissade/scene': minor
---

layout-critique cut 3 (final): group→composed-box + Layout accessors + LAYOUT_OVERFLOW.

**Composed-children box (retires Cut-2's leaf workaround).** A `containBounds` node or
`alignGroups` member that is a container Group now resolves to the UNION bbox of its
rendered descendants (composed box), instead of failing loud. A leaf still resolves to
its own box (byte-identical to the prior path). OUT_OF_BOUNDS reads the composed box; a
member settles only when its whole composed footprint holds still. Two accurate, distinct
fail-loud causes remain: (a) a member that (and its descendants) drew NOTHING — a
truly-empty Group / hidden node — still fails loud ("produced no rendered box"); (b) a
member that DOES draw but is never simultaneously present-and-still still fails loud
("no settled frame"). Pure integer geometry — render-neutral.

**Layout read-accessors.** New public instance methods on `Layout`:
`computedBoxes()` (per-flowable-child boxes the flow placed), `computedPadding()` (the
resolved padding inset), and `computedGaps()` (the actual inter-child gaps along the main
axis). Each routes through the SAME memoized compute the DisplayList origins came from
(one-source — byte-neutral, goldens unchanged). `describe()` now lists a Layout `methods`
table (these three plus the previously-undocumented `computedSize`/`intrinsicSize`).

**LAYOUT_OVERFLOW.** A new `critique()` diagnostic (additive `DiagnosticCode`, no schema
bump) that runs automatically over every Layout node: it compares each flowable child's
rendered ink box to its computed flex SLOT (mapped to device via the Layout's
`worldMatrix()`) and fires when the ink exceeds the slot by > 0.5px — content bigger than
the cell the layout reserved for it. severity `warning`, source `critique`, geometry
fix-hints (shrink the child / grow the slot).
