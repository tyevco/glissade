---
'@glissade/narrate': minor
---

`captionNode`'s long-caption fit (auto-shrink + bottom-anchor) is now **opt-in** via `{ autoFit: true }`, off by default. It re-flows multi-line burned captions, so leaving it off keeps captionNode byte-identical for existing scenes (a strict additive contract — no golden shifts on upgrade). Enable it for muted 9:16 cutdowns where burned captions are load-bearing: `captionNode(SIZE, { autoFit: true, maxLines: 3 })`. `maxLines`/`minScale` apply only when `autoFit` is set.
