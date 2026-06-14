# @glissade/narrate

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
