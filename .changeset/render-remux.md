---
"@glissade/cli": minor
---

`gs render --cache`: audio-only **remux fast path** — a voice re-master becomes a remux, not a re-render

The persistent whole-frame cache (0.12) already skips *rendering* frames whose visual inputs are unchanged — but an all-cache-hit render still re-*encoded* the video. Now, when rendering a video with `--cache`, `gs render` writes a `<out>.gsrender.json` manifest recording the ordered digest of every frame's content-cache key. On a re-render, a cheap **key-only pre-pass** (evaluate + hash, no raster) recomputes that digest; if it matches the prior manifest and the output + encode params are unchanged, the video is byte-identical, so glissade skips the frame loop entirely and `ffmpeg -c:v copy` remuxes just the new audio:

```
gs render e07.ts --out e07.mp4 --cache .gscache
  240/240 frames unchanged (audio-only) — video copy + remux → e07.mp4
```

The frame-key digest **is** a determinism proof: identical DisplayLists per frame ⇒ identical raster on the pinned Skia toolchain ⇒ identical encode. Any pixel change flips the digest and falls back to a full encode; a codec / container / fps / frame-count change also forces a re-encode. No new flag — `--cache` just gets smarter. The encode path is byte-for-byte unchanged.

*(The disk-persistent layer-cache tier from the same card — a marked `Group`'s raster surviving a re-narration — is a fast-follow.)*
