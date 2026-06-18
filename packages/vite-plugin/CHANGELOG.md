# @glissade/vite-plugin

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

- 8820f3f: Reshape the editor sidecar to `sidecarVersion: 2` (§6.2) — the foundation for safe code↔editor round-tripping. Edits are now namespaced by timeline id (`'main'` for the linear timeline; v2 machines add more), tracks are keyed by canonical target and carry the code `baseHash` they branched from, keys get stable `k<N>` ids, and tracks whose target drifted are parked as `orphans` (with a reason) instead of failing to bind the whole overlay. New core API: `migrateSidecar` (lifts v1 documents forward on load), `setSidecarTrack` (the studio write path, assigns key ids + baseHash), `mergeSidecarDetailed` (returns the bindable timeline + drift list + orphans), `hashKeys`, `assignKeyIds`. `mergeSidecar` keeps returning a bindable `Timeline` and now accepts v1 or v2 input. The studio and vite-plugin read/write v2 (v1 files migrate automatically). The drift-badge / orphan-relink studio UI is a follow-up.
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

- 8820f3f: Reshape the editor sidecar to `sidecarVersion: 2` (§6.2) — the foundation for safe code↔editor round-tripping. Edits are now namespaced by timeline id (`'main'` for the linear timeline; v2 machines add more), tracks are keyed by canonical target and carry the code `baseHash` they branched from, keys get stable `k<N>` ids, and tracks whose target drifted are parked as `orphans` (with a reason) instead of failing to bind the whole overlay. New core API: `migrateSidecar` (lifts v1 documents forward on load), `setSidecarTrack` (the studio write path, assigns key ids + baseHash), `mergeSidecarDetailed` (returns the bindable timeline + drift list + orphans), `hashKeys`, `assignKeyIds`. `mergeSidecar` keeps returning a bindable `Timeline` and now accepts v1 or v2 input. The studio and vite-plugin read/write v2 (v1 files migrate automatically). The drift-badge / orphan-relink studio UI is a follow-up.
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

### Patch Changes

- @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Patch Changes

- @glissade/core@0.5.0-pre.2

## 0.5.0-pre.1

### Patch Changes

- @glissade/core@0.5.0-pre.1

## 0.5.0-pre.0

### Patch Changes

- @glissade/core@0.5.0-pre.0

## 0.4.5

### Patch Changes

- @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies [2282bcb]
  - @glissade/core@0.4.3

## 0.4.2

### Patch Changes

- @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- @glissade/core@0.4.1

## 0.4.0

### Patch Changes

- @glissade/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [e89c3d0]
  - @glissade/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [715be32]
  - @glissade/core@0.2.0

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
