# @glissade/core

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
