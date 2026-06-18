# @glissade/cli

## 0.10.0-pre.1

### Patch Changes

- fbdcc44: `gs render --workers N` now caps the sharded frame range to the timeline extent (`ceil(duration*fps)`), matching the linear path's `-t <duration>` trim. Previously an explicit over-range (e.g. `--range 0..119` on a shorter timeline) or an `--fps` override emitted more frames from the sharded path than the single-worker path — a silent break of the documented N-worker == 1-worker contract. (A copy-mode `-t` on the concat join is not frame-accurate, so the cap is applied to the rendered frames instead.)
- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
  - @glissade/scene@0.10.0-pre.1
  - @glissade/core@0.10.0-pre.1
  - @glissade/backend-skia@0.10.0-pre.1
  - @glissade/interact@0.10.0-pre.1
  - @glissade/lottie@0.10.0-pre.1
  - @glissade/narrate@0.10.0-pre.1
  - @glissade/player@0.10.0-pre.1
  - @glissade/svg@0.10.0-pre.1
  - @glissade/sfx@0.10.0-pre.1

## 0.10.0-pre.0

### Minor Changes

- 050db0a: Add `gs render --workers N` — **sharded parallel export** (§5.6, §8.1). The frame
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

### Patch Changes

- Updated dependencies [b2f1fd7]
- Updated dependencies [278ea05]
- Updated dependencies [680f8ae]
- Updated dependencies [0cc640f]
- Updated dependencies [0a1844c]
  - @glissade/core@0.10.0-pre.0
  - @glissade/scene@0.10.0-pre.0
  - @glissade/backend-skia@0.10.0-pre.0
  - @glissade/interact@0.10.0-pre.0
  - @glissade/lottie@0.10.0-pre.0
  - @glissade/narrate@0.10.0-pre.0
  - @glissade/player@0.10.0-pre.0
  - @glissade/sfx@0.10.0-pre.0
  - @glissade/svg@0.10.0-pre.0

## 0.9.1

### Patch Changes

- 4da552c: `gs render --chapters vtt` now writes **only chapter-kind cues** as WebVTT chapters by default — ad-break and plain `cue` markers stay out of the chapter list (they remain in `cues.json` for machines), so the VTT pastes straight into a YouTube description without manual filtering. Override the set with `--chapters-kind <kind[,kind]>` (e.g. `--chapters-kind chapter,ad-break`). `cues.json` is unchanged — it keeps every kind. The `00:00` "Intro" anchor logic now applies to the filtered chapter set.
  - @glissade/backend-skia@0.9.1
  - @glissade/core@0.9.1
  - @glissade/interact@0.9.1
  - @glissade/lottie@0.9.1
  - @glissade/narrate@0.9.1
  - @glissade/player@0.9.1
  - @glissade/scene@0.9.1
  - @glissade/sfx@0.9.1
  - @glissade/svg@0.9.1

## 0.9.1-pre.0

### Patch Changes

- 4da552c: `gs render --chapters vtt` now writes **only chapter-kind cues** as WebVTT chapters by default — ad-break and plain `cue` markers stay out of the chapter list (they remain in `cues.json` for machines), so the VTT pastes straight into a YouTube description without manual filtering. Override the set with `--chapters-kind <kind[,kind]>` (e.g. `--chapters-kind chapter,ad-break`). `cues.json` is unchanged — it keeps every kind. The `00:00` "Intro" anchor logic now applies to the filtered chapter set.
  - @glissade/backend-skia@0.9.1-pre.0
  - @glissade/core@0.9.1-pre.0
  - @glissade/interact@0.9.1-pre.0
  - @glissade/lottie@0.9.1-pre.0
  - @glissade/narrate@0.9.1-pre.0
  - @glissade/player@0.9.1-pre.0
  - @glissade/scene@0.9.1-pre.0
  - @glissade/sfx@0.9.1-pre.0
  - @glissade/svg@0.9.1-pre.0

## 0.9.0

### Patch Changes

- 04a1059: feat(fonts): FontRegistry + strict-mode font validation + cmap glyph coverage (§3.6)

  Explicit fonts grow up. `AssetRef` gains optional `faces` (weight/style variants)
  and `fallback` (the family chain) — purely additive: a bare `{ kind: 'font', url }`
  stays the single 400/normal face with a `[family]` chain, so every existing
  document renders byte-identically.

  New in `@glissade/core` (DEV/export-path only, never in `evaluate()`, tree-shaken
  from real embeds):

  - `buildFontRegistry(assets)` → `FontRegistry` with `has`, `faces()`,
    `resolveFace(family, weight, style)` (CSS nearest-weight), and
    `fallbackChain(family)`.
  - `parseCmap(bytes)` — a pure, zero-dep sfnt `cmap` reader (formats 4 + 12)
    returning the covered code points; malformed input yields an empty set.
  - `validateFonts(usages, registry, cmaps, mode)` + `FontValidationError` —
    reports unregistered non-generic families and uncovered glyphs (the
    "héllo 👋 renders emoji in Chrome, tofu in Skia" bug). Generic and
    caller-supplied OS families are exempt, so a default-font Text never errors.

  New in `@glissade/scene`: `collectTextUsages(scene)`, `validateSceneFonts(scene,
doc, loadBytes, opts)` (node-walk + caller I/O → core validation), and
  `TextProps.fontStyle: 'normal' | 'italic'` threaded into `FontSpec` (omitted when
  normal, so goldens are unchanged).

  Strict-vs-dev is a per-render/per-export OPTION (default dev-warn), never a
  Timeline flag: `exportVideo({ strictFonts })`, `gs render --strict`, and a
  `mount({ strictFonts })` option. All three loaders now register EVERY declared
  face (not one-per-asset): export-web awaits each face before frame 0, the CLI
  registers each path via `GlobalFonts`, the player loads non-awaited.

- Updated dependencies [f3b471b]
- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0
  - @glissade/scene@0.9.0
  - @glissade/player@0.9.0
  - @glissade/backend-skia@0.9.0
  - @glissade/interact@0.9.0
  - @glissade/lottie@0.9.0
  - @glissade/narrate@0.9.0
  - @glissade/sfx@0.9.0
  - @glissade/svg@0.9.0

## 0.9.0-pre.1

### Patch Changes

- Updated dependencies [f3b471b]
  - @glissade/core@0.9.0-pre.1
  - @glissade/scene@0.9.0-pre.1
  - @glissade/backend-skia@0.9.0-pre.1
  - @glissade/interact@0.9.0-pre.1
  - @glissade/lottie@0.9.0-pre.1
  - @glissade/narrate@0.9.0-pre.1
  - @glissade/player@0.9.0-pre.1
  - @glissade/sfx@0.9.0-pre.1
  - @glissade/svg@0.9.0-pre.1

## 0.9.0-pre.0

### Patch Changes

- 04a1059: feat(fonts): FontRegistry + strict-mode font validation + cmap glyph coverage (§3.6)

  Explicit fonts grow up. `AssetRef` gains optional `faces` (weight/style variants)
  and `fallback` (the family chain) — purely additive: a bare `{ kind: 'font', url }`
  stays the single 400/normal face with a `[family]` chain, so every existing
  document renders byte-identically.

  New in `@glissade/core` (DEV/export-path only, never in `evaluate()`, tree-shaken
  from real embeds):

  - `buildFontRegistry(assets)` → `FontRegistry` with `has`, `faces()`,
    `resolveFace(family, weight, style)` (CSS nearest-weight), and
    `fallbackChain(family)`.
  - `parseCmap(bytes)` — a pure, zero-dep sfnt `cmap` reader (formats 4 + 12)
    returning the covered code points; malformed input yields an empty set.
  - `validateFonts(usages, registry, cmaps, mode)` + `FontValidationError` —
    reports unregistered non-generic families and uncovered glyphs (the
    "héllo 👋 renders emoji in Chrome, tofu in Skia" bug). Generic and
    caller-supplied OS families are exempt, so a default-font Text never errors.

  New in `@glissade/scene`: `collectTextUsages(scene)`, `validateSceneFonts(scene,
doc, loadBytes, opts)` (node-walk + caller I/O → core validation), and
  `TextProps.fontStyle: 'normal' | 'italic'` threaded into `FontSpec` (omitted when
  normal, so goldens are unchanged).

  Strict-vs-dev is a per-render/per-export OPTION (default dev-warn), never a
  Timeline flag: `exportVideo({ strictFonts })`, `gs render --strict`, and a
  `mount({ strictFonts })` option. All three loaders now register EVERY declared
  face (not one-per-asset): export-web awaits each face before frame 0, the CLI
  registers each path via `GlobalFonts`, the player loads non-awaited.

- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0-pre.0
  - @glissade/scene@0.9.0-pre.0
  - @glissade/player@0.9.0-pre.0
  - @glissade/backend-skia@0.9.0-pre.0
  - @glissade/interact@0.9.0-pre.0
  - @glissade/lottie@0.9.0-pre.0
  - @glissade/narrate@0.9.0-pre.0
  - @glissade/sfx@0.9.0-pre.0
  - @glissade/svg@0.9.0-pre.0

## 0.8.1

### Patch Changes

- e338c7d: Fix `--provider kokoro` under pnpm (downstream canary findings on 0.8.1-pre.0):

  - **Resolve `kokoro-js` from the user's project, not from `@glissade/narrate`'s own location.** Under pnpm's isolated layout an optional peer isn't linked into narrate's store dir, so the bare `import('kokoro-js')` failed even when it was installed and loadable. It's now resolved via `createRequire(cwd).resolve('kokoro-js')` (falling back to this module for hoisted/global installs) and loaded through a computed `file://` import — which also keeps it out of any bundle.
  - **Surface the real error.** The `catch {}` that masked every failure as a generic "not found" now includes the actual error `code` + `message`, so resolution/load problems are diagnosable.
  - **Read the version without the non-exported subpath.** `kokoro-js` doesn't export `./package.json`; `version()` now walks up from the resolved entry instead of resolving that subpath (which threw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
  - **Docs:** package-manager-agnostic install, and a pnpm note that downstreams must allow/ignore the native build scripts (`onnxruntime-node` / `sharp` / `protobufjs`) or `pnpm install --frozen-lockfile` exits non-zero.

- 0f09b67: Add a **Kokoro** TTS provider (`--provider kokoro`) — an Apache-2.0, 82M-param neural voice that is markedly more natural than espeak/piper, fully offline on CPU, with no API key. Unlike piper there's no `pip install` or external binary: it runs **pure-Node** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js + onnxruntime), declared as an **optional peer dependency** — `npm i kokoro-js` only if you use it. The model downloads and caches on first use; pick a voice via the script's `voice` (e.g. `af_heart`) and the quant via `kokoroProvider({ dtype })` (`q8` default, `fp32` for top quality).

  Deterministic by construction: Kokoro inference uses a fixed voice/style embedding (not diffusion-sampled per call), so the same text re-synthesizes byte-identical — verified by a gated determinism test. `version()` pins the `kokoro-js` version + model + dtype, so any of those moving invalidates the per-segment cache. New exports from `@glissade/narrate/providers`: `kokoroProvider`, `floatToWav`, `KokoroDtype`.

- Updated dependencies [e338c7d]
- Updated dependencies [0f09b67]
  - @glissade/narrate@0.8.1
  - @glissade/backend-skia@0.8.1
  - @glissade/core@0.8.1
  - @glissade/interact@0.8.1
  - @glissade/lottie@0.8.1
  - @glissade/player@0.8.1
  - @glissade/scene@0.8.1
  - @glissade/sfx@0.8.1
  - @glissade/svg@0.8.1

## 0.8.1-pre.1

### Patch Changes

- e338c7d: Fix `--provider kokoro` under pnpm (downstream canary findings on 0.8.1-pre.0):

  - **Resolve `kokoro-js` from the user's project, not from `@glissade/narrate`'s own location.** Under pnpm's isolated layout an optional peer isn't linked into narrate's store dir, so the bare `import('kokoro-js')` failed even when it was installed and loadable. It's now resolved via `createRequire(cwd).resolve('kokoro-js')` (falling back to this module for hoisted/global installs) and loaded through a computed `file://` import — which also keeps it out of any bundle.
  - **Surface the real error.** The `catch {}` that masked every failure as a generic "not found" now includes the actual error `code` + `message`, so resolution/load problems are diagnosable.
  - **Read the version without the non-exported subpath.** `kokoro-js` doesn't export `./package.json`; `version()` now walks up from the resolved entry instead of resolving that subpath (which threw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
  - **Docs:** package-manager-agnostic install, and a pnpm note that downstreams must allow/ignore the native build scripts (`onnxruntime-node` / `sharp` / `protobufjs`) or `pnpm install --frozen-lockfile` exits non-zero.

- Updated dependencies [e338c7d]
  - @glissade/narrate@0.8.1-pre.1
  - @glissade/backend-skia@0.8.1-pre.1
  - @glissade/core@0.8.1-pre.1
  - @glissade/interact@0.8.1-pre.1
  - @glissade/lottie@0.8.1-pre.1
  - @glissade/player@0.8.1-pre.1
  - @glissade/scene@0.8.1-pre.1
  - @glissade/sfx@0.8.1-pre.1
  - @glissade/svg@0.8.1-pre.1

## 0.8.1-pre.0

### Patch Changes

- 0f09b67: Add a **Kokoro** TTS provider (`--provider kokoro`) — an Apache-2.0, 82M-param neural voice that is markedly more natural than espeak/piper, fully offline on CPU, with no API key. Unlike piper there's no `pip install` or external binary: it runs **pure-Node** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js + onnxruntime), declared as an **optional peer dependency** — `npm i kokoro-js` only if you use it. The model downloads and caches on first use; pick a voice via the script's `voice` (e.g. `af_heart`) and the quant via `kokoroProvider({ dtype })` (`q8` default, `fp32` for top quality).

  Deterministic by construction: Kokoro inference uses a fixed voice/style embedding (not diffusion-sampled per call), so the same text re-synthesizes byte-identical — verified by a gated determinism test. `version()` pins the `kokoro-js` version + model + dtype, so any of those moving invalidates the per-segment cache. New exports from `@glissade/narrate/providers`: `kokoroProvider`, `floatToWav`, `KokoroDtype`.

- Updated dependencies [0f09b67]
  - @glissade/narrate@0.8.1-pre.0
  - @glissade/backend-skia@0.8.1-pre.0
  - @glissade/core@0.8.1-pre.0
  - @glissade/interact@0.8.1-pre.0
  - @glissade/lottie@0.8.1-pre.0
  - @glissade/player@0.8.1-pre.0
  - @glissade/scene@0.8.1-pre.0
  - @glissade/sfx@0.8.1-pre.0
  - @glissade/svg@0.8.1-pre.0

## 0.8.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.

### Patch Changes

- dac15c9: Cue→chapters polish (downstream validation follow-ups on the 0.8 ad-break feature):

  - **Plain `cue()` now serializes.** `cue(at, name, data?)` stamps `data.kind: 'cue'` by default (a caller-supplied `kind` still wins), so a cue authored without an explicit kind now lands in `cues.json` and fires `player.onCue('cue', …)` instead of being silently dropped. The `data.kind` gate that excludes `.call()`/label markers stays intact.
  - **`--chapters vtt` shows the human title, not the kind.** The WebVTT cue text is now `data.title ?? name` (was the machine `kind`), and a `00:00` "Intro" chapter is auto-anchored when the earliest cue starts later — making the output a drop-in for a YouTube description chapter block (YouTube reads the cue text as the title and requires a 0:00 start). `cues.json` is unchanged (keeps `kind` for machines) and stays byte-deterministic.

- Updated dependencies [1d56c0a]
- Updated dependencies [dac15c9]
- Updated dependencies [dac15c9]
- Updated dependencies [012d9c0]
- Updated dependencies [1c9a303]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0
  - @glissade/player@0.8.0
  - @glissade/scene@0.8.0
  - @glissade/backend-skia@0.8.0
  - @glissade/interact@0.8.0
  - @glissade/lottie@0.8.0
  - @glissade/narrate@0.8.0
  - @glissade/sfx@0.8.0
  - @glissade/svg@0.8.0

## 0.8.0-pre.1

### Patch Changes

- dac15c9: Cue→chapters polish (downstream validation follow-ups on the 0.8 ad-break feature):

  - **Plain `cue()` now serializes.** `cue(at, name, data?)` stamps `data.kind: 'cue'` by default (a caller-supplied `kind` still wins), so a cue authored without an explicit kind now lands in `cues.json` and fires `player.onCue('cue', …)` instead of being silently dropped. The `data.kind` gate that excludes `.call()`/label markers stays intact.
  - **`--chapters vtt` shows the human title, not the kind.** The WebVTT cue text is now `data.title ?? name` (was the machine `kind`), and a `00:00` "Intro" chapter is auto-anchored when the earliest cue starts later — making the output a drop-in for a YouTube description chapter block (YouTube reads the cue text as the title and requires a 0:00 start). `cues.json` is unchanged (keeps `kind` for machines) and stays byte-deterministic.

- Updated dependencies [dac15c9]
- Updated dependencies [dac15c9]
  - @glissade/player@0.8.0-pre.1
  - @glissade/core@0.8.0-pre.1
  - @glissade/interact@0.8.0-pre.1
  - @glissade/backend-skia@0.8.0-pre.1
  - @glissade/lottie@0.8.0-pre.1
  - @glissade/narrate@0.8.0-pre.1
  - @glissade/scene@0.8.0-pre.1
  - @glissade/sfx@0.8.0-pre.1
  - @glissade/svg@0.8.0-pre.1

## 0.8.0-pre.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [012d9c0]
- Updated dependencies [1c9a303]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0-pre.0
  - @glissade/player@0.8.0-pre.0
  - @glissade/scene@0.8.0-pre.0
  - @glissade/backend-skia@0.8.0-pre.0
  - @glissade/interact@0.8.0-pre.0
  - @glissade/lottie@0.8.0-pre.0
  - @glissade/narrate@0.8.0-pre.0
  - @glissade/sfx@0.8.0-pre.0
  - @glissade/svg@0.8.0-pre.0

## 0.7.0

### Minor Changes

- 8f4fa6c: `gs render --range` is now **frame-indexed** (`--range 0..120` = inclusive frame indices), matching the spec's rule that export APIs take frames while Player APIs take seconds. Decimal/garbage ranges are rejected. New flags: `--frame N` (render a single still through the same path) and `--format png-seq` (force a PNG sequence even when `--out` looks like a video). `--workers` and `--watch` are recognized but print an honest not-yet-implemented note (parallel sharding is tracked separately). The programmatic `render({ range })` still accepts seconds for back-compat; new `frame`/`frameRange`/`format` options drive the frame-indexed path.

### Patch Changes

- 0c0a583: A/V sync offsets are now sample-accurate and identical across export paths by construction (§5.3). A new `audioOffsetSamples(at, sampleRate)` in core (`round(at * sampleRate)`) is the single source of truth: the CLI mixer derives its `adelay` from the sample grid instead of rounding to milliseconds, and the browser `OfflineAudioContext` mixer snaps clip starts (and gain-envelope times) to the same grid instead of using raw float seconds. Previously the two paths could drift sub-frame and a non-frame-aligned `at` passed through silently.
- 4317102: `gs render --frame N --out foo.png` now writes that single PNG file at the path, instead of creating a directory `foo.png/` containing `frame-0000N.png` + caption sidecars. A single frame to a `*.png` `--out` is a still; rendering into a directory still works with a directory `--out`. Reported downstream.
- 9aa42e6: Render-mode determinism guards (§5.5): `withDeterminismGuards(mode, fn)` from `@glissade/scene` patches the banned globals (`Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`) for the synchronous scope of a single `evaluate()` — throwing a `DeterminismViolationError` under `throw` mode (CLI/CI), warning-once-then-delegating under `warn` (dev), and always restoring them afterward. `gs render` now wraps every frame's `evaluate()` in `throw` mode, so a scene that reads a wall clock or unseeded random is rejected at render time instead of producing a silently nondeterministic export. This is the runtime backstop to the static `@glissade/eslint-plugin` rules.
- Updated dependencies [0c0a583]
- Updated dependencies [9a360b2]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [9aa42e6]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0
  - @glissade/scene@0.7.0
  - @glissade/backend-skia@0.7.0
  - @glissade/interact@0.7.0
  - @glissade/lottie@0.7.0
  - @glissade/narrate@0.7.0
  - @glissade/player@0.7.0
  - @glissade/sfx@0.7.0
  - @glissade/svg@0.7.0

## 0.7.0-pre.0

### Minor Changes

- 8f4fa6c: `gs render --range` is now **frame-indexed** (`--range 0..120` = inclusive frame indices), matching the spec's rule that export APIs take frames while Player APIs take seconds. Decimal/garbage ranges are rejected. New flags: `--frame N` (render a single still through the same path) and `--format png-seq` (force a PNG sequence even when `--out` looks like a video). `--workers` and `--watch` are recognized but print an honest not-yet-implemented note (parallel sharding is tracked separately). The programmatic `render({ range })` still accepts seconds for back-compat; new `frame`/`frameRange`/`format` options drive the frame-indexed path.

### Patch Changes

- 0c0a583: A/V sync offsets are now sample-accurate and identical across export paths by construction (§5.3). A new `audioOffsetSamples(at, sampleRate)` in core (`round(at * sampleRate)`) is the single source of truth: the CLI mixer derives its `adelay` from the sample grid instead of rounding to milliseconds, and the browser `OfflineAudioContext` mixer snaps clip starts (and gain-envelope times) to the same grid instead of using raw float seconds. Previously the two paths could drift sub-frame and a non-frame-aligned `at` passed through silently.
- 9aa42e6: Render-mode determinism guards (§5.5): `withDeterminismGuards(mode, fn)` from `@glissade/scene` patches the banned globals (`Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`) for the synchronous scope of a single `evaluate()` — throwing a `DeterminismViolationError` under `throw` mode (CLI/CI), warning-once-then-delegating under `warn` (dev), and always restoring them afterward. `gs render` now wraps every frame's `evaluate()` in `throw` mode, so a scene that reads a wall clock or unseeded random is rejected at render time instead of producing a silently nondeterministic export. This is the runtime backstop to the static `@glissade/eslint-plugin` rules.
- Updated dependencies [0c0a583]
- Updated dependencies [9a360b2]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [9aa42e6]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0-pre.0
  - @glissade/scene@0.7.0-pre.0
  - @glissade/backend-skia@0.7.0-pre.0
  - @glissade/interact@0.7.0-pre.0
  - @glissade/lottie@0.7.0-pre.0
  - @glissade/narrate@0.7.0-pre.0
  - @glissade/player@0.7.0-pre.0
  - @glissade/sfx@0.7.0-pre.0
  - @glissade/svg@0.7.0-pre.0

## 0.6.1

### Patch Changes

- Updated dependencies [c231e58]
  - @glissade/narrate@0.6.1
  - @glissade/backend-skia@0.6.1
  - @glissade/core@0.6.1
  - @glissade/interact@0.6.1
  - @glissade/lottie@0.6.1
  - @glissade/player@0.6.1
  - @glissade/scene@0.6.1
  - @glissade/sfx@0.6.1
  - @glissade/svg@0.6.1

## 0.6.0

### Minor Changes

- c5dbc0e: New `@glissade/svg` package: static SVG import. `importSvg(svgString)` parses an SVG document into a glissade scene — `<path d>` strings (full M/L/H/V/C/S/Q/T/A/Z command set, with arcs converted to native ellipse-arc segments), the basic shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`), `<g>` grouping, `transform` (translate/scale/rotate/matrix → node TRS), and fill/stroke/stroke-width with SVG presentation inheritance. Unsupported features (text, images, gradients, filters, masks) are dropped with warnings. Returns `{ size, root, warnings, toSceneModule() }`.

  `gs import` now accepts `.svg` alongside `.json`: it emits a scene module that defers to `importSvg` (the conversion's single source of truth), renderable by `gs render`.

### Patch Changes

- Updated dependencies [1aa2228]
- Updated dependencies [e249f0d]
- Updated dependencies [6c07c96]
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
- Updated dependencies [12c5841]
- Updated dependencies [c5dbc0e]
- Updated dependencies [977b3d5]
  - @glissade/narrate@0.6.0
  - @glissade/core@0.6.0
  - @glissade/scene@0.6.0
  - @glissade/svg@0.6.0
  - @glissade/backend-skia@0.6.0
  - @glissade/interact@0.6.0
  - @glissade/lottie@0.6.0
  - @glissade/player@0.6.0
  - @glissade/sfx@0.6.0

## 0.6.0-pre.1

### Minor Changes

- c5dbc0e: New `@glissade/svg` package: static SVG import. `importSvg(svgString)` parses an SVG document into a glissade scene — `<path d>` strings (full M/L/H/V/C/S/Q/T/A/Z command set, with arcs converted to native ellipse-arc segments), the basic shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`), `<g>` grouping, `transform` (translate/scale/rotate/matrix → node TRS), and fill/stroke/stroke-width with SVG presentation inheritance. Unsupported features (text, images, gradients, filters, masks) are dropped with warnings. Returns `{ size, root, warnings, toSceneModule() }`.

  `gs import` now accepts `.svg` alongside `.json`: it emits a scene module that defers to `importSvg` (the conversion's single source of truth), renderable by `gs render`.

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [c5dbc0e]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0-pre.1
  - @glissade/svg@0.6.0-pre.1
  - @glissade/scene@0.6.0-pre.1
  - @glissade/backend-skia@0.6.0-pre.1
  - @glissade/interact@0.6.0-pre.1
  - @glissade/lottie@0.6.0-pre.1
  - @glissade/narrate@0.6.0-pre.1
  - @glissade/player@0.6.0-pre.1
  - @glissade/sfx@0.6.0-pre.1

## 0.6.0-pre.0

### Patch Changes

- Updated dependencies [1aa2228]
- Updated dependencies [e249f0d]
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
  - @glissade/narrate@0.6.0-pre.0
  - @glissade/scene@0.6.0-pre.0
  - @glissade/backend-skia@0.6.0-pre.0
  - @glissade/interact@0.6.0-pre.0
  - @glissade/lottie@0.6.0-pre.0
  - @glissade/player@0.6.0-pre.0
  - @glissade/core@0.6.0-pre.0
  - @glissade/sfx@0.6.0-pre.0

## 0.5.0

### Minor Changes

- 27d4727: `gs prepare <scene>` — one command to materialize ALL of a scene's committed audio assets: it runs the narration prepare (if a `.narration.json` sibling exists), the sfx prepare (if a `.sfx.json` exists, anchors resolving against the narration timing), and then **imports the scene module** so any in-code sfx caches the author writes at module/timeline-build time (e.g. `renderSfxAssets` for `keystrokeClips`) are flushed too. It never calls `evaluate()` (a pure read that writes nothing); the import side-effects are the flush. A missing sibling or a failing import is a skip/warning, not an abort — so prepare is a no-op-friendly superset of `gs narrate` + `gs sfx`. After it, `gs render` is a pure read of committed files.
- 3af5f67: Piper provider + provider-independent word alignment. `piperProvider({ model })` adds local **neural** TTS (rhasspy/piper) — natural voice, offline, free, no key. The bigger change: word timing is now an alignment step decoupled from synthesis, because no real provider (espeak/openai/piper) emits word timestamps. After `synthesize()`, a segment without provider words is run through an aligner: `heuristic` (default — pure-JS syllable distribution, always available, deterministic), `vosk` (offline ASR via the optional `vosk` package — Apache-2.0, ~50 MB model, no Docker/Python/multi-GB download), or `none`. `vosk` derives timings against the audio and maps them onto the script tokens (`mapAsrToScript`, exported) so `segments[].words[i]` lines up with `wordBoxes()[i]`. Provider-supplied words always win. Set it with the script's `align` field or `gs narrate --align <id>`. Alignment runs only in the prepare step and is cached separately from audio (`wordsFrom`), so swapping aligners re-aligns the cached wav at zero synthesis cost. `synthesizeScript` gains `providerImpl`/`alignerImpl` instance overrides — the bring-your-own seam for custom providers (ElevenLabs, Azure) and aligners (whisper.cpp, MFA, …). Docs: a provider matrix and a "Word timing & alignment" section in the narration guide.
- adc00ba: `gs sfx` — the sound-effects prepare step + render auto-mix, closing the SFX zero-config loop (parity with narration/music). Write a `<scene>.sfx.json` with effect hits that anchor to a narration beat (`{ voice, anchor, offset }`, resolved against the sibling `*.narration.timing.json` so they re-flow on re-narrate) or use an absolute `at`. `gs sfx <scene>` resolves the times, renders the referenced voices once (deduped) to `<scene>.sfx-cache/`, bakes the deterministic index-seeded jitter into a committed `<scene>.sfx.timing.json`, and `gs render` auto-mixes that manifest with zero config (`--sfx off` opts out). Author-wired clips are detected and never doubled (the +6dB guard). v1 drives the procedural `sfxr` source; sample packs remain available from code via `@glissade/sfx`'s `buildSfxClips`.
- 1c53eeb: `gs sfx --verbose` echoes each resolved hit as `<time>s  <voice>` (plus gain/rate when jittered), so anchor coupling validates at a glance instead of reading the committed timing.json. `prepareSfx` now returns the resolved `clips` for programmatic use.

### Patch Changes

- 3af5f67: `gs render` now auto-mixes narration, closing the asymmetry a consumer flagged: 0.4.x auto-mixed a sibling music manifest but the narration voice still had to be hand-wired onto `timeline.audio` (the music manifest read the narration timing only to _duck_ the bed, never to add the voice). Now a sibling `<scene>.narration.timing.json` is discovered and its clips mixed automatically — scene + narration manifest → a voiced mp4, zero-config, the promise the music-parity framing implied. `--narration off` opts out. Author-wired clips are detected and never doubled (the same +6dB guard as the bed), and the browser-export path is unchanged (it mixes only `timeline.audio`, so wire `beats.clips()` there).
- Updated dependencies [763bd2f]
- Updated dependencies [2521fdc]
- Updated dependencies [ca2150f]
- Updated dependencies [e1865d2]
- Updated dependencies [363c7b7]
- Updated dependencies [1c53eeb]
- Updated dependencies [3af5f67]
- Updated dependencies [fcfb962]
- Updated dependencies [3383077]
- Updated dependencies [829b14d]
- Updated dependencies [43b326b]
- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [43b326b]
- Updated dependencies [adc7941]
- Updated dependencies [27b4b49]
- Updated dependencies [4495359]
  - @glissade/narrate@0.5.0
  - @glissade/scene@0.5.0
  - @glissade/sfx@0.5.0
  - @glissade/backend-skia@0.5.0
  - @glissade/interact@0.5.0
  - @glissade/lottie@0.5.0
  - @glissade/player@0.5.0
  - @glissade/core@0.5.0

## 0.5.0-pre.7

### Patch Changes

- Updated dependencies [763bd2f]
  - @glissade/narrate@0.5.0-pre.7
  - @glissade/backend-skia@0.5.0-pre.7
  - @glissade/core@0.5.0-pre.7
  - @glissade/interact@0.5.0-pre.7
  - @glissade/lottie@0.5.0-pre.7
  - @glissade/player@0.5.0-pre.7
  - @glissade/scene@0.5.0-pre.7
  - @glissade/sfx@0.5.0-pre.7

## 0.5.0-pre.6

### Minor Changes

- 27d4727: `gs prepare <scene>` — one command to materialize ALL of a scene's committed audio assets: it runs the narration prepare (if a `.narration.json` sibling exists), the sfx prepare (if a `.sfx.json` exists, anchors resolving against the narration timing), and then **imports the scene module** so any in-code sfx caches the author writes at module/timeline-build time (e.g. `renderSfxAssets` for `keystrokeClips`) are flushed too. It never calls `evaluate()` (a pure read that writes nothing); the import side-effects are the flush. A missing sibling or a failing import is a skip/warning, not an abort — so prepare is a no-op-friendly superset of `gs narrate` + `gs sfx`. After it, `gs render` is a pure read of committed files.

### Patch Changes

- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [adc7941]
  - @glissade/scene@0.5.0-pre.6
  - @glissade/backend-skia@0.5.0-pre.6
  - @glissade/interact@0.5.0-pre.6
  - @glissade/lottie@0.5.0-pre.6
  - @glissade/narrate@0.5.0-pre.6
  - @glissade/player@0.5.0-pre.6
  - @glissade/core@0.5.0-pre.6
  - @glissade/sfx@0.5.0-pre.6

## 0.5.0-pre.5

### Patch Changes

- Updated dependencies [2521fdc]
- Updated dependencies [4495359]
  - @glissade/narrate@0.5.0-pre.5
  - @glissade/scene@0.5.0-pre.5
  - @glissade/backend-skia@0.5.0-pre.5
  - @glissade/interact@0.5.0-pre.5
  - @glissade/lottie@0.5.0-pre.5
  - @glissade/player@0.5.0-pre.5
  - @glissade/core@0.5.0-pre.5
  - @glissade/sfx@0.5.0-pre.5

## 0.5.0-pre.4

### Minor Changes

- 1c53eeb: `gs sfx --verbose` echoes each resolved hit as `<time>s  <voice>` (plus gain/rate when jittered), so anchor coupling validates at a glance instead of reading the committed timing.json. `prepareSfx` now returns the resolved `clips` for programmatic use.

### Patch Changes

- Updated dependencies [ca2150f]
- Updated dependencies [1c53eeb]
  - @glissade/scene@0.5.0-pre.4
  - @glissade/narrate@0.5.0-pre.4
  - @glissade/backend-skia@0.5.0-pre.4
  - @glissade/interact@0.5.0-pre.4
  - @glissade/lottie@0.5.0-pre.4
  - @glissade/player@0.5.0-pre.4
  - @glissade/core@0.5.0-pre.4
  - @glissade/sfx@0.5.0-pre.4

## 0.5.0-pre.3

### Patch Changes

- Updated dependencies [e1865d2]
- Updated dependencies [43b326b]
- Updated dependencies [43b326b]
  - @glissade/scene@0.5.0-pre.3
  - @glissade/sfx@0.5.0-pre.3
  - @glissade/backend-skia@0.5.0-pre.3
  - @glissade/interact@0.5.0-pre.3
  - @glissade/lottie@0.5.0-pre.3
  - @glissade/narrate@0.5.0-pre.3
  - @glissade/player@0.5.0-pre.3
  - @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Minor Changes

- adc00ba: `gs sfx` — the sound-effects prepare step + render auto-mix, closing the SFX zero-config loop (parity with narration/music). Write a `<scene>.sfx.json` with effect hits that anchor to a narration beat (`{ voice, anchor, offset }`, resolved against the sibling `*.narration.timing.json` so they re-flow on re-narrate) or use an absolute `at`. `gs sfx <scene>` resolves the times, renders the referenced voices once (deduped) to `<scene>.sfx-cache/`, bakes the deterministic index-seeded jitter into a committed `<scene>.sfx.timing.json`, and `gs render` auto-mixes that manifest with zero config (`--sfx off` opts out). Author-wired clips are detected and never doubled (the +6dB guard). v1 drives the procedural `sfxr` source; sample packs remain available from code via `@glissade/sfx`'s `buildSfxClips`.

### Patch Changes

- Updated dependencies [363c7b7]
- Updated dependencies [3383077]
- Updated dependencies [829b14d]
- Updated dependencies [27b4b49]
  - @glissade/narrate@0.5.0-pre.2
  - @glissade/sfx@0.5.0-pre.2
  - @glissade/scene@0.5.0-pre.2
  - @glissade/backend-skia@0.5.0-pre.2
  - @glissade/interact@0.5.0-pre.2
  - @glissade/lottie@0.5.0-pre.2
  - @glissade/player@0.5.0-pre.2
  - @glissade/core@0.5.0-pre.2

## 0.5.0-pre.1

### Patch Changes

- Updated dependencies [fcfb962]
  - @glissade/narrate@0.5.0-pre.1
  - @glissade/backend-skia@0.5.0-pre.1
  - @glissade/core@0.5.0-pre.1
  - @glissade/interact@0.5.0-pre.1
  - @glissade/lottie@0.5.0-pre.1
  - @glissade/player@0.5.0-pre.1
  - @glissade/scene@0.5.0-pre.1

## 0.5.0-pre.0

### Minor Changes

- 3af5f67: Piper provider + provider-independent word alignment. `piperProvider({ model })` adds local **neural** TTS (rhasspy/piper) — natural voice, offline, free, no key. The bigger change: word timing is now an alignment step decoupled from synthesis, because no real provider (espeak/openai/piper) emits word timestamps. After `synthesize()`, a segment without provider words is run through an aligner: `heuristic` (default — pure-JS syllable distribution, always available, deterministic), `vosk` (offline ASR via the optional `vosk` package — Apache-2.0, ~50 MB model, no Docker/Python/multi-GB download), or `none`. `vosk` derives timings against the audio and maps them onto the script tokens (`mapAsrToScript`, exported) so `segments[].words[i]` lines up with `wordBoxes()[i]`. Provider-supplied words always win. Set it with the script's `align` field or `gs narrate --align <id>`. Alignment runs only in the prepare step and is cached separately from audio (`wordsFrom`), so swapping aligners re-aligns the cached wav at zero synthesis cost. `synthesizeScript` gains `providerImpl`/`alignerImpl` instance overrides — the bring-your-own seam for custom providers (ElevenLabs, Azure) and aligners (whisper.cpp, MFA, …). Docs: a provider matrix and a "Word timing & alignment" section in the narration guide.

### Patch Changes

- 3af5f67: `gs render` now auto-mixes narration, closing the asymmetry a consumer flagged: 0.4.x auto-mixed a sibling music manifest but the narration voice still had to be hand-wired onto `timeline.audio` (the music manifest read the narration timing only to _duck_ the bed, never to add the voice). Now a sibling `<scene>.narration.timing.json` is discovered and its clips mixed automatically — scene + narration manifest → a voiced mp4, zero-config, the promise the music-parity framing implied. `--narration off` opts out. Author-wired clips are detected and never doubled (the same +6dB guard as the bed), and the browser-export path is unchanged (it mixes only `timeline.audio`, so wire `beats.clips()` there).
- Updated dependencies [3af5f67]
  - @glissade/narrate@0.5.0-pre.0
  - @glissade/backend-skia@0.5.0-pre.0
  - @glissade/core@0.5.0-pre.0
  - @glissade/interact@0.5.0-pre.0
  - @glissade/lottie@0.5.0-pre.0
  - @glissade/player@0.5.0-pre.0
  - @glissade/scene@0.5.0-pre.0

## 0.4.5

### Patch Changes

- 70159ad: Adoption-report follow-ups. TokenHighlight ranges gain an `offset` target (`'<id>/<rangeId>/offset'` + .x/.y) — per-range shakes and nudges without moving sibling ranges (downstream's red-flip shake previously had to jitter the whole node). `gs render` auto-mix never double-adds the bed: when the timeline's audio already references the stem (any url spelling resolving to the same file), the bed is skipped with a note — a coherent duplicate measured +6dB downstream. Docs: em-derived padding guidance for tokenHighlight at high resolutions; gainDb override (not compose) semantics pinned.
- Updated dependencies [70159ad]
  - @glissade/scene@0.4.5
  - @glissade/backend-skia@0.4.5
  - @glissade/interact@0.4.5
  - @glissade/lottie@0.4.5
  - @glissade/narrate@0.4.5
  - @glissade/player@0.4.5
  - @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- 40f5a31: The two downstream feature requests, built from their production specs. `tokenHighlight(text, { ranges })` (scene): sub-line multi-color token highlights over wordBoxes — each range matches a token (whitespace-insensitive boundary-exact runs, or [wordIndex, wordIndex]) and carries its OWN animatable fill/opacity/progress/scale targets; ranges validate at construction and throw on copy drift at draw (rematch: true for animated text); wrap-spanning ranges produce one rect per line segment. Music manifest blessed (narrate): `*.music.timing.json` ({musicVersion, bpm, beatsPerCycle, cps, durationSec, offsetSec, stem, gainDb}) with the beat-0-equals-sample-0 invariant and cps↔bpm validation; `music(timing, at)` anchors (beat/cycle/nearestBeat/nextBeat/grid) mirror narration(); `m.clip()` composes bed gainDb (10^(dB/20) over the whole envelope) with duckEnvelope under a narration manifest. `gs render` auto-mix parity: a sibling music manifest with a stem joins the mix automatically, ducked under narration when both manifests sit next to the scene — the zero-config narrated-explainer-with-bed; `--music off` opts out.
- Updated dependencies [40f5a31]
  - @glissade/scene@0.4.4
  - @glissade/narrate@0.4.4
  - @glissade/backend-skia@0.4.4
  - @glissade/interact@0.4.4
  - @glissade/lottie@0.4.4
  - @glissade/player@0.4.4
  - @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- 2282bcb: The downstream-friction batch (driven by a consuming project's 0.3.0→0.4.2 report). `createMeasurer({ fonts })` in backend-skia + `setDefaultMeasurer()` in scene bless factory-time measurement — Text pulls and un-injected scenes fall back through the process default before the estimator, so component factories measure with the rasterizer's real metrics (scene-injected measurers still win). `springTo(endT, from, to, cfg)` in core returns the [launch, settle] key pair with the spring-duration arithmetic done — settle-ON-the-beat without hand math. `Text.wordBoxes()` trims whitespace that punctuation-gluing folds into a segment (' $' → '$'), so boxes cover exactly the ink. `AudioClip.gain` accepts keys-only envelopes (`{ keys }`); the meaningless-but-mandatory target string is gone (full Tracks still work structurally). `duckEnvelope(timing, opts)` in narrate derives the music-bed ducking gain from the narration manifest (segment windows, attack/release ramps, near-window merging) — upstreamed from downstream. `gs render` progress detects non-TTY stderr and emits sparse newline-terminated updates instead of an unbroken \r stream.
- Updated dependencies [2282bcb]
  - @glissade/scene@0.4.3
  - @glissade/backend-skia@0.4.3
  - @glissade/core@0.4.3
  - @glissade/narrate@0.4.3
  - @glissade/interact@0.4.3
  - @glissade/lottie@0.4.3
  - @glissade/player@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [53f6f9f]
  - @glissade/scene@0.4.2
  - @glissade/backend-skia@0.4.2
  - @glissade/interact@0.4.2
  - @glissade/lottie@0.4.2
  - @glissade/narrate@0.4.2
  - @glissade/player@0.4.2
  - @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [80d9ac1]
  - @glissade/scene@0.4.1
  - @glissade/interact@0.4.1
  - @glissade/backend-skia@0.4.1
  - @glissade/lottie@0.4.1
  - @glissade/narrate@0.4.1
  - @glissade/player@0.4.1
  - @glissade/core@0.4.1

## 0.4.0

### Minor Changes

- 613a00a: New package `@glissade/lottie` + `gs import` (Lottie S1): an import-only, fail-fast Lottie/bodymovin converter. Shape, null, solid, and image layers; full transform mapping (anchor sandwiches, parent chains incl. hidden parents, ip/op visibility wrappers, ease-shift onto arrival keys, hold and same-frame rewrites, arc-length-baked spatial tangents); painter-model shape denormalization to Path nodes with animated path morphing; el/rc kappa conversion (exact under animation, direction-aware winding for nonzero holes); merge-paths mode 1. Everything outside the cut rejects in ONE error enumerating every problem (`--allow-degraded` downgrades expressions and exotic merge modes to warnings). Output is a plain SceneModule + v1 Timeline — render, studio, machines, and export consume it unchanged. Byte-deterministic across processes; never mutates its input.
- cc57dfc: TTS narration + caption primitives. `@glissade/narrate` (new): narration scripts collocated with scenes, pluggable TTS providers (espeak / openai / deterministic fake) behind an explicit `gs narrate` prepare step with sha256 segment caching, narration-derived timeline anchors (`narration(timing).start('seg')`), captions as hold-key string tracks + safe-area caption nodes (16:9 and 9:16), and `.srt`/`.vtt` exporters. CLI: `gs narrate` command and `gs render --captions burn|sidecar|off` with sidecars that match the burned timing by construction. Render stays fully offline after prepare.

### Patch Changes

- Updated dependencies [056817c]
- Updated dependencies [869d406]
- Updated dependencies [613a00a]
- Updated dependencies [cc57dfc]
- Updated dependencies [3986798]
  - @glissade/scene@0.4.0
  - @glissade/lottie@0.4.0
  - @glissade/narrate@0.4.0
  - @glissade/backend-skia@0.4.0
  - @glissade/interact@0.4.0
  - @glissade/player@0.4.0
  - @glissade/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [fbb12ca]
- Updated dependencies [ab8ca37]
- Updated dependencies [bc9add6]
- Updated dependencies [e89c3d0]
  - @glissade/scene@0.3.0
  - @glissade/backend-skia@0.3.0
  - @glissade/core@0.3.0
  - @glissade/interact@0.3.0
  - @glissade/player@0.3.0

## 0.2.0

### Minor Changes

- 1693a55: Record → replay → bake (v2 addendum §A.6/§C.5). `@glissade/interact`: `InputTrace` (event list, raw pre-filter values at raw timestamps), `recordTrace` (transparent tap on input writes), `bakeTrace` (frame-quantized replay through a fresh machine → a plain version-1 linear Timeline, bit-deterministic per trace), `hashMachine` trace identity covering referenced timeline documents, and `MachineSpec` — the scene-module machine declaration. Machines additionally expose `doc`, `hash`, `hasStepped`, and `sampleTargets`. `@glissade/cli`: `gs render --trace/--state/--force` (machines without an export story are a build error), and `gs dev [--record]` — an esbuild-served harness that mounts the module's machines and writes `.trace.json` sidecars on stop.

### Patch Changes

- Updated dependencies [715be32]
- Updated dependencies [dcb28f2]
- Updated dependencies [1d2fd20]
- Updated dependencies [1693a55]
  - @glissade/interact@0.2.0
  - @glissade/core@0.2.0
  - @glissade/player@0.2.0
  - @glissade/scene@0.2.0
  - @glissade/backend-skia@0.2.0

## 0.1.0

### Minor Changes

- First public release.

  glissade is a TypeScript framework for programmatic motion graphics built on
  one contract: `evaluate(scene, timeline, t)` is a pure function of time. No
  generator functions — animations are serializable keyframe documents authored
  via a fluent builder or raw data.

  - Pull-based signals (lazy, cached, dependency-tracked) driving a
    renderer-agnostic scene graph with a flat DisplayList IR
  - Canvas 2D (browser) and Skia (headless CLI) backends with golden-frame CI:
    frames byte-compare across machines on a pinned toolchain — including text
    (explicit fonts) and flexbox layout (Yoga behind the LayoutEngine seam)
  - `gs render` CLI: PNG sequences or mp4/webm with mixed audio, encoder
    feature detection, video assets via FFmpeg extraction
  - In-browser export via WebCodecs + Mediabunny, faster than realtime, with
    sample-accurate OfflineAudioContext audio and bidirectional video scrub
  - Time-based Player with a Driver seam (rAF clock, scroll), `<gs-player>`
    custom element (~1 kB), React bindings
  - `bake()`: stateful simulation compiled to ordinary keyframe tracks
  - A React studio with draggable keyframes persisted to git-diffable sidecars
    that survive code edits

### Patch Changes

- Updated dependencies
  - @glissade/core@0.1.0
  - @glissade/scene@0.1.0
  - @glissade/backend-skia@0.1.0
