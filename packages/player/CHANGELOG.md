# @glissade/player

## 0.15.0-pre.0

### Patch Changes

- Updated dependencies [c87e88b]
- Updated dependencies [53030d0]
  - @glissade/core@0.15.0-pre.0
  - @glissade/scene@0.15.0-pre.0
  - @glissade/backend-canvas2d@0.15.0-pre.0

## 0.14.0

### Patch Changes

- Updated dependencies [f13486d]
- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7456761]
  - @glissade/core@0.14.0
  - @glissade/scene@0.14.0
  - @glissade/backend-canvas2d@0.14.0

## 0.14.0-pre.1

### Patch Changes

- Updated dependencies [f13486d]
  - @glissade/core@0.14.0-pre.1
  - @glissade/scene@0.14.0-pre.1
  - @glissade/backend-canvas2d@0.14.0-pre.1

## 0.14.0-pre.0

### Patch Changes

- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7456761]
  - @glissade/scene@0.14.0-pre.0
  - @glissade/core@0.14.0-pre.0
  - @glissade/backend-canvas2d@0.14.0-pre.0

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

## 0.13.0-pre.3

### Patch Changes

- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0-pre.3
  - @glissade/backend-canvas2d@0.13.0-pre.3
  - @glissade/scene@0.13.0-pre.3

## 0.13.0-pre.2

### Patch Changes

- Updated dependencies [8bec181]
  - @glissade/core@0.13.0-pre.2
  - @glissade/backend-canvas2d@0.13.0-pre.2
  - @glissade/scene@0.13.0-pre.2

## 0.13.0-pre.1

### Patch Changes

- Updated dependencies [d1e81b7]
- Updated dependencies [d1e81b7]
  - @glissade/core@0.13.0-pre.1
  - @glissade/scene@0.13.0-pre.1
  - @glissade/backend-canvas2d@0.13.0-pre.1

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

## 0.12.1

### Patch Changes

- Updated dependencies [56fa1f3]
  - @glissade/core@0.12.1
  - @glissade/backend-canvas2d@0.12.1
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

## 0.12.0-pre.1

### Patch Changes

- Updated dependencies [78393f1]
  - @glissade/core@0.12.0-pre.1
  - @glissade/backend-canvas2d@0.12.0-pre.1
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

## 0.11.0

### Minor Changes

- 6d3e061: `Player` gains a reactive `playingSignal: ReadonlySignal<boolean>` that invalidates on every play/pause/settle transition. React's `usePlayerState` now tracks it, so a custom play/pause UI (e.g. `<ScenePlayer controls>`) updates its button/label on pause — previously it read a non-reactive getter and only re-rendered on playhead motion, so the label went stale after pausing. (0.11 canary fix.)

### Patch Changes

- c7c6660: Publishing & release readiness: add per-package `engines.node >=20.19` to every publishable package, and introduce the unscoped `glissade` umbrella package — a one-import realtime embed surface that re-exports `@glissade/core`, `@glissade/scene`, and `@glissade/player` (and only those, per the §7.1 import direction). Also documents the `0.x` lockstep breaking-change policy in a root `BREAKING.md`.
- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
  - @glissade/core@0.11.0
  - @glissade/scene@0.11.0
  - @glissade/backend-canvas2d@0.11.0

## 0.11.0-pre.1

### Minor Changes

- 6d3e061: `Player` gains a reactive `playingSignal: ReadonlySignal<boolean>` that invalidates on every play/pause/settle transition. React's `usePlayerState` now tracks it, so a custom play/pause UI (e.g. `<ScenePlayer controls>`) updates its button/label on pause — previously it read a non-reactive getter and only re-rendered on playhead motion, so the label went stale after pausing. (0.11 canary fix.)

### Patch Changes

- @glissade/backend-canvas2d@0.11.0-pre.1
- @glissade/core@0.11.0-pre.1
- @glissade/scene@0.11.0-pre.1

## 0.11.0-pre.0

### Patch Changes

- c7c6660: Publishing & release readiness: add per-package `engines.node >=20.19` to every publishable package, and introduce the unscoped `glissade` umbrella package — a one-import realtime embed surface that re-exports `@glissade/core`, `@glissade/scene`, and `@glissade/player` (and only those, per the §7.1 import direction). Also documents the `0.x` lockstep breaking-change policy in a root `BREAKING.md`.
- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
  - @glissade/core@0.11.0-pre.0
  - @glissade/scene@0.11.0-pre.0
  - @glissade/backend-canvas2d@0.11.0-pre.0

## 0.10.1

### Patch Changes

- Updated dependencies [f9f7ebe]
- Updated dependencies [7482378]
  - @glissade/core@0.10.1
  - @glissade/scene@0.10.1
  - @glissade/backend-canvas2d@0.10.1

## 0.10.1-pre.1

### Patch Changes

- Updated dependencies [f9f7ebe]
  - @glissade/core@0.10.1-pre.1
  - @glissade/scene@0.10.1-pre.1
  - @glissade/backend-canvas2d@0.10.1-pre.1

## 0.10.1-pre.0

### Patch Changes

- Updated dependencies [7482378]
  - @glissade/core@0.10.1-pre.0
  - @glissade/scene@0.10.1-pre.0
  - @glissade/backend-canvas2d@0.10.1-pre.0

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

## 0.10.0-pre.1

### Patch Changes

- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
  - @glissade/scene@0.10.0-pre.1
  - @glissade/core@0.10.0-pre.1
  - @glissade/backend-canvas2d@0.10.0-pre.1

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

## 0.9.1

### Patch Changes

- @glissade/backend-canvas2d@0.9.1
- @glissade/core@0.9.1
- @glissade/scene@0.9.1

## 0.9.1-pre.0

### Patch Changes

- @glissade/backend-canvas2d@0.9.1-pre.0
- @glissade/core@0.9.1-pre.0
- @glissade/scene@0.9.1-pre.0

## 0.9.0

### Patch Changes

- 04a1059: feat(fonts): FontRegistry + strict-mode font validation + cmap glyph coverage (§3.6)

  Explicit fonts grow up. `AssetRef` gains optional `faces` (weight/style variants)
  and `fallback` (the family chain) — purely additive: a bare `{ kind: 'font', url }`
  stays the single 400/normal face with a `[family]` chain, so every existing
  document renders byte-identically.

  New in `@glissade/core` (DEV/export-path only, never in `evaluate()`, tree-shaken
  from real embeds):

  - `buildFontRegistry(assets)` → `FontRegistry` with `has`, `faces()`,
    `resolveFace(family, weight, style)` (CSS nearest-weight), and
    `fallbackChain(family)`.
  - `parseCmap(bytes)` — a pure, zero-dep sfnt `cmap` reader (formats 4 + 12)
    returning the covered code points; malformed input yields an empty set.
  - `validateFonts(usages, registry, cmaps, mode)` + `FontValidationError` —
    reports unregistered non-generic families and uncovered glyphs (the
    "héllo 👋 renders emoji in Chrome, tofu in Skia" bug). Generic and
    caller-supplied OS families are exempt, so a default-font Text never errors.

  New in `@glissade/scene`: `collectTextUsages(scene)`, `validateSceneFonts(scene,
doc, loadBytes, opts)` (node-walk + caller I/O → core validation), and
  `TextProps.fontStyle: 'normal' | 'italic'` threaded into `FontSpec` (omitted when
  normal, so goldens are unchanged).

  Strict-vs-dev is a per-render/per-export OPTION (default dev-warn), never a
  Timeline flag: `exportVideo({ strictFonts })`, `gs render --strict`, and a
  `mount({ strictFonts })` option. All three loaders now register EVERY declared
  face (not one-per-asset): export-web awaits each face before frame 0, the CLI
  registers each path via `GlobalFonts`, the player loads non-awaited.

- Updated dependencies [f3b471b]
- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0
  - @glissade/scene@0.9.0
  - @glissade/backend-canvas2d@0.9.0

## 0.9.0-pre.1

### Patch Changes

- Updated dependencies [f3b471b]
  - @glissade/core@0.9.0-pre.1
  - @glissade/scene@0.9.0-pre.1
  - @glissade/backend-canvas2d@0.9.0-pre.1

## 0.9.0-pre.0

### Patch Changes

- 04a1059: feat(fonts): FontRegistry + strict-mode font validation + cmap glyph coverage (§3.6)

  Explicit fonts grow up. `AssetRef` gains optional `faces` (weight/style variants)
  and `fallback` (the family chain) — purely additive: a bare `{ kind: 'font', url }`
  stays the single 400/normal face with a `[family]` chain, so every existing
  document renders byte-identically.

  New in `@glissade/core` (DEV/export-path only, never in `evaluate()`, tree-shaken
  from real embeds):

  - `buildFontRegistry(assets)` → `FontRegistry` with `has`, `faces()`,
    `resolveFace(family, weight, style)` (CSS nearest-weight), and
    `fallbackChain(family)`.
  - `parseCmap(bytes)` — a pure, zero-dep sfnt `cmap` reader (formats 4 + 12)
    returning the covered code points; malformed input yields an empty set.
  - `validateFonts(usages, registry, cmaps, mode)` + `FontValidationError` —
    reports unregistered non-generic families and uncovered glyphs (the
    "héllo 👋 renders emoji in Chrome, tofu in Skia" bug). Generic and
    caller-supplied OS families are exempt, so a default-font Text never errors.

  New in `@glissade/scene`: `collectTextUsages(scene)`, `validateSceneFonts(scene,
doc, loadBytes, opts)` (node-walk + caller I/O → core validation), and
  `TextProps.fontStyle: 'normal' | 'italic'` threaded into `FontSpec` (omitted when
  normal, so goldens are unchanged).

  Strict-vs-dev is a per-render/per-export OPTION (default dev-warn), never a
  Timeline flag: `exportVideo({ strictFonts })`, `gs render --strict`, and a
  `mount({ strictFonts })` option. All three loaders now register EVERY declared
  face (not one-per-asset): export-web awaits each face before frame 0, the CLI
  registers each path via `GlobalFonts`, the player loads non-awaited.

- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0-pre.0
  - @glissade/scene@0.9.0-pre.0
  - @glissade/backend-canvas2d@0.9.0-pre.0

## 0.8.1

### Patch Changes

- @glissade/backend-canvas2d@0.8.1
- @glissade/core@0.8.1
- @glissade/scene@0.8.1

## 0.8.1-pre.1

### Patch Changes

- @glissade/backend-canvas2d@0.8.1-pre.1
- @glissade/core@0.8.1-pre.1
- @glissade/scene@0.8.1-pre.1

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
