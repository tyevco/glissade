# @glissade/cli

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
