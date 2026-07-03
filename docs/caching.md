# Render caching & the remux fast path

Mesh-heavy or blur-heavy frames are expensive to rasterize. Because `evaluate(scene, timeline, t)` is a **pure function of time**, a frame whose visual inputs haven't changed is byte-identical to a prior render — so it never needs re-rasterizing. `gs render --cache` turns that guarantee into a persistent, content-addressed cache.

```sh
gs render e07.ts --out out/e07.mp4 --cache=.gscache
```

The cache is **opt-in** (default off — the exact no-cache baseline is preserved) and lives on disk, so it spans runs, edits, and `--workers` shards. Pass `--cache` bare for the default directory, or `--cache=<dir>` (the `=` form — a space-separated `--cache .gscache` is **not** parsed as a directory).

## The whole-frame cache

Each frame's cache key is a SHA-256 of the frame's entire DisplayList snapshot ⊕ the glissade version ⊕ the backend capabilities ⊕ the byte digests of every referenced image/video/font. A **hit** means "this frame's content is byte-identical to a prior render," so the stored RGBA is reused instead of rasterizing — byte-safe by construction.

- Change one beat and only the frames that actually differ re-rasterize; the rest are cache hits.
- Bump the glissade version, edit an asset's bytes, or change the backend and every affected key changes — a stale frame is never served.

```sh
gs render e07.ts --out out/e07.mp4 --cache=.gscache --cache-max-size 2GB
#   cache (read-write): 236 hits, 4 misses, 4 stored → .gscache
```

`--cache-mode read-write` (default) reads and writes; `read-only` reuses without growing the cache; `off` bypasses it. `--cache-max-size` bounds the on-disk LRU (e.g. `2GB`, `512MB`, or a raw byte count).

## The audio-only remux fast path

The whole-frame cache skips *rasterizing* unchanged frames — but re-encoding the video from those frames still costs time. When **every** frame is unchanged (a voice re-master, a music-level tweak — anything that touches only the audio mix, not the picture), that re-encode is pure waste: the video is byte-identical to what's already on disk.

So a cached video render also writes a small **manifest** (`<out>.gsrender.json`) recording the ordered digest of every frame's cache key. On a re-render, a cheap **key-only pre-pass** (evaluate + hash, no rasterizing) recomputes that digest. If it matches the prior manifest — and the output file and encode parameters are unchanged — glissade skips the frame loop entirely and `ffmpeg -c:v copy` remuxes just the new audio:

```sh
gs render e07.ts --out out/e07.mp4 --cache=.gscache
#   cache: 240/240 frames unchanged (audio-only) — video copy + remux → out/e07.mp4
```

An audio-only re-master goes from a full re-render to a remux in seconds. There's no new flag — `--cache` simply gets smarter.

### What forces a full re-encode

The frame-key digest tracks exactly what's **on screen**, so the fast path is taken only when the picture is provably identical. Anything else falls back to a normal render (which the whole-frame cache still accelerates):

- **A visual edit** — any pixel change flips the digest.
- **A re-narration** — new TTS shifts beats, so captions and timing-driven frames change; the digest flips and the video re-encodes (correctly).
- **An encode change** — a different codec, container, fps, or frame count.
- **A missing/moved output** — no prior video to copy, so it re-renders.

The manifest is a **portable determinism proof**: identical DisplayLists per frame ⇒ identical raster on the pinned Skia toolchain ⇒ identical encode. The fast path never trades correctness for speed — a cache hit's output is byte-identical to a cold render.

### Verifying it yourself — compare *pixels*, not container bytes

The correctness contract is that the **decoded picture** is identical, not that the container bytes are. A remux (`-c:v copy`) copies the coded video packets verbatim, but it re-writes the container's framing (PTS/DTS, the `moov` atom, `+faststart`) — so a whole-file or packet-level hash *will* differ even when every pixel is identical. On a real GOP-structured video this bites subtly: `ffmpeg -f framemd5` emits per-frame hashes in **decode order**, and the remux's timestamp rewrite reorders how B-frames decode, so the framemd5 *sequence* diverges even though the frames match.

Compare in **presentation order with timestamps stripped**:

```sh
# PSNR reports MSE=0 / psnr=inf on every frame when the pictures are identical
ffmpeg -i cold.mp4 -i remuxed.mp4 -lavfi psnr -f null -
# or a raw pixel hash in presentation order (no container/timestamp fields)
ffmpeg -i remuxed.mp4 -f rawvideo -pix_fmt rgb24 - | sha256sum
```

A `psnr` of `inf` (MSE 0) on all frames is the pass: the video is pixel-for-pixel the cold render, and only the audio (and cosmetic container timestamps) changed.

## Dirty-beat incremental — re-render only the frames that changed

The remux fast path is all-or-nothing: it wins only when **every** frame is unchanged. But the common editing loop is the opposite — you change one thing in the middle and re-render. And the worst case for the whole-frame cache is a **timing** edit: move one beat, re-narrate a line, nudge a keyframe, and every *downstream* frame's DisplayList shifts. Every content key from the edit point onward misses the cache, the rolled-up remux digest flips, and a 35-minute episode re-renders in full for a three-second change.

`--incremental` fixes exactly that. Instead of only the rolled-up digest, the manifest persists the **ordered per-frame key vector**. On a re-render, the key-only pre-pass recomputes that vector, diffs it against the prior one, and re-renders **only the contiguous runs of changed frames** — splicing the unchanged runs verbatim out of a retained FFV1 lossless intermediate kept beside the output (`<out>.gsintermediate.mkv`):

```sh
gs render episode.ts --out ep.mp4 --incremental   # first run: builds the intermediate
# …move one beat in the middle…
gs render episode.ts --out ep.mp4 --incremental
#   incremental: 61/1530 frames changed — re-rendering those, splicing 1469 from the intermediate
```

### Determinism holds byte-exact *through* the optimization

This is the contract that makes it safe: a warm splice is **byte-for-byte identical** to a cold `--incremental` render of the same edited scene. FFV1 is lossless and intra-only, so a kept segment decodes to the exact pixels a re-render would produce, and one final encode over the spliced stream *is* the cold render. A cold `--incremental` render is just the degenerate all-changed case of the same pipeline, so cold and warm can't diverge. The per-frame key is the same determinism proof the whole-frame cache and the golden corpus trust — an end-to-end test asserts splice ≡ cold-full byte-identity across a forward edit, an unchanged re-render, and a reverse edit.

### When it falls back to a full render

`--incremental` implies the lossless-intermediate pipeline (FFV1 shards → one final encode) and applies to **video output** only. It re-renders everything (and rebuilds the intermediate for next time) when:

- **No prior intermediate** — the first `--incremental` render, or the retained `.gsintermediate.mkv` was deleted.
- **A duration change** — a different frame count is a structural change, not a splice (the key vectors can't align frame-for-frame).
- **An encode-param change** — a different codec, container, fps, or frame range; a kept segment is only byte-faithful under an identical surrounding encode.
- **A GPU/shader scene** — its output isn't reproducible across the child-process boundary the splice re-renders in (pass `--allow-gpu-shards` to override, at your own risk).
- **A pre-0.41 manifest** — one without the per-frame key vector; the next render adds it.

### Where the win comes from — it's front-loaded, not uniform

`--incremental` re-renders the changed frame runs and splices the rest, so the saving is proportional to **how much of the timeline precedes your edit** — it saves everything *before* the edit, not "the one beat you touched." On a timeline where beats are anchored to narration (or anything that shifts every later beat when one changes), a **mid-timeline** edit re-flows the entire downstream tail, so only the head before the edit splices:

| edit location | changed frames | typical win |
| --- | --- | --- |
| a late / last beat | ~none downstream | large — a truly-final-line edit collapses the warm render to just the FFV1→final-encode pass (length-bound, not the full re-render) |
| mid-timeline | the whole tail after the edit | modest — only the head before the edit is saved |

Measured on a real ~52-minute narration-anchored episode (1530-frame short segment): a last-segment word change re-rendered **0/1530** frames (**5.06×** faster than a cold render); a mid-timeline word change re-rendered **637/1530** (**1.23×**). Both were byte-identical to a cold `--incremental` render. So `--incremental` retires the full re-render for **late-edit** iteration — the common "fix the ending / tweak the last line" loop — and still helps, less dramatically, for mid-timeline edits.

One eligibility subtlety for narration-driven projects: a re-narration usually changes the audio *duration*, and if your render length is derived from that duration the **frame count changes → full-render fallback** (the key vectors can't align). Padding the render to a **fixed, duration-invariant length** keeps `--incremental` eligible across re-narrations — the frame count stays constant, so only the content keys of the shifted beats differ.
