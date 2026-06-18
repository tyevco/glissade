---
'@glissade/cli': minor
---

Add `gs render --workers N` — **sharded parallel export** (§5.6, §8.1). The frame
range is split into N contiguous sub-ranges, each rendered in a **separate `gs`
child process** (not worker_threads — `@napi-rs/canvas`/`GlobalFonts` hold unsafe
process-global state, and separate processes are cross-machine-ready). Because
`evaluate` is a pure function of time, each shard re-runs the scene module from
scratch — re-deriving any module-level `bake()` for its prefix — so an N-worker
render of a range is **byte-identical to a single-worker render of the same range**
at the frame level (verified by a determinism gate test).

Shards render **video-only**; the orchestrator mixes timeline + auto-mixed
(narration/music/sfx) audio **once** over the joined result, and emits caption/cue
sidecars once. Two join strategies (the §8.1 decision):

- **default** — per-shard encode to the final codec with a forced keyframe at each
  shard boundary (`-force_key_frames`), joined by the FFmpeg concat demuxer
  (verbatim `-c copy`).
- **`--lossless-intermediate`** — FFV1 shards + a single final encode (the
  guaranteed byte-faithful path). Auto-enabled with a stderr note when the picked
  encoder can't honor precise boundary keyframes (mpeg4 / openh264), since a
  concat-copy of imprecise-GOP codecs would drop/dupe boundary frames.

GPU/shader scenes are outside the cross-process reproducibility guarantee (§3.7):
a scene containing a `ShaderEffect` **refuses to shard** unless `--allow-gpu-shards`
is passed.

New `RenderOptions`: `workers?`, `losslessIntermediate?`, `allowGpuShards?`. New
CLI flags: `--workers <n>`, `--lossless-intermediate`, `--allow-gpu-shards`. New
exports from `@glissade/cli`: `renderSharded`, `splitFrameRange`,
`sceneHasGpuNodes`, `planFinalAudio`, `ShardError`.

Note: serialized shipped-checkpoint warming for checkpointed `bake()` sources
(§2.8) remains a follow-up; each shard currently re-derives its prefix.
