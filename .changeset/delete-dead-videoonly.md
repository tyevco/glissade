---
"@glissade/cli": patch
---

Remove the dead `RenderOptions.videoOnly` shard option. It was never set to `true` (no `--video-only` flag exists) and its gated branches never ran — shard children render video-only via `--format png-seq` + `--narration/music/sfx off`. Pure cleanup; identical runtime behavior.
