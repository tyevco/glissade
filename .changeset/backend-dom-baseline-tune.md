---
'@glissade/backend-dom': patch
---

0.21: backend-dom — tune DOM text baseline (0.8em → 0.84em)

Follow-up to the pre.3 text fix: the rendered text sat ~0.04em too low versus the canvas baseline (a single systematic offset, not per-font; ~4px at display/title sizes). The baseline lift is now 0.84em, landing DOM text on the canvas baseline within ~1px. Horizontal alignment is unchanged.
