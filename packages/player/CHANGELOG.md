# @glissade/player

## 0.8.1-pre.0

### Patch Changes

- @glissade/backend-canvas2d@0.8.1-pre.0
- @glissade/core@0.8.1-pre.0
- @glissade/scene@0.8.1-pre.0

## 0.8.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.
- 012d9c0: Hot-swap a live embed (vite HMR, §4.3). `Player.swap({ duration, markers, targets })` rebinds to a recompiled timeline **preserving the current playhead** (clamped to the new duration — no replay-to-frame); playing state and registered marker/cue callbacks survive. `Mounted.swap({ scene?, timeline })` recompiles, rebinds the player, and repaints at the held time — a track whose target the new scene dropped simply stops being written (it keeps its last value rather than erroring). `swapOnHmr(mounted, initialTimeline, rerun)` returns the `import.meta.hot.accept` callback that wires a scene-module edit to a swap and warns when an edit removes a label.
- 1c9a303: Accessibility + background playback (§4.2 / §4.1), realizing two PlayerOptions the spec described but the runtime ignored.

  - `reducedMotion: 'respect' | 'ignore' | (doc) => Timeline` (default `'respect'`). Under `prefers-reduced-motion: reduce`, `'respect'` suppresses autoplay and holds the poster frame (`timeline.posterTime`, default = end state); the function form swaps in a calmer alternative timeline (rides the new `Player.swap`). `mount()` detects the media query (override with `prefersReducedMotion`). The decision logic is the pure, exported `planReducedMotion`.
  - `background: 'pause' | 'run'` (default `'pause'`). While the tab is hidden, `'pause'` freezes and resumes where it left off — no wall-clock jump on return; `'run'` advances by the hidden duration (correct for ambient loops). Wires the previously-inert driver `visibility` hook.

### Patch Changes

- dac15c9: Heads-up (behavior change in 0.8): `PlayerOptions.background` defaults to `'pause'` — a hidden tab now freezes and resumes where it left off rather than advancing by the hidden wall-clock duration. Embedders running ambient/looping players who relied on the old advance-through-hidden behavior should pass `background: 'run'` explicitly.
- Updated dependencies [1d56c0a]
- Updated dependencies [dac15c9]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0
  - @glissade/scene@0.8.0
  - @glissade/backend-canvas2d@0.8.0

## 0.8.0-pre.1

### Patch Changes

- dac15c9: Heads-up (behavior change in 0.8): `PlayerOptions.background` defaults to `'pause'` — a hidden tab now freezes and resumes where it left off rather than advancing by the hidden wall-clock duration. Embedders running ambient/looping players who relied on the old advance-through-hidden behavior should pass `background: 'run'` explicitly.
- Updated dependencies [dac15c9]
  - @glissade/core@0.8.0-pre.1
  - @glissade/backend-canvas2d@0.8.0-pre.1
  - @glissade/scene@0.8.0-pre.1

## 0.8.0-pre.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.
- 012d9c0: Hot-swap a live embed (vite HMR, §4.3). `Player.swap({ duration, markers, targets })` rebinds to a recompiled timeline **preserving the current playhead** (clamped to the new duration — no replay-to-frame); playing state and registered marker/cue callbacks survive. `Mounted.swap({ scene?, timeline })` recompiles, rebinds the player, and repaints at the held time — a track whose target the new scene dropped simply stops being written (it keeps its last value rather than erroring). `swapOnHmr(mounted, initialTimeline, rerun)` returns the `import.meta.hot.accept` callback that wires a scene-module edit to a swap and warns when an edit removes a label.
- 1c9a303: Accessibility + background playback (§4.2 / §4.1), realizing two PlayerOptions the spec described but the runtime ignored.

  - `reducedMotion: 'respect' | 'ignore' | (doc) => Timeline` (default `'respect'`). Under `prefers-reduced-motion: reduce`, `'respect'` suppresses autoplay and holds the poster frame (`timeline.posterTime`, default = end state); the function form swaps in a calmer alternative timeline (rides the new `Player.swap`). `mount()` detects the media query (override with `prefersReducedMotion`). The decision logic is the pure, exported `planReducedMotion`.
  - `background: 'pause' | 'run'` (default `'pause'`). While the tab is hidden, `'pause'` freezes and resumes where it left off — no wall-clock jump on return; `'run'` advances by the hidden duration (correct for ambient loops). Wires the previously-inert driver `visibility` hook.

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0-pre.0
  - @glissade/scene@0.8.0-pre.0
  - @glissade/backend-canvas2d@0.8.0-pre.0

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
  - @glissade/backend-canvas2d@0.7.0

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
  - @glissade/backend-canvas2d@0.7.0-pre.0

## 0.6.1

### Patch Changes

- @glissade/backend-canvas2d@0.6.1
- @glissade/core@0.6.1
- @glissade/scene@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
- Updated dependencies [12c5841]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0
  - @glissade/scene@0.6.0
  - @glissade/backend-canvas2d@0.6.0

## 0.6.0-pre.1

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0-pre.1
  - @glissade/scene@0.6.0-pre.1
  - @glissade/backend-canvas2d@0.6.0-pre.1

## 0.6.0-pre.0

### Patch Changes

- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
  - @glissade/scene@0.6.0-pre.0
  - @glissade/backend-canvas2d@0.6.0-pre.0
  - @glissade/core@0.6.0-pre.0

## 0.5.0

### Patch Changes

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
  - @glissade/backend-canvas2d@0.5.0
  - @glissade/core@0.5.0

## 0.5.0-pre.7

### Patch Changes

- @glissade/backend-canvas2d@0.5.0-pre.7
- @glissade/core@0.5.0-pre.7
- @glissade/scene@0.5.0-pre.7

## 0.5.0-pre.6

### Patch Changes

- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [adc7941]
  - @glissade/scene@0.5.0-pre.6
  - @glissade/backend-canvas2d@0.5.0-pre.6
  - @glissade/core@0.5.0-pre.6

## 0.5.0-pre.5

### Patch Changes

- Updated dependencies [4495359]
  - @glissade/scene@0.5.0-pre.5
  - @glissade/backend-canvas2d@0.5.0-pre.5
  - @glissade/core@0.5.0-pre.5

## 0.5.0-pre.4

### Patch Changes

- Updated dependencies [ca2150f]
  - @glissade/scene@0.5.0-pre.4
  - @glissade/backend-canvas2d@0.5.0-pre.4
  - @glissade/core@0.5.0-pre.4

## 0.5.0-pre.3

### Patch Changes

- Updated dependencies [e1865d2]
- Updated dependencies [43b326b]
  - @glissade/scene@0.5.0-pre.3
  - @glissade/backend-canvas2d@0.5.0-pre.3
  - @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Patch Changes

- Updated dependencies [27b4b49]
  - @glissade/scene@0.5.0-pre.2
  - @glissade/backend-canvas2d@0.5.0-pre.2
  - @glissade/core@0.5.0-pre.2

## 0.5.0-pre.1

### Patch Changes

- @glissade/backend-canvas2d@0.5.0-pre.1
- @glissade/core@0.5.0-pre.1
- @glissade/scene@0.5.0-pre.1

## 0.5.0-pre.0

### Patch Changes

- @glissade/backend-canvas2d@0.5.0-pre.0
- @glissade/core@0.5.0-pre.0
- @glissade/scene@0.5.0-pre.0

## 0.4.5

### Patch Changes

- Updated dependencies [70159ad]
  - @glissade/scene@0.4.5
  - @glissade/backend-canvas2d@0.4.5
  - @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- Updated dependencies [40f5a31]
  - @glissade/scene@0.4.4
  - @glissade/backend-canvas2d@0.4.4
  - @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies [2282bcb]
  - @glissade/scene@0.4.3
  - @glissade/core@0.4.3
  - @glissade/backend-canvas2d@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [53f6f9f]
  - @glissade/scene@0.4.2
  - @glissade/backend-canvas2d@0.4.2
  - @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [80d9ac1]
  - @glissade/scene@0.4.1
  - @glissade/backend-canvas2d@0.4.1
  - @glissade/core@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [056817c]
- Updated dependencies [869d406]
- Updated dependencies [3986798]
  - @glissade/scene@0.4.0
  - @glissade/backend-canvas2d@0.4.0
  - @glissade/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [fbb12ca]
- Updated dependencies [ab8ca37]
- Updated dependencies [bc9add6]
- Updated dependencies [e89c3d0]
  - @glissade/scene@0.3.0
  - @glissade/backend-canvas2d@0.3.0
  - @glissade/core@0.3.0

## 0.2.0

### Minor Changes

- 715be32: New package `@glissade/interact`: state machines over timelines (v2 addendum §A/§B). `StateMachineDoc` version 1 (sibling document, 'crossfade' reserved-not-valid), `createMachine` with typed inputs (boolean/number signals, queued triggers, loud unknown-name errors), one-transition-per-step semantics with exit-time windows, any-state edges, `onEnter` restart/resume, and `interruptible` queue-hold. Handoffs: cut / decay (with the Bollo overshoot clamp) / velocity-matched offset springs, type-class defaults, blend-from-frozen for lerp-only types, bounded one-offset re-interruption. `@glissade/player` gains `player.attach(machine)` with §A.1 target-disjointness validation; `@glissade/core` additionally exports `emitDevWarning`.
- dcb28f2: Drivers, listeners, and hit testing (v2 addendum §C). `@glissade/player`: `Driver` generalizes to `InputDriver<T>` (the v1 alias is intact; `DriverContext.duration` is now optional) and `scrollDriver` writes normalized progress 0..1 in input mode. `@glissade/interact`: `pointerDriver` (rAF-coalesced, scene-scaled, optional driver-resident closed-form spring smoothing), `splitVec2` fan-out, `springFilter`, `createListeners` (hover/press/click → machine inputs, touch-emulated hover filtered), geometric `hitTest` (per-node-type shape tests on inverted cached world matrices, `hitArea` overrides, `interactiveChildren` pruning), and the separate `@glissade/interact/audio` entry with offline `audioAmplitudeTrack` (RMS or Goertzel band amplitude compiled to an ordinary Track). `@glissade/scene`: matrix `invert`, and nodes gain `interactive` / `interactiveChildren` / `hitArea`.

### Patch Changes

- Updated dependencies [715be32]
- Updated dependencies [dcb28f2]
  - @glissade/core@0.2.0
  - @glissade/scene@0.2.0
  - @glissade/backend-canvas2d@0.2.0

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
  - @glissade/backend-canvas2d@0.1.0
