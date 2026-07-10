---
"@glissade/cli": minor
---

`gs render --preview <scene>` — a two-tier render: a WATCHABLE DRAFT that shares the frame cache with the production render but encodes lighter/faster. `--final` (also the DEFAULT when neither flag is passed) is UNCHANGED and byte-exact; `--preview` and `--final` are mutually exclusive (fail-loud if both).

**Same frames, lighter encode.** crf is an ENCODE parameter only — it changes the compressed h264 bytes, never the rasterized frames. It is deliberately NOT in the frame-key digest (nor the determinism cert), so a `--preview` render REUSES the exact rasterized frames a prior `--final` produced — no re-raster on a raster-bound workload, the whole point. `--preview` just raises the crf (libx264 `-crf 30` instead of `18`; libvpx-vp9 `-crf 40` instead of `32`) for a faster/lighter draft; encoders without a draft point (libvpx / openh264 / mpeg4) keep their final quality. The tier→crf map is one pure function (`videoQualityArgs`) shared by the linear, sharded (`--workers`), and incremental (`--incremental`) encode paths.

**Tier isolation at the encode-artifact layer (the load-bearing fix).** The audio-only REMUX fast path (`canRemux` → `ffmpeg -c:v copy` the existing video stream) keyed only on the frame-key digest + container/codec/fps/frames — NOT the encode quality. Since a preview and a final of the same scene have the SAME frame digest, a `--final` request could have remux-copied a leftover `--preview` (higher-crf) stream AS the final = a preview served as final. This adds a `videoQuality` field (the resolved crf/encode-quality params string) to `RenderManifest` and folds it into the `canRemux` equality check, so a preview manifest NEVER remux-serves a final request or vice versa. A pre-0.71 manifest (absent `videoQuality`) reads as `undefined` → never matches a resolved quality string → falls back to a full encode rather than risk a cross-tier false-hit (no manifest `v` bump needed).

`--final`/default output bytes are byte-identical to pre-0.71 (the default crf path is untouched); goldens hold 433/433. CLI-only, off the frame/determinism path (b4e6060006 unaffected).
