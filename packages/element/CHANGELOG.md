# @glissade/element

## 0.14.0

### Patch Changes

- Updated dependencies [f13486d]
- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7456761]
  - @glissade/core@0.14.0
  - @glissade/scene@0.14.0
  - @glissade/backend-canvas2d@0.14.0
  - @glissade/player@0.14.0

## 0.14.0-pre.1

### Patch Changes

- Updated dependencies [f13486d]
  - @glissade/core@0.14.0-pre.1
  - @glissade/scene@0.14.0-pre.1
  - @glissade/backend-canvas2d@0.14.0-pre.1
  - @glissade/player@0.14.0-pre.1

## 0.14.0-pre.0

### Patch Changes

- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7456761]
  - @glissade/scene@0.14.0-pre.0
  - @glissade/core@0.14.0-pre.0
  - @glissade/backend-canvas2d@0.14.0-pre.0
  - @glissade/player@0.14.0-pre.0

## 0.13.0

### Patch Changes

- Updated dependencies [d1e81b7]
- Updated dependencies [d1e81b7]
- Updated dependencies [1995ee8]
- Updated dependencies [707d228]
- Updated dependencies [88ba5bc]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
- Updated dependencies [8bec181]
- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0
  - @glissade/scene@0.13.0
  - @glissade/backend-canvas2d@0.13.0
  - @glissade/player@0.13.0

## 0.13.0-pre.3

### Patch Changes

- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0-pre.3
  - @glissade/backend-canvas2d@0.13.0-pre.3
  - @glissade/player@0.13.0-pre.3
  - @glissade/scene@0.13.0-pre.3

## 0.13.0-pre.2

### Patch Changes

- Updated dependencies [8bec181]
  - @glissade/core@0.13.0-pre.2
  - @glissade/backend-canvas2d@0.13.0-pre.2
  - @glissade/player@0.13.0-pre.2
  - @glissade/scene@0.13.0-pre.2

## 0.13.0-pre.1

### Patch Changes

- Updated dependencies [d1e81b7]
- Updated dependencies [d1e81b7]
  - @glissade/core@0.13.0-pre.1
  - @glissade/scene@0.13.0-pre.1
  - @glissade/backend-canvas2d@0.13.0-pre.1
  - @glissade/player@0.13.0-pre.1

## 0.13.0-pre.0

### Patch Changes

- Updated dependencies [1995ee8]
- Updated dependencies [707d228]
- Updated dependencies [88ba5bc]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
  - @glissade/core@0.13.0-pre.0
  - @glissade/scene@0.13.0-pre.0
  - @glissade/backend-canvas2d@0.13.0-pre.0
  - @glissade/player@0.13.0-pre.0

## 0.12.1

### Patch Changes

- Updated dependencies [56fa1f3]
  - @glissade/core@0.12.1
  - @glissade/backend-canvas2d@0.12.1
  - @glissade/player@0.12.1
  - @glissade/scene@0.12.1

## 0.12.0

### Patch Changes

- Updated dependencies [78393f1]
- Updated dependencies [2850386]
- Updated dependencies [796b568]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
- Updated dependencies [2a520c5]
  - @glissade/core@0.12.0
  - @glissade/scene@0.12.0
  - @glissade/backend-canvas2d@0.12.0
  - @glissade/player@0.12.0

## 0.12.0-pre.1

### Patch Changes

- Updated dependencies [78393f1]
  - @glissade/core@0.12.0-pre.1
  - @glissade/backend-canvas2d@0.12.0-pre.1
  - @glissade/player@0.12.0-pre.1
  - @glissade/scene@0.12.0-pre.1

## 0.12.0-pre.0

### Patch Changes

- Updated dependencies [2850386]
- Updated dependencies [796b568]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
- Updated dependencies [2a520c5]
  - @glissade/core@0.12.0-pre.0
  - @glissade/scene@0.12.0-pre.0
  - @glissade/backend-canvas2d@0.12.0-pre.0
  - @glissade/player@0.12.0-pre.0

## 0.11.0

### Patch Changes

- 6d3e061: Fix `<gs-player>`: toggling the `controls` attribute at runtime no longer resets the playhead to 0 or stops playback. The controls subtree + its scrubber/time subscription are now wired/unwired against the _current_ mounted scene instead of triggering a full remount. (0.11 canary fix.)
- 83575a3: `<gs-player>` now lazy-constructs its controls. With no `controls` attribute the
  element builds zero controls DOM and attaches zero control listeners, and the
  playhead subscription that drives the scrubber/time readout never runs. Adding
  the `controls` attribute builds the play/pause button, scrubber, and time
  readout live (with listeners); removing it tears them down. Theming and the CSS
  `part=` selectors (`controls`/`button`/`scrubber`/`time`) are preserved exactly
  when controls are present. Play/pause/seek behavior is unchanged.
- Updated dependencies [6d3e061]
- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
  - @glissade/player@0.11.0
  - @glissade/core@0.11.0
  - @glissade/scene@0.11.0
  - @glissade/backend-canvas2d@0.11.0

## 0.11.0-pre.1

### Patch Changes

- 6d3e061: Fix `<gs-player>`: toggling the `controls` attribute at runtime no longer resets the playhead to 0 or stops playback. The controls subtree + its scrubber/time subscription are now wired/unwired against the _current_ mounted scene instead of triggering a full remount. (0.11 canary fix.)
- Updated dependencies [6d3e061]
  - @glissade/player@0.11.0-pre.1
  - @glissade/backend-canvas2d@0.11.0-pre.1
  - @glissade/core@0.11.0-pre.1
  - @glissade/scene@0.11.0-pre.1

## 0.11.0-pre.0

### Patch Changes

- 83575a3: `<gs-player>` now lazy-constructs its controls. With no `controls` attribute the
  element builds zero controls DOM and attaches zero control listeners, and the
  playhead subscription that drives the scrubber/time readout never runs. Adding
  the `controls` attribute builds the play/pause button, scrubber, and time
  readout live (with listeners); removing it tears them down. Theming and the CSS
  `part=` selectors (`controls`/`button`/`scrubber`/`time`) are preserved exactly
  when controls are present. Play/pause/seek behavior is unchanged.
- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
  - @glissade/core@0.11.0-pre.0
  - @glissade/scene@0.11.0-pre.0
  - @glissade/player@0.11.0-pre.0
  - @glissade/backend-canvas2d@0.11.0-pre.0

## 0.10.1

### Patch Changes

- Updated dependencies [f9f7ebe]
- Updated dependencies [7482378]
  - @glissade/core@0.10.1
  - @glissade/scene@0.10.1
  - @glissade/backend-canvas2d@0.10.1
  - @glissade/player@0.10.1

## 0.10.1-pre.1

### Patch Changes

- Updated dependencies [f9f7ebe]
  - @glissade/core@0.10.1-pre.1
  - @glissade/scene@0.10.1-pre.1
  - @glissade/backend-canvas2d@0.10.1-pre.1
  - @glissade/player@0.10.1-pre.1

## 0.10.1-pre.0

### Patch Changes

- Updated dependencies [7482378]
  - @glissade/core@0.10.1-pre.0
  - @glissade/scene@0.10.1-pre.0
  - @glissade/backend-canvas2d@0.10.1-pre.0
  - @glissade/player@0.10.1-pre.0

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
  - @glissade/backend-canvas2d@0.10.0
  - @glissade/player@0.10.0

## 0.10.0-pre.1

### Patch Changes

- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
  - @glissade/scene@0.10.0-pre.1
  - @glissade/core@0.10.0-pre.1
  - @glissade/backend-canvas2d@0.10.0-pre.1
  - @glissade/player@0.10.0-pre.1

## 0.10.0-pre.0

### Patch Changes

- Updated dependencies [b2f1fd7]
- Updated dependencies [278ea05]
- Updated dependencies [680f8ae]
- Updated dependencies [0cc640f]
- Updated dependencies [0a1844c]
  - @glissade/core@0.10.0-pre.0
  - @glissade/scene@0.10.0-pre.0
  - @glissade/backend-canvas2d@0.10.0-pre.0
  - @glissade/player@0.10.0-pre.0

## 0.9.1

### Patch Changes

- @glissade/backend-canvas2d@0.9.1
- @glissade/core@0.9.1
- @glissade/player@0.9.1
- @glissade/scene@0.9.1

## 0.9.1-pre.0

### Patch Changes

- @glissade/backend-canvas2d@0.9.1-pre.0
- @glissade/core@0.9.1-pre.0
- @glissade/player@0.9.1-pre.0
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
  - @glissade/player@0.9.0
  - @glissade/backend-canvas2d@0.9.0

## 0.9.0-pre.1

### Patch Changes

- Updated dependencies [f3b471b]
  - @glissade/core@0.9.0-pre.1
  - @glissade/scene@0.9.0-pre.1
  - @glissade/backend-canvas2d@0.9.0-pre.1
  - @glissade/player@0.9.0-pre.1

## 0.9.0-pre.0

### Patch Changes

- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0-pre.0
  - @glissade/scene@0.9.0-pre.0
  - @glissade/player@0.9.0-pre.0
  - @glissade/backend-canvas2d@0.9.0-pre.0

## 0.8.1

### Patch Changes

- @glissade/backend-canvas2d@0.8.1
- @glissade/core@0.8.1
- @glissade/player@0.8.1
- @glissade/scene@0.8.1

## 0.8.1-pre.1

### Patch Changes

- @glissade/backend-canvas2d@0.8.1-pre.1
- @glissade/core@0.8.1-pre.1
- @glissade/player@0.8.1-pre.1
- @glissade/scene@0.8.1-pre.1

## 0.8.1-pre.0

### Patch Changes

- @glissade/backend-canvas2d@0.8.1-pre.0
- @glissade/core@0.8.1-pre.0
- @glissade/player@0.8.1-pre.0
- @glissade/scene@0.8.1-pre.0

## 0.8.0

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [dac15c9]
- Updated dependencies [dac15c9]
- Updated dependencies [012d9c0]
- Updated dependencies [1c9a303]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0
  - @glissade/player@0.8.0
  - @glissade/scene@0.8.0
  - @glissade/backend-canvas2d@0.8.0

## 0.8.0-pre.1

### Patch Changes

- Updated dependencies [dac15c9]
- Updated dependencies [dac15c9]
  - @glissade/player@0.8.0-pre.1
  - @glissade/core@0.8.0-pre.1
  - @glissade/backend-canvas2d@0.8.0-pre.1
  - @glissade/scene@0.8.0-pre.1

## 0.8.0-pre.0

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [012d9c0]
- Updated dependencies [1c9a303]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0-pre.0
  - @glissade/player@0.8.0-pre.0
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
  - @glissade/player@0.7.0

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
  - @glissade/player@0.7.0-pre.0

## 0.6.1

### Patch Changes

- @glissade/backend-canvas2d@0.6.1
- @glissade/core@0.6.1
- @glissade/player@0.6.1
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
  - @glissade/player@0.6.0

## 0.6.0-pre.1

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0-pre.1
  - @glissade/scene@0.6.0-pre.1
  - @glissade/backend-canvas2d@0.6.0-pre.1
  - @glissade/player@0.6.0-pre.1

## 0.6.0-pre.0

### Patch Changes

- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
  - @glissade/scene@0.6.0-pre.0
  - @glissade/backend-canvas2d@0.6.0-pre.0
  - @glissade/player@0.6.0-pre.0
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
  - @glissade/player@0.5.0
  - @glissade/core@0.5.0

## 0.5.0-pre.7

### Patch Changes

- @glissade/backend-canvas2d@0.5.0-pre.7
- @glissade/core@0.5.0-pre.7
- @glissade/player@0.5.0-pre.7
- @glissade/scene@0.5.0-pre.7

## 0.5.0-pre.6

### Patch Changes

- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [adc7941]
  - @glissade/scene@0.5.0-pre.6
  - @glissade/backend-canvas2d@0.5.0-pre.6
  - @glissade/player@0.5.0-pre.6
  - @glissade/core@0.5.0-pre.6

## 0.5.0-pre.5

### Patch Changes

- Updated dependencies [4495359]
  - @glissade/scene@0.5.0-pre.5
  - @glissade/backend-canvas2d@0.5.0-pre.5
  - @glissade/player@0.5.0-pre.5
  - @glissade/core@0.5.0-pre.5

## 0.5.0-pre.4

### Patch Changes

- Updated dependencies [ca2150f]
  - @glissade/scene@0.5.0-pre.4
  - @glissade/backend-canvas2d@0.5.0-pre.4
  - @glissade/player@0.5.0-pre.4
  - @glissade/core@0.5.0-pre.4

## 0.5.0-pre.3

### Patch Changes

- Updated dependencies [e1865d2]
- Updated dependencies [43b326b]
  - @glissade/scene@0.5.0-pre.3
  - @glissade/backend-canvas2d@0.5.0-pre.3
  - @glissade/player@0.5.0-pre.3
  - @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Patch Changes

- Updated dependencies [27b4b49]
  - @glissade/scene@0.5.0-pre.2
  - @glissade/backend-canvas2d@0.5.0-pre.2
  - @glissade/player@0.5.0-pre.2
  - @glissade/core@0.5.0-pre.2

## 0.5.0-pre.1

### Patch Changes

- @glissade/backend-canvas2d@0.5.0-pre.1
- @glissade/core@0.5.0-pre.1
- @glissade/player@0.5.0-pre.1
- @glissade/scene@0.5.0-pre.1

## 0.5.0-pre.0

### Patch Changes

- @glissade/backend-canvas2d@0.5.0-pre.0
- @glissade/core@0.5.0-pre.0
- @glissade/player@0.5.0-pre.0
- @glissade/scene@0.5.0-pre.0

## 0.4.5

### Patch Changes

- Updated dependencies [70159ad]
  - @glissade/scene@0.4.5
  - @glissade/backend-canvas2d@0.4.5
  - @glissade/player@0.4.5
  - @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- Updated dependencies [40f5a31]
  - @glissade/scene@0.4.4
  - @glissade/backend-canvas2d@0.4.4
  - @glissade/player@0.4.4
  - @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies [2282bcb]
  - @glissade/scene@0.4.3
  - @glissade/core@0.4.3
  - @glissade/backend-canvas2d@0.4.3
  - @glissade/player@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [53f6f9f]
  - @glissade/scene@0.4.2
  - @glissade/backend-canvas2d@0.4.2
  - @glissade/player@0.4.2
  - @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [80d9ac1]
  - @glissade/scene@0.4.1
  - @glissade/backend-canvas2d@0.4.1
  - @glissade/player@0.4.1
  - @glissade/core@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [056817c]
- Updated dependencies [869d406]
- Updated dependencies [3986798]
  - @glissade/scene@0.4.0
  - @glissade/backend-canvas2d@0.4.0
  - @glissade/player@0.4.0
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
  - @glissade/player@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [715be32]
- Updated dependencies [dcb28f2]
  - @glissade/core@0.2.0
  - @glissade/player@0.2.0
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
  - @glissade/player@0.1.0
