# Render caching & the remux fast path

Mesh-heavy or blur-heavy frames are expensive to rasterize. Because `evaluate(scene, timeline, t)` is a **pure function of time**, a frame whose visual inputs haven't changed is byte-identical to a prior render — so it never needs re-rasterizing. `gs render --cache` turns that guarantee into a persistent, content-addressed cache.

```sh
gs render e07.ts --out out/e07.mp4 --cache .gscache
```

The cache is **opt-in** (default off — the exact no-cache baseline is preserved) and lives on disk, so it spans runs, edits, and `--workers` shards.

## The whole-frame cache

Each frame's cache key is a SHA-256 of the frame's entire DisplayList snapshot ⊕ the glissade version ⊕ the backend capabilities ⊕ the byte digests of every referenced image/video/font. A **hit** means "this frame's content is byte-identical to a prior render," so the stored RGBA is reused instead of rasterizing — byte-safe by construction.

- Change one beat and only the frames that actually differ re-rasterize; the rest are cache hits.
- Bump the glissade version, edit an asset's bytes, or change the backend and every affected key changes — a stale frame is never served.

```sh
gs render e07.ts --out out/e07.mp4 --cache .gscache --cache-max-size 2GB
#   cache (read-write): 236 hits, 4 misses, 4 stored → .gscache
```

`--cache-mode read-write` (default) reads and writes; `read-only` reuses without growing the cache; `off` bypasses it. `--cache-max-size` bounds the on-disk LRU (e.g. `2GB`, `512MB`, or a raw byte count).

## The audio-only remux fast path

The whole-frame cache skips *rasterizing* unchanged frames — but re-encoding the video from those frames still costs time. When **every** frame is unchanged (a voice re-master, a music-level tweak — anything that touches only the audio mix, not the picture), that re-encode is pure waste: the video is byte-identical to what's already on disk.

So a cached video render also writes a small **manifest** (`<out>.gsrender.json`) recording the ordered digest of every frame's cache key. On a re-render, a cheap **key-only pre-pass** (evaluate + hash, no rasterizing) recomputes that digest. If it matches the prior manifest — and the output file and encode parameters are unchanged — glissade skips the frame loop entirely and `ffmpeg -c:v copy` remuxes just the new audio:

```sh
gs render e07.ts --out out/e07.mp4 --cache .gscache
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
