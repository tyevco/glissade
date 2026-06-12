# @glissade/cli

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
