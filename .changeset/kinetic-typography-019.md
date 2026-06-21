---
'@glissade/scene': minor
---

0.19: kinetic typography — `Text.revealFraction` + `splitText` sub-targets (scJv, x-YTLQ).

- **`Text.revealFraction`** (0..1): pure count-rounding sugar over the shipped
  `reveal` grapheme count — `count = round(fraction * graphemeCount)`, resolved
  against the SAME grapheme stream and feeding the identical masked-emit path.
  Animatable (`'<id>/revealFraction'`), overrides `reveal` when set; unset (the
  default) is byte-identical to a Text without it, so every existing golden is
  unchanged. Whole-grapheme only — the sub-grapheme clip-wipe/softness is out of
  scope.

- **`splitText(text, { by: 'word' | 'line' | 'grapheme' })`** on a NEW
  tree-shaken `@glissade/scene/type` subpath: a pure build-time expansion (like
  `each()`) of a Text into a `Group` of positioned, independently addressable
  per-part child Texts (ids `${id}/[i]`) — stagger a word-by-word reveal,
  scatter graphemes, etc. STATIC snapshot of the source's laid-out geometry and
  REPLACE-the-source semantics. Backed by a new `Text.graphemeBoxes()` (the
  per-grapheme analogue of `wordBoxes()`, boundaries matching the draw path).
  ZERO base-embed cost.
