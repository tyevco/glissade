---
"@glissade/cli": minor
---

feat(loudness): `gs measure-loudness` — loudness-normalized publish profiles via a deterministic peak-clamped scalar gain (loudness)

Publish-loudness normalization that keeps the render hot path single-pass and
byte-deterministic. The insight: YouTube/Shorts re-normalize loudness
platform-side, so the publish target is *≤ target-LUFS AND ≤ -1 dBTP*, not exact
— which means no two-pass limiter is needed.

- **`gs measure-loudness <scene> [--profile <id>]`** builds the final mix to a
  WAV (the same `collectAudioClips` + `planAudioMix` render uses) and runs
  ffmpeg's `loudnorm` measurement pass over it at MEASURE-time, then commits a
  `<scene>.loudness.json { loudnessVersion, profileId, inputI, inputTp, inputLra,
  gain, mixHash }`. The gain is peak-clamped:
  `gain = min(targetLufs - inputI, truePeakDb - inputTp)` — the clamp uses the
  MEASURED true-peak, so the published output is guaranteed ≤ -1 dBTP with no
  render-time oversampling.
- **At render**: `<scene>.loudness.json` is read and `gain` is applied as a PURE
  `volume=<gain>dB` scalar on the FINAL mix node — a single scalar in the
  existing filter graph, NOT a second ffmpeg pass. The scalar gain is bit-exact
  (verified) and golden-hashable; the only non-deterministic stages (mix-to-PCM,
  measure-time ebur128) stay quarantined to commit/measure-time per §5.3.
- **PublishProfiles**: `youtube`/`shorts` (-14 LUFS), `podcast` (-16),
  `broadcast`/`ebu` (-23) — all at a -1 dBTP ceiling. YouTube/Shorts ship fully;
  the brickwall true-peak limiter is deferred — an un-normalized profile whose
  peaky source can't reach its target without clipping gets an advisory warning.
- **mixHash** binds the committed measurement to the mix CONTENT (a hash of the
  narration/music/sfx timing-manifest bytes, not mtime). Render recomputes it and
  HARD-THROWS naming the command on a mismatch, so a re-narrate invalidates the
  measurement loudly instead of silently mis-normalizing. `--loudness off` skips
  it entirely.
