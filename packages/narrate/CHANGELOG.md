# @glissade/narrate

## 0.10.1-pre.1

### Patch Changes

- Updated dependencies [f9f7ebe]
  - @glissade/core@0.10.1-pre.1
  - @glissade/scene@0.10.1-pre.1

## 0.10.1-pre.0

### Patch Changes

- Updated dependencies [7482378]
  - @glissade/core@0.10.1-pre.0
  - @glissade/scene@0.10.1-pre.0

## 0.10.0

### Patch Changes

- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
- Updated dependencies [b2f1fd7]
- Updated dependencies [278ea05]
- Updated dependencies [e4190b5]
- Updated dependencies [680f8ae]
- Updated dependencies [0cc640f]
- Updated dependencies [0a1844c]
  - @glissade/scene@0.10.0
  - @glissade/core@0.10.0

## 0.10.0-pre.1

### Patch Changes

- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
  - @glissade/scene@0.10.0-pre.1
  - @glissade/core@0.10.0-pre.1

## 0.10.0-pre.0

### Patch Changes

- Updated dependencies [b2f1fd7]
- Updated dependencies [278ea05]
- Updated dependencies [680f8ae]
- Updated dependencies [0cc640f]
- Updated dependencies [0a1844c]
  - @glissade/core@0.10.0-pre.0
  - @glissade/scene@0.10.0-pre.0

## 0.9.1

### Patch Changes

- @glissade/core@0.9.1
- @glissade/scene@0.9.1

## 0.9.1-pre.0

### Patch Changes

- @glissade/core@0.9.1-pre.0
- @glissade/scene@0.9.1-pre.0

## 0.9.0

### Patch Changes

- Updated dependencies [f3b471b]
- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0
  - @glissade/scene@0.9.0

## 0.9.0-pre.1

### Patch Changes

- Updated dependencies [f3b471b]
  - @glissade/core@0.9.0-pre.1
  - @glissade/scene@0.9.0-pre.1

## 0.9.0-pre.0

### Patch Changes

- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0-pre.0
  - @glissade/scene@0.9.0-pre.0

## 0.8.1

### Patch Changes

- e338c7d: Fix `--provider kokoro` under pnpm (downstream canary findings on 0.8.1-pre.0):

  - **Resolve `kokoro-js` from the user's project, not from `@glissade/narrate`'s own location.** Under pnpm's isolated layout an optional peer isn't linked into narrate's store dir, so the bare `import('kokoro-js')` failed even when it was installed and loadable. It's now resolved via `createRequire(cwd).resolve('kokoro-js')` (falling back to this module for hoisted/global installs) and loaded through a computed `file://` import — which also keeps it out of any bundle.
  - **Surface the real error.** The `catch {}` that masked every failure as a generic "not found" now includes the actual error `code` + `message`, so resolution/load problems are diagnosable.
  - **Read the version without the non-exported subpath.** `kokoro-js` doesn't export `./package.json`; `version()` now walks up from the resolved entry instead of resolving that subpath (which threw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
  - **Docs:** package-manager-agnostic install, and a pnpm note that downstreams must allow/ignore the native build scripts (`onnxruntime-node` / `sharp` / `protobufjs`) or `pnpm install --frozen-lockfile` exits non-zero.

- 0f09b67: Add a **Kokoro** TTS provider (`--provider kokoro`) — an Apache-2.0, 82M-param neural voice that is markedly more natural than espeak/piper, fully offline on CPU, with no API key. Unlike piper there's no `pip install` or external binary: it runs **pure-Node** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js + onnxruntime), declared as an **optional peer dependency** — `npm i kokoro-js` only if you use it. The model downloads and caches on first use; pick a voice via the script's `voice` (e.g. `af_heart`) and the quant via `kokoroProvider({ dtype })` (`q8` default, `fp32` for top quality).

  Deterministic by construction: Kokoro inference uses a fixed voice/style embedding (not diffusion-sampled per call), so the same text re-synthesizes byte-identical — verified by a gated determinism test. `version()` pins the `kokoro-js` version + model + dtype, so any of those moving invalidates the per-segment cache. New exports from `@glissade/narrate/providers`: `kokoroProvider`, `floatToWav`, `KokoroDtype`.

  - @glissade/core@0.8.1
  - @glissade/scene@0.8.1

## 0.8.1-pre.1

### Patch Changes

- e338c7d: Fix `--provider kokoro` under pnpm (downstream canary findings on 0.8.1-pre.0):

  - **Resolve `kokoro-js` from the user's project, not from `@glissade/narrate`'s own location.** Under pnpm's isolated layout an optional peer isn't linked into narrate's store dir, so the bare `import('kokoro-js')` failed even when it was installed and loadable. It's now resolved via `createRequire(cwd).resolve('kokoro-js')` (falling back to this module for hoisted/global installs) and loaded through a computed `file://` import — which also keeps it out of any bundle.
  - **Surface the real error.** The `catch {}` that masked every failure as a generic "not found" now includes the actual error `code` + `message`, so resolution/load problems are diagnosable.
  - **Read the version without the non-exported subpath.** `kokoro-js` doesn't export `./package.json`; `version()` now walks up from the resolved entry instead of resolving that subpath (which threw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
  - **Docs:** package-manager-agnostic install, and a pnpm note that downstreams must allow/ignore the native build scripts (`onnxruntime-node` / `sharp` / `protobufjs`) or `pnpm install --frozen-lockfile` exits non-zero.
  - @glissade/core@0.8.1-pre.1
  - @glissade/scene@0.8.1-pre.1

## 0.8.1-pre.0

### Patch Changes

- 0f09b67: Add a **Kokoro** TTS provider (`--provider kokoro`) — an Apache-2.0, 82M-param neural voice that is markedly more natural than espeak/piper, fully offline on CPU, with no API key. Unlike piper there's no `pip install` or external binary: it runs **pure-Node** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js + onnxruntime), declared as an **optional peer dependency** — `npm i kokoro-js` only if you use it. The model downloads and caches on first use; pick a voice via the script's `voice` (e.g. `af_heart`) and the quant via `kokoroProvider({ dtype })` (`q8` default, `fp32` for top quality).

  Deterministic by construction: Kokoro inference uses a fixed voice/style embedding (not diffusion-sampled per call), so the same text re-synthesizes byte-identical — verified by a gated determinism test. `version()` pins the `kokoro-js` version + model + dtype, so any of those moving invalidates the per-segment cache. New exports from `@glissade/narrate/providers`: `kokoroProvider`, `floatToWav`, `KokoroDtype`.

  - @glissade/core@0.8.1-pre.0
  - @glissade/scene@0.8.1-pre.0

## 0.8.0

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [dac15c9]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0
  - @glissade/scene@0.8.0

## 0.8.0-pre.1

### Patch Changes

- Updated dependencies [dac15c9]
  - @glissade/core@0.8.0-pre.1
  - @glissade/scene@0.8.0-pre.1

## 0.8.0-pre.0

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0-pre.0
  - @glissade/scene@0.8.0-pre.0

## 0.7.0

### Patch Changes

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

## 0.7.0-pre.0

### Patch Changes

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

## 0.6.1

### Patch Changes

- c231e58: Fix `piper` provider: a bare voice filename like `"voice": "en_US-joe-medium.onnx"` now works. piper-tts 1.x's `--model` needs a filesystem path (or a downloadable voice key), not a bare `.onnx` name, so it failed with `Unable to find voice`. The provider now resolves the voice before spawn — an existing path is used as-is; a bare `<name>`/`<name>.onnx` is looked up under `piperProvider({ voicesDir })` → `PIPER_VOICES` env → `~/.local/share/piper-voices`; a `.onnx` name that resolves nowhere raises a clear error naming the dir; a bare key (no `.onnx`) passes through so piper can download it. Piper failures now surface the **tail** of stderr (where the Python exception actually is) instead of the truncated head. Reported downstream.
  - @glissade/core@0.6.1
  - @glissade/scene@0.6.1

## 0.6.0

### Minor Changes

- e249f0d: Caption split-cues — a long narration segment can split into timed sub-cues instead of overflowing or shrinking to the floor. Opt in with `captionSplit: { maxChars }` in the script; it's persisted into the timing manifest so `captionTrack` (burned) and `toSrt`/`toVtt` (sidecars) all call the same exported `splitCaption(segment, maxChars)` and split at identical boundaries — chunking on word boundaries and timing each sub-cue from its first word (per-word alignment), or dividing the window evenly when words are absent. Omitted by default ⇒ no split ⇒ byte-identical.

### Patch Changes

- 1aa2228: `captionNode` autoFit now computes the fitted font and its actual wrapped line count together, so the bottom-anchor always agrees with the draw — including at the `minScale` floor, where the wrap can still exceed `maxLines` (a best-effort regime; split the segment to truly fit). No change to non-floor output.
- Updated dependencies [6c07c96]
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
- Updated dependencies [12c5841]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0
  - @glissade/scene@0.6.0

## 0.6.0-pre.1

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0-pre.1
  - @glissade/scene@0.6.0-pre.1

## 0.6.0-pre.0

### Minor Changes

- e249f0d: Caption split-cues — a long narration segment can split into timed sub-cues instead of overflowing or shrinking to the floor. Opt in with `captionSplit: { maxChars }` in the script; it's persisted into the timing manifest so `captionTrack` (burned) and `toSrt`/`toVtt` (sidecars) all call the same exported `splitCaption(segment, maxChars)` and split at identical boundaries — chunking on word boundaries and timing each sub-cue from its first word (per-word alignment), or dividing the window evenly when words are absent. Omitted by default ⇒ no split ⇒ byte-identical.

### Patch Changes

- 1aa2228: `captionNode` autoFit now computes the fitted font and its actual wrapped line count together, so the bottom-anchor always agrees with the draw — including at the `minScale` floor, where the wrap can still exceed `maxLines` (a best-effort regime; split the segment to truly fit). No change to non-floor output.
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
  - @glissade/scene@0.6.0-pre.0
  - @glissade/core@0.6.0-pre.0

## 0.5.0

### Minor Changes

- 763bd2f: `captionNode`'s long-caption fit (auto-shrink + bottom-anchor) is now **opt-in** via `{ autoFit: true }`, off by default. It re-flows multi-line burned captions, so leaving it off keeps captionNode byte-identical for existing scenes (a strict additive contract — no golden shifts on upgrade). Enable it for muted 9:16 cutdowns where burned captions are load-bearing: `captionNode(SIZE, { autoFit: true, maxLines: 3 })`. `maxLines`/`minScale` apply only when `autoFit` is set.
- 2521fdc: `captionNode` now keeps long narration segments in-frame — the overflow that forced `--captions sidecar` on muted 9:16 cutdowns. A long caption used to wrap to many lines and run off the bottom; the node now **auto-shrinks** the font until the wrap fits `maxLines` (default 2, floored at `minScale` = 0.7× the base size) and **bottom-anchors** the block so extra lines grow upward into the safe area instead of off the edge. Both are pull-bound and deterministic (golden-covered, landscape + portrait). Short captions are byte-identical to before; tune via `{ maxLines, minScale }`.
- 363c7b7: Pause beats: pacing as first-class, addressable narration data. A narration script may now interleave `{ "pause": <seconds>, "id": "...", "bed": "hold" | "silence" | "swell" }` elements between segments. A pause is an addressable **window**, not dead air — it produces the same anchors a segment does (`beats.start/end/duration('id')`, plus `beats.at('id', offset)` for sub-beats and `beats.labels()` entries), supplies its own silence (suppressing the default inter-segment `gap` around it), and shifts every later segment's start, so the whole track re-flows on re-narrate.

  The per-pause `bed` mode threads into `duckEnvelope`: `hold` (default) keeps the bed ducked across the pause, `silence` cuts it to a floor (`{ silence }` to set the level, default 0), `swell` lets it breathe back to base while the voice rests. `duckEnvelope` was reworked to a per-transition ramp model that handles contiguous different-level windows correctly; its output for pause-free manifests is byte-identical to before. The manifest gains an optional `pauses: TimedPause[]`; `narration()` resolves segments and pauses in one id namespace (collisions throw). Pure manifest data — golden-stable.

- 1c53eeb: `narration(timing).require([ids])` — a build-time fast-fail that asserts every referenced beat id exists in the manifest, throwing ONE error listing ALL unknown ids at once (e.g. after rewiring/splitting segment ids, instead of discovering stale refs one render at a time). Returns the anchors, so it chains: `const beats = narration(timing).require(['intro', 'beat', 'outro'])`. The error lists the available ids, like the per-lookup message.
- 3af5f67: Piper provider + provider-independent word alignment. `piperProvider({ model })` adds local **neural** TTS (rhasspy/piper) — natural voice, offline, free, no key. The bigger change: word timing is now an alignment step decoupled from synthesis, because no real provider (espeak/openai/piper) emits word timestamps. After `synthesize()`, a segment without provider words is run through an aligner: `heuristic` (default — pure-JS syllable distribution, always available, deterministic), `vosk` (offline ASR via the optional `vosk` package — Apache-2.0, ~50 MB model, no Docker/Python/multi-GB download), or `none`. `vosk` derives timings against the audio and maps them onto the script tokens (`mapAsrToScript`, exported) so `segments[].words[i]` lines up with `wordBoxes()[i]`. Provider-supplied words always win. Set it with the script's `align` field or `gs narrate --align <id>`. Alignment runs only in the prepare step and is cached separately from audio (`wordsFrom`), so swapping aligners re-aligns the cached wav at zero synthesis cost. `synthesizeScript` gains `providerImpl`/`alignerImpl` instance overrides — the bring-your-own seam for custom providers (ElevenLabs, Azure) and aligners (whisper.cpp, MFA, …). Docs: a provider matrix and a "Word timing & alignment" section in the narration guide.

### Patch Changes

- fcfb962: Piper detection fix + Vosk via `vosk-align` (validated on real audio). `piperProvider.version()` now gates on `spawnSync` ENOENT, not exit code — piper-tts 1.x has no `--version` action (argparse exits non-zero), so the old check false-rejected a perfectly good install. The `vosk` aligner now shells out to a `vosk-align` command (Apache-2.0 Python Vosk + ffmpeg, JSON `{words:[{word,start,end}]}` on stdout) instead of the npm `vosk` package, whose `ffi-napi` native build is broken on modern Node; this also removes the now-redundant pure-JS WAV decode/resample (ffmpeg handles it). Find the command via `VOSK_ALIGN` (default `vosk-align`). The full piper→heuristic and piper→vosk pipelines were verified end-to-end against real piper-tts 1.4.2 + vosk-align, including graceful interpolation of words Vosk mis-recognizes.
- 3383077: `piperProvider` is now deterministic by default. VITS adds noise (generator + a stochastic duration predictor), so vanilla piper re-synthesizes the same text to slightly different audio/durations — which re-pins any goldens anchored to narration timing. glissade now passes `--noise-scale 0 --noise-w-scale 0`, making re-synthesis byte-identical (verified end-to-end on real piper-tts 1.4.2). Opt into piper's natural-but-drifting prosody via `piperProvider({ noiseScale: 0.667, noiseWScale: 0.8 })` + `providerImpl`. The noise mode is part of the provider version, so switching deterministic↔natural invalidates the cache.
- Updated dependencies [ca2150f]
- Updated dependencies [e1865d2]
- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [43b326b]
- Updated dependencies [adc7941]
- Updated dependencies [27b4b49]
- Updated dependencies [4495359]
  - @glissade/scene@0.5.0
  - @glissade/core@0.5.0

## 0.5.0-pre.7

### Minor Changes

- 763bd2f: `captionNode`'s long-caption fit (auto-shrink + bottom-anchor) is now **opt-in** via `{ autoFit: true }`, off by default. It re-flows multi-line burned captions, so leaving it off keeps captionNode byte-identical for existing scenes (a strict additive contract — no golden shifts on upgrade). Enable it for muted 9:16 cutdowns where burned captions are load-bearing: `captionNode(SIZE, { autoFit: true, maxLines: 3 })`. `maxLines`/`minScale` apply only when `autoFit` is set.

### Patch Changes

- @glissade/core@0.5.0-pre.7
- @glissade/scene@0.5.0-pre.7

## 0.5.0-pre.6

### Patch Changes

- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [adc7941]
  - @glissade/scene@0.5.0-pre.6
  - @glissade/core@0.5.0-pre.6

## 0.5.0-pre.5

### Minor Changes

- 2521fdc: `captionNode` now keeps long narration segments in-frame — the overflow that forced `--captions sidecar` on muted 9:16 cutdowns. A long caption used to wrap to many lines and run off the bottom; the node now **auto-shrinks** the font until the wrap fits `maxLines` (default 2, floored at `minScale` = 0.7× the base size) and **bottom-anchors** the block so extra lines grow upward into the safe area instead of off the edge. Both are pull-bound and deterministic (golden-covered, landscape + portrait). Short captions are byte-identical to before; tune via `{ maxLines, minScale }`.

### Patch Changes

- Updated dependencies [4495359]
  - @glissade/scene@0.5.0-pre.5
  - @glissade/core@0.5.0-pre.5

## 0.5.0-pre.4

### Minor Changes

- 1c53eeb: `narration(timing).require([ids])` — a build-time fast-fail that asserts every referenced beat id exists in the manifest, throwing ONE error listing ALL unknown ids at once (e.g. after rewiring/splitting segment ids, instead of discovering stale refs one render at a time). Returns the anchors, so it chains: `const beats = narration(timing).require(['intro', 'beat', 'outro'])`. The error lists the available ids, like the per-lookup message.

### Patch Changes

- Updated dependencies [ca2150f]
  - @glissade/scene@0.5.0-pre.4
  - @glissade/core@0.5.0-pre.4

## 0.5.0-pre.3

### Patch Changes

- Updated dependencies [e1865d2]
- Updated dependencies [43b326b]
  - @glissade/scene@0.5.0-pre.3
  - @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Minor Changes

- 363c7b7: Pause beats: pacing as first-class, addressable narration data. A narration script may now interleave `{ "pause": <seconds>, "id": "...", "bed": "hold" | "silence" | "swell" }` elements between segments. A pause is an addressable **window**, not dead air — it produces the same anchors a segment does (`beats.start/end/duration('id')`, plus `beats.at('id', offset)` for sub-beats and `beats.labels()` entries), supplies its own silence (suppressing the default inter-segment `gap` around it), and shifts every later segment's start, so the whole track re-flows on re-narrate.

  The per-pause `bed` mode threads into `duckEnvelope`: `hold` (default) keeps the bed ducked across the pause, `silence` cuts it to a floor (`{ silence }` to set the level, default 0), `swell` lets it breathe back to base while the voice rests. `duckEnvelope` was reworked to a per-transition ramp model that handles contiguous different-level windows correctly; its output for pause-free manifests is byte-identical to before. The manifest gains an optional `pauses: TimedPause[]`; `narration()` resolves segments and pauses in one id namespace (collisions throw). Pure manifest data — golden-stable.

### Patch Changes

- 3383077: `piperProvider` is now deterministic by default. VITS adds noise (generator + a stochastic duration predictor), so vanilla piper re-synthesizes the same text to slightly different audio/durations — which re-pins any goldens anchored to narration timing. glissade now passes `--noise-scale 0 --noise-w-scale 0`, making re-synthesis byte-identical (verified end-to-end on real piper-tts 1.4.2). Opt into piper's natural-but-drifting prosody via `piperProvider({ noiseScale: 0.667, noiseWScale: 0.8 })` + `providerImpl`. The noise mode is part of the provider version, so switching deterministic↔natural invalidates the cache.
- Updated dependencies [27b4b49]
  - @glissade/scene@0.5.0-pre.2
  - @glissade/core@0.5.0-pre.2

## 0.5.0-pre.1

### Patch Changes

- fcfb962: Piper detection fix + Vosk via `vosk-align` (validated on real audio). `piperProvider.version()` now gates on `spawnSync` ENOENT, not exit code — piper-tts 1.x has no `--version` action (argparse exits non-zero), so the old check false-rejected a perfectly good install. The `vosk` aligner now shells out to a `vosk-align` command (Apache-2.0 Python Vosk + ffmpeg, JSON `{words:[{word,start,end}]}` on stdout) instead of the npm `vosk` package, whose `ffi-napi` native build is broken on modern Node; this also removes the now-redundant pure-JS WAV decode/resample (ffmpeg handles it). Find the command via `VOSK_ALIGN` (default `vosk-align`). The full piper→heuristic and piper→vosk pipelines were verified end-to-end against real piper-tts 1.4.2 + vosk-align, including graceful interpolation of words Vosk mis-recognizes.
  - @glissade/core@0.5.0-pre.1
  - @glissade/scene@0.5.0-pre.1

## 0.5.0-pre.0

### Minor Changes

- 3af5f67: Piper provider + provider-independent word alignment. `piperProvider({ model })` adds local **neural** TTS (rhasspy/piper) — natural voice, offline, free, no key. The bigger change: word timing is now an alignment step decoupled from synthesis, because no real provider (espeak/openai/piper) emits word timestamps. After `synthesize()`, a segment without provider words is run through an aligner: `heuristic` (default — pure-JS syllable distribution, always available, deterministic), `vosk` (offline ASR via the optional `vosk` package — Apache-2.0, ~50 MB model, no Docker/Python/multi-GB download), or `none`. `vosk` derives timings against the audio and maps them onto the script tokens (`mapAsrToScript`, exported) so `segments[].words[i]` lines up with `wordBoxes()[i]`. Provider-supplied words always win. Set it with the script's `align` field or `gs narrate --align <id>`. Alignment runs only in the prepare step and is cached separately from audio (`wordsFrom`), so swapping aligners re-aligns the cached wav at zero synthesis cost. `synthesizeScript` gains `providerImpl`/`alignerImpl` instance overrides — the bring-your-own seam for custom providers (ElevenLabs, Azure) and aligners (whisper.cpp, MFA, …). Docs: a provider matrix and a "Word timing & alignment" section in the narration guide.

### Patch Changes

- @glissade/core@0.5.0-pre.0
- @glissade/scene@0.5.0-pre.0

## 0.4.5

### Patch Changes

- Updated dependencies [70159ad]
  - @glissade/scene@0.4.5
  - @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- 40f5a31: The two downstream feature requests, built from their production specs. `tokenHighlight(text, { ranges })` (scene): sub-line multi-color token highlights over wordBoxes — each range matches a token (whitespace-insensitive boundary-exact runs, or [wordIndex, wordIndex]) and carries its OWN animatable fill/opacity/progress/scale targets; ranges validate at construction and throw on copy drift at draw (rematch: true for animated text); wrap-spanning ranges produce one rect per line segment. Music manifest blessed (narrate): `*.music.timing.json` ({musicVersion, bpm, beatsPerCycle, cps, durationSec, offsetSec, stem, gainDb}) with the beat-0-equals-sample-0 invariant and cps↔bpm validation; `music(timing, at)` anchors (beat/cycle/nearestBeat/nextBeat/grid) mirror narration(); `m.clip()` composes bed gainDb (10^(dB/20) over the whole envelope) with duckEnvelope under a narration manifest. `gs render` auto-mix parity: a sibling music manifest with a stem joins the mix automatically, ducked under narration when both manifests sit next to the scene — the zero-config narrated-explainer-with-bed; `--music off` opts out.
- Updated dependencies [40f5a31]
  - @glissade/scene@0.4.4
  - @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- 2282bcb: The downstream-friction batch (driven by a consuming project's 0.3.0→0.4.2 report). `createMeasurer({ fonts })` in backend-skia + `setDefaultMeasurer()` in scene bless factory-time measurement — Text pulls and un-injected scenes fall back through the process default before the estimator, so component factories measure with the rasterizer's real metrics (scene-injected measurers still win). `springTo(endT, from, to, cfg)` in core returns the [launch, settle] key pair with the spring-duration arithmetic done — settle-ON-the-beat without hand math. `Text.wordBoxes()` trims whitespace that punctuation-gluing folds into a segment (' $' → '$'), so boxes cover exactly the ink. `AudioClip.gain` accepts keys-only envelopes (`{ keys }`); the meaningless-but-mandatory target string is gone (full Tracks still work structurally). `duckEnvelope(timing, opts)` in narrate derives the music-bed ducking gain from the narration manifest (segment windows, attack/release ramps, near-window merging) — upstreamed from downstream. `gs render` progress detects non-TTY stderr and emits sparse newline-terminated updates instead of an unbroken \r stream.
- Updated dependencies [2282bcb]
  - @glissade/scene@0.4.3
  - @glissade/core@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [53f6f9f]
  - @glissade/scene@0.4.2
  - @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [80d9ac1]
  - @glissade/scene@0.4.1
  - @glissade/core@0.4.1

## 0.4.0

### Minor Changes

- cc57dfc: TTS narration + caption primitives. `@glissade/narrate` (new): narration scripts collocated with scenes, pluggable TTS providers (espeak / openai / deterministic fake) behind an explicit `gs narrate` prepare step with sha256 segment caching, narration-derived timeline anchors (`narration(timing).start('seg')`), captions as hold-key string tracks + safe-area caption nodes (16:9 and 9:16), and `.srt`/`.vtt` exporters. CLI: `gs narrate` command and `gs render --captions burn|sidecar|off` with sidecars that match the burned timing by construction. Render stays fully offline after prepare.

### Patch Changes

- Updated dependencies [056817c]
- Updated dependencies [869d406]
- Updated dependencies [3986798]
  - @glissade/scene@0.4.0
  - @glissade/core@0.4.0
