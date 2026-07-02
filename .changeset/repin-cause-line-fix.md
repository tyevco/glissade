---
'@glissade/backend-skia': patch
'@glissade/cli': patch
---

0.37.0-pre.1: gs repin cause-line — attribute the edit site + trace downstream to root (ai-training canary evidence)

The ai-training canary's real e01-short re-narration found the flagship's headline
half-delivered: a re-narration changes the edited segment's **duration** (not its
start) and pushes every later beat, but `causeFor()` only attributed *start*
shifts — so the actually-edited segment got no cause line, and each downstream
beat claimed its own derived shift instead of tracing to the root.

- **Edit-site attribution**: `diffTiming` now tracks per-segment `deltaDuration`;
  the edited segment is named by its duration change (`s2 re-narrated (+0.53s
  duration): re-narration`) even though its start didn't move.
- **Downstream → root**: a purely-shifted beat is attributed `downstream of s2
  (+0.53s)` — traced to the nearest upstream re-narration — instead of naming its
  own pushed start.
- **Culprit marker**: the report flags the lowest-SSIM changed frame `◀ likely
  edit-site` (a content edit drops SSIM hard; a pure time-shift barely dents it) —
  works even with no timing sibling.
- **`ssimMap` sub-8×8 guard**: an image smaller than one 8×8 tile returns a
  vacuous mean 1 instead of NaN (0/0).
- **Discoverability**: `@glissade/cli`'s shipped README now documents `gs repin`
  + points to the guide (both canaries flagged that docs/golden-review.md isn't in
  the npm tarball).

Determinism/goldens unchanged; the SSIM scalar stays bit-identical for all real
(≥8×8) frames.
