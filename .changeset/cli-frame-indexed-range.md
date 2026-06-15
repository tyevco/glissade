---
'@glissade/cli': minor
---

`gs render --range` is now **frame-indexed** (`--range 0..120` = inclusive frame indices), matching the spec's rule that export APIs take frames while Player APIs take seconds. Decimal/garbage ranges are rejected. New flags: `--frame N` (render a single still through the same path) and `--format png-seq` (force a PNG sequence even when `--out` looks like a video). `--workers` and `--watch` are recognized but print an honest not-yet-implemented note (parallel sharding is tracked separately). The programmatic `render({ range })` still accepts seconds for back-compat; new `frame`/`frameRange`/`format` options drive the frame-indexed path.
