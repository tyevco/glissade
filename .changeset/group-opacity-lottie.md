---
"@glissade/lottie": minor
---

Group-opacity compositing in Lottie export. A `Group` with opacity < 1 (or an animated
opacity track) previously exported its children at full opacity — Lottie parenting
inherits a parent's transform matrix but not its opacity, so `gs export --lottie` warned
and left group fades un-composited (elements that should fade out stayed visible in the
re-imported Lottie). Now the group's opacity is baked into each leaf descendant's own
opacity (`leaf × Π ancestor-group-opacity`), while the group's null layer keeps only its
position/rotation/scale — so a fading group finally hides its children (exact for the
common case: a group fading to ~0 gives `0 × child = 0`). Nested groups multiply; an
animated group opacity samples and decimates onto the child channel. Honest limit
(warned, not silent): overlapping *translucent* siblings inside a group double-composite
their overlap region — exact when descendants don't overlap or the group opacity is
near 0/1. Export-only and additive; determinism and goldens unaffected.
