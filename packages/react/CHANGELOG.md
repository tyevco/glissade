# @glissade/react

## 0.8.0-pre.1

### Patch Changes

- Updated dependencies [dac15c9]
- Updated dependencies [dac15c9]
  - @glissade/player@0.8.0-pre.1
  - @glissade/core@0.8.0-pre.1

## 0.8.0-pre.0

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [012d9c0]
- Updated dependencies [1c9a303]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0-pre.0
  - @glissade/player@0.8.0-pre.0

## 0.7.0

### Patch Changes

- Updated dependencies [0c0a583]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0
  - @glissade/player@0.7.0

## 0.7.0-pre.0

### Patch Changes

- Updated dependencies [0c0a583]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0-pre.0
  - @glissade/player@0.7.0-pre.0

## 0.6.1

### Patch Changes

- @glissade/core@0.6.1
- @glissade/player@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [6c07c96]
  - @glissade/core@0.6.0
  - @glissade/player@0.6.0

## 0.6.0-pre.1

### Patch Changes

- Updated dependencies [6c07c96]
  - @glissade/core@0.6.0-pre.1
  - @glissade/player@0.6.0-pre.1

## 0.6.0-pre.0

### Patch Changes

- @glissade/player@0.6.0-pre.0
- @glissade/core@0.6.0-pre.0

## 0.5.0

### Patch Changes

- @glissade/player@0.5.0
- @glissade/core@0.5.0

## 0.5.0-pre.7

### Patch Changes

- @glissade/core@0.5.0-pre.7
- @glissade/player@0.5.0-pre.7

## 0.5.0-pre.6

### Patch Changes

- @glissade/player@0.5.0-pre.6
- @glissade/core@0.5.0-pre.6

## 0.5.0-pre.5

### Patch Changes

- @glissade/player@0.5.0-pre.5
- @glissade/core@0.5.0-pre.5

## 0.5.0-pre.4

### Patch Changes

- @glissade/player@0.5.0-pre.4
- @glissade/core@0.5.0-pre.4

## 0.5.0-pre.3

### Patch Changes

- @glissade/player@0.5.0-pre.3
- @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Patch Changes

- @glissade/player@0.5.0-pre.2
- @glissade/core@0.5.0-pre.2

## 0.5.0-pre.1

### Patch Changes

- @glissade/core@0.5.0-pre.1
- @glissade/player@0.5.0-pre.1

## 0.5.0-pre.0

### Patch Changes

- @glissade/core@0.5.0-pre.0
- @glissade/player@0.5.0-pre.0

## 0.4.5

### Patch Changes

- @glissade/player@0.4.5
- @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- @glissade/player@0.4.4
- @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies [2282bcb]
  - @glissade/core@0.4.3
  - @glissade/player@0.4.3

## 0.4.2

### Patch Changes

- @glissade/player@0.4.2
- @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- @glissade/player@0.4.1
- @glissade/core@0.4.1

## 0.4.0

### Patch Changes

- @glissade/player@0.4.0
- @glissade/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [e89c3d0]
  - @glissade/core@0.3.0
  - @glissade/player@0.3.0

## 0.2.0

### Minor Changes

- 1d2fd20: Authoring surface + integration (v2 addendum §C.7). `@glissade/interact`: `machineBuilder` (typed inputs/states accumulate in the type parameters; `build()` validates and emits the same `StateMachineDoc` JSON authoring produces), `pose()` one-key-timeline states, and `hoverMachine`/`pressMachine` presets returning `MachineSpec`s with self-wiring listeners. `@glissade/react`: `useMachineState(machine)` and `useInput(machine, name)` over the existing `useSyncExternalStore` bridge — typed structurally, so react never depends on interact. The showcase gallery mounts module machines and gains an `interactive` scene: real machine-driven toggles with velocity-matched mid-flight reversal, beside an ambient-timeline toggle and preset-driven button. The interact size gate now bundles the §C.6 subset entry (machine + listeners + hitTest + pointerDriver ≤ 6 kB), verifying that builder/preset/trace tooling tree-shakes out.

### Patch Changes

- Updated dependencies [715be32]
- Updated dependencies [dcb28f2]
  - @glissade/core@0.2.0
  - @glissade/player@0.2.0

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
  - @glissade/player@0.1.0
