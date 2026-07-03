---
"@glissade/lottie": patch
---

`gs export --lottie` pre.1 — two canary-flagged fixes:

- **Emit the bodymovin `v` (schema-version) field** (`"5.7.0"`). Strict lottie-web /
  dotLottie validators reject a document without it, so the pre.0 output could be
  refused by real players. Both the render and real-scene canary seats verified the
  gap independently.
- **Decimate dense-sampled fallback keys.** Springs, named easings, and `Expr` tracks
  sample to one linear key per frame; a real episode measured ~148k keys / 139 MB.
  Since Lottie plays linear between keys, a Ramer–Douglas–Peucker pass drops the keys
  that linear playback already reproduces (within 0.2% of each channel's range),
  collapsing constant and constant-velocity runs to their endpoints while preserving
  curvature and the exact start/end. Output shrinks by orders of magnitude with no
  perceptible fidelity change.
