---
'@glissade/cli': minor
---

0.39: `gs master` — series-consistent loudness + the true-peak limiter

`gs measure-loudness` gains one asset at a time and clamps the gain against the
source peak (no limiter), so a peaky short lands LUs below target and a series ends
up inconsistent (−14 episodes / −16 shorts). `gs master glissade.master.json`:

- measures **all** members together (globs, like `gs build`'s `scenes`), picks the
  loudest shared LUFS target the whole set can reach under a shared true-peak
  ceiling, and ships the deferred brickwall **true-peak limiter** so a peaky member
  recovers headroom instead of landing low;
- **verifies** each member (applies gain+limiter, re-measures the output) and
  reports the real `out` LUFS/dBTP — exits non-zero if any verified peak still
  exceeds the ceiling;
- writes the ordinary `<scene>.loudness.json` sidecar + a `limiter` block, so it
  **composes with the render-time mixHash preflight** (a re-narrate still
  invalidates it loudly before frame 1) and **applies as a mix-only remux** (~20 s/
  asset) — `render` copies the video stream and re-muxes audio through
  `volume=<gain>dB, alimiter=…`, never re-rendering frames.

`consistency: 'shared-target'` (default) normalizes every member to one LUFS;
`'per-asset'` drives each to its own max. `limiter: false` keeps the legacy
peak-clamp. The limiter is the one non-linear stage, baked from committed params in
the audio graph (deterministic on a pinned ffmpeg) — a mastered render stays
byte-identical run-to-run. Visual determinism untouched (audio-only). `render`'s
`resolveLoudnessGainDb` now returns `{ gainDb, limiter? }` instead of a bare number.
