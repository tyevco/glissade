---
'@glissade/narrate': minor
---

`captionNode` now keeps long narration segments in-frame — the overflow that forced `--captions sidecar` on muted 9:16 cutdowns. A long caption used to wrap to many lines and run off the bottom; the node now **auto-shrinks** the font until the wrap fits `maxLines` (default 2, floored at `minScale` = 0.7× the base size) and **bottom-anchors** the block so extra lines grow upward into the safe area instead of off the edge. Both are pull-bound and deterministic (golden-covered, landscape + portrait). Short captions are byte-identical to before; tune via `{ maxLines, minScale }`.
