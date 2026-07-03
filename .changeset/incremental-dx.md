---
"@glissade/cli": patch
---

`gs render`: accurate `--incremental` progress + an actionable missing-audio error

Two DX papercuts from the 0.41 real-episode dirty-beat review (ai-training):

- **`--incremental` progress now reports the re-rendered count, not the whole timeline.** A splice that re-renders 637 of 1530 frames printed `rendering 1530/1530 frames`, which read like a full render even though 893 frames were spliced from the intermediate. It now prints `rendering 637/637` (the frames actually re-rendered), alongside the existing `incremental: 637/1530 frames changed — splicing 893` line.
- **A missing audio input fails with an actionable message.** A committed narration/sfx timing manifest can reference a cache WAV that isn't on disk (the audio cache is usually git-ignored, so a fresh checkout lacks it); the render used to die deep in ffmpeg with a bare `hook-….wav: No such file`. `gs render` now preflights the mix inputs and, on a missing file, names it and points at the fix (`gs narrate` / `gs sfx`, or `--narration off` / `--sfx off`).
