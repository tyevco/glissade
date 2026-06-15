# @glissade/scene

## 0.6.1

### Patch Changes

- @glissade/core@0.6.1

## 0.6.0

### Minor Changes

- 301fd07: `pathFromSegs(segs): PathValue` — the inverse of `Path.pathSegs`, so geometry from `roundedRectSegs`, `sketchStrokes`, or `flatten` can be placed on a `Path` node (to morph it, follow it with a motion path, or draw it on). C/Q become an anchor + relative in/out tangents (Q is promoted to cubic), L is a zero-tangent vertex, E samples to vertices, and Z closes the contour — round-tripping cubic contours exactly. Closes the biggest friction in the sketch → render path.
- 4c6424d: `reveal` draw-on now works on ANY stroked shape, not just sketched ones. A plain `Path`/`Rect`/`Circle` with a stroke and `reveal < 1` (track `<id>/reveal`) strokes itself on via a per-contour retreating dash — the satisfying hand-drawing-itself effect for plain geometry (pair with `pathFromSegs` to draw on a sketched outline). `reveal >= 1` (the default) keeps the single un-dashed stroke, so existing scenes are byte-identical.
- 37e48be: Hachure fill for sketched shapes — `ShapeProps.sketchFill: HachureSpec { angleRad, gap, roughness? }` lays sketchy parallel hatch lines clipped to the shape (the pencil/crayon "filled" look), under the roughened outline. Pure path math (`hachureLines` exported), seeded from the same `sketchSeed` stream (consumed after the outline, so it's deterministic and byte-stable on both backends). Requires a `sketch` style on the shape.
- 977b3d5: Whiteboard kit: **`drawOn(target, opts)`** builds a `<id>/reveal` track running 0→1, so a stroked or sketched shape hand-draws itself on in one call; **`drawOnEach(targets, opts)`** cascades a list of shapes drawing on one after another (the classic whiteboard sequence) by staggering their reveal tracks. Composes the sketch `reveal` draw-on with the core `stagger` helper.

### Patch Changes

- 12c5841: `Shape` now emits a dev-mode warning when `sketchFill` is set without a `sketch` style — hachure fill is drawn only by the sketch renderer, so `sketchFill` alone was silently ignored. Dev-only (no DisplayList change); consumer-reported papercut.
- Updated dependencies [6c07c96]
  - @glissade/core@0.6.0

## 0.6.0-pre.1

### Minor Changes

- 977b3d5: Whiteboard kit: **`drawOn(target, opts)`** builds a `<id>/reveal` track running 0→1, so a stroked or sketched shape hand-draws itself on in one call; **`drawOnEach(targets, opts)`** cascades a list of shapes drawing on one after another (the classic whiteboard sequence) by staggering their reveal tracks. Composes the sketch `reveal` draw-on with the core `stagger` helper.

### Patch Changes

- Updated dependencies [6c07c96]
  - @glissade/core@0.6.0-pre.1

## 0.6.0-pre.0

### Minor Changes

- 301fd07: `pathFromSegs(segs): PathValue` — the inverse of `Path.pathSegs`, so geometry from `roundedRectSegs`, `sketchStrokes`, or `flatten` can be placed on a `Path` node (to morph it, follow it with a motion path, or draw it on). C/Q become an anchor + relative in/out tangents (Q is promoted to cubic), L is a zero-tangent vertex, E samples to vertices, and Z closes the contour — round-tripping cubic contours exactly. Closes the biggest friction in the sketch → render path.
- 4c6424d: `reveal` draw-on now works on ANY stroked shape, not just sketched ones. A plain `Path`/`Rect`/`Circle` with a stroke and `reveal < 1` (track `<id>/reveal`) strokes itself on via a per-contour retreating dash — the satisfying hand-drawing-itself effect for plain geometry (pair with `pathFromSegs` to draw on a sketched outline). `reveal >= 1` (the default) keeps the single un-dashed stroke, so existing scenes are byte-identical.
- 37e48be: Hachure fill for sketched shapes — `ShapeProps.sketchFill: HachureSpec { angleRad, gap, roughness? }` lays sketchy parallel hatch lines clipped to the shape (the pencil/crayon "filled" look), under the roughened outline. Pure path math (`hachureLines` exported), seeded from the same `sketchSeed` stream (consumed after the outline, so it's deterministic and byte-stable on both backends). Requires a `sketch` style on the shape.

### Patch Changes

- @glissade/core@0.6.0-pre.0

## 0.5.0

### Minor Changes

- ca2150f: `followPath` now follows a **morphing** path live: pass it a `Path` node (rather than a snapshot of its data) and it re-samples the current geometry as the route bends along a `'<id>/d'` track — the cursor rides the live line. The arc-length table is memoized by PathValue reference, so a static route (a raw `PathValue`, or a Path node whose data never changes) still builds its table only once; pass a `PathValue` directly for a fixed route. Pure and deterministic (re-sampling is a pure function of the current path); golden-covered.
- e1865d2: Motion along a path: drive a node along a `Path`'s geometry over time. `followPath(target, path, { progress, orient, orientOffset })` is a companion node that owns the target's `position` (and `rotation`, when `orient`) and binds them — pull-based, no eval-order side effect — to its own animatable `progress` (0→1, track `<id>/progress`). Travel is **arc-length parameterized** (constant speed, not bunched at control points), and `orient` rotates the target to the path tangent (degrees) so a cursor or arrow points where it's heading.

  The pure sampler is exported too: `motionPath(path)` → `{ length, at(s), tangentAt(s), atProgress(u), tangentAtProgress(u) }`, plus `pointAtLength(path, s)` / `pathLength(path)`. Deterministic (static table built once, pure of progress) and in the golden corpus. v1 snapshots a static `PathValue` (pass a `Path` node's `data()`); morphing-path follow is a follow-up.

- d679e81: Sketch **draw-on**: a sketched shape can stroke ITSELF on via `ShapeProps.reveal` (0..1, track `<id>/reveal`, default 1 = whole). It's implemented as a retreating per-contour dash (`dash = [len, len]`, `dashOffset = len * (1 - reveal)`, `len` from `arcLength`), so the hand-drawn outline draws in. Reveal ≥ 1 takes the original byte-identical path, so existing sketched shapes are unchanged. Precise for single-contour shapes; multi-contour shapes reveal each contour in parallel. Pure of `reveal` and deterministic. (Relies on the raster2d `dashOffset` fix; hachure fill remains a follow-up.)
- 8f631ab: Hand-drawn **sketch styles** — give any shape a marker / crayon / pencil / ink / chalk look via geometric roughening (not raster textures). `ShapeProps.sketch: SketchStyle` flattens the outline and redraws each segment as a jittered, bowed, multi-pass stroke; the solid `fill` (if any) renders underneath. Works on Rect, Circle, and Path (the Circle/rounded-rect 'E' arcs flatten correctly). Seeded by `sketchSeed` (default a stable hash of the node id) and consumed fresh each draw, so it's deterministic and byte-identical on both backends — golden-covered. Invalid styles throw at construction (`validateSketch`). The pure helpers `roughen`, `flatten`, and `arcLength` are exported. (Distinct from `highlight()`'s marker _highlight_ — this is the marker _stroke style_.)
- 43b326b: `typewriter()` — edit-event-aware typing, so a terminal cold-open can type, delete, and retype _different_ text (the monotonic `Text.reveal` can't). It compiles a compact edit script (`{ type }`, `{ delete }`, `{ hold }`, per-step `perChar`) into a hold-key **string track** for `Text.text` plus a per-keystroke schedule `EditMark[] = { time, kind: 'insert' | 'delete', grapheme, value }` (backspaces included, carrying the removed grapheme for keystroke SFX). Drive `Text.text` with the track and leave `reveal` at its default — the whole current string shows, deletion just works, and `textCursor` rides the end of the live text with no extra wiring. No changes to `Text`/`draw`; `segmentGraphemes` is now exported too.
- 27b4b49: Typewriter reveal primitive on `Text`. A new `reveal` prop/track (`'<id>/reveal'`) shows the first N graphemes of the laid-out text, left-to-right — the terminal/typed-text effect as pure data. Default `Infinity` (fully shown), so every existing scene and golden is byte-identical; line breaking runs on the full text first, so revealing never reflows.

  - `Text.graphemes(measurer?)` — the laid-out grapheme stream (emoji/combining marks stay whole), to author a per-keystroke staircase: `track('title/reveal', 'number', g.map((_, i) => key(t0 + i * 0.05, i + 1, { interp: 'hold' })))`.
  - `Text.revealHead(measurer?)` — the caret point just after the last revealed grapheme.
  - `TextCursor` / `textCursor(text, opts?)` — a sibling caret that rides the reveal head: solid while typing, then blinking once fully shown.
  - `revealSchedule(text, revealTrack, measurer?): RevealMark[]` — a pure per-grapheme schedule (`{ charIndex, grapheme, time, x, y, line }`), the direct analogue of narrate's `TimedWord[]`. This is the contract `@glissade/sfx` keystroke-sync will consume (one click per mark at `at: time`); char-class policy (skip space/newline, pick a sample) is left to the audio layer.

- 4495359: `typewriter()` now returns `steps: StepMark[]` — one `{ index, start, end, value }` per edit step, the phrase boundaries of the performance. Drive sibling UI (an attempts counter, a progress dot) off `steps[i].end` instead of recomputing wall-clock spans against the edit script.

### Patch Changes

- 4e93a59: The raster2d interpreter now honors `StrokeStyle.dashOffset` (declared but previously dropped): it sets `ctx.lineDashOffset` inside the existing dash guard and resets it, so dashed strokes can be phase-shifted. Byte-neutral for non-dashed strokes (the only path that runs it). Unblocks draw-on / stroke-reveal via a retreating dash.
- adc7941: `typewriter()` gains `opts.gap` — a default pause inserted between consecutive edit steps (default 0 = unchanged). It's dead time, excluded from either adjacent `StepMark`'s start/end (so a counter riding `steps[i].end` is unaffected), and composes with explicit per-step `{ hold }`.
  - @glissade/core@0.5.0

## 0.5.0-pre.7

### Patch Changes

- @glissade/core@0.5.0-pre.7

## 0.5.0-pre.6

### Minor Changes

- d679e81: Sketch **draw-on**: a sketched shape can stroke ITSELF on via `ShapeProps.reveal` (0..1, track `<id>/reveal`, default 1 = whole). It's implemented as a retreating per-contour dash (`dash = [len, len]`, `dashOffset = len * (1 - reveal)`, `len` from `arcLength`), so the hand-drawn outline draws in. Reveal ≥ 1 takes the original byte-identical path, so existing sketched shapes are unchanged. Precise for single-contour shapes; multi-contour shapes reveal each contour in parallel. Pure of `reveal` and deterministic. (Relies on the raster2d `dashOffset` fix; hachure fill remains a follow-up.)
- 8f631ab: Hand-drawn **sketch styles** — give any shape a marker / crayon / pencil / ink / chalk look via geometric roughening (not raster textures). `ShapeProps.sketch: SketchStyle` flattens the outline and redraws each segment as a jittered, bowed, multi-pass stroke; the solid `fill` (if any) renders underneath. Works on Rect, Circle, and Path (the Circle/rounded-rect 'E' arcs flatten correctly). Seeded by `sketchSeed` (default a stable hash of the node id) and consumed fresh each draw, so it's deterministic and byte-identical on both backends — golden-covered. Invalid styles throw at construction (`validateSketch`). The pure helpers `roughen`, `flatten`, and `arcLength` are exported. (Distinct from `highlight()`'s marker _highlight_ — this is the marker _stroke style_.)

### Patch Changes

- 4e93a59: The raster2d interpreter now honors `StrokeStyle.dashOffset` (declared but previously dropped): it sets `ctx.lineDashOffset` inside the existing dash guard and resets it, so dashed strokes can be phase-shifted. Byte-neutral for non-dashed strokes (the only path that runs it). Unblocks draw-on / stroke-reveal via a retreating dash.
- adc7941: `typewriter()` gains `opts.gap` — a default pause inserted between consecutive edit steps (default 0 = unchanged). It's dead time, excluded from either adjacent `StepMark`'s start/end (so a counter riding `steps[i].end` is unaffected), and composes with explicit per-step `{ hold }`.
  - @glissade/core@0.5.0-pre.6

## 0.5.0-pre.5

### Minor Changes

- 4495359: `typewriter()` now returns `steps: StepMark[]` — one `{ index, start, end, value }` per edit step, the phrase boundaries of the performance. Drive sibling UI (an attempts counter, a progress dot) off `steps[i].end` instead of recomputing wall-clock spans against the edit script.

### Patch Changes

- @glissade/core@0.5.0-pre.5

## 0.5.0-pre.4

### Minor Changes

- ca2150f: `followPath` now follows a **morphing** path live: pass it a `Path` node (rather than a snapshot of its data) and it re-samples the current geometry as the route bends along a `'<id>/d'` track — the cursor rides the live line. The arc-length table is memoized by PathValue reference, so a static route (a raw `PathValue`, or a Path node whose data never changes) still builds its table only once; pass a `PathValue` directly for a fixed route. Pure and deterministic (re-sampling is a pure function of the current path); golden-covered.

### Patch Changes

- @glissade/core@0.5.0-pre.4

## 0.5.0-pre.3

### Minor Changes

- e1865d2: Motion along a path: drive a node along a `Path`'s geometry over time. `followPath(target, path, { progress, orient, orientOffset })` is a companion node that owns the target's `position` (and `rotation`, when `orient`) and binds them — pull-based, no eval-order side effect — to its own animatable `progress` (0→1, track `<id>/progress`). Travel is **arc-length parameterized** (constant speed, not bunched at control points), and `orient` rotates the target to the path tangent (degrees) so a cursor or arrow points where it's heading.

  The pure sampler is exported too: `motionPath(path)` → `{ length, at(s), tangentAt(s), atProgress(u), tangentAtProgress(u) }`, plus `pointAtLength(path, s)` / `pathLength(path)`. Deterministic (static table built once, pure of progress) and in the golden corpus. v1 snapshots a static `PathValue` (pass a `Path` node's `data()`); morphing-path follow is a follow-up.

- 43b326b: `typewriter()` — edit-event-aware typing, so a terminal cold-open can type, delete, and retype _different_ text (the monotonic `Text.reveal` can't). It compiles a compact edit script (`{ type }`, `{ delete }`, `{ hold }`, per-step `perChar`) into a hold-key **string track** for `Text.text` plus a per-keystroke schedule `EditMark[] = { time, kind: 'insert' | 'delete', grapheme, value }` (backspaces included, carrying the removed grapheme for keystroke SFX). Drive `Text.text` with the track and leave `reveal` at its default — the whole current string shows, deletion just works, and `textCursor` rides the end of the live text with no extra wiring. No changes to `Text`/`draw`; `segmentGraphemes` is now exported too.

### Patch Changes

- @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Minor Changes

- 27b4b49: Typewriter reveal primitive on `Text`. A new `reveal` prop/track (`'<id>/reveal'`) shows the first N graphemes of the laid-out text, left-to-right — the terminal/typed-text effect as pure data. Default `Infinity` (fully shown), so every existing scene and golden is byte-identical; line breaking runs on the full text first, so revealing never reflows.

  - `Text.graphemes(measurer?)` — the laid-out grapheme stream (emoji/combining marks stay whole), to author a per-keystroke staircase: `track('title/reveal', 'number', g.map((_, i) => key(t0 + i * 0.05, i + 1, { interp: 'hold' })))`.
  - `Text.revealHead(measurer?)` — the caret point just after the last revealed grapheme.
  - `TextCursor` / `textCursor(text, opts?)` — a sibling caret that rides the reveal head: solid while typing, then blinking once fully shown.
  - `revealSchedule(text, revealTrack, measurer?): RevealMark[]` — a pure per-grapheme schedule (`{ charIndex, grapheme, time, x, y, line }`), the direct analogue of narrate's `TimedWord[]`. This is the contract `@glissade/sfx` keystroke-sync will consume (one click per mark at `at: time`); char-class policy (skip space/newline, pick a sample) is left to the audio layer.

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

- 70159ad: Adoption-report follow-ups. TokenHighlight ranges gain an `offset` target (`'<id>/<rangeId>/offset'` + .x/.y) — per-range shakes and nudges without moving sibling ranges (downstream's red-flip shake previously had to jitter the whole node). `gs render` auto-mix never double-adds the bed: when the timeline's audio already references the stem (any url spelling resolving to the same file), the bed is skipped with a note — a coherent duplicate measured +6dB downstream. Docs: em-derived padding guidance for tokenHighlight at high resolutions; gainDb override (not compose) semantics pinned.
  - @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- 40f5a31: The two downstream feature requests, built from their production specs. `tokenHighlight(text, { ranges })` (scene): sub-line multi-color token highlights over wordBoxes — each range matches a token (whitespace-insensitive boundary-exact runs, or [wordIndex, wordIndex]) and carries its OWN animatable fill/opacity/progress/scale targets; ranges validate at construction and throw on copy drift at draw (rematch: true for animated text); wrap-spanning ranges produce one rect per line segment. Music manifest blessed (narrate): `*.music.timing.json` ({musicVersion, bpm, beatsPerCycle, cps, durationSec, offsetSec, stem, gainDb}) with the beat-0-equals-sample-0 invariant and cps↔bpm validation; `music(timing, at)` anchors (beat/cycle/nearestBeat/nextBeat/grid) mirror narration(); `m.clip()` composes bed gainDb (10^(dB/20) over the whole envelope) with duckEnvelope under a narration manifest. `gs render` auto-mix parity: a sibling music manifest with a stem joins the mix automatically, ducked under narration when both manifests sit next to the scene — the zero-config narrated-explainer-with-bed; `--music off` opts out.
  - @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- 2282bcb: The downstream-friction batch (driven by a consuming project's 0.3.0→0.4.2 report). `createMeasurer({ fonts })` in backend-skia + `setDefaultMeasurer()` in scene bless factory-time measurement — Text pulls and un-injected scenes fall back through the process default before the estimator, so component factories measure with the rasterizer's real metrics (scene-injected measurers still win). `springTo(endT, from, to, cfg)` in core returns the [launch, settle] key pair with the spring-duration arithmetic done — settle-ON-the-beat without hand math. `Text.wordBoxes()` trims whitespace that punctuation-gluing folds into a segment (' $' → '$'), so boxes cover exactly the ink. `AudioClip.gain` accepts keys-only envelopes (`{ keys }`); the meaningless-but-mandatory target string is gone (full Tracks still work structurally). `duckEnvelope(timing, opts)` in narrate derives the music-bed ducking gain from the narration manifest (segment windows, attack/release ramps, near-window merging) — upstreamed from downstream. `gs render` progress detects non-TTY stderr and emits sparse newline-terminated updates instead of an unbroken \r stream.
- Updated dependencies [2282bcb]
  - @glissade/core@0.4.3

## 0.4.2

### Patch Changes

- 53f6f9f: `Text.wordBoxes()` — per-word ink boxes within each laid-out line, from the same segmentation the line breaker flows (Intl.Segmenter boundaries, punctuation glued to its word), positioned by cumulative prefix advances so cross-word kerning is exact and word widths sum to the line. The substrate for sub-line multi-color token highlights and word-synced karaoke (pair index-wise with a narration manifest's word timestamps). `segmentWords` is exported alongside `breakLines`.
  - @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- 80d9ac1: Anchors, measured text, and marker highlights. `anchor` on any node with an intrinsic box pins `position` to a fraction of it (presets or `[ax, ay]`) and is the rotation/scale pivot (the Lottie model) — grow direction falls out: a 'left'-anchored width track sweeps rightward, `[0, 1]` grows bars upward. Unset keeps the legacy origin, byte-stable. `Text.measuredSize()` and `Text.lineBoxes()` expose the wrapped box and per-line ink boxes as pure pulls over the same line-break pass that draws — no hand-calculated text dimensions. `highlight(text, opts)` sweeps per-line rounded marker rects via one 0→1 `progress` track (reading order, width-weighted constant speed, multiply-blend ink, line count fully dynamic); key progress from narration word timestamps for karaoke. Hit testing distinguishes draw-space boxes (`drawOffset`) from flow placement (`flowOffset`), so anchored nodes hit exactly where they draw, including rotation around the pivot.
  - @glissade/core@0.4.1

## 0.4.0

### Minor Changes

- 869d406: `glow(color, radius, intensity)` — outer glow as stacked zero-offset drop-shadows: one line, deterministic on both backends (it is just filters), and signal-bindable so a glow can follow an animated fill or machine state live. The interactive showcase's toggles now glow in their handoff color while on.
- 3986798: WebGPU shader effects (§3.7). `ShaderEffect` is a group whose rasterized subtree runs through a WGSL pass — uniforms are per-name signals registered as `u.<name>` track targets, so shader params animate like any property. The node and `ShaderRef` IR are PURE DATA in scene; the GPU lives only in the new browser-only `@glissade/effects-webgpu` (never importable by the headless pipeline — §7.1-enforced): `loadWebGPUEffects()` calibrates the present path (zero-latency sync on hardware, one-frame-deferred on stacks that present late), with byte-upload and acquisition-deadline fallbacks for hostile environments. Built-in `effects.noiseDisplace` (animated value-noise displacement — perlin-style warps) and `effects.grain`. Headless and webgpu-less browsers degrade per `caps.shaders`: passthrough with one warning by default, hard error opt-in. Explicitly outside the determinism guarantee.

### Patch Changes

- 056817c: Filtered group composites now clip to the layer's painted bounds plus the filter's reach. Canvas `ctx.filter` cost scales with the destination area, so a small glowing node was paying for full-canvas gaussians every frame on software-rendered (no-GPU) browsers — measured 16× faster on the isolated composite and ~3.4× on the filter-heavy showcase scene. Pixel-invisible by construction: conservative device-space bounds (miter-aware strokes, measured text), 3×radius gaussian reach, color-only filters map transparent→transparent; non-source-over blends and shader layers never clip. Golden suite unchanged byte-for-byte.
  - @glissade/core@0.4.0

## 0.3.0

### Minor Changes

- fbb12ca: Group filters (§3.4): `FilterSpec` is now a closed, validated union — `blur`, `drop-shadow`, `brightness`, `contrast`, `saturate` — never a CSS passthrough string. Nodes take `filters` as a prop (it's a signal, so a computed binding animates a blur radius from ordinary tracks), filtered subtrees composite as a unit, and both backends apply the compiled filter on the group's composite draw. Skia output is golden-pinned per filter; browser↔Skia parity measured at SSIM ≥ 0.9992 on the filters corpus — no per-filter exclusions needed.
- ab8ca37: Auto-sized Layout containers (§3.2): `width`/`height: 'auto'` size an axis from content via Yoga, and `layout.computedSize()` exposes the resolved size as a pure pull — bind a sibling to it (`height: () => panel.computedSize().h`) and backgrounds track content growth with no hand-synced tracks. Nested auto layouts report their computed `intrinsicSize`. The `LayoutEngine` seam's `compute` now takes `'auto'` axes and returns the resolved container size alongside the boxes; fixed axes keep spec-exact (unrounded) values, so existing layouts — including the byte-exact goldens — are untouched. `createScene` injects a live measurer reference into every node so derived-size bindings measure with the same rasterizer the flow uses.
- bc9add6: The shared `Raster2D` interpreter: one DisplayList command walk in `@glissade/scene`, generic over the host's canvas/path/drawable flavor. Both backends become thin adapters (context acquisition + a path constructor + a layer-canvas factory), so the twin rasterizers structurally cannot drift. Behavior-identical: every golden frame byte-matches through the refactor and the SSIM parity suite is unchanged. `Raster2D`, `fontString`, and the host interfaces are exported for future backends.
- e89c3d0: The `path` value type + `Path` node (Lottie S0). `PathValue` is bezier contours in vertex form (`{closed, v, in, out}[]` — Lottie's own representation, plain JSON); morphs are pairwise lerps of anchors and tangents, exactly how lottie-web interpolates, with mismatched topology snapping (one-time dev warning) instead of interpolating garbage. `Path extends Shape` registers its geometry as the animatable `<id>/d` track target and emits cubic segments to the existing IR — zero backend work. Interact gains the §C.3 fill-rule hit test (flattened nonzero winding): a star misses in its notches, a reversed inner contour cuts a real hole. `inferValueType` sniffs `PathValue` so the builder works natively. Golden-pinned with an animated star↔blob morph; browser↔Skia parity on the paths corpus measured SSIM 1.00000.

### Patch Changes

- Updated dependencies [e89c3d0]
  - @glissade/core@0.3.0

## 0.2.0

### Minor Changes

- dcb28f2: Drivers, listeners, and hit testing (v2 addendum §C). `@glissade/player`: `Driver` generalizes to `InputDriver<T>` (the v1 alias is intact; `DriverContext.duration` is now optional) and `scrollDriver` writes normalized progress 0..1 in input mode. `@glissade/interact`: `pointerDriver` (rAF-coalesced, scene-scaled, optional driver-resident closed-form spring smoothing), `splitVec2` fan-out, `springFilter`, `createListeners` (hover/press/click → machine inputs, touch-emulated hover filtered), geometric `hitTest` (per-node-type shape tests on inverted cached world matrices, `hitArea` overrides, `interactiveChildren` pruning), and the separate `@glissade/interact/audio` entry with offline `audioAmplitudeTrack` (RMS or Goertzel band amplitude compiled to an ordinary Track). `@glissade/scene`: matrix `invert`, and nodes gain `interactive` / `interactiveChildren` / `hitArea`.

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
