---
"@glissade/lottie": minor
---

Text → Lottie export. `gs export --lottie` now emits glissade `Text` nodes as Lottie
`ty:5` text layers with a top-level `fonts.list` (font referenced by name — the player
supplies it, never embedded): text, font family/weight/style, size, fill color,
alignment, letter-spacing, and line-height, plus the full transform channels
(position/scale/rotation/opacity). Animated `text`/`fill`/`fontSize` sample into stepped
text-documents. The importer learns `ty:5` too (parse a static or animated text layer
back into a `Text` node), so the round-trip fidelity gate covers text end-to-end
(export→import→render is byte-identical). Honestly warned-and-dropped this cycle:
typewriter `reveal`/`revealFraction` (Lottie range selectors are a later phase),
`TokenHighlight` (its sibling highlight rects route through the shape path later),
variable-font axes (`fontAxes`/`fontVariationSettings` — no Lottie text-document field),
`box` valign (baseline-approximated), and wrap `width` (the player self-reflows).
Additive and off the embed path.
