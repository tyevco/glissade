---
'@glissade/backend-skia': minor
'@glissade/cli': minor
---

0.37: `gs repin` — the narration-aware golden reviewer, on a shipped perceptual tier

The lived pain: one re-narration re-flows every beat, so all of a project's
golden PNGs go stale at once and get re-pinned blind with `vitest -u` — the exact
thing that makes a re-narration batch un-landable.

- **`gs repin <scene-module> --golden <dir>`** renders the current scene
  frame-by-frame against the committed goldens and, for every changed frame,
  reports a perceptual delta (mean SSIM + the worst 8×8 tile — *where* it
  changed) and a one-line **cause** by diffing the scene's
  `*.narration.timing.json` sibling against a git ref: `seg-4 moved +0.21s:
  re-narration` (a downstream beat is attributed to its upstream shift). Default
  is a **dry run**; `--write` re-pins, `--only` gates per-frame, `--floor <ssim>`
  **refuses** a bigger-than-expected drop until `--force`, and `--heatmap <dir>`
  emits a thermal review PNG. Byte-equality stays the acceptance test — SSIM only
  explains and gates a divergence, never silently accepts one.
- **Perceptual golden tier**: the SSIM metric is promoted from the test-only
  PARITY helper to a shipped `@glissade/backend-skia` export — `ssim` (scalar,
  bit-identical to before), `ssimMap` (per-tile grid + worst tile), and
  `heatmapRgba`. Headless-twin only; never on the browser embed path.

Determinism hash and all existing goldens are unchanged (no `core`/`scene`/node
draw touched).
