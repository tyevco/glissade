# @glissade/core

## 0.43.1

## 0.43.1-pre.0

## 0.43.0

## 0.43.0-pre.1

## 0.43.0-pre.0

## 0.42.0

## 0.42.0-pre.1

## 0.42.0-pre.0

## 0.41.1

### Patch Changes

- ed74686: `Expr`: fail loud on non-finite results + accept lowercase constants

  Two papercuts from the 0.40 evaluator review (edcc + ai-training):

  - **Non-finite results now fail loud.** A formula that evaluates to `NaN` (`0/0`, `sqrt` of a negative) or `±Infinity` (`1/0`) used to coerce silently to `null` at the bound prop — a gap in an otherwise strictly fail-loud evaluator. Sampling such a formula now throws `ExprError` naming the formula and the `t` at which it blew up, so a broken expression surfaces immediately instead of a silently-missing animation. The guard fires per-sample, so a formula that is finite everywhere except one `t` still samples normally elsewhere.
  - **Lowercase constant aliases.** `pi`, `tau`, and `e` now resolve to the same values as `PI`/`TAU`/`E` (they used to throw `unknown variable`), so a copy-pasted lowercase formula just works. Scientific-notation numbers (`1e3`) are unaffected. `EXPR_CONSTANTS` still advertises only the canonical uppercase names.

## 0.41.1-pre.0

### Patch Changes

- `Expr`: fail loud on non-finite results + accept lowercase constants

  Two papercuts from the 0.40 evaluator review (edcc + ai-training):

  - **Non-finite results now fail loud.** A formula that evaluates to `NaN` (`0/0`, `sqrt` of a negative) or `±Infinity` (`1/0`) used to coerce silently to `null` at the bound prop — a gap in an otherwise strictly fail-loud evaluator. Sampling such a formula now throws `ExprError` naming the formula and the `t` at which it blew up, so a broken expression surfaces immediately instead of a silently-missing animation. The guard fires per-sample, so a formula that is finite everywhere except one `t` still samples normally elsewhere.
  - **Lowercase constant aliases.** `pi`, `tau`, and `e` now resolve to the same values as `PI`/`TAU`/`E` (they used to throw `unknown variable`), so a copy-pasted lowercase formula just works. Scientific-notation numbers (`1e3`) are unaffected. `EXPR_CONSTANTS` still advertises only the canonical uppercase names.

## 0.41.0

## 0.41.0-pre.1

## 0.41.0-pre.0

## 0.40.0

### Minor Changes

- 18f27a0: 0.40: `Expr` — animate a prop by a FORMULA of time

  `exprTrack('orb/position.y', '180 + 120*sin(t*2)')` drives a numeric prop by a
  math formula of the playhead `t` instead of keyframes — orbits, pulses, jitter,
  easing curves as one line. Fed via `tl.tracks([exprTrack(...)])` (the clip-tier
  authoring path).

  - A deterministic evaluator (tokenizer + precedence-climbing parser → closure):
    `+ - * / % ^`, unary ±, parens; constants `PI/TAU/E`; a pure-function whitelist
    (`sin cos clamp lerp smoothstep min max mod floor …`); and `rand(x)` (a seeded
    hash → [0,1) — the ONLY randomness). No `Date`/`Math.random`; an unknown
    identifier/function/arity fails loud at compile time.
  - Binds through the SAME playhead channel keyframes use (`sampleTrack` at `t`), so
    it's a pure function of time — backward scrub, export sharding, and the golden
    byte-comparison all hold. A `golden-expr` showcase (Lissajous orbits) is in the
    corpus.
  - The evaluator lives on the tree-shakeable **`@glissade/core/expr`** subpath, OFF
    the base embed (a metafile guard asserts it) — the base render path carries only
    a tiny compiler-register seam, so the SACRED base embed stays 39.00/39. Importing
    `@glissade/core/expr` activates it; re-exported on the browser bundle as
    `window.glissade.exprTrack`, and surfaced in `describe().helpers`.

  Determinism hash + all existing goldens unchanged (Expr is additive; no
  `core`/`scene` evaluate-path behaviour changed for keyed tracks).

### Patch Changes

- e7cbe29: 0.40.0-pre.1: keep the base embed ≤39 for Expr via a budget-review relocation (revert the 39→40 bump)

  Expr adds an irreducible base sampler seam (~0.17 kB: `sampleTrack`'s `tr.expr`
  branch + `compileTimeline`'s `validateTrack` skip-keys for expr tracks). pre.0
  bumped the base embed 39→40 to seat it — but that contravened the "preserve the
  base-embed budget" constraint, and all three canary seats correctly held their
  promote vote for a human ruling rather than bless it.

  Instead of bumping the SACRED ceiling, this recovers headroom the proven way (the
  0.20 budget-review playbook): `retime` — a pure build-time key-time transform
  (speed/shift/reverse/pingpong), never on the sampleTrack/evaluate hot path — plus
  its private `reversedKeys`/`mirrorEase` helpers (string-heavy) move OFF the base
  core index onto `@glissade/core/clips`. That recovers ~0.5 kB gz, so the base embed
  lands at **38.44/39 WITH Expr's seam** — the ceiling stays 39, no bump.

  - `retime` / `RetimeSpec` now import from `@glissade/core/clips` (not
    `@glissade/core`). `window.glissade.retime` is unaffected (the IIFE re-exports
    `@glissade/core/clips`). `core/clips` budget 8→9 (off the base embed).
  - Determinism hash + all goldens unchanged.

## 0.40.0-pre.1

### Patch Changes

- e7cbe29: 0.40.0-pre.1: keep the base embed ≤39 for Expr via a budget-review relocation (revert the 39→40 bump)

  Expr adds an irreducible base sampler seam (~0.17 kB: `sampleTrack`'s `tr.expr`
  branch + `compileTimeline`'s `validateTrack` skip-keys for expr tracks). pre.0
  bumped the base embed 39→40 to seat it — but that contravened the "preserve the
  base-embed budget" constraint, and all three canary seats correctly held their
  promote vote for a human ruling rather than bless it.

  Instead of bumping the SACRED ceiling, this recovers headroom the proven way (the
  0.20 budget-review playbook): `retime` — a pure build-time key-time transform
  (speed/shift/reverse/pingpong), never on the sampleTrack/evaluate hot path — plus
  its private `reversedKeys`/`mirrorEase` helpers (string-heavy) move OFF the base
  core index onto `@glissade/core/clips`. That recovers ~0.5 kB gz, so the base embed
  lands at **38.44/39 WITH Expr's seam** — the ceiling stays 39, no bump.

  - `retime` / `RetimeSpec` now import from `@glissade/core/clips` (not
    `@glissade/core`). `window.glissade.retime` is unaffected (the IIFE re-exports
    `@glissade/core/clips`). `core/clips` budget 8→9 (off the base embed).
  - Determinism hash + all goldens unchanged.

## 0.40.0-pre.0

### Minor Changes

- 18f27a0: 0.40: `Expr` — animate a prop by a FORMULA of time

  `exprTrack('orb/position.y', '180 + 120*sin(t*2)')` drives a numeric prop by a
  math formula of the playhead `t` instead of keyframes — orbits, pulses, jitter,
  easing curves as one line. Fed via `tl.tracks([exprTrack(...)])` (the clip-tier
  authoring path).

  - A deterministic evaluator (tokenizer + precedence-climbing parser → closure):
    `+ - * / % ^`, unary ±, parens; constants `PI/TAU/E`; a pure-function whitelist
    (`sin cos clamp lerp smoothstep min max mod floor …`); and `rand(x)` (a seeded
    hash → [0,1) — the ONLY randomness). No `Date`/`Math.random`; an unknown
    identifier/function/arity fails loud at compile time.
  - Binds through the SAME playhead channel keyframes use (`sampleTrack` at `t`), so
    it's a pure function of time — backward scrub, export sharding, and the golden
    byte-comparison all hold. A `golden-expr` showcase (Lissajous orbits) is in the
    corpus.
  - The evaluator lives on the tree-shakeable **`@glissade/core/expr`** subpath, OFF
    the base embed (a metafile guard asserts it) — the base render path carries only
    a tiny compiler-register seam, so the SACRED base embed stays 39.00/39. Importing
    `@glissade/core/expr` activates it; re-exported on the browser bundle as
    `window.glissade.exprTrack`, and surfaced in `describe().helpers`.

  Determinism hash + all existing goldens unchanged (Expr is additive; no
  `core`/`scene` evaluate-path behaviour changed for keyed tracks).

## 0.39.0

## 0.39.0-pre.1

## 0.39.0-pre.0

## 0.38.0

## 0.38.0-pre.1

## 0.38.0-pre.0

## 0.37.0

## 0.37.0-pre.1

## 0.37.0-pre.0

## 0.36.0

## 0.36.0-pre.1

## 0.36.0-pre.0

## 0.35.0

## 0.35.0-pre.1

## 0.35.0-pre.0

## 0.34.0

## 0.34.0-pre.1

## 0.34.0-pre.0

## 0.33.0

## 0.33.0-pre.0

## 0.32.0

### Patch Changes

- 4eb1a91: `track()`: fail loud on a non-numeric keyframe value for a numeric type (kill the native-panic footgun)

  Keying a numeric track to a signal _accessor_ (`node.height` instead of `node.height()` — a signal accessor IS a function), or to `NaN`/`Infinity`/`undefined`, used to silently propagate `NaN` through the value-type `lerp` and detonate much later as a **native backend panic** (a Skia abort with no source location). `validateTrack` now checks every key of a `number`/`vec2`-repr track and throws a `TrackValidationError` naming the target and `t`:

  ```
  track 'bar/height': number keyframe at t=1 must be a finite number,
    got a function (a signal accessor? call it — e.g. node.height(), not node.height)
  ```

  Additive: every valid finite key passes unchanged, so all goldens stay byte-identical (determinism holds 0.20→0.32). Affects any track, not just Chart — surfaced by two canary seats validating 0.32's data-viz feature (cards `PH3Tq14kN_1l` / `LPddSlVYosYg`).

## 0.32.0-pre.1

### Patch Changes

- `track()`: fail loud on a non-numeric keyframe value for a numeric type (kill the native-panic footgun)

  Keying a numeric track to a signal _accessor_ (`node.height` instead of `node.height()` — a signal accessor IS a function), or to `NaN`/`Infinity`/`undefined`, used to silently propagate `NaN` through the value-type `lerp` and detonate much later as a **native backend panic** (a Skia abort with no source location). `validateTrack` now checks every key of a `number`/`vec2`-repr track and throws a `TrackValidationError` naming the target and `t`:

  ```
  track 'bar/height': number keyframe at t=1 must be a finite number,
    got a function (a signal accessor? call it — e.g. node.height(), not node.height)
  ```

  Additive: every valid finite key passes unchanged, so all goldens stay byte-identical (determinism holds 0.20→0.32). Affects any track, not just Chart — surfaced by two canary seats validating 0.32's data-viz feature (cards `PH3Tq14kN_1l` / `LPddSlVYosYg`).

## 0.32.0-pre.0

## 0.31.0

## 0.31.0-pre.1

## 0.31.0-pre.0

## 0.30.0

## 0.30.0-pre.0

## 0.29.0

## 0.29.0-pre.0

## 0.28.0

## 0.28.0-pre.1

## 0.28.0-pre.0

## 0.27.1

## 0.27.1-pre.0

## 0.27.0

## 0.27.0-pre.0

## 0.26.0

### Minor Changes

- b3218c9: Motion-craft quick-win: `retime(tracks, spec)` — speed ramps / reverse / pingpong as a pure key-time transform

  The build-time sibling of `stagger`: remap a set of tracks' key TIMES and get ordinary retimed `Track[]` back — no runtime clock warp, no cross-frame state, so `evaluate()` stays a pure function of time and the result is golden-stable and O(log keys) scrubbable.

  - `{ speed }` — slow-mo / fast (key times ÷ speed).
  - `{ shift }` — delay or advance the whole group (seconds).
  - `{ reverse }` — play backward in place: values reversed, span preserved, and each segment's ease **time-mirrored exactly** (built-in eases pair `easeInX ↔ easeOutX`, `cubicBezier` mirrors by point reflection).
  - `{ pingpong }` — forward then back as one there-and-back track.

  Fail-loud (not silent mis-animation) on the causal cases: reversing a **spring** ease or a **hold** segment throws with an actionable message, as does a non-positive `speed` or `reverse` + `pingpong` together. Returns new tracks; inputs untouched. Also on the browser IIFE as `window.glissade.retime`.

  ```js
  import { retime } from "@glissade/core";
  retime(move, { speed: 0.5 }); // half speed
  retime(move, { reverse: true }); // backward
  retime(move, { pingpong: true }); // there and back
  ```

## 0.26.0-pre.1

## 0.26.0-pre.0

### Minor Changes

- b3218c9: Motion-craft quick-win: `retime(tracks, spec)` — speed ramps / reverse / pingpong as a pure key-time transform

  The build-time sibling of `stagger`: remap a set of tracks' key TIMES and get ordinary retimed `Track[]` back — no runtime clock warp, no cross-frame state, so `evaluate()` stays a pure function of time and the result is golden-stable and O(log keys) scrubbable.

  - `{ speed }` — slow-mo / fast (key times ÷ speed).
  - `{ shift }` — delay or advance the whole group (seconds).
  - `{ reverse }` — play backward in place: values reversed, span preserved, and each segment's ease **time-mirrored exactly** (built-in eases pair `easeInX ↔ easeOutX`, `cubicBezier` mirrors by point reflection).
  - `{ pingpong }` — forward then back as one there-and-back track.

  Fail-loud (not silent mis-animation) on the causal cases: reversing a **spring** ease or a **hold** segment throws with an actionable message, as does a non-positive `speed` or `reverse` + `pingpong` together. Returns new tracks; inputs untouched. Also on the browser IIFE as `window.glissade.retime`.

  ```js
  import { retime } from "@glissade/core";
  retime(move, { speed: 0.5 }); // half speed
  retime(move, { reverse: true }); // backward
  retime(move, { pingpong: true }); // there and back
  ```

## 0.25.0

### Patch Changes

- d780cdd: mesh: per-point sub-path targets now fail loud (the docstring over-promised them)

  Animating a mesh point via `track('node/fill.points.0.pos', …)` never resolved — `fill` is a single signal, not a nested tree — but the `MeshPoint` docstring implied per-point sub-path tracks exist. Now: (1) the docstring documents the real mechanism (drive the WHOLE `fill` as a `paint` track; two same-point-count meshes interpolate pairwise), and (2) a `fill.points.<i>.*` target throws a SPECIFIC actionable error pointing at that whole-fill paint track, instead of the generic "no property signal resolves to it".

## 0.25.0-pre.1

### Patch Changes

- d780cdd: mesh: per-point sub-path targets now fail loud (the docstring over-promised them)

  Animating a mesh point via `track('node/fill.points.0.pos', …)` never resolved — `fill` is a single signal, not a nested tree — but the `MeshPoint` docstring implied per-point sub-path tracks exist. Now: (1) the docstring documents the real mechanism (drive the WHOLE `fill` as a `paint` track; two same-point-count meshes interpolate pairwise), and (2) a `fill.points.<i>.*` target throws a SPECIFIC actionable error pointing at that whole-fill paint track, instead of the generic "no property signal resolves to it".

## 0.25.0-pre.0

## 0.24.0

## 0.24.0-pre.3

## 0.24.0-pre.2

## 0.24.0-pre.1

## 0.24.0-pre.0

## 0.23.0

### Minor Changes

- 8209c61: Text: animatable variable-font axes (`fontAxes`)

  OpenType axes (`wght`/`opsz`/`slnt`) are now ANIMATABLE. The static `fontVariationSettings` string isn't lerp-able, so animation uses a new structured value type — `fontAxes`, a `{ wght: 700, opsz: 14 }` map — set on `Text.fontAxes` and bound as a track target `<id>/fontAxes`:

  ```js
  new Text({
    id: "hero",
    text: "Bold",
    fontFamily: "Inter",
    fontAxes: { wght: 400 },
  });
  timeline((tl) =>
    tl.tracks([
      track("hero/fontAxes", "fontAxes", [
        key(0, { wght: 400 }),
        key(1, { wght: 800 }),
      ]),
    ])
  );
  ```

  It interpolates **per-axis**, then formats to the CSS `font-variation-settings` string at draw (so backends are unchanged). Both keyframes must declare the same axis tags (a mismatched set snaps + warns, like path/paint topology). The static `fontVariationSettings` string still works (and a non-empty `fontAxes` overrides it); default Text is byte-identical. `describe()` lists `fontAxes` as an animatable target.

- e54d593: builder: `to`/`fromTo`/`set` accept an explicit `{ type }` — the value-type inference escape hatch

  `inferValueType(value)` can't name a structured value like `fontAxes`'s `{ wght: 700 }` map, so the fluent builder threw `ValueTypeInferenceError` when you animated `fontAxes` (you had to drop to `track(target, 'fontAxes', keys)`). Now pass the type explicitly:

  ```js
  timeline((tl) =>
    tl.to(
      "hero/fontAxes",
      { wght: 900 },
      { type: "fontAxes", from: { wght: 400 } }
    )
  );
  ```

  `{ type }` overrides inference for that target's whole track (and works on `fromTo`/`set` too). Two different explicit types on one target throw (a track has one value type). `describe().builder` surfaces the new option.

## 0.23.0-pre.5

### Minor Changes

- e54d593: builder: `to`/`fromTo`/`set` accept an explicit `{ type }` — the value-type inference escape hatch

  `inferValueType(value)` can't name a structured value like `fontAxes`'s `{ wght: 700 }` map, so the fluent builder threw `ValueTypeInferenceError` when you animated `fontAxes` (you had to drop to `track(target, 'fontAxes', keys)`). Now pass the type explicitly:

  ```js
  timeline((tl) =>
    tl.to(
      "hero/fontAxes",
      { wght: 900 },
      { type: "fontAxes", from: { wght: 400 } }
    )
  );
  ```

  `{ type }` overrides inference for that target's whole track (and works on `fromTo`/`set` too). Two different explicit types on one target throw (a track has one value type). `describe().builder` surfaces the new option.

## 0.23.0-pre.4

## 0.23.0-pre.3

## 0.23.0-pre.2

## 0.23.0-pre.1

### Minor Changes

- 8209c61: Text: animatable variable-font axes (`fontAxes`)

  OpenType axes (`wght`/`opsz`/`slnt`) are now ANIMATABLE. The static `fontVariationSettings` string isn't lerp-able, so animation uses a new structured value type — `fontAxes`, a `{ wght: 700, opsz: 14 }` map — set on `Text.fontAxes` and bound as a track target `<id>/fontAxes`:

  ```js
  new Text({
    id: "hero",
    text: "Bold",
    fontFamily: "Inter",
    fontAxes: { wght: 400 },
  });
  timeline((tl) =>
    tl.tracks([
      track("hero/fontAxes", "fontAxes", [
        key(0, { wght: 400 }),
        key(1, { wght: 800 }),
      ]),
    ])
  );
  ```

  It interpolates **per-axis**, then formats to the CSS `font-variation-settings` string at draw (so backends are unchanged). Both keyframes must declare the same axis tags (a mismatched set snaps + warns, like path/paint topology). The static `fontVariationSettings` string still works (and a non-empty `fontAxes` overrides it); default Text is byte-identical. `describe()` lists `fontAxes` as an animatable target.

## 0.23.0-pre.0

## 0.22.0

## 0.22.0-pre.5

## 0.22.0-pre.4

## 0.22.0-pre.3

## 0.22.0-pre.2

## 0.22.0-pre.1

## 0.22.0-pre.0

## 0.21.0

## 0.21.0-pre.4

## 0.21.0-pre.3

## 0.21.0-pre.2

## 0.21.0-pre.1

## 0.21.0-pre.0

## 0.20.1

## 0.20.1-pre.0

## 0.20.0

### Minor Changes

- c629b51: 0.20 pre.0: base-embed budget review — relocate sidecar/diagnostics/motion to subpaths + CI-faithful check:size

  The base embed (core + scene + canvas2d + player) had crept to 38.79/39 kB gz —
  FULL, blocking every embed-touching 0.20 feature. This recovers headroom the
  proven way (mirroring the yoga/path/type/snapshot splits): code that is NOT on
  the `evaluate()`/render path moves off the base barrels onto tree-shakeable
  subpaths. **Base embed: 38.79 → 34.93 kB gz.** The 39 ceiling is unchanged — the
  recovered headroom is the 0.20 feature budget.

  **Public-API relocation** (these symbols now import from a subpath, not the
  package root):

  - **`@glissade/core/sidecar`** — the §6.2 editor sidecar
    (`mergeSidecar`/`mergeSidecarDetailed`/`migrateSidecar`/`setSidecarTrack`/
    `deleteSidecarTrack`/`emptySidecar`/`hashKeys`/`assignKeyIds`/
    `normalizeEditedKeys`/`SidecarVersionError` + the `SidecarDoc`/`SidecarOrphan`/…
    types). Studio-only; never on the embed path.
  - **`@glissade/scene/diagnostics`** — the §3.3 DEV/CLI determinism substrate
    (`diffDisplayLists`/`formatDisplayDiff`/`serializeDisplayList`/
    `parseDisplaySnapshot`/`DL_SNAPSHOT_VERSION`/`DlSnapshotError`), plus
    `auditCacheCold` and `tokenHighlight`. (`collapseReplacer` — the §3.5 cacheKey
    replacer, the one render-path member — stays on the `@glissade/scene` root.)
  - **`@glissade/scene/motion`** — the §3 motion-path follow helper
    (`followPath`/`motionPath`/`pointAtLength`/`pathLength`/`FollowPath`). A
    user-facing opt-in, re-exported onto the `@glissade/browser` IIFE so
    `window.glissade.motionPath` still works for the no-build consumer.

  **CI-faithful `check:size`**: the historical fail-then-fix CI delta (CI measured
  the base embed ~0.16 kB heavier than local and red-failed a 0.19.1 release) was
  caused by `esbuild` (the minifier `check-size.mjs` measures with) being pinned
  with a caret — a patch float between local and CI shifted the gz. `esbuild` and
  `tsdown` are now pinned EXACT in root + cli, so local == CI byte-for-byte.

  All 262 goldens stay byte-identical (pure module-graph moves, no render change).

- 4a2117f: 0.20: `timeline(fn, { tracks })` no longer silently drops the tracks (KMu5GL1DvFms)

  The builder form's second argument advertised a `tracks` field (via `TimelineInit`)
  but **silently ignored it** — `timeline(tl => {}, { tracks: [t] })` produced an empty
  document with no error or warning, costing a consumer a debug cycle (a near-empty PNG:
  a correct caption group whose `popGroup` carried no glyphs). It was long-standing
  (no-op on 0.18 / 0.19 / 0.20-pre.5, not a regression).

  The builder-form `init.tracks` is now **applied** — composed into the built document
  at the same place and in the same shape `tl.tracks(...)` injects them (the
  finalize→coalesce path; raw absolute-time rows, no cursor move). `init.tracks` lands
  first, so a `tl.tracks(...)` call inside the body coalesces later-wins over it at a
  shared target. The builder form's `init` type no longer `Omit`s `tracks`, so the field
  type-checks where it now functions.

  Unchanged: the object/document form `timeline({ tracks, fps, duration })` already
  honored its tracks (untouched); `tl.tracks(...)` still works. No render-path change —
  all 262 goldens stay byte-identical.

- be35b11: 0.20: friendlier construction-prop bind error. When a timeline targets
  `<id>/<prop>` and the bind guard can't resolve it, a `<prop>` that is a KNOWN
  construction prop (`animatable: false` in the `describe()` schema — e.g.
  Image/Video `assetId`, Text `fontFamily`/`align`) now throws a specific message
  ("'bg/assetId' is a construction prop (animatable:false) — set it at
  construction (new Image({ assetId })); it is not an animatable target.")
  instead of the generic "no property signal resolves to it". A genuinely-unknown
  prop still gets the generic `UnboundTargetError`.

  The target was already correctly rejected — this only improves the message, so
  determinism and goldens are untouched. The construction-prop NAME set is
  factored into a slim shared `@glissade/scene` module that both `describe()` and
  the bind guard import (the bind path imports only the tiny name lookup, never
  the rich manifest), keeping the base embed within budget.

  `@glissade/core`: `bindTimeline` gains an optional `BindOptions.unboundMessage`
  hook (additive) so a layer with node-type context can supply the specific
  reason; `UnboundTargetError` accepts an optional override message.

## 0.20.0-pre.7

## 0.20.0-pre.6

### Minor Changes

- 4a2117f: 0.20: `timeline(fn, { tracks })` no longer silently drops the tracks (KMu5GL1DvFms)

  The builder form's second argument advertised a `tracks` field (via `TimelineInit`)
  but **silently ignored it** — `timeline(tl => {}, { tracks: [t] })` produced an empty
  document with no error or warning, costing a consumer a debug cycle (a near-empty PNG:
  a correct caption group whose `popGroup` carried no glyphs). It was long-standing
  (no-op on 0.18 / 0.19 / 0.20-pre.5, not a regression).

  The builder-form `init.tracks` is now **applied** — composed into the built document
  at the same place and in the same shape `tl.tracks(...)` injects them (the
  finalize→coalesce path; raw absolute-time rows, no cursor move). `init.tracks` lands
  first, so a `tl.tracks(...)` call inside the body coalesces later-wins over it at a
  shared target. The builder form's `init` type no longer `Omit`s `tracks`, so the field
  type-checks where it now functions.

  Unchanged: the object/document form `timeline({ tracks, fps, duration })` already
  honored its tracks (untouched); `tl.tracks(...)` still works. No render-path change —
  all 262 goldens stay byte-identical.

## 0.20.0-pre.5

## 0.20.0-pre.4

## 0.20.0-pre.3

## 0.20.0-pre.2

### Minor Changes

- be35b11: 0.20: friendlier construction-prop bind error. When a timeline targets
  `<id>/<prop>` and the bind guard can't resolve it, a `<prop>` that is a KNOWN
  construction prop (`animatable: false` in the `describe()` schema — e.g.
  Image/Video `assetId`, Text `fontFamily`/`align`) now throws a specific message
  ("'bg/assetId' is a construction prop (animatable:false) — set it at
  construction (new Image({ assetId })); it is not an animatable target.")
  instead of the generic "no property signal resolves to it". A genuinely-unknown
  prop still gets the generic `UnboundTargetError`.

  The target was already correctly rejected — this only improves the message, so
  determinism and goldens are untouched. The construction-prop NAME set is
  factored into a slim shared `@glissade/scene` module that both `describe()` and
  the bind guard import (the bind path imports only the tiny name lookup, never
  the rich manifest), keeping the base embed within budget.

  `@glissade/core`: `bindTimeline` gains an optional `BindOptions.unboundMessage`
  hook (additive) so a layer with node-type context can supply the specific
  reason; `UnboundTargetError` accepts an optional override message.

## 0.20.0-pre.1

## 0.20.0-pre.0

### Minor Changes

- c629b51: 0.20 pre.0: base-embed budget review — relocate sidecar/diagnostics/motion to subpaths + CI-faithful check:size

  The base embed (core + scene + canvas2d + player) had crept to 38.79/39 kB gz —
  FULL, blocking every embed-touching 0.20 feature. This recovers headroom the
  proven way (mirroring the yoga/path/type/snapshot splits): code that is NOT on
  the `evaluate()`/render path moves off the base barrels onto tree-shakeable
  subpaths. **Base embed: 38.79 → 34.93 kB gz.** The 39 ceiling is unchanged — the
  recovered headroom is the 0.20 feature budget.

  **Public-API relocation** (these symbols now import from a subpath, not the
  package root):

  - **`@glissade/core/sidecar`** — the §6.2 editor sidecar
    (`mergeSidecar`/`mergeSidecarDetailed`/`migrateSidecar`/`setSidecarTrack`/
    `deleteSidecarTrack`/`emptySidecar`/`hashKeys`/`assignKeyIds`/
    `normalizeEditedKeys`/`SidecarVersionError` + the `SidecarDoc`/`SidecarOrphan`/…
    types). Studio-only; never on the embed path.
  - **`@glissade/scene/diagnostics`** — the §3.3 DEV/CLI determinism substrate
    (`diffDisplayLists`/`formatDisplayDiff`/`serializeDisplayList`/
    `parseDisplaySnapshot`/`DL_SNAPSHOT_VERSION`/`DlSnapshotError`), plus
    `auditCacheCold` and `tokenHighlight`. (`collapseReplacer` — the §3.5 cacheKey
    replacer, the one render-path member — stays on the `@glissade/scene` root.)
  - **`@glissade/scene/motion`** — the §3 motion-path follow helper
    (`followPath`/`motionPath`/`pointAtLength`/`pathLength`/`FollowPath`). A
    user-facing opt-in, re-exported onto the `@glissade/browser` IIFE so
    `window.glissade.motionPath` still works for the no-build consumer.

  **CI-faithful `check:size`**: the historical fail-then-fix CI delta (CI measured
  the base embed ~0.16 kB heavier than local and red-failed a 0.19.1 release) was
  caused by `esbuild` (the minifier `check-size.mjs` measures with) being pinned
  with a caret — a patch float between local and CI shifted the gz. `esbuild` and
  `tsdown` are now pinned EXACT in root + cli, so local == CI byte-for-byte.

  All 262 goldens stay byte-identical (pure module-graph moves, no render change).

## 0.19.1

## 0.19.0

### Minor Changes

- bf0d4e8: 0.19 builder sugar — three additive, pure build-time slices that compile to the serializable Timeline document (goldens stay byte-identical):

  - **Unknown builder options now throw** (`k-g1zn`). `to` / `fromTo` / `set` / `stagger` validate their options object against a known-key allow-list and throw a `TimelineValidationError` naming the offending key(s) and the method, instead of silently swallowing it. Known keys: `to`/`fromTo` → `duration`, `ease`, `at`, `from`; `set` → `at`; `stagger` spec → `to`, `from`, `duration`, `ease`; `stagger` opts → `each`, `anchor`, `at`. **Mildly breaking:** stray keys that were previously ignored now fail loudly at build time.
  - **Per-target `stagger` spec values** (`ppCUmU`). `StaggerSpec.to` and `.from` now accept a function `(index, count) => value` resolved per target (a runtime `typeof` branch, consistent with `each` and scene `each()`), so a per-target-destination cascade is expressible. A plain value still fans uniformly. Emits N ordinary tweens, byte-identical to hand-authored.
  - **`tl.tracks(tracks)`** (`Isuo8Gxn`) — a fluent bridge for the clip tier. Inject the pre-built `Track[]` returned by `presence`/`clip`/`each`/`morph` straight into the document; they land as ordinary absolute-time track rows via the same finalize→coalesce path `add()` uses for child tracks. Scoped to raw absolute-time tracks (no cursor-offset/rebasing wrapper).

  `@glissade/scene`'s `describe()` manifest is updated in lockstep: the new `tracks` builder method is listed and the `stagger` signature reflects the `to`/`from` function form.

### Patch Changes

- 02968bd: 0.19 pre.5 — splitText part-handle ergonomics + a forgiving `tl.tracks` (no render change; the 262 goldens stay byte-identical — this is API shape + docs):

  - **`SplitPart.id`** (`@glissade/scene/type`). Each part now carries `id` — the child node's registered `${id}/${i}` (the SAME string the child `Text` was constructed with). The advertised kinetic-typography recipe `parts.map((p) => `${p.id}/revealFraction`)` now works verbatim instead of yielding `undefined/revealFraction` (the part shape was previously `{ text, node, line, box }` with no `id`, so the headline split→stagger recipe couldn't bind).
  - **`SplitTextResult.targets(prop)`** — returns the bind-ready ids `[`${id}/0/${prop}`, `${id}/1/${prop}`, …]` in reading order, so the recipe is one line: `tl.stagger(split.targets('revealFraction'), { from: 0, to: 1 }, { each: 0.1 })`.
  - **`tl.tracks` accepts a clip-tier RESULT object** (`@glissade/core`). `tl.tracks(presence(...))` previously threw "{} is not iterable" — you had to pass `.tracks`. It now accepts both a raw `Track[]` and a `{ tracks: Track[] }` result (presence/clip/each/morph all return the object), unwrapping `.tracks` for you.
  - **Docs:** `docs/typewriter.md` shows the `split.targets('revealFraction')` + `part.id` recipe and that `{ measurer }` is required for exact layout; `docs/browser.md` states `renderToDataURL` returns a `Promise<string>` (await it).

## 0.19.0-pre.5

### Patch Changes

- 02968bd: 0.19 pre.5 — splitText part-handle ergonomics + a forgiving `tl.tracks` (no render change; the 262 goldens stay byte-identical — this is API shape + docs):

  - **`SplitPart.id`** (`@glissade/scene/type`). Each part now carries `id` — the child node's registered `${id}/${i}` (the SAME string the child `Text` was constructed with). The advertised kinetic-typography recipe `parts.map((p) => `${p.id}/revealFraction`)` now works verbatim instead of yielding `undefined/revealFraction` (the part shape was previously `{ text, node, line, box }` with no `id`, so the headline split→stagger recipe couldn't bind).
  - **`SplitTextResult.targets(prop)`** — returns the bind-ready ids `[`${id}/0/${prop}`, `${id}/1/${prop}`, …]` in reading order, so the recipe is one line: `tl.stagger(split.targets('revealFraction'), { from: 0, to: 1 }, { each: 0.1 })`.
  - **`tl.tracks` accepts a clip-tier RESULT object** (`@glissade/core`). `tl.tracks(presence(...))` previously threw "{} is not iterable" — you had to pass `.tracks`. It now accepts both a raw `Track[]` and a `{ tracks: Track[] }` result (presence/clip/each/morph all return the object), unwrapping `.tracks` for you.
  - **Docs:** `docs/typewriter.md` shows the `split.targets('revealFraction')` + `part.id` recipe and that `{ measurer }` is required for exact layout; `docs/browser.md` states `renderToDataURL` returns a `Promise<string>` (await it).

## 0.19.0-pre.4

## 0.19.0-pre.3

## 0.19.0-pre.2

## 0.19.0-pre.1

## 0.19.0-pre.0

### Minor Changes

- bf0d4e8: 0.19 builder sugar — three additive, pure build-time slices that compile to the serializable Timeline document (goldens stay byte-identical):

  - **Unknown builder options now throw** (`k-g1zn`). `to` / `fromTo` / `set` / `stagger` validate their options object against a known-key allow-list and throw a `TimelineValidationError` naming the offending key(s) and the method, instead of silently swallowing it. Known keys: `to`/`fromTo` → `duration`, `ease`, `at`, `from`; `set` → `at`; `stagger` spec → `to`, `from`, `duration`, `ease`; `stagger` opts → `each`, `anchor`, `at`. **Mildly breaking:** stray keys that were previously ignored now fail loudly at build time.
  - **Per-target `stagger` spec values** (`ppCUmU`). `StaggerSpec.to` and `.from` now accept a function `(index, count) => value` resolved per target (a runtime `typeof` branch, consistent with `each` and scene `each()`), so a per-target-destination cascade is expressible. A plain value still fans uniformly. Emits N ordinary tweens, byte-identical to hand-authored.
  - **`tl.tracks(tracks)`** (`Isuo8Gxn`) — a fluent bridge for the clip tier. Inject the pre-built `Track[]` returned by `presence`/`clip`/`each`/`morph` straight into the document; they land as ordinary absolute-time track rows via the same finalize→coalesce path `add()` uses for child tracks. Scoped to raw absolute-time tracks (no cursor-offset/rebasing wrapper).

  `@glissade/scene`'s `describe()` manifest is updated in lockstep: the new `tracks` builder method is listed and the `stagger` signature reflects the `to`/`from` function form.

## 0.18.0

### Minor Changes

- 746b3d0: feat(core,scene,browser): `glissade.describe()` — a machine-readable API manifest

  `describe()` returns a structured, JSON-serializable manifest of the public API —
  the structural antidote to discoverability, so an AI consumer reads GROUND TRUTH
  from the artifact instead of reverse-engineering the surface. It is PURE
  INTROSPECTION (instantiate each built-in node once, read its registered targets,
  enumerate the core registries); zero `evaluate()`/determinism impact — every
  golden is byte-identical.

  The manifest is GENERATED from the live registries it documents, so it can't
  drift from the real API:

  - `nodes[*].props[*]` — the animatable track targets per node type, each with its
    value type + arity, read from the REAL `registerTarget` calls via the new
    `Node.listTargets()` (e.g. `position: { type:'vec2', animatable:true,
target:'<id>/position', arity:2 }`, `fill: { type:'color|paint' }`,
    `Text.reveal: { type:'number' }`).
  - `valueTypes` — from the new `listValueTypes()` over the core ValueType registry.
  - `easings` — from the core easing registry.
  - `builder` / `createScene` / `subpaths` — curated, with a test pinning the
    builder names to the live `TimelineBuilder` surface.

  `describe()` lives on the tree-shakeable `@glissade/scene/describe` subpath (off
  the base embed — base embed path unchanged), and is re-exported on the
  `@glissade/browser` bundle as `window.glissade.describe()`. The browser build also
  emits a committed `dist/glissade.api.json` (= `JSON.stringify(describe())`) so a
  tool can fetch the manifest without running JS.

- 7f815f9: feat(core): presence inline-literal sugar — terse enter/exit literals over `presence()`

  `presence()`'s `enter`/`exit` now accept an inline `PresenceTransition` literal in
  addition to a `Clip`, plus a `window:[t0,t1]` alias for `{ show, hide }`:

  ```js
  presence("card", {
    window: [1, 5],
    enter: { opacity: [0, 1], offset: 16, dur: 0.5, ease: "easeOutCubic" },
    exit: { opacity: [1, 0], offset: 16, dur: 0.4 },
  });
  ```

  PURE build-time sugar. A new `transitionToClip(t, dir)` compiles the literal
  (`{opacity, offset, edge, scale, dur, ease}`) to the SAME `clip({channels})` an
  author writes by hand — an opacity channel (only when `opacity` is given), a
  position channel from `offset`+`edge` (clipStdlib `slideIn` convention; default
  `edge:'bottom'` = slide up from below; scalar `offset` slides that magnitude along
  the edge; enter goes displaced→origin, exit origin→displaced; explicit `[Vec2,Vec2]`
  endpoints used verbatim), and a scale channel (scalar pair broadcast to Vec2, popIn
  convention). `presence()` then runs UNCHANGED on the resulting `Clip`, so the inline
  spelling is byte-INDISTINGUISHABLE from the hand-built form and the default
  `presence({show,hide})` bytes are untouched (all 262 goldens stay byte-identical).

  OMITTING `opacity` emits NO opacity channel, relying on `presence()`'s synthesized
  rise/fall — matching the Clip path exactly. `PresenceTransition` and
  `transitionToClip` are re-exported from `@glissade/core/clips` (and ride the
  `@glissade/browser` convenience bundle).

- d3d9206: feat(core): `tl.sequence` + `tl.at` builder methods — compose 0-relative sub-timelines

  Pure build-time sugar over the shipped `add()`:

  - `at(time, sub)` places a 0-relative sub-timeline at an absolute parent time — exactly
    `add(sub, time)` (a numeric position resolves to itself). The method `at` is distinct
    from the `at` _field_ in `TweenOpts`/`StaggerOpts`.
  - `sequence(subs, { gap = 0 })` chains N subs end-to-end: each is `add`ed at the running
    chain end, with a scalar `gap` (seconds) of slack between consecutive subs — identical
    to a hand-written `add(a); add(b, '+=gap'); add(c, '+=gap')` chain. Because `add`
    advances the cursor by each sub's compiled duration, changing one sub's internal length
    auto-shifts the rest. A negative `gap` overlaps arithmetically (no crossfade is
    synthesized — that's a deferred design). `gap` is scalar in v1 (per-index gap deferred).

  Both emit ordinary `ChildEntry` rows — serializable, zero runtime, seek ≡ play-through.
  New opt-in methods, default behavior unchanged; all 262 goldens stay byte-identical.

  Also: `add()` now **forwards a child sub-timeline's `.call()` callbacks** onto the parent
  document's callback map (rebased markers already surfaced via `compileTimeline`, but their
  name→fn entries were unreachable through `getTimelineCallbacks(parentDoc)`). A parent's own
  callback wins a marker-name collision. This makes `.call()` in a sequenced/added sub fire
  as expected — benefiting both `add` and `sequence`.

- 35968a1: feat(core): stagger `anchor` rename + non-uniform `each` + cursor fixes, and a `.call()` sibling-collision fix

  **stagger API (pre-only, no back-compat):**

  - `StaggerOpts.from` → `StaggerOpts.anchor`. The placement anchor shared the word
    `from` with `StaggerSpec.from` (the start VALUE that routes a target through
    `fromTo`) — two different axes, one word. Renamed the placement one to `anchor`
    (`'start' | 'end' | 'center' | 'edges' | number`).
  - `each` widened to `number | ((rank, count) => number)`. A number keeps the
    uniform cascade `d_i = rank_i * each`; a function maps each target's rank +
    group size to its own delay, completing GSAP parity for accel/decel/eased
    cascades. Keys stay byte-identical to the hand-authored equivalent.

  **stagger cursor-semantics fixes** (the post-stagger cursor a following
  `'<'`/`'>'`/`'+='`/default step resolves against):

  - A spring `spec.ease` now contributes its real `spring.duration(ease)` to the
    group end, not the local `duration ?? 1`.
  - An empty `targets` list is a true no-op — the cursor is untouched.
  - The group reports its **true** min/max delay (over all `d_i`, init from `d_0`),
    so a backward / non-monotonic spread anchors honestly.
  - A delay that would place a key at `t < 0`, or a non-finite `each`/`anchor`
    (incl. a function returning NaN/Infinity), throws a `TimelineValidationError`
    at build time instead of emitting silent negative / NaN keys.

  **`.call()` sibling-collision fix:** auto-named `call:N` markers are namespaced by
  the sub's position path (`c<index>/…`) when rebased into a parent, and the same
  prefix is applied when forwarding the sub's callback map. Two sibling subs that
  each define a `.call()` (both auto-named `call:0`) now land under distinct keys
  and both fire — previously one callback was dropped and the other double-fired.

- e3a2f6a: feat(core): `tl.stagger` builder method — pure build-time sugar over `to`/`fromTo`

  `stagger(targets, { to, from?, duration?, ease? }, { each, from?, at? })` loops the
  shipped `to`/`fromTo` key-emission across `targets`, cascading each by a per-rank delay.
  The emitted keys are byte-identical to N hand-authored offset tweens, so all existing
  goldens stay byte-identical (new opt-in method, default behavior unchanged).

  The `from` anchor ranks targets over their array index `i` (n = targets.length,
  c = (n-1)/2), GSAP parity: `'start'` → `i`; `'end'` → `(n-1)-i`; `'center'` →
  `round(|i-c|)`; `'edges'` → `round(c-|i-c|)`; numeric `k` → `round(|i-k|)`. Delay
  `d_i = rank_i * each`, inserted at `base + d_i` where `base = resolvePosition(at)`
  (default = chain end). After the loop the cursor reads the whole group as one block to
  a following `'<'`/`'>'`/`'+='` step. `each` is number-only in v1. `StaggerSpec` and
  `StaggerOpts` are re-exported from `@glissade/core`.

### Patch Changes

- 0a8967c: fix(core): presence reconciles non-opacity channels per target (slide-in-hold-slide-out no longer truncates)

  When a `presence()`'s enter AND exit both animated the SAME non-opacity channel
  (e.g. both slide `position` — a slide-in, hold, slide-out), presence emitted TWO
  same-target tracks. `compileTimeline`'s `coalesce()` then dropped the enter's
  settle key and dev-warned — the hold leg of the slide was silently truncated.

  Non-opacity channels are now reconciled per target into ONE track, using the same
  stable-sort + coincident-`t` later-wins dedup the opacity guard already uses (at a
  coincident enter-settle / exit-start `t` the exit wins). The enter settle and exit
  start both survive, so a slide-in-hold-slide-out works. Default opacity-only
  presence is byte-unchanged (the presence golden is byte-identical).

## 0.18.0-pre.6

## 0.18.0-pre.5

### Minor Changes

- 746b3d0: feat(core,scene,browser): `glissade.describe()` — a machine-readable API manifest

  `describe()` returns a structured, JSON-serializable manifest of the public API —
  the structural antidote to discoverability, so an AI consumer reads GROUND TRUTH
  from the artifact instead of reverse-engineering the surface. It is PURE
  INTROSPECTION (instantiate each built-in node once, read its registered targets,
  enumerate the core registries); zero `evaluate()`/determinism impact — every
  golden is byte-identical.

  The manifest is GENERATED from the live registries it documents, so it can't
  drift from the real API:

  - `nodes[*].props[*]` — the animatable track targets per node type, each with its
    value type + arity, read from the REAL `registerTarget` calls via the new
    `Node.listTargets()` (e.g. `position: { type:'vec2', animatable:true,
target:'<id>/position', arity:2 }`, `fill: { type:'color|paint' }`,
    `Text.reveal: { type:'number' }`).
  - `valueTypes` — from the new `listValueTypes()` over the core ValueType registry.
  - `easings` — from the core easing registry.
  - `builder` / `createScene` / `subpaths` — curated, with a test pinning the
    builder names to the live `TimelineBuilder` surface.

  `describe()` lives on the tree-shakeable `@glissade/scene/describe` subpath (off
  the base embed — base embed path unchanged), and is re-exported on the
  `@glissade/browser` bundle as `window.glissade.describe()`. The browser build also
  emits a committed `dist/glissade.api.json` (= `JSON.stringify(describe())`) so a
  tool can fetch the manifest without running JS.

## 0.18.0-pre.4

### Minor Changes

- 35968a1: feat(core): stagger `anchor` rename + non-uniform `each` + cursor fixes, and a `.call()` sibling-collision fix

  **stagger API (pre-only, no back-compat):**

  - `StaggerOpts.from` → `StaggerOpts.anchor`. The placement anchor shared the word
    `from` with `StaggerSpec.from` (the start VALUE that routes a target through
    `fromTo`) — two different axes, one word. Renamed the placement one to `anchor`
    (`'start' | 'end' | 'center' | 'edges' | number`).
  - `each` widened to `number | ((rank, count) => number)`. A number keeps the
    uniform cascade `d_i = rank_i * each`; a function maps each target's rank +
    group size to its own delay, completing GSAP parity for accel/decel/eased
    cascades. Keys stay byte-identical to the hand-authored equivalent.

  **stagger cursor-semantics fixes** (the post-stagger cursor a following
  `'<'`/`'>'`/`'+='`/default step resolves against):

  - A spring `spec.ease` now contributes its real `spring.duration(ease)` to the
    group end, not the local `duration ?? 1`.
  - An empty `targets` list is a true no-op — the cursor is untouched.
  - The group reports its **true** min/max delay (over all `d_i`, init from `d_0`),
    so a backward / non-monotonic spread anchors honestly.
  - A delay that would place a key at `t < 0`, or a non-finite `each`/`anchor`
    (incl. a function returning NaN/Infinity), throws a `TimelineValidationError`
    at build time instead of emitting silent negative / NaN keys.

  **`.call()` sibling-collision fix:** auto-named `call:N` markers are namespaced by
  the sub's position path (`c<index>/…`) when rebased into a parent, and the same
  prefix is applied when forwarding the sub's callback map. Two sibling subs that
  each define a `.call()` (both auto-named `call:0`) now land under distinct keys
  and both fire — previously one callback was dropped and the other double-fired.

### Patch Changes

- 0a8967c: fix(core): presence reconciles non-opacity channels per target (slide-in-hold-slide-out no longer truncates)

  When a `presence()`'s enter AND exit both animated the SAME non-opacity channel
  (e.g. both slide `position` — a slide-in, hold, slide-out), presence emitted TWO
  same-target tracks. `compileTimeline`'s `coalesce()` then dropped the enter's
  settle key and dev-warned — the hold leg of the slide was silently truncated.

  Non-opacity channels are now reconciled per target into ONE track, using the same
  stable-sort + coincident-`t` later-wins dedup the opacity guard already uses (at a
  coincident enter-settle / exit-start `t` the exit wins). The enter settle and exit
  start both survive, so a slide-in-hold-slide-out works. Default opacity-only
  presence is byte-unchanged (the presence golden is byte-identical).

## 0.18.0-pre.3

### Minor Changes

- 7f815f9: feat(core): presence inline-literal sugar — terse enter/exit literals over `presence()`

  `presence()`'s `enter`/`exit` now accept an inline `PresenceTransition` literal in
  addition to a `Clip`, plus a `window:[t0,t1]` alias for `{ show, hide }`:

  ```js
  presence("card", {
    window: [1, 5],
    enter: { opacity: [0, 1], offset: 16, dur: 0.5, ease: "easeOutCubic" },
    exit: { opacity: [1, 0], offset: 16, dur: 0.4 },
  });
  ```

  PURE build-time sugar. A new `transitionToClip(t, dir)` compiles the literal
  (`{opacity, offset, edge, scale, dur, ease}`) to the SAME `clip({channels})` an
  author writes by hand — an opacity channel (only when `opacity` is given), a
  position channel from `offset`+`edge` (clipStdlib `slideIn` convention; default
  `edge:'bottom'` = slide up from below; scalar `offset` slides that magnitude along
  the edge; enter goes displaced→origin, exit origin→displaced; explicit `[Vec2,Vec2]`
  endpoints used verbatim), and a scale channel (scalar pair broadcast to Vec2, popIn
  convention). `presence()` then runs UNCHANGED on the resulting `Clip`, so the inline
  spelling is byte-INDISTINGUISHABLE from the hand-built form and the default
  `presence({show,hide})` bytes are untouched (all 262 goldens stay byte-identical).

  OMITTING `opacity` emits NO opacity channel, relying on `presence()`'s synthesized
  rise/fall — matching the Clip path exactly. `PresenceTransition` and
  `transitionToClip` are re-exported from `@glissade/core/clips` (and ride the
  `@glissade/browser` convenience bundle).

## 0.18.0-pre.2

## 0.18.0-pre.1

### Minor Changes

- d3d9206: feat(core): `tl.sequence` + `tl.at` builder methods — compose 0-relative sub-timelines

  Pure build-time sugar over the shipped `add()`:

  - `at(time, sub)` places a 0-relative sub-timeline at an absolute parent time — exactly
    `add(sub, time)` (a numeric position resolves to itself). The method `at` is distinct
    from the `at` _field_ in `TweenOpts`/`StaggerOpts`.
  - `sequence(subs, { gap = 0 })` chains N subs end-to-end: each is `add`ed at the running
    chain end, with a scalar `gap` (seconds) of slack between consecutive subs — identical
    to a hand-written `add(a); add(b, '+=gap'); add(c, '+=gap')` chain. Because `add`
    advances the cursor by each sub's compiled duration, changing one sub's internal length
    auto-shifts the rest. A negative `gap` overlaps arithmetically (no crossfade is
    synthesized — that's a deferred design). `gap` is scalar in v1 (per-index gap deferred).

  Both emit ordinary `ChildEntry` rows — serializable, zero runtime, seek ≡ play-through.
  New opt-in methods, default behavior unchanged; all 262 goldens stay byte-identical.

  Also: `add()` now **forwards a child sub-timeline's `.call()` callbacks** onto the parent
  document's callback map (rebased markers already surfaced via `compileTimeline`, but their
  name→fn entries were unreachable through `getTimelineCallbacks(parentDoc)`). A parent's own
  callback wins a marker-name collision. This makes `.call()` in a sequenced/added sub fire
  as expected — benefiting both `add` and `sequence`.

## 0.18.0-pre.0

### Minor Changes

- e3a2f6a: feat(core): `tl.stagger` builder method — pure build-time sugar over `to`/`fromTo`

  `stagger(targets, { to, from?, duration?, ease? }, { each, from?, at? })` loops the
  shipped `to`/`fromTo` key-emission across `targets`, cascading each by a per-rank delay.
  The emitted keys are byte-identical to N hand-authored offset tweens, so all existing
  goldens stay byte-identical (new opt-in method, default behavior unchanged).

  The `from` anchor ranks targets over their array index `i` (n = targets.length,
  c = (n-1)/2), GSAP parity: `'start'` → `i`; `'end'` → `(n-1)-i`; `'center'` →
  `round(|i-c|)`; `'edges'` → `round(c-|i-c|)`; numeric `k` → `round(|i-k|)`. Delay
  `d_i = rank_i * each`, inserted at `base + d_i` where `base = resolvePosition(at)`
  (default = chain end). After the loop the cursor reads the whole group as one block to
  a following `'<'`/`'>'`/`'+='` step. `each` is number-only in v1. `StaggerSpec` and
  `StaggerOpts` are re-exported from `@glissade/core`.

## 0.17.1

## 0.17.1-pre.0

## 0.17.0

## 0.17.0-pre.0

## 0.16.0

## 0.16.0-pre.1

## 0.16.0-pre.0

## 0.15.0

### Minor Changes

- c87e88b: 0.15 guard-repr-compat: generalize the bind guard from strict id-equality to single-hop representation-compatibility, and retire the vec2-arc array-tag hack.

  `ValueType` gains an optional `repr?: ValueTypeId` — the built-in type a custom type is representationally compatible with (a `cents` type sets `repr: 'number'`, `vec2-arc` sets `repr: 'vec2'`). The bind-time guard (`binding.ts`) now resolves both the track's value-type and the target's `expects` to their repr (single-hop; an id with no `repr` resolves to itself) and accepts when the reprs match. This reopens the documented extension door: a custom `number`-repr track binds to a `number` prop without throwing.

  The 0.14 `['vec2','vec2-arc']` array-tags on `Node.position`/`Node.scale` and `tokenHighlight` `offset` are reverted to plain `'vec2'` — repr-compat handles vec2-arc now. `Shape.fill`'s `['color','paint']` stays: that is genuine polymorphism (distinct reprs). Bind-time only — all goldens stay byte-identical.

- 53030d0: 0.15 i18n-hardening 5-pack — residual localization robustness gaps, all OFF the `evaluate()` path (252 goldens byte-identical; the no-locale base path unchanged). Each fix has a violating-input regression test.

  FIX 1 (multi-cue collapse → hard-throw): `localize()` broadcasts `table[id]` to every key of a matched string track. For a multi-cue caption (a string track with >1 DISTINCT keyed value) that froze one caption over the whole video. `localize` now HARD-THROWS a `LocalizationError` naming the id and directing to per-locale narration regen; a single-value / single-key string track still localizes by broadcast.

  FIX 2 (flat-table key collision → throw-on-ambiguity): a key matching BOTH a node-id-with-a-string-track AND a free-standing `t()` id (`opts.consumedIds`) silently rewrote the node's track. `localize` now throws a clear `LocalizationError` on any such collision. PURE ADDITIVE GUARD — the flat `messages.<locale>.json` shape (`MessageTable = Record<string, string>`) is UNCHANGED; no sectioned `{tracks,messages}` format introduced.

  FIX 3 (ambient `t()` race across concurrent renders): the process-global ambient table/consumed-id set was shared across concurrent programmatic `render()`/`loadSceneModule` flows for different locales → wrong-language static `Text`. Added `runWithMessageTable(table, fn)` — an `AsyncLocalStorage`-scoped ambient table that isolates each async flow (lazily loaded `node:async_hooks`, off the embed; `core/i18n` stays 1.5 kB gz). `setMessageTable`/`getMessageTable`/`getConsumedMessageIds`/`t()` now read the active scope (ALS if present, else the process-global). Added `preservingMessageTable(fn)` (snapshot/restore the global ambient table), wired around the no-locale audio-mix helpers in the CLI (`collectMixAudioInputs`/`buildMixWav`) so they don't clobber or leak a concurrent locale's table. The CLI one-shot is unaffected.

  FIX 4 (`requireParity` within-manifest duplicate ids): the Set-based union/diff swallowed `{en:['a','a','b']}`. `requireParity` now runs a per-manifest duplicate check (`new Set(m.ids).size !== m.ids.length`) FIRST — naming the locale + dup id and throwing a `ParityError` — even for a single (or zero) manifest, before the cross-manifest diff.

  FIX 5 (`osFamilies` brand-warn gap): `buildFontExemptSet` folded the OS catalog into the exempt set; a registered/declared brand family whose name collides with an OS family could be waved through as "OS-only". The OS-catalog fold now SKIPS any name that collides with a registered family, so a declared brand font stays subject to glyph-coverage validation (a missing glyph still warns / throws under `--strict`). The exemption is for genuinely-OS-only families.

## 0.15.0-pre.1

## 0.15.0-pre.0

### Minor Changes

- c87e88b: 0.15 guard-repr-compat: generalize the bind guard from strict id-equality to single-hop representation-compatibility, and retire the vec2-arc array-tag hack.

  `ValueType` gains an optional `repr?: ValueTypeId` — the built-in type a custom type is representationally compatible with (a `cents` type sets `repr: 'number'`, `vec2-arc` sets `repr: 'vec2'`). The bind-time guard (`binding.ts`) now resolves both the track's value-type and the target's `expects` to their repr (single-hop; an id with no `repr` resolves to itself) and accepts when the reprs match. This reopens the documented extension door: a custom `number`-repr track binds to a `number` prop without throwing.

  The 0.14 `['vec2','vec2-arc']` array-tags on `Node.position`/`Node.scale` and `tokenHighlight` `offset` are reverted to plain `'vec2'` — repr-compat handles vec2-arc now. `Shape.fill`'s `['color','paint']` stays: that is genuine polymorphism (distinct reprs). Bind-time only — all goldens stay byte-identical.

- 53030d0: 0.15 i18n-hardening 5-pack — residual localization robustness gaps, all OFF the `evaluate()` path (252 goldens byte-identical; the no-locale base path unchanged). Each fix has a violating-input regression test.

  FIX 1 (multi-cue collapse → hard-throw): `localize()` broadcasts `table[id]` to every key of a matched string track. For a multi-cue caption (a string track with >1 DISTINCT keyed value) that froze one caption over the whole video. `localize` now HARD-THROWS a `LocalizationError` naming the id and directing to per-locale narration regen; a single-value / single-key string track still localizes by broadcast.

  FIX 2 (flat-table key collision → throw-on-ambiguity): a key matching BOTH a node-id-with-a-string-track AND a free-standing `t()` id (`opts.consumedIds`) silently rewrote the node's track. `localize` now throws a clear `LocalizationError` on any such collision. PURE ADDITIVE GUARD — the flat `messages.<locale>.json` shape (`MessageTable = Record<string, string>`) is UNCHANGED; no sectioned `{tracks,messages}` format introduced.

  FIX 3 (ambient `t()` race across concurrent renders): the process-global ambient table/consumed-id set was shared across concurrent programmatic `render()`/`loadSceneModule` flows for different locales → wrong-language static `Text`. Added `runWithMessageTable(table, fn)` — an `AsyncLocalStorage`-scoped ambient table that isolates each async flow (lazily loaded `node:async_hooks`, off the embed; `core/i18n` stays 1.5 kB gz). `setMessageTable`/`getMessageTable`/`getConsumedMessageIds`/`t()` now read the active scope (ALS if present, else the process-global). Added `preservingMessageTable(fn)` (snapshot/restore the global ambient table), wired around the no-locale audio-mix helpers in the CLI (`collectMixAudioInputs`/`buildMixWav`) so they don't clobber or leak a concurrent locale's table. The CLI one-shot is unaffected.

  FIX 4 (`requireParity` within-manifest duplicate ids): the Set-based union/diff swallowed `{en:['a','a','b']}`. `requireParity` now runs a per-manifest duplicate check (`new Set(m.ids).size !== m.ids.length`) FIRST — naming the locale + dup id and throwing a `ParityError` — even for a single (or zero) manifest, before the cross-manifest diff.

  FIX 5 (`osFamilies` brand-warn gap): `buildFontExemptSet` folded the OS catalog into the exempt set; a registered/declared brand family whose name collides with an OS family could be waved through as "OS-only". The OS-catalog fold now SKIPS any name that collides with a registered family, so a declared brand font stays subject to glyph-coverage validation (a missing glyph still warns / throws under `--strict`). The exemption is for genuinely-OS-only families.

## 0.14.0

### Minor Changes

- 1795d1c: Add the **0.14 localization core** — build-time + render-time i18n sugar that resolves a scene's strings against a per-locale message table, with NOTHING on the `evaluate()` path (the goldens stay byte-identical; the no-`--locale` render path is byte-identical to today).

  New tree-shakeable sub-path `@glissade/core/i18n` (off the base index, like `@glissade/core/clips`), with three pure pieces:

  - **`requireParity(...manifests: { locale, ids }[]): void`** — a pure cross-locale id-set diff (the cross-language analogue of `narration().require`); throws a `ParityError` naming every missing/extra id per locale.
  - **`localize(doc, table, { locale }): TimelineDoc`** — a pure doc→doc resolver that substitutes string-track key values whose target node-id is a key in the table (captions / narration-derived text live in the doc as string tracks). Returns a NEW doc; non-matching tracks pass through byte-identical.
  - **`t(id): string`** — build-time sugar resolving `id` against an ambient message table (`setMessageTable`/`getMessageTable`), for static Text-node text not animated by a track. Hard-fails on an unknown id (mirrors `require()`); with no table installed returns `id` verbatim (the base path).

  `@glissade/cli`: `gs render --locale <code>` selects `messages.<code>.json` (relative to the scene module) and prefers the locale-tagged narration sibling `<base>.<code>.narration.timing.json` (the suffix is a single clearly-commented constant in `cli/src/locale.ts`), injecting the table into the ambient context `loadSceneModule` uses and running `localize` over the doc. No `--locale` resolves the BASE files → byte-identical to today.

  `@glissade/narrate`: `narration().idManifest(locale)` returns `{ locale, ids }` (every addressable beat id) to feed `requireParity`.

- 7456761: Add the 0.14 scalar→vec2 **bind-time type guard** (§2.2) — the runtime correctness floor for the silent-NaN class. A scalar `number` track bound to a `vec2` prop (e.g. authoring `scale: 0.8` instead of `[0.8, 0.8]`) used to silently sample to `[undefined, undefined]` → a NaN matrix → the node and its whole subtree vanishing, with no error. Any track-type ↔ target-shape mismatch (a `number` track on a `paint`/`path` prop, a `color` on a `number`, …) was the same silent failure.

  Now `bindTimeline` (`@glissade/core`) checks each compiled track's `type` against the target's declared accepted type and hard-throws a typed `BindTypeMismatchError` — naming the target, the got (track) type, the expected (prop) type, and a fix hint (`scale.x`/`scale.y` for the vec2 case). This matches the existing "unbound tracks are build errors" precedent (`UnboundTargetError`): a mismatched bind is a build error, not a silent no-op.

  Mechanism (additive, golden-safe — a _correct_ bind is unchanged, so all 252 goldens stay byte-identical):

  - `BindTarget` (core) gains `readonly expects: ValueTypeId | readonly ValueTypeId[]` (an array for a polymorphic prop — a Shape `fill` accepts both `color` and `paint`). New exports: `BindTypeMismatchError`, the `Vec2Component` type.
  - `vec2Signal` tags its compound (`'vec2'`) and its `.x`/`.y` sub-signals (`'number'`).
  - `registerTarget` (`@glissade/scene`) takes the prop's accepted type and stamps it; every node prop is tagged (`position`/`scale` vec2; their `.x`/`.y` + `opacity`/`rotation`/`zIndex`/`width`/`height`/`cornerRadius`/`radius`/`strokeWidth`/`reveal`/`fontSize`/Layout/shader uniforms number; `fill` color|paint, `stroke`/Text-`fill`/Highlight color, `d` path, `text` string).

  The 0.13 clip stdlib `popIn`/`pulse` already author vec2 `scale` keys, so they pass the new guard unchanged. The scalar→pair _broadcast_ (lifting `0.8` → `[0.8, 0.8]`) is deliberately deferred to 0.15 — it would mask the wrong-prop mistakes this guard is meant to catch.

### Patch Changes

- f13486d: 0.14 canary fixes (1, 2, 5) — bind-time guard correctness + the orphaned-message-key check. Three mount-time / build-time fixes; no `evaluate()` change, so all 262 goldens stay byte-identical.

  - **FIX 1 (BLOCKER) — vec2-arc false-throws on every vec2 prop.** The public `vec2-arc` value type samples to a valid `Vec2`, but every vec2 `registerTarget` site tagged the scalar `'vec2'`, so binding a `vec2-arc` track to `position`/`scale`/Highlight `offset` hard-threw `BindTypeMismatchError` at mount. Those targets are now tagged polymorphically `['vec2', 'vec2-arc']` (`@glissade/scene`: `node.ts` position/scale, `tokenHighlight.ts` offset). A `vec2-arc` track binds and samples to a finite `Vec2`.

  - **FIX 2 (BLOCKER) — `registerTarget`'s required 3rd arg broke the public Custom-node seam + 0.13 back-compat.** `registerTarget(path, sig, expects)` made `expects` required, so external `Custom`/`Node` subclasses (and prebuilt 0.13 custom nodes calling the 2-arg form) hit `binding.ts` with `expects === undefined` → every track on a custom prop hard-threw. `expects` is now OPTIONAL (no default — left `undefined`), and `bindTimeline`'s guard skips an UNtagged target (`expects === undefined || …includes(got) …`). An untagged custom-node prop binds ANY track (0.13 had no guard); built-in tagged targets keep their guard. `BindTarget.expects` / `BindablePropTarget.expects` widen to `… | undefined`.

  - **FIX 5 (HIGH) — stale/typo'd `messages.<locale>.json` key silently dropped.** `localize()` consumed table entries by membership only, so a key matching no node-id (and no `t()` id) silently localized nothing — that node shipped base text, no error. `localize` now collects the node-ids it consumes, folds in the `t()`-consumed ids (`getConsumedMessageIds()`, reset by `setMessageTable`, passed via the new `LocalizeOptions.consumedIds`), and throws a `LocalizationError` naming every orphaned key. A fully-matched table is silent.

## 0.14.0-pre.1

### Patch Changes

- f13486d: 0.14 canary fixes (1, 2, 5) — bind-time guard correctness + the orphaned-message-key check. Three mount-time / build-time fixes; no `evaluate()` change, so all 262 goldens stay byte-identical.

  - **FIX 1 (BLOCKER) — vec2-arc false-throws on every vec2 prop.** The public `vec2-arc` value type samples to a valid `Vec2`, but every vec2 `registerTarget` site tagged the scalar `'vec2'`, so binding a `vec2-arc` track to `position`/`scale`/Highlight `offset` hard-threw `BindTypeMismatchError` at mount. Those targets are now tagged polymorphically `['vec2', 'vec2-arc']` (`@glissade/scene`: `node.ts` position/scale, `tokenHighlight.ts` offset). A `vec2-arc` track binds and samples to a finite `Vec2`.

  - **FIX 2 (BLOCKER) — `registerTarget`'s required 3rd arg broke the public Custom-node seam + 0.13 back-compat.** `registerTarget(path, sig, expects)` made `expects` required, so external `Custom`/`Node` subclasses (and prebuilt 0.13 custom nodes calling the 2-arg form) hit `binding.ts` with `expects === undefined` → every track on a custom prop hard-threw. `expects` is now OPTIONAL (no default — left `undefined`), and `bindTimeline`'s guard skips an UNtagged target (`expects === undefined || …includes(got) …`). An untagged custom-node prop binds ANY track (0.13 had no guard); built-in tagged targets keep their guard. `BindTarget.expects` / `BindablePropTarget.expects` widen to `… | undefined`.

  - **FIX 5 (HIGH) — stale/typo'd `messages.<locale>.json` key silently dropped.** `localize()` consumed table entries by membership only, so a key matching no node-id (and no `t()` id) silently localized nothing — that node shipped base text, no error. `localize` now collects the node-ids it consumes, folds in the `t()`-consumed ids (`getConsumedMessageIds()`, reset by `setMessageTable`, passed via the new `LocalizeOptions.consumedIds`), and throws a `LocalizationError` naming every orphaned key. A fully-matched table is silent.

## 0.14.0-pre.0

### Minor Changes

- 1795d1c: Add the **0.14 localization core** — build-time + render-time i18n sugar that resolves a scene's strings against a per-locale message table, with NOTHING on the `evaluate()` path (the goldens stay byte-identical; the no-`--locale` render path is byte-identical to today).

  New tree-shakeable sub-path `@glissade/core/i18n` (off the base index, like `@glissade/core/clips`), with three pure pieces:

  - **`requireParity(...manifests: { locale, ids }[]): void`** — a pure cross-locale id-set diff (the cross-language analogue of `narration().require`); throws a `ParityError` naming every missing/extra id per locale.
  - **`localize(doc, table, { locale }): TimelineDoc`** — a pure doc→doc resolver that substitutes string-track key values whose target node-id is a key in the table (captions / narration-derived text live in the doc as string tracks). Returns a NEW doc; non-matching tracks pass through byte-identical.
  - **`t(id): string`** — build-time sugar resolving `id` against an ambient message table (`setMessageTable`/`getMessageTable`), for static Text-node text not animated by a track. Hard-fails on an unknown id (mirrors `require()`); with no table installed returns `id` verbatim (the base path).

  `@glissade/cli`: `gs render --locale <code>` selects `messages.<code>.json` (relative to the scene module) and prefers the locale-tagged narration sibling `<base>.<code>.narration.timing.json` (the suffix is a single clearly-commented constant in `cli/src/locale.ts`), injecting the table into the ambient context `loadSceneModule` uses and running `localize` over the doc. No `--locale` resolves the BASE files → byte-identical to today.

  `@glissade/narrate`: `narration().idManifest(locale)` returns `{ locale, ids }` (every addressable beat id) to feed `requireParity`.

- 7456761: Add the 0.14 scalar→vec2 **bind-time type guard** (§2.2) — the runtime correctness floor for the silent-NaN class. A scalar `number` track bound to a `vec2` prop (e.g. authoring `scale: 0.8` instead of `[0.8, 0.8]`) used to silently sample to `[undefined, undefined]` → a NaN matrix → the node and its whole subtree vanishing, with no error. Any track-type ↔ target-shape mismatch (a `number` track on a `paint`/`path` prop, a `color` on a `number`, …) was the same silent failure.

  Now `bindTimeline` (`@glissade/core`) checks each compiled track's `type` against the target's declared accepted type and hard-throws a typed `BindTypeMismatchError` — naming the target, the got (track) type, the expected (prop) type, and a fix hint (`scale.x`/`scale.y` for the vec2 case). This matches the existing "unbound tracks are build errors" precedent (`UnboundTargetError`): a mismatched bind is a build error, not a silent no-op.

  Mechanism (additive, golden-safe — a _correct_ bind is unchanged, so all 252 goldens stay byte-identical):

  - `BindTarget` (core) gains `readonly expects: ValueTypeId | readonly ValueTypeId[]` (an array for a polymorphic prop — a Shape `fill` accepts both `color` and `paint`). New exports: `BindTypeMismatchError`, the `Vec2Component` type.
  - `vec2Signal` tags its compound (`'vec2'`) and its `.x`/`.y` sub-signals (`'number'`).
  - `registerTarget` (`@glissade/scene`) takes the prop's accepted type and stamps it; every node prop is tagged (`position`/`scale` vec2; their `.x`/`.y` + `opacity`/`rotation`/`zIndex`/`width`/`height`/`cornerRadius`/`radius`/`strokeWidth`/`reveal`/`fontSize`/Layout/shader uniforms number; `fill` color|paint, `stroke`/Text-`fill`/Highlight color, `d` path, `text` string).

  The 0.13 clip stdlib `popIn`/`pulse` already author vec2 `scale` keys, so they pass the new guard unchanged. The scalar→pair _broadcast_ (lifting `0.8` → `[0.8, 0.8]`) is deliberately deferred to 0.15 — it would mask the wrong-prop mistakes this guard is meant to catch.

## 0.13.0

### Minor Changes

- 3bc3270: Add `morph()` (on the `@glissade/core/clips` sub-path) — a shared-element box-FLIP morph. Given two caller-supplied `Box` literals (a from and a to rect, Rect center convention) and a `{ morphNode, fromNode?, toNode? }` target map, it compiles a FLIP position+scale tween on one shared element plus an optional opacity cross-fade. Pure core (no scene/Yoga query): the FLIP delta is plain arithmetic over the two boxes, emitted through the validated `clip` path so the tracks are byte-indistinguishable from hand-authored ones. Degenerate boxes, non-positive duration, and out-of-range crossfade are rejected at build time.
- 993d46a: Add `presence()` (0.13) — enter/exit presence scheduling on the `@glissade/core/clips` subpath. Build-time sugar over `clip`: schedules a node's enter on `show`, back-times its exit to land exactly on `hide`, and authors a real `<nodeId>/opacity` window-guard track that culls the node (opacity<=0) outside `[show, hide]`. The enter/exit clips' own opacity keys are reconciled into the guard with the builder's deterministic later-wins coincident-key dedup (no double-authored keys); a clip without an opacity channel synthesizes the 0→1 rise / 1→0 fall. Compiles entirely to keyed `Track[]` via `track()` — byte-indistinguishable from hand-authored, with no runtime visibility flag. Returns `{ tracks, end, shownAt, hiddenAt }` so siblings anchor to the real exit. Overlapping windows throw `PresenceError`.

### Patch Changes

- d1e81b7: 0.13 canary fixes: five deterministic-but-wrong correctness holes in shipped sugar.

  - **clipStdlib**: `popIn()` and `pulse()` authored a SCALAR `scale` channel, but the scene node `scale` prop is a `Vec2Signal` — the vec2 signal read `c[0]`/`c[1]` off a scalar → `[undefined, undefined]` → a NaN local matrix → the node + its subtree silently vanished for the whole clip window. Both now author VEC2 scale keys (`[0.8,0.8]→[1,1]` for popIn; `1→[peak,peak]→1` for pulse). Emitted tracks are byte-identical to the prior hand-authored `popInVec` workaround, so goldens are unaffected.
  - **presence (degenerate window)**: a no-plateau window (`exitStart == show`) slipped through a strict `<` check; the exit's value-1 key then won the coincident-`t` dedup at `show`, destroying the enter fade AND the pre-show cull (opacity ramped 0→1 across `[0,show)`). The guard is now `<=`, so a window with no live plateau throws `PresenceError`.
  - **presence (pre-show opacity leak)**: a custom `enter` whose first opacity key value ≠ 0 (e.g. `key(0,0.5)`) lerped the held-0 cull up to that value across the entire pre-show window (`sampleTrack` reads the `hold` flag off the ARRIVAL key). The pre-show segment now HOLDS 0 until the enter's first key (marked `interp:'hold'` only when its value ≠ 0), so the cull holds 0 across `[0,show)` and the ramp begins at `show`. Default-fade bytes are unchanged.
  - **presence/morph (slash-bearing node ids)**: `presence`/`morph` no longer re-split a caller's node id on the FIRST `/` — they APPEND the prop suffix and trust the caller, so an `each()` clone id like `card/3` targets the CLONE, not the wrapping `card` Group. The scene's longest-registered-prefix resolver disambiguates at bind time.
  - **valueTypes (mesh bg)**: a one-sided mesh `bg` in a non-hex color (hsl/named/oklch) threw from `parseColor` inside `lerp` during `evaluate()` (the 0.13 symmetric-bg path). `transparentOf` and the bg lerp now fall back to a safe snap instead of throwing.

- 1995ee8: clip: close three byte-indistinguishability nits so emitted `Track[]` stays deep-equal to hand-authored `track()` on currently-unread fields:

  - carry a key's `from` (`'live'`, §4.7) flag through `compileChannel` instead of dropping it;
  - drop `derived` on a key whose value an override REPLACED (an overridden value is no longer builder-derived; un-overridden keys keep the flag);
  - reject an ambiguous single-key override (`from` on a 1-key channel, or `from`+`to` both targeting the one key) with a `ClipError` naming the channel, rather than silently dropping a value.

  Goldens unaffected (these touch unread fields / a throw path).

- 750367f: Fix two silently-wrong cases in the animated-mesh `paintType.lerp` (`mesh ↔ mesh`, opt-in path). Both were already deterministic; these make them visually correct.

  - **Interpolation-mode mismatch now snaps instead of pairwise-lerping.** The mesh blend kernel forks on `interpolation` (`gaussian` vs `smooth`/`oklab`), so a `smooth → gaussian` tween used to rasterize the whole way with A's kernel and then flip discretely at the boundary. A matched-point-count mesh whose `interpolation` differs now routes through the snap path (hold A — value **and** kernel — until `t ≥ 1`, then B) and emits a one-time dev warning naming the mode mismatch, consistent with the mismatched-count and cross-kind branches.
  - **`bg` (mesh baseline) now fades symmetrically.** An appearing `bg` (A has none, B does) used to be dropped for the whole tween and pop in at `t ≥ 1`; a disappearing `bg` froze at A's value then snapped. Both now lift the missing side to a transparent (alpha-0) stand-in of the present color and `lerpColor` whenever **either** side has a `bg`, so it ramps in/out continuously.

  No public API change. All existing goldens are byte-identical (no golden crosses these cases).

- 8bec181: woff2 decode coverage: decode unit test + golden + byte-stable sfnt assertion (DsW-aD_OUMoV item 1).

  The font-ingest woff2/woff subpath was untested (no woff2 bytes existed in the repo) and latently broken: the decode branch read `parseCmap()` on the _compressed_ woff2 bytes to build hb-subset's retain set — which is empty — so the decode dropped every glyph (a stripped cmap, 0 covered code points). It now decodes woff/woff2 → sfnt via `fontverter` (subset-font's own pure codec, dynamically imported on the font-ingest subpath only, never reaching the embed), reads real coverage from the decoded sfnt, and only then optionally instances axes via hb-subset.

  Coverage:

  - **decode unit test** (`packages/core/test/woff2Decode.test.ts`): a committed `Inconsolata-wght600.woff2` (OFL, a woff2 of the in-repo `Inconsolata-wght600.ttf`) ingested through `registerFont`/`ingestFont` → the covered code-point SET equals the round-trip-validated fixture (882 codepoints / 128 ranges) incl. spot-checks (U+0020/0041/0061/0030).
  - **golden** (`golden-woff2`): a Text scene in the woff2-decoded face, rendered byte-exactly on Skia — proves the decode is byte-stable through the rasterizer.
  - **byte-stable sfnt assertion**: decoding the same woff2 twice yields byte-identical sfnt bytes (sha256) — decode-once-at-ingest, never in evaluate.

  The woff2 fixture is a TEST asset and the `fontverter` decoder stays on the dynamically-imported font-ingest subpath; the §4.4 leak-guard confirms neither reaches any embed bundle.

- 0a3d35b: Fix `registerFont`/`ingestFont` throwing `Unrecognized font signature` on a woff2/woff passed as a plain `Uint8Array` or `ArrayBuffer` `src` (i.e. every real consumer — `registerFont` normalizes `src` to a plain `Uint8Array`). `fontverter@2.x` sniffs the magic via `Buffer.prototype.toString('ascii',0,4)`, which a plain `Uint8Array` does not honor; the decode now normalizes to a node `Buffer` first. The in-repo woff2 test masked this by feeding a path (→ `readFile` → a `Buffer`); added a regression that ingests a plain `Uint8Array`/`ArrayBuffer` src — the broken public-API contract. (ai-training real-Fontsource validation, the second woff2 bug behind DsW-aD_OUMoV item 1.)

## 0.13.0-pre.3

### Patch Changes

- 0a3d35b: Fix `registerFont`/`ingestFont` throwing `Unrecognized font signature` on a woff2/woff passed as a plain `Uint8Array` or `ArrayBuffer` `src` (i.e. every real consumer — `registerFont` normalizes `src` to a plain `Uint8Array`). `fontverter@2.x` sniffs the magic via `Buffer.prototype.toString('ascii',0,4)`, which a plain `Uint8Array` does not honor; the decode now normalizes to a node `Buffer` first. The in-repo woff2 test masked this by feeding a path (→ `readFile` → a `Buffer`); added a regression that ingests a plain `Uint8Array`/`ArrayBuffer` src — the broken public-API contract. (ai-training real-Fontsource validation, the second woff2 bug behind DsW-aD_OUMoV item 1.)

## 0.13.0-pre.2

### Patch Changes

- 8bec181: woff2 decode coverage: decode unit test + golden + byte-stable sfnt assertion (DsW-aD_OUMoV item 1).

  The font-ingest woff2/woff subpath was untested (no woff2 bytes existed in the repo) and latently broken: the decode branch read `parseCmap()` on the _compressed_ woff2 bytes to build hb-subset's retain set — which is empty — so the decode dropped every glyph (a stripped cmap, 0 covered code points). It now decodes woff/woff2 → sfnt via `fontverter` (subset-font's own pure codec, dynamically imported on the font-ingest subpath only, never reaching the embed), reads real coverage from the decoded sfnt, and only then optionally instances axes via hb-subset.

  Coverage:

  - **decode unit test** (`packages/core/test/woff2Decode.test.ts`): a committed `Inconsolata-wght600.woff2` (OFL, a woff2 of the in-repo `Inconsolata-wght600.ttf`) ingested through `registerFont`/`ingestFont` → the covered code-point SET equals the round-trip-validated fixture (882 codepoints / 128 ranges) incl. spot-checks (U+0020/0041/0061/0030).
  - **golden** (`golden-woff2`): a Text scene in the woff2-decoded face, rendered byte-exactly on Skia — proves the decode is byte-stable through the rasterizer.
  - **byte-stable sfnt assertion**: decoding the same woff2 twice yields byte-identical sfnt bytes (sha256) — decode-once-at-ingest, never in evaluate.

  The woff2 fixture is a TEST asset and the `fontverter` decoder stays on the dynamically-imported font-ingest subpath; the §4.4 leak-guard confirms neither reaches any embed bundle.

## 0.13.0-pre.1

### Patch Changes

- d1e81b7: 0.13 canary fixes: five deterministic-but-wrong correctness holes in shipped sugar.

  - **clipStdlib**: `popIn()` and `pulse()` authored a SCALAR `scale` channel, but the scene node `scale` prop is a `Vec2Signal` — the vec2 signal read `c[0]`/`c[1]` off a scalar → `[undefined, undefined]` → a NaN local matrix → the node + its subtree silently vanished for the whole clip window. Both now author VEC2 scale keys (`[0.8,0.8]→[1,1]` for popIn; `1→[peak,peak]→1` for pulse). Emitted tracks are byte-identical to the prior hand-authored `popInVec` workaround, so goldens are unaffected.
  - **presence (degenerate window)**: a no-plateau window (`exitStart == show`) slipped through a strict `<` check; the exit's value-1 key then won the coincident-`t` dedup at `show`, destroying the enter fade AND the pre-show cull (opacity ramped 0→1 across `[0,show)`). The guard is now `<=`, so a window with no live plateau throws `PresenceError`.
  - **presence (pre-show opacity leak)**: a custom `enter` whose first opacity key value ≠ 0 (e.g. `key(0,0.5)`) lerped the held-0 cull up to that value across the entire pre-show window (`sampleTrack` reads the `hold` flag off the ARRIVAL key). The pre-show segment now HOLDS 0 until the enter's first key (marked `interp:'hold'` only when its value ≠ 0), so the cull holds 0 across `[0,show)` and the ramp begins at `show`. Default-fade bytes are unchanged.
  - **presence/morph (slash-bearing node ids)**: `presence`/`morph` no longer re-split a caller's node id on the FIRST `/` — they APPEND the prop suffix and trust the caller, so an `each()` clone id like `card/3` targets the CLONE, not the wrapping `card` Group. The scene's longest-registered-prefix resolver disambiguates at bind time.
  - **valueTypes (mesh bg)**: a one-sided mesh `bg` in a non-hex color (hsl/named/oklch) threw from `parseColor` inside `lerp` during `evaluate()` (the 0.13 symmetric-bg path). `transparentOf` and the bg lerp now fall back to a safe snap instead of throwing.

## 0.13.0-pre.0

### Minor Changes

- 3bc3270: Add `morph()` (on the `@glissade/core/clips` sub-path) — a shared-element box-FLIP morph. Given two caller-supplied `Box` literals (a from and a to rect, Rect center convention) and a `{ morphNode, fromNode?, toNode? }` target map, it compiles a FLIP position+scale tween on one shared element plus an optional opacity cross-fade. Pure core (no scene/Yoga query): the FLIP delta is plain arithmetic over the two boxes, emitted through the validated `clip` path so the tracks are byte-indistinguishable from hand-authored ones. Degenerate boxes, non-positive duration, and out-of-range crossfade are rejected at build time.
- 993d46a: Add `presence()` (0.13) — enter/exit presence scheduling on the `@glissade/core/clips` subpath. Build-time sugar over `clip`: schedules a node's enter on `show`, back-times its exit to land exactly on `hide`, and authors a real `<nodeId>/opacity` window-guard track that culls the node (opacity<=0) outside `[show, hide]`. The enter/exit clips' own opacity keys are reconciled into the guard with the builder's deterministic later-wins coincident-key dedup (no double-authored keys); a clip without an opacity channel synthesizes the 0→1 rise / 1→0 fall. Compiles entirely to keyed `Track[]` via `track()` — byte-indistinguishable from hand-authored, with no runtime visibility flag. Returns `{ tracks, end, shownAt, hiddenAt }` so siblings anchor to the real exit. Overlapping windows throw `PresenceError`.

### Patch Changes

- 1995ee8: clip: close three byte-indistinguishability nits so emitted `Track[]` stays deep-equal to hand-authored `track()` on currently-unread fields:

  - carry a key's `from` (`'live'`, §4.7) flag through `compileChannel` instead of dropping it;
  - drop `derived` on a key whose value an override REPLACED (an overridden value is no longer builder-derived; un-overridden keys keep the flag);
  - reject an ambiguous single-key override (`from` on a 1-key channel, or `from`+`to` both targeting the one key) with a `ClipError` naming the channel, rather than silently dropping a value.

  Goldens unaffected (these touch unread fields / a throw path).

- 750367f: Fix two silently-wrong cases in the animated-mesh `paintType.lerp` (`mesh ↔ mesh`, opt-in path). Both were already deterministic; these make them visually correct.

  - **Interpolation-mode mismatch now snaps instead of pairwise-lerping.** The mesh blend kernel forks on `interpolation` (`gaussian` vs `smooth`/`oklab`), so a `smooth → gaussian` tween used to rasterize the whole way with A's kernel and then flip discretely at the boundary. A matched-point-count mesh whose `interpolation` differs now routes through the snap path (hold A — value **and** kernel — until `t ≥ 1`, then B) and emits a one-time dev warning naming the mode mismatch, consistent with the mismatched-count and cross-kind branches.
  - **`bg` (mesh baseline) now fades symmetrically.** An appearing `bg` (A has none, B does) used to be dropped for the whole tween and pop in at `t ≥ 1`; a disappearing `bg` froze at A's value then snapped. Both now lift the missing side to a transparent (alpha-0) stand-in of the present color and `lerpColor` whenever **either** side has a `bg`, so it ramps in/out continuously.

  No public API change. All existing goldens are byte-identical (no golden crosses these cases).

## 0.12.1

### Patch Changes

- 56fa1f3: Two 0.12.1 consumer papercut fixes from the 0.12.0 validation.

  **Fix A — narration-lint no longer over-flags sidecar caption workflows.**
  `caption-fit` is now Tier-2 (WARN, never fails CI) **by default**, escalating to
  Tier-1 (error, CI-failing) only when the NarrationScript declares caption-fit
  intent — `captionMode: 'burn'` or a `captionMaxLines` budget. The escalation
  signal travels with the content in the committed script/manifest (not a CLI
  flag). The warn variant carries a nudge telling the author how to promote it to
  a hard gate. A sidecar project with no declaration now exits 0 out of the box.
  Adds `captionMode?: 'burn' | 'sidecar'` and `captionMaxLines?: number` to
  `NarrationScript`, persisted into `NarrationTiming`.

  **Fix B — `registerFont({ src: './Inter.ttf' })` accepts a string path.**
  A string `src` is now fs-read to bytes node-side (on the export/prepare-only
  `@glissade/core/font-ingest` subpath; `node:fs` does not leak into the embed).
  An unreadable path throws a clear `FontIngestError` naming the path instead of
  the downstream "too short to be a font". Raw `Uint8Array | ArrayBuffer` keeps
  working unchanged.

## 0.12.0

### Minor Changes

- 2850386: feat(fonts): font ingestion front door — registerFont/font()/static instancing (§3.6)

  The 0.12 font front door: `registerFont`, the fluent `font()` builder,
  `ingestFont`, `sniffFontFormat`, `buildFontPlan`, and a `FontStore`, all on the
  new `@glissade/core/font-ingest` sub-path entry. It turns a variable font into
  an ordinary static face once, at ingest/prepare time — never inside
  `evaluate()` — so variable-font support collapses to the already-solved
  static-parity case.

  - `@glissade/core/font-ingest`: magic-byte **sniffing** (ttf / otf / ttc →
    straight to Skia; woff / woff2 → decoded in-process to a plain sfnt),
    **STATIC variable-axis instancing** (a fixed axis tuple, e.g. `{ wght: 600 }`,
    → ONE content-hashed static sfnt; an axis RANGE / live per-frame instancing is
    intentionally deferred), eager `parseCmap` so `registerFont(...)` returns
    coverage + a build-time `covers(text)` / `missing(text)` predicate, and the
    pure `font('Inter').src(...).variable().axis('wght', 600).build()` builder.
    Determinism: the same source + axis tuple yields byte-identical sfnt bytes and
    hash run-to-run, so no new field flows through `FontSpec`/`DisplayList`.
  - `@glissade/cli`: `gs fonts audit <scene>` — the font front-door report
    (per family: declared faces, sniffed format, cmap coverage, and missing-glyph
    RUNS for the text the scene actually renders — the "héllo 👋 renders emoji in
    Chrome, tofu in Skia" bug). The render path registers an instanced face like
    any other static ttf (`GlobalFonts.registerFromPath` for plain ttf/otf,
    preserving existing goldens byte-for-byte; `register(Buffer)` only for a
    decoded woff2).

  The single heavy dependency, `subset-font` (harfbuzz `hb-subset` + a wasm woff2
  decoder), is an `optionalDependencies` entry reached ONLY via a dynamic
  `import()`, so it tree-shakes completely out of every embed bundle — a §4.4
  leak-guard in `scripts/check-size.mjs` fails the build if `subset-font` /
  harfbuzz / wawoff2 / fontIngest reach the embed graph (core/index, scene,
  canvas2d, player, element).

  Gates met: a new `font-instanced` Skia golden (the wght:600 instance of
  Inconsolata-Variable) is per-path byte-exact and joins the browser↔Skia SSIM
  parity suite at the shared 0.97 floor; all pre-existing goldens stay
  byte-identical (additive); the leak-guard passes (the deps tree-shake out).

- 388a8f0: feat(paint): mesh-gradient Paint — one native, animatable aurora fill (§3 Paint)

  A native `mesh` Paint: N color points blended across a node's [0,1]² fill
  rectangle as ONE animatable fill, registered in the Paint union beside
  `linear`/`radial`. The native replacement for the "N blurred blobs" aurora
  backdrop (the consumer's #1 render-cost pain). `points[i].pos`/`color` are
  animatable, so `track('node/fill.points.0.color', 'paint', …)` drives aurora
  drift on a single node.

  The determinism tentpole of the milestone — dual-backend parity is the
  deliverable. A decisive finding (@napi-rs/canvas exposes no SkSL
  `RuntimeEffect`/`makeShader`) means there is NO SkSL-vs-fallback fork: there is
  exactly ONE shared CPU kernel both backends run.

  - `@glissade/core`: a `mesh` Paint variant (`MeshPaint`/`MeshPoint`/
    `MeshInterpolation`) in the animatable Paint union. `paintType` lerps
    matched-count meshes pairwise (point `pos` + OKLab `color`; `interpolation`/
    `bg` carried as discrete metadata) and snaps on a mismatched point count or
    cross-kind — the path/paint precedent. Cross-kind lift (solid→uniform-mesh)
    is deferred.
  - `@glissade/scene`: `meshGradient.ts` — the shared deterministic kernel: one
    Shepard inverse-distance blend with a colorspace knob (`smooth`/`oklab` = IDW
    in OKLab, `gaussian` = a pinned-sigma weight), pinned named constants
    (`MESH_SIGMA`, `MESH_SHEPARD_POWER`, `MESH_DOWNSCALE`), OKLab math reused
    bit-identically from core, and `Uint8ClampedArray` integer quantization so the
    source buffer is reproducible run-to-run and identical across backends. The
    `Raster2D` fill branch blits it via `clip(path) + drawImage(meshTile → bounds)`
    with `imageSmoothingEnabled` pinned (a cross-backend parity spike rejected
    `createPattern` for edge-AA/alpha contamination + an uncontrolled resample
    filter). NO triangulator (Gouraud/Delaunay/Coons deferred).

  Determinism gates met: Skia golden per-path byte-exact (a new `golden-mesh`
  aurora scene; all existing goldens byte-identical — additive Paint kind);
  browser↔Skia SSIM ≥ 0.97 (mesh added to the PARITY suite — the shared kernel
  emits an identical source ImageData on both, only the final blit AA differs);
  RASTER_CACHE on == off byte-for-byte (mesh adds no per-frame state — it rides
  the §3.5 group cache); only deterministic math (exp/hypot/cbrt), no
  Date/Math.random. A stroke/text mesh paint degrades to a deterministic
  representative solid with a one-time dev warning.

- 47a3ca0: Add **motion clips** — build-time authoring sugar, on the tree-shakeable `@glissade/core/clips` sub-path. A `clip()` captures a relative-time key schedule over named prop _channels_; `clip.apply(target, startSec, opts?)` compiles it to ordinary keyed `Track[]` at apply-time (exactly like `springTo`/`stagger`) — **byte-indistinguishable** from hand-authored `track()`, never a runtime concept, never in the serialized Timeline document. Every channel compiles through `track(target, type, keys)`, so `validateTrack` runs and the `evaluate()` purity contract is untouched.

  `target` is a node-id string (each channel → `'<nodeId>/<channel.path>'`) **or** a `{ channel: TweenTarget }` map for per-channel path override. `opts.overrides` substitutes a channel's value/ease topology-preservingly (no add/remove keys); `opts.speed` divides every relative `t`. `clipList(clip, targets, startSec, { stagger })` fans a clip across a list, reusing the `stagger` shape. A small stdlib of `clip(...)` literals ships from the same sub-path: `popIn`, `slideIn`, `pulse`, `driftLoop` (the last two are seamless loop clips).

  New exports from `@glissade/core/clips`: `clip`, `clipList`, `ClipError`, `popIn`, `slideIn`, `pulse`, `driftLoop`, and the `Clip` / `ClipSpec` / `ClipChannel` / `ChannelOverride` / `ApplyOpts` / `ClipResult` / `ClipTarget` / `ClipListOpts` / `DurationOpts` / `SlideEdge` types.

### Patch Changes

- 78393f1: fix(0.12 canary): close four silent-wrong-output / false-verdict holes on opt-in surfaces

  Four fixes from the 0.12.0-pre.0 canary review. All are on opt-in or tooling
  paths; the default render output is unchanged (225 goldens stay byte-identical).

  - **frame cache (`@glissade/cli`)**: the `--cache` key folded only the
    DisplayList (which carries an asset _id_, not pixels), so editing an
    `image`/`video`/`font` asset in place served STALE frames. The key context now
    folds an asset-content digest (sha256 of each referenced asset's BYTES), so an
    in-place asset edit invalidates the key.
  - **`gs verify-determinism --against` (`@glissade/cli`)**: a disjoint
    baseline/render range compared zero frames yet returned a green
    `{ok:true, compared:0}`. A zero-overlap compare is now a FAILURE (exits
    non-zero) with a clear reason; a partial overlap passes but warns about the
    uncompared baseline frames.
  - **loudness mixHash (`@glissade/cli`)**: `computeMixHash` hashed only the timing
    manifests, never the actual mix audio bytes, so editing a timeline clip or
    music stem in place left a stale publish gain applied silently. The hash now
    folds the BYTES of the resolved mix audio inputs (timeline clips + music stem +
    narration cache) at both measure-time and render-time, so the render-time
    stale-gain gate fires on an edited audio file.
  - **`clip()` overrides (`@glissade/core`)**: a wrong-value-type override (e.g. a
    number on a `vec2` channel) sampled to NaN into both backends with no warning.
    The clip override path now asserts the override value's type matches the
    channel and throws `ClipError` on a mismatch.

## 0.12.0-pre.1

### Patch Changes

- 78393f1: fix(0.12 canary): close four silent-wrong-output / false-verdict holes on opt-in surfaces

  Four fixes from the 0.12.0-pre.0 canary review. All are on opt-in or tooling
  paths; the default render output is unchanged (225 goldens stay byte-identical).

  - **frame cache (`@glissade/cli`)**: the `--cache` key folded only the
    DisplayList (which carries an asset _id_, not pixels), so editing an
    `image`/`video`/`font` asset in place served STALE frames. The key context now
    folds an asset-content digest (sha256 of each referenced asset's BYTES), so an
    in-place asset edit invalidates the key.
  - **`gs verify-determinism --against` (`@glissade/cli`)**: a disjoint
    baseline/render range compared zero frames yet returned a green
    `{ok:true, compared:0}`. A zero-overlap compare is now a FAILURE (exits
    non-zero) with a clear reason; a partial overlap passes but warns about the
    uncompared baseline frames.
  - **loudness mixHash (`@glissade/cli`)**: `computeMixHash` hashed only the timing
    manifests, never the actual mix audio bytes, so editing a timeline clip or
    music stem in place left a stale publish gain applied silently. The hash now
    folds the BYTES of the resolved mix audio inputs (timeline clips + music stem +
    narration cache) at both measure-time and render-time, so the render-time
    stale-gain gate fires on an edited audio file.
  - **`clip()` overrides (`@glissade/core`)**: a wrong-value-type override (e.g. a
    number on a `vec2` channel) sampled to NaN into both backends with no warning.
    The clip override path now asserts the override value's type matches the
    channel and throws `ClipError` on a mismatch.

## 0.12.0-pre.0

### Minor Changes

- 2850386: feat(fonts): font ingestion front door — registerFont/font()/static instancing (§3.6)

  The 0.12 font front door: `registerFont`, the fluent `font()` builder,
  `ingestFont`, `sniffFontFormat`, `buildFontPlan`, and a `FontStore`, all on the
  new `@glissade/core/font-ingest` sub-path entry. It turns a variable font into
  an ordinary static face once, at ingest/prepare time — never inside
  `evaluate()` — so variable-font support collapses to the already-solved
  static-parity case.

  - `@glissade/core/font-ingest`: magic-byte **sniffing** (ttf / otf / ttc →
    straight to Skia; woff / woff2 → decoded in-process to a plain sfnt),
    **STATIC variable-axis instancing** (a fixed axis tuple, e.g. `{ wght: 600 }`,
    → ONE content-hashed static sfnt; an axis RANGE / live per-frame instancing is
    intentionally deferred), eager `parseCmap` so `registerFont(...)` returns
    coverage + a build-time `covers(text)` / `missing(text)` predicate, and the
    pure `font('Inter').src(...).variable().axis('wght', 600).build()` builder.
    Determinism: the same source + axis tuple yields byte-identical sfnt bytes and
    hash run-to-run, so no new field flows through `FontSpec`/`DisplayList`.
  - `@glissade/cli`: `gs fonts audit <scene>` — the font front-door report
    (per family: declared faces, sniffed format, cmap coverage, and missing-glyph
    RUNS for the text the scene actually renders — the "héllo 👋 renders emoji in
    Chrome, tofu in Skia" bug). The render path registers an instanced face like
    any other static ttf (`GlobalFonts.registerFromPath` for plain ttf/otf,
    preserving existing goldens byte-for-byte; `register(Buffer)` only for a
    decoded woff2).

  The single heavy dependency, `subset-font` (harfbuzz `hb-subset` + a wasm woff2
  decoder), is an `optionalDependencies` entry reached ONLY via a dynamic
  `import()`, so it tree-shakes completely out of every embed bundle — a §4.4
  leak-guard in `scripts/check-size.mjs` fails the build if `subset-font` /
  harfbuzz / wawoff2 / fontIngest reach the embed graph (core/index, scene,
  canvas2d, player, element).

  Gates met: a new `font-instanced` Skia golden (the wght:600 instance of
  Inconsolata-Variable) is per-path byte-exact and joins the browser↔Skia SSIM
  parity suite at the shared 0.97 floor; all pre-existing goldens stay
  byte-identical (additive); the leak-guard passes (the deps tree-shake out).

- 388a8f0: feat(paint): mesh-gradient Paint — one native, animatable aurora fill (§3 Paint)

  A native `mesh` Paint: N color points blended across a node's [0,1]² fill
  rectangle as ONE animatable fill, registered in the Paint union beside
  `linear`/`radial`. The native replacement for the "N blurred blobs" aurora
  backdrop (the consumer's #1 render-cost pain). `points[i].pos`/`color` are
  animatable, so `track('node/fill.points.0.color', 'paint', …)` drives aurora
  drift on a single node.

  The determinism tentpole of the milestone — dual-backend parity is the
  deliverable. A decisive finding (@napi-rs/canvas exposes no SkSL
  `RuntimeEffect`/`makeShader`) means there is NO SkSL-vs-fallback fork: there is
  exactly ONE shared CPU kernel both backends run.

  - `@glissade/core`: a `mesh` Paint variant (`MeshPaint`/`MeshPoint`/
    `MeshInterpolation`) in the animatable Paint union. `paintType` lerps
    matched-count meshes pairwise (point `pos` + OKLab `color`; `interpolation`/
    `bg` carried as discrete metadata) and snaps on a mismatched point count or
    cross-kind — the path/paint precedent. Cross-kind lift (solid→uniform-mesh)
    is deferred.
  - `@glissade/scene`: `meshGradient.ts` — the shared deterministic kernel: one
    Shepard inverse-distance blend with a colorspace knob (`smooth`/`oklab` = IDW
    in OKLab, `gaussian` = a pinned-sigma weight), pinned named constants
    (`MESH_SIGMA`, `MESH_SHEPARD_POWER`, `MESH_DOWNSCALE`), OKLab math reused
    bit-identically from core, and `Uint8ClampedArray` integer quantization so the
    source buffer is reproducible run-to-run and identical across backends. The
    `Raster2D` fill branch blits it via `clip(path) + drawImage(meshTile → bounds)`
    with `imageSmoothingEnabled` pinned (a cross-backend parity spike rejected
    `createPattern` for edge-AA/alpha contamination + an uncontrolled resample
    filter). NO triangulator (Gouraud/Delaunay/Coons deferred).

  Determinism gates met: Skia golden per-path byte-exact (a new `golden-mesh`
  aurora scene; all existing goldens byte-identical — additive Paint kind);
  browser↔Skia SSIM ≥ 0.97 (mesh added to the PARITY suite — the shared kernel
  emits an identical source ImageData on both, only the final blit AA differs);
  RASTER_CACHE on == off byte-for-byte (mesh adds no per-frame state — it rides
  the §3.5 group cache); only deterministic math (exp/hypot/cbrt), no
  Date/Math.random. A stroke/text mesh paint degrades to a deterministic
  representative solid with a one-time dev warning.

- 47a3ca0: Add **motion clips** — build-time authoring sugar, on the tree-shakeable `@glissade/core/clips` sub-path. A `clip()` captures a relative-time key schedule over named prop _channels_; `clip.apply(target, startSec, opts?)` compiles it to ordinary keyed `Track[]` at apply-time (exactly like `springTo`/`stagger`) — **byte-indistinguishable** from hand-authored `track()`, never a runtime concept, never in the serialized Timeline document. Every channel compiles through `track(target, type, keys)`, so `validateTrack` runs and the `evaluate()` purity contract is untouched.

  `target` is a node-id string (each channel → `'<nodeId>/<channel.path>'`) **or** a `{ channel: TweenTarget }` map for per-channel path override. `opts.overrides` substitutes a channel's value/ease topology-preservingly (no add/remove keys); `opts.speed` divides every relative `t`. `clipList(clip, targets, startSec, { stagger })` fans a clip across a list, reusing the `stagger` shape. A small stdlib of `clip(...)` literals ships from the same sub-path: `popIn`, `slideIn`, `pulse`, `driftLoop` (the last two are seamless loop clips).

  New exports from `@glissade/core/clips`: `clip`, `clipList`, `ClipError`, `popIn`, `slideIn`, `pulse`, `driftLoop`, and the `Clip` / `ClipSpec` / `ClipChannel` / `ChannelOverride` / `ApplyOpts` / `ClipResult` / `ClipTarget` / `ClipListOpts` / `DurationOpts` / `SlideEdge` types.

## 0.11.0

### Patch Changes

- c7c6660: Publishing & release readiness: add per-package `engines.node >=20.19` to every publishable package, and introduce the unscoped `glissade` umbrella package — a one-import realtime embed surface that re-exports `@glissade/core`, `@glissade/scene`, and `@glissade/player` (and only those, per the §7.1 import direction). Also documents the `0.x` lockstep breaking-change policy in a root `BREAKING.md`.

## 0.11.0-pre.1

## 0.11.0-pre.0

### Patch Changes

- c7c6660: Publishing & release readiness: add per-package `engines.node >=20.19` to every publishable package, and introduce the unscoped `glissade` umbrella package — a one-import realtime embed surface that re-exports `@glissade/core`, `@glissade/scene`, and `@glissade/player` (and only those, per the §7.1 import direction). Also documents the `0.x` lockstep breaking-change policy in a root `BREAKING.md`.

## 0.10.1

### Patch Changes

- f9f7ebe: Gradient `Paint` gains a per-gradient `interpolation` mode: `'linear'` (the canvas-native ramp, default — byte-identical), `'smooth'` (a smoothstep S-curve, no Mach-banding at stops), or `'gaussian'` (a soft gaussian shoulder that melts like a wide blur with 2–3 stops). `smooth`/`gaussian` densify and oklab-interpolate the stops at raster, so a soft-light fill reads as smooth as a Gaussian-blur filter with no offscreen composite. Deterministic + golden-byte-exact; `linear`/no-mode gradients are unchanged.
- 7482378: **Gradient `Paint` — animatable linear & radial gradient fills.** `Paint` is now a core animatable document value (`{ kind: 'color' | 'linear' | 'radial' }`), and shape `fill` accepts a `Paint` as well as a color string. Gradients render as a fill with no offscreen composite and no filter — the cheap, soft-light alternative to a Gaussian blur (≈100× faster per frame in a soft-light-heavy scene). Geometry (`from`/`to`, `center`/`radius`) defaults to the shape's path bounds when omitted.

  Gradients animate two ways: **signal-driven** (a computed `fill: () => ({ kind:'radial', center:[x(), y()], ... })` re-evaluates each frame) and **keyframe-driven** via the new `paint` value type — `tl.to('rect/fill', gradient, { ease })` interpolates stops (offset + oklab color) and geometry; a solid color lifts to a uniform gradient to meet a gradient; a mismatched kind/stop-count snaps with a dev warning. Deterministic and golden-byte-exact. Existing color fills are unchanged.

## 0.10.1-pre.1

### Patch Changes

- f9f7ebe: Gradient `Paint` gains a per-gradient `interpolation` mode: `'linear'` (the canvas-native ramp, default — byte-identical), `'smooth'` (a smoothstep S-curve, no Mach-banding at stops), or `'gaussian'` (a soft gaussian shoulder that melts like a wide blur with 2–3 stops). `smooth`/`gaussian` densify and oklab-interpolate the stops at raster, so a soft-light fill reads as smooth as a Gaussian-blur filter with no offscreen composite. Deterministic + golden-byte-exact; `linear`/no-mode gradients are unchanged.

## 0.10.1-pre.0

### Patch Changes

- 7482378: **Gradient `Paint` — animatable linear & radial gradient fills.** `Paint` is now a core animatable document value (`{ kind: 'color' | 'linear' | 'radial' }`), and shape `fill` accepts a `Paint` as well as a color string. Gradients render as a fill with no offscreen composite and no filter — the cheap, soft-light alternative to a Gaussian blur (≈100× faster per frame in a soft-light-heavy scene). Geometry (`from`/`to`, `center`/`radius`) defaults to the shape's path bounds when omitted.

  Gradients animate two ways: **signal-driven** (a computed `fill: () => ({ kind:'radial', center:[x(), y()], ... })` re-evaluates each frame) and **keyframe-driven** via the new `paint` value type — `tl.to('rect/fill', gradient, { ease })` interpolates stops (offset + oklab color) and geometry; a solid color lifts to a uniform gradient to meet a gradient; a mismatched kind/stop-count snaps with a dev warning. Deterministic and golden-byte-exact. Existing color fills are unchanged.

## 0.10.0

### Minor Changes

- 680f8ae: Add the §6.1 per-tick subscriber-notification coalescer (CULV).

  New `@glissade/core` exports: `batch(fn)`, `setScheduler(scheduler)`,
  `synchronousScheduler`, and the `Scheduler` type. `batch()` coalesces every
  signal write inside `fn` into a single subscriber notification; `setScheduler()`
  lets a consumer defer that notification to a microtask/rAF flush (Theatre's
  `dataverse` Ticker pattern) so a scrub frame that dirties N signals produces one
  observer pass.

  The scheduler times subscriber **notification only**. Reads stay synchronous:
  `peek()`/`get()`/`evaluate()` return the new value immediately after `set()`,
  the DIRTY/CHECK staleness cascade is untouched, and a write during a flush is
  drained by a bounded loop. The default scheduler is synchronous and flushes at
  the end of the outermost write, preserving the prior notification timing
  byte-for-byte — existing behavior (and all Skia goldens) is unchanged. The
  existing rAF coalescers in player/element are intentionally left as-is this
  cycle.

### Patch Changes

- fbdcc44: The signal-notification ticker now isolates a throwing subscriber: one subscriber that throws no longer starves the other subscribers coalesced into the same flush. Errors are collected and rethrown (as an `AggregateError` if more than one) after the queue fully drains, so every subscriber still fires for the change.
- b2f1fd7: `parseCmap` now accepts an `ArrayBuffer | ArrayBufferView` (e.g. a `Uint8Array`/`Buffer` from `readFileSync`), not just an `ArrayBuffer`. Previously a typed-array view made the internal `new DataView(bytes)` throw, swallowed to an empty coverage set — a silent wrong answer for the most natural input type. (0.9 canary nit.)

## 0.10.0-pre.1

### Patch Changes

- fbdcc44: The signal-notification ticker now isolates a throwing subscriber: one subscriber that throws no longer starves the other subscribers coalesced into the same flush. Errors are collected and rethrown (as an `AggregateError` if more than one) after the queue fully drains, so every subscriber still fires for the change.

## 0.10.0-pre.0

### Minor Changes

- 680f8ae: Add the §6.1 per-tick subscriber-notification coalescer (CULV).

  New `@glissade/core` exports: `batch(fn)`, `setScheduler(scheduler)`,
  `synchronousScheduler`, and the `Scheduler` type. `batch()` coalesces every
  signal write inside `fn` into a single subscriber notification; `setScheduler()`
  lets a consumer defer that notification to a microtask/rAF flush (Theatre's
  `dataverse` Ticker pattern) so a scrub frame that dirties N signals produces one
  observer pass.

  The scheduler times subscriber **notification only**. Reads stay synchronous:
  `peek()`/`get()`/`evaluate()` return the new value immediately after `set()`,
  the DIRTY/CHECK staleness cascade is untouched, and a write during a flush is
  drained by a bounded loop. The default scheduler is synchronous and flushes at
  the end of the outermost write, preserving the prior notification timing
  byte-for-byte — existing behavior (and all Skia goldens) is unchanged. The
  existing rAF coalescers in player/element are intentionally left as-is this
  cycle.

### Patch Changes

- b2f1fd7: `parseCmap` now accepts an `ArrayBuffer | ArrayBufferView` (e.g. a `Uint8Array`/`Buffer` from `readFileSync`), not just an `ArrayBuffer`. Previously a typed-array view made the internal `new DataView(bytes)` throw, swallowed to an empty coverage set — a silent wrong answer for the most natural input type. (0.9 canary nit.)

## 0.9.1

## 0.9.1-pre.0

## 0.9.0

### Minor Changes

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

- 7edd807: feat(core): studio edit-gating + write-back helpers (§6.2)

  Adds the core surface the studio needs to gate GUI edits and offer the
  hybrid write-back affordances (the `isEditableNodeId` predicate ships
  separately):

  - `editableDuration()` on `TimelineBuilder` + `isDurationEditable(doc)` — opt
    the (otherwise code-owned) timeline duration into studio editing, mirroring
    `.editable()` for tracks. Backed by an additive optional
    `Timeline.editableDuration` field; existing documents are unaffected.
  - `deleteSidecarTrack(doc, timelineId, target)` — remove one editor-owned
    track from the sidecar (§6.2 rule 7 "extract edits to code"), returning a new
    document and never mutating the input. Source is never touched.

  All additive; no existing document changes shape or renders differently.

- ea9657c: Studio foundation (DESIGN §6.3/§6.4), the core half of the StudioHost work: a new tree-shaken entry **`@glissade/core/studio-host`** exporting the `StudioHost` interface types (`MergedTimeline = Timeline & { orphans }`, `NodeDescriptor`, `SignalPath`, `StudioEvent`), the `isEditableNodeId` rule (only explicit, non-structural ids host editable tracks), and the **`TimelinePatch` engine**: `applyPatches(doc, patches, baseline?)` applies a fine-grained, by-stable-key-id edit transaction **atomically** (an invalid patch rejects the whole batch, doc untouched) and returns a snapshot-restore **inverse** for undo that round-trips byte-for-byte — even through `normalizeEditedKeys`' spring re-pin. Every patch variant is plain JSON (structured-clone-safe for a future postMessage host). Kept entirely out of the embed `.` bundle. (The studio's in-process host + App.tsx rewire onto this land next.)

### Patch Changes

- f3b471b: Hardening from the in-house 0.9 canary (all confined to the opt-in studio-host / strict-font surfaces; the determinism gate was clean):

  - **Undo is now byte-exact even on un-normalized sidecars.** The snapshot-restore inverse is a `verbatim` setTrackKeys that replays the prior state as-is, instead of re-running `normalizeEditedKeys` (which re-pinned spring keys / re-nudged collisions and silently mutated the curve on externally-sourced or `setSidecarTrack`-written sidecars).
  - **`parseCmap` can't hang on a corrupt font.** The format-12 group count is clamped to what the buffer holds — a truncated subtable that declared billions of groups (a ~30s stall on the `--strict` font path) now returns empty instantly.
  - **The editable-host rule is enforced on the write surface.** `applyPatches` (setTrackKeys/addKey) and `setSidecarTrack` now reject structural `~Type.ordinal` / empty-nodeId targets, so a low-level consumer can't persist a sidecar track that then crashes `evaluate()`.
  - **Reserved-id guard at construction.** A node id in the reserved `~` namespace throws `ReservedNodeIdError` at `createScene` (was accepted, then failed confusingly at the first tween).
  - **Undo of a baseline-seeded first edit** restores `{timelines:{}}` exactly (prunes the timeline only when the transaction created it), instead of leaving an empty `{tracks:{}}` shell.

- 7035c6b: Enforce the editable-host rule on track targets (§6.4/§6.5, the structural-id guards): a structural `~Type.ordinal` string target is now rejected at track creation (`UnresolvableTargetError` — structural ids are inspection-only, never track targets), and `.editable()` on a target lacking an explicit node id throws a clear `TimelineValidationError`. Both share the single `isEditableNodeId` predicate, now exported from core (alongside `targetNodeId`) and consumed by the builder, the scene, and the studio host. (The `~Type.ordinal` structural-id _generator_ was dropped per the 0.9 design lock; only the guards remain.)

## 0.9.0-pre.1

### Patch Changes

- f3b471b: Hardening from the in-house 0.9 canary (all confined to the opt-in studio-host / strict-font surfaces; the determinism gate was clean):

  - **Undo is now byte-exact even on un-normalized sidecars.** The snapshot-restore inverse is a `verbatim` setTrackKeys that replays the prior state as-is, instead of re-running `normalizeEditedKeys` (which re-pinned spring keys / re-nudged collisions and silently mutated the curve on externally-sourced or `setSidecarTrack`-written sidecars).
  - **`parseCmap` can't hang on a corrupt font.** The format-12 group count is clamped to what the buffer holds — a truncated subtable that declared billions of groups (a ~30s stall on the `--strict` font path) now returns empty instantly.
  - **The editable-host rule is enforced on the write surface.** `applyPatches` (setTrackKeys/addKey) and `setSidecarTrack` now reject structural `~Type.ordinal` / empty-nodeId targets, so a low-level consumer can't persist a sidecar track that then crashes `evaluate()`.
  - **Reserved-id guard at construction.** A node id in the reserved `~` namespace throws `ReservedNodeIdError` at `createScene` (was accepted, then failed confusingly at the first tween).
  - **Undo of a baseline-seeded first edit** restores `{timelines:{}}` exactly (prunes the timeline only when the transaction created it), instead of leaving an empty `{tracks:{}}` shell.

## 0.9.0-pre.0

### Minor Changes

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

- 7edd807: feat(core): studio edit-gating + write-back helpers (§6.2)

  Adds the core surface the studio needs to gate GUI edits and offer the
  hybrid write-back affordances (the `isEditableNodeId` predicate ships
  separately):

  - `editableDuration()` on `TimelineBuilder` + `isDurationEditable(doc)` — opt
    the (otherwise code-owned) timeline duration into studio editing, mirroring
    `.editable()` for tracks. Backed by an additive optional
    `Timeline.editableDuration` field; existing documents are unaffected.
  - `deleteSidecarTrack(doc, timelineId, target)` — remove one editor-owned
    track from the sidecar (§6.2 rule 7 "extract edits to code"), returning a new
    document and never mutating the input. Source is never touched.

  All additive; no existing document changes shape or renders differently.

- ea9657c: Studio foundation (DESIGN §6.3/§6.4), the core half of the StudioHost work: a new tree-shaken entry **`@glissade/core/studio-host`** exporting the `StudioHost` interface types (`MergedTimeline = Timeline & { orphans }`, `NodeDescriptor`, `SignalPath`, `StudioEvent`), the `isEditableNodeId` rule (only explicit, non-structural ids host editable tracks), and the **`TimelinePatch` engine**: `applyPatches(doc, patches, baseline?)` applies a fine-grained, by-stable-key-id edit transaction **atomically** (an invalid patch rejects the whole batch, doc untouched) and returns a snapshot-restore **inverse** for undo that round-trips byte-for-byte — even through `normalizeEditedKeys`' spring re-pin. Every patch variant is plain JSON (structured-clone-safe for a future postMessage host). Kept entirely out of the embed `.` bundle. (The studio's in-process host + App.tsx rewire onto this land next.)

### Patch Changes

- 7035c6b: Enforce the editable-host rule on track targets (§6.4/§6.5, the structural-id guards): a structural `~Type.ordinal` string target is now rejected at track creation (`UnresolvableTargetError` — structural ids are inspection-only, never track targets), and `.editable()` on a target lacking an explicit node id throws a clear `TimelineValidationError`. Both share the single `isEditableNodeId` predicate, now exported from core (alongside `targetNodeId`) and consumed by the builder, the scene, and the studio host. (The `~Type.ordinal` structural-id _generator_ was dropped per the 0.9 design lock; only the guards remain.)

## 0.8.1

## 0.8.1-pre.1

## 0.8.1-pre.0

## 0.8.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.
- 8820f3f: Reshape the editor sidecar to `sidecarVersion: 2` (§6.2) — the foundation for safe code↔editor round-tripping. Edits are now namespaced by timeline id (`'main'` for the linear timeline; v2 machines add more), tracks are keyed by canonical target and carry the code `baseHash` they branched from, keys get stable `k<N>` ids, and tracks whose target drifted are parked as `orphans` (with a reason) instead of failing to bind the whole overlay. New core API: `migrateSidecar` (lifts v1 documents forward on load), `setSidecarTrack` (the studio write path, assigns key ids + baseHash), `mergeSidecarDetailed` (returns the bindable timeline + drift list + orphans), `hashKeys`, `assignKeyIds`. `mergeSidecar` keeps returning a bindable `Timeline` and now accepts v1 or v2 input. The studio and vite-plugin read/write v2 (v1 files migrate automatically). The drift-badge / orphan-relink studio UI is a follow-up.
- bc15866: Registry & schema completeness (§2.2/§4.7/§B.6):
  - `ValueType` gains optional `serialize`/`deserialize` (default identity for JSON-native types), so a custom value type can round-trip through the Timeline document.
  - New registered `vec2-arc` value type: interpolates a vec2 along a circular arc (polar lerp of radius + shortest-path angle) instead of a straight chord.
  - Reserved schema slots accepted (but inert) in v1 so v2 needs no migration: `Key.from: 'live'` (the §4.7 synthesized-transition sentinel) and `Track.additive` (the §B.6 blending flag — v1 stays last-wins).

### Patch Changes

- dac15c9: Cue→chapters polish (downstream validation follow-ups on the 0.8 ad-break feature):

  - **Plain `cue()` now serializes.** `cue(at, name, data?)` stamps `data.kind: 'cue'` by default (a caller-supplied `kind` still wins), so a cue authored without an explicit kind now lands in `cues.json` and fires `player.onCue('cue', …)` instead of being silently dropped. The `data.kind` gate that excludes `.call()`/label markers stays intact.
  - **`--chapters vtt` shows the human title, not the kind.** The WebVTT cue text is now `data.title ?? name` (was the machine `kind`), and a `00:00` "Intro" chapter is auto-anchored when the earliest cue starts later — making the output a drop-in for a YouTube description chapter block (YouTube reads the cue text as the title and requires a 0:00 start). `cues.json` is unchanged (keeps `kind` for machines) and stays byte-deterministic.

- bc75e7c: `mergeSidecar` now re-resolves `derived:true` leading keys against the merged track (§2.6): a derived from-key duplicates the preceding key's held value, so an upstream edit (a sidecar that bumped the prior key) flows into it instead of leaving a stale value that pops at the segment start. Build-time derived keys are already correct; this only touches the ones an edit moved beneath.

## 0.8.0-pre.1

### Patch Changes

- dac15c9: Cue→chapters polish (downstream validation follow-ups on the 0.8 ad-break feature):

  - **Plain `cue()` now serializes.** `cue(at, name, data?)` stamps `data.kind: 'cue'` by default (a caller-supplied `kind` still wins), so a cue authored without an explicit kind now lands in `cues.json` and fires `player.onCue('cue', …)` instead of being silently dropped. The `data.kind` gate that excludes `.call()`/label markers stays intact.
  - **`--chapters vtt` shows the human title, not the kind.** The WebVTT cue text is now `data.title ?? name` (was the machine `kind`), and a `00:00` "Intro" chapter is auto-anchored when the earliest cue starts later — making the output a drop-in for a YouTube description chapter block (YouTube reads the cue text as the title and requires a 0:00 start). `cues.json` is unchanged (keeps `kind` for machines) and stays byte-deterministic.

## 0.8.0-pre.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.
- 8820f3f: Reshape the editor sidecar to `sidecarVersion: 2` (§6.2) — the foundation for safe code↔editor round-tripping. Edits are now namespaced by timeline id (`'main'` for the linear timeline; v2 machines add more), tracks are keyed by canonical target and carry the code `baseHash` they branched from, keys get stable `k<N>` ids, and tracks whose target drifted are parked as `orphans` (with a reason) instead of failing to bind the whole overlay. New core API: `migrateSidecar` (lifts v1 documents forward on load), `setSidecarTrack` (the studio write path, assigns key ids + baseHash), `mergeSidecarDetailed` (returns the bindable timeline + drift list + orphans), `hashKeys`, `assignKeyIds`. `mergeSidecar` keeps returning a bindable `Timeline` and now accepts v1 or v2 input. The studio and vite-plugin read/write v2 (v1 files migrate automatically). The drift-badge / orphan-relink studio UI is a follow-up.
- bc15866: Registry & schema completeness (§2.2/§4.7/§B.6):
  - `ValueType` gains optional `serialize`/`deserialize` (default identity for JSON-native types), so a custom value type can round-trip through the Timeline document.
  - New registered `vec2-arc` value type: interpolates a vec2 along a circular arc (polar lerp of radius + shortest-path angle) instead of a straight chord.
  - Reserved schema slots accepted (but inert) in v1 so v2 needs no migration: `Key.from: 'live'` (the §4.7 synthesized-transition sentinel) and `Track.additive` (the §B.6 blending flag — v1 stays last-wins).

### Patch Changes

- bc75e7c: `mergeSidecar` now re-resolves `derived:true` leading keys against the merged track (§2.6): a derived from-key duplicates the preceding key's held value, so an upstream edit (a sidecar that bumped the prior key) flows into it instead of leaving a stale value that pops at the segment start. Build-time derived keys are already correct; this only touches the ones an edit moved beneath.

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
