# @glissade/core

## 0.7.0

### Patch Changes

- 0c0a583: A/V sync offsets are now sample-accurate and identical across export paths by construction (§5.3). A new `audioOffsetSamples(at, sampleRate)` in core (`round(at * sampleRate)`) is the single source of truth: the CLI mixer derives its `adelay` from the sample grid instead of rounding to milliseconds, and the browser `OfflineAudioContext` mixer snaps clip starts (and gain-envelope times) to the same grid instead of using raw float seconds. Previously the two paths could drift sub-frame and a non-frame-aligned `at` passed through silently.
- 0848530: `sampleTrack` now emits a once-per-track dev warning when a non-extrapolating type (path / discrete) clamps an out-of-range eased value — e.g. a spring or overshooting ease on a `path` track gets flattened. Previously the clamp was silent, hiding a likely authoring mistake.
- 0848530: `validateTrack` now canonicalizes non-hold keys on discrete (`string` / `boolean`) tracks to explicit holds. These types are hold-only by construction (their `lerp` already snaps), so this is behaviorally a no-op — but it makes the serialized document honest and stops a curve editor from offering a meaningless ease on a discrete track.
- 0848530: Pin the custom-ease numeric derivative fallback step to `h = 1/1024` (§B.5). Eases lacking a closed-form derivative now read velocity via a spec-fixed symmetric-difference step, so interruption handoffs are reproducible across JS engines instead of depending on an arbitrary `1e-5`.
- 25c5986: Sidecar label merge precedence is fixed: **code labels now win on a name collision** (§6.2), with a dev warning naming the shadowed sidecar label(s). Previously the editor sidecar's label silently overrode the code-authored one — the opposite of the decided rule that code labels are authoritative and the editor label is flagged for rename.
- ecdece8: `sync` timeline children are now properly opaque: a sync child that animates the same target as the parent (or another sync child) raises a `TimelineValidationError` instead of silently coalescing last-writer-wins. The previously-dead `opaque` flag becomes a load-bearing per-unit id in the compiler. `add` children still flatten and coalesce against the parent as before, and a sync child with disjoint targets still appears in `compiled.tracks` under its own target. Fixes a §2.3 nesting-model violation.

## 0.7.0-pre.0

### Patch Changes

- 0c0a583: A/V sync offsets are now sample-accurate and identical across export paths by construction (§5.3). A new `audioOffsetSamples(at, sampleRate)` in core (`round(at * sampleRate)`) is the single source of truth: the CLI mixer derives its `adelay` from the sample grid instead of rounding to milliseconds, and the browser `OfflineAudioContext` mixer snaps clip starts (and gain-envelope times) to the same grid instead of using raw float seconds. Previously the two paths could drift sub-frame and a non-frame-aligned `at` passed through silently.
- 0848530: `sampleTrack` now emits a once-per-track dev warning when a non-extrapolating type (path / discrete) clamps an out-of-range eased value — e.g. a spring or overshooting ease on a `path` track gets flattened. Previously the clamp was silent, hiding a likely authoring mistake.
- 0848530: `validateTrack` now canonicalizes non-hold keys on discrete (`string` / `boolean`) tracks to explicit holds. These types are hold-only by construction (their `lerp` already snaps), so this is behaviorally a no-op — but it makes the serialized document honest and stops a curve editor from offering a meaningless ease on a discrete track.
- 0848530: Pin the custom-ease numeric derivative fallback step to `h = 1/1024` (§B.5). Eases lacking a closed-form derivative now read velocity via a spec-fixed symmetric-difference step, so interruption handoffs are reproducible across JS engines instead of depending on an arbitrary `1e-5`.
- 25c5986: Sidecar label merge precedence is fixed: **code labels now win on a name collision** (§6.2), with a dev warning naming the shadowed sidecar label(s). Previously the editor sidecar's label silently overrode the code-authored one — the opposite of the decided rule that code labels are authoritative and the editor label is flagged for rename.
- ecdece8: `sync` timeline children are now properly opaque: a sync child that animates the same target as the parent (or another sync child) raises a `TimelineValidationError` instead of silently coalescing last-writer-wins. The previously-dead `opaque` flag becomes a load-bearing per-unit id in the compiler. `add` children still flatten and coalesce against the parent as before, and a sync child with disjoint targets still appears in `compiled.tracks` under its own target. Fixes a §2.3 nesting-model violation.

## 0.6.1

## 0.6.0

### Minor Changes

- 6c07c96: Motion-authoring sugar: **`springPresets`** — named spring feels (`default`, `gentle`, `wobbly`, `stiff`, `slow`, `molasses`, react-spring conventions) so you reach for a vocabulary instead of hand-tuning stiffness/damping: `spring(springPresets.wobbly)`, `springTo(t, a, b, springPresets.gentle)`. And **`stagger(tracks, delay)`** — cascade a list of tracks by shifting each one's key times (`delay` a per-index gap in seconds or a function of the index), the classic stagger for animating a list of nodes. Pure; the input tracks are untouched.

## 0.6.0-pre.1

### Minor Changes

- 6c07c96: Motion-authoring sugar: **`springPresets`** — named spring feels (`default`, `gentle`, `wobbly`, `stiff`, `slow`, `molasses`, react-spring conventions) so you reach for a vocabulary instead of hand-tuning stiffness/damping: `spring(springPresets.wobbly)`, `springTo(t, a, b, springPresets.gentle)`. And **`stagger(tracks, delay)`** — cascade a list of tracks by shifting each one's key times (`delay` a per-index gap in seconds or a function of the index), the classic stagger for animating a list of nodes. Pure; the input tracks are untouched.

## 0.6.0-pre.0

## 0.5.0

## 0.5.0-pre.7

## 0.5.0-pre.6

## 0.5.0-pre.5

## 0.5.0-pre.4

## 0.5.0-pre.3

## 0.5.0-pre.2

## 0.5.0-pre.1

## 0.5.0-pre.0

## 0.4.5

## 0.4.4

## 0.4.3

### Patch Changes

- 2282bcb: The downstream-friction batch (driven by a consuming project's 0.3.0→0.4.2 report). `createMeasurer({ fonts })` in backend-skia + `setDefaultMeasurer()` in scene bless factory-time measurement — Text pulls and un-injected scenes fall back through the process default before the estimator, so component factories measure with the rasterizer's real metrics (scene-injected measurers still win). `springTo(endT, from, to, cfg)` in core returns the [launch, settle] key pair with the spring-duration arithmetic done — settle-ON-the-beat without hand math. `Text.wordBoxes()` trims whitespace that punctuation-gluing folds into a segment (' $' → '$'), so boxes cover exactly the ink. `AudioClip.gain` accepts keys-only envelopes (`{ keys }`); the meaningless-but-mandatory target string is gone (full Tracks still work structurally). `duckEnvelope(timing, opts)` in narrate derives the music-bed ducking gain from the narration manifest (segment windows, attack/release ramps, near-window merging) — upstreamed from downstream. `gs render` progress detects non-TTY stderr and emits sparse newline-terminated updates instead of an unbroken \r stream.

## 0.4.2

## 0.4.1

## 0.4.0

## 0.3.0

### Minor Changes

- e89c3d0: The `path` value type + `Path` node (Lottie S0). `PathValue` is bezier contours in vertex form (`{closed, v, in, out}[]` — Lottie's own representation, plain JSON); morphs are pairwise lerps of anchors and tangents, exactly how lottie-web interpolates, with mismatched topology snapping (one-time dev warning) instead of interpolating garbage. `Path extends Shape` registers its geometry as the animatable `<id>/d` track target and emits cubic segments to the existing IR — zero backend work. Interact gains the §C.3 fill-rule hit test (flattened nonzero winding): a star misses in its notches, a reversed inner contour cuts a real hole. `inferValueType` sniffs `PathValue` so the builder works natively. Golden-pinned with an animated star↔blob morph; browser↔Skia parity on the paths corpus measured SSIM 1.00000.

## 0.2.0

### Minor Changes

- 715be32: New package `@glissade/interact`: state machines over timelines (v2 addendum §A/§B). `StateMachineDoc` version 1 (sibling document, 'crossfade' reserved-not-valid), `createMachine` with typed inputs (boolean/number signals, queued triggers, loud unknown-name errors), one-transition-per-step semantics with exit-time windows, any-state edges, `onEnter` restart/resume, and `interruptible` queue-hold. Handoffs: cut / decay (with the Bollo overshoot clamp) / velocity-matched offset springs, type-class defaults, blend-from-frozen for lerp-only types, bounded one-offset re-interruption. `@glissade/player` gains `player.attach(machine)` with §A.1 target-disjointness validation; `@glissade/core` additionally exports `emitDevWarning`.

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
