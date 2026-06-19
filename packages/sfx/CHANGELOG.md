# @glissade/sfx

## 0.12.0-pre.1

### Patch Changes

- Updated dependencies [78393f1]
  - @glissade/core@0.12.0-pre.1

## 0.12.0-pre.0

### Patch Changes

- Updated dependencies [2850386]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
  - @glissade/core@0.12.0-pre.0

## 0.11.0

### Patch Changes

- Updated dependencies [c7c6660]
  - @glissade/core@0.11.0

## 0.11.0-pre.1

### Patch Changes

- @glissade/core@0.11.0-pre.1

## 0.11.0-pre.0

### Patch Changes

- Updated dependencies [c7c6660]
  - @glissade/core@0.11.0-pre.0

## 0.10.1

### Patch Changes

- Updated dependencies [f9f7ebe]
- Updated dependencies [7482378]
  - @glissade/core@0.10.1

## 0.10.1-pre.1

### Patch Changes

- Updated dependencies [f9f7ebe]
  - @glissade/core@0.10.1-pre.1

## 0.10.1-pre.0

### Patch Changes

- Updated dependencies [7482378]
  - @glissade/core@0.10.1-pre.0

## 0.10.0

### Patch Changes

- Updated dependencies [fbdcc44]
- Updated dependencies [b2f1fd7]
- Updated dependencies [680f8ae]
  - @glissade/core@0.10.0

## 0.10.0-pre.1

### Patch Changes

- Updated dependencies [fbdcc44]
  - @glissade/core@0.10.0-pre.1

## 0.10.0-pre.0

### Patch Changes

- Updated dependencies [b2f1fd7]
- Updated dependencies [680f8ae]
  - @glissade/core@0.10.0-pre.0

## 0.9.1

### Patch Changes

- @glissade/core@0.9.1

## 0.9.1-pre.0

### Patch Changes

- @glissade/core@0.9.1-pre.0

## 0.9.0

### Patch Changes

- Updated dependencies [f3b471b]
- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0

## 0.9.0-pre.1

### Patch Changes

- Updated dependencies [f3b471b]
  - @glissade/core@0.9.0-pre.1

## 0.9.0-pre.0

### Patch Changes

- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0-pre.0

## 0.8.1

### Patch Changes

- @glissade/core@0.8.1

## 0.8.1-pre.1

### Patch Changes

- @glissade/core@0.8.1-pre.1

## 0.8.1-pre.0

### Patch Changes

- @glissade/core@0.8.1-pre.0

## 0.8.0

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [dac15c9]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0

## 0.8.0-pre.1

### Patch Changes

- Updated dependencies [dac15c9]
  - @glissade/core@0.8.0-pre.1

## 0.8.0-pre.0

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0-pre.0

## 0.7.0

### Patch Changes

- Updated dependencies [0c0a583]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0

## 0.7.0-pre.0

### Patch Changes

- Updated dependencies [0c0a583]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0-pre.0

## 0.6.1

### Patch Changes

- @glissade/core@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [6c07c96]
  - @glissade/core@0.6.0

## 0.6.0-pre.1

### Patch Changes

- Updated dependencies [6c07c96]
  - @glissade/core@0.6.0-pre.1

## 0.6.0-pre.0

### Patch Changes

- @glissade/core@0.6.0-pre.0

## 0.5.0

### Minor Changes

- 829b14d: New package `@glissade/sfx` — sound effects, determinism- and license-safe. A clean-room procedural synth (`renderSfxr`: waveform + attack/sustain/decay envelope + pitch slide + one-shot arpeggio) renders **byte-identical** Int16 WAVs from a fixed param set, with the noise voice drawing from core's seeded `random` (no `Math.random`, no third-party synth code — bundled effects are unambiguously Apache-2.0 / license-clean). Ten frozen presets (`click tap pop whoosh success error type select coin blip`).

  The source seam mirrors narrate's provider shape: `SfxSource = { id, version(), voices(), render(voiceId) }`. `sfxrSource()` is the procedural bank; `samplePackSource(pack)` backs effects with committed audio but **hard-throws** when `license` or `source` is missing (nothing unlicensed ships by omission). `buildSfxClips(hits, source, opts)` places one `AudioClip` per hit, with INDEX-SEEDED pitch/gain variation (`random(seed ^ hash(source/voice) ^ index)`) so repeated hits don't sound identical while staying a pure function of position — re-evaluation never drifts. `renderSfxAssets` renders the referenced voices once (deduped) for committing. The `gs sfx` prepare step and render auto-mix join land next; `keystrokeClips()` (consuming the typewriter's `revealSchedule()`) is a tracked 0.5.x follow-up.

- 43b326b: `keystrokeClips(marks, source, opts)` — the typewriter's audio half, one `AudioClip` per typed or deleted character. Consumes the structural `KeystrokeMark = { time, grapheme, kind? }` shape, which both the typewriter's `EditMark[]` (insert + delete) and a monotonic `revealSchedule()`'s `RevealMark[]` (inserts only) satisfy. Whitespace is skipped by default, a backspace can take a distinct `deleteVoice`, and the per-key pitch/gain variation is index-seeded (reusing `buildSfxClips`) so a typing run stays alive instead of machine-gun identical. For real keyboard foley, `insertVoices`/`deleteVoices` round-robin a pool of distinct keypress samples (index-seeded pick) so it doesn't sound looped — pair with `samplePackSource` to bring your own (license-checked) pack. Char-class policy lives here; the marks stay neutral data.

### Patch Changes

- @glissade/core@0.5.0

## 0.5.0-pre.7

### Patch Changes

- @glissade/core@0.5.0-pre.7

## 0.5.0-pre.6

### Patch Changes

- @glissade/core@0.5.0-pre.6

## 0.5.0-pre.5

### Patch Changes

- @glissade/core@0.5.0-pre.5

## 0.5.0-pre.4

### Patch Changes

- @glissade/core@0.5.0-pre.4

## 0.5.0-pre.3

### Minor Changes

- 43b326b: `keystrokeClips(marks, source, opts)` — the typewriter's audio half, one `AudioClip` per typed or deleted character. Consumes the structural `KeystrokeMark = { time, grapheme, kind? }` shape, which both the typewriter's `EditMark[]` (insert + delete) and a monotonic `revealSchedule()`'s `RevealMark[]` (inserts only) satisfy. Whitespace is skipped by default, a backspace can take a distinct `deleteVoice`, and the per-key pitch/gain variation is index-seeded (reusing `buildSfxClips`) so a typing run stays alive instead of machine-gun identical. For real keyboard foley, `insertVoices`/`deleteVoices` round-robin a pool of distinct keypress samples (index-seeded pick) so it doesn't sound looped — pair with `samplePackSource` to bring your own (license-checked) pack. Char-class policy lives here; the marks stay neutral data.

### Patch Changes

- @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Minor Changes

- 829b14d: New package `@glissade/sfx` — sound effects, determinism- and license-safe. A clean-room procedural synth (`renderSfxr`: waveform + attack/sustain/decay envelope + pitch slide + one-shot arpeggio) renders **byte-identical** Int16 WAVs from a fixed param set, with the noise voice drawing from core's seeded `random` (no `Math.random`, no third-party synth code — bundled effects are unambiguously Apache-2.0 / license-clean). Ten frozen presets (`click tap pop whoosh success error type select coin blip`).

  The source seam mirrors narrate's provider shape: `SfxSource = { id, version(), voices(), render(voiceId) }`. `sfxrSource()` is the procedural bank; `samplePackSource(pack)` backs effects with committed audio but **hard-throws** when `license` or `source` is missing (nothing unlicensed ships by omission). `buildSfxClips(hits, source, opts)` places one `AudioClip` per hit, with INDEX-SEEDED pitch/gain variation (`random(seed ^ hash(source/voice) ^ index)`) so repeated hits don't sound identical while staying a pure function of position — re-evaluation never drifts. `renderSfxAssets` renders the referenced voices once (deduped) for committing. The `gs sfx` prepare step and render auto-mix join land next; `keystrokeClips()` (consuming the typewriter's `revealSchedule()`) is a tracked 0.5.x follow-up.

### Patch Changes

- @glissade/core@0.5.0-pre.2
