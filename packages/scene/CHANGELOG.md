# @glissade/scene

## 0.38.0-pre.0

### Minor Changes

- 474fc66: 0.38: `Gauge()` / `Meter()` — radial data-viz gauges (the Chart companion)

  A pure build-time fan-out (like `Chart()`/`Grid()`) on the tree-shakeable
  `@glissade/scene/gauge` subpath: a spec → N categorical stroked-arc **zones** +
  boundary **ticks** + a **needle** + separate **labels**, returning an ordinary
  `Group`. Byte-exact on Skia; every part independently animatable.

  - **Two needle modes**: authored angle keyframes (`tl.to(g.targets('needle',
'rotation'), …)`, 0 = straight up, + = clockwise), or **Meter** value→angle
    (`Meter({ value, domain })`; a `() => value` signal binds live).
  - **Independent channels**: zones, ticks, needle, and labels are each their own
    addressable child (`zone-{i}`, `tick-{i}`, `needle`, `label-{i}`, `glow`), and
    labels draw z-above the zone decoration — so a zone can dim or tint _without_
    crushing its label's contrast (zone opacity and label opacity are separate).
  - **Categorical zones** with per-zone color/label + configurable gap/thickness,
    so a labeled trust/quality/status dial is a spec, not hand-rolled arc geometry.
  - Surfaced in `describe().helpers` and re-exported on the browser bundle as
    `window.glissade.Gauge` / `Meter`. A `golden-gauge` showcase scene ships in the
    gallery + golden corpus.

  Base embed unchanged (38.83/39 — gauge is subpath-only, asserted by a metafile
  guard); determinism hash and all existing goldens unchanged.

### Patch Changes

- @glissade/core@0.38.0-pre.0

## 0.37.0

### Patch Changes

- @glissade/core@0.37.0

## 0.37.0-pre.1

### Patch Changes

- @glissade/core@0.37.0-pre.1

## 0.37.0-pre.0

### Patch Changes

- @glissade/core@0.37.0-pre.0

## 0.36.0

### Minor Changes

- 81c97ad: `defineComponent()` — reusable, typed, describe()-legible animated subscenes

  The missing composition unit: `defineComponent({ name, props, build })` turns a parameterized subscene into a first-class building block — the user-defined generalization of the built-in `Grid()`/`Chart()`/`splitText()` factories (all already pure "props → subtree" build-time functions).

  ```js
  const LowerThird = defineComponent({
    name: "LowerThird",
    props: {
      name: { type: "string", required: true },
      accent: { type: "color" },
    },
    build: ({ name, accent }, cid) =>
      new Group({
        id: cid(),
        children: [
          new Rect({ id: cid("bar"), width: 6, height: 40, fill: accent }),
          new Text({ id: cid("name"), text: name, box: { valign: "center" } }),
        ],
      }),
  });
  const lt = LowerThird({ id: "intro", name: "Ada", accent: "#4ea1ff" });
  tl.to(lt.childId("bar") + "/height", 40, { from: 0 });
  ```

  **Pure build-time** — `build` runs once at construction and emits ordinary nodes, so `evaluate()` stays a pure function of time and every existing golden is byte-identical. **ID-scoping is the safety story**: every instance carries a required `id` and every child is stamped through `cid(sub)` → `<id>/<sub>`, so instancing the same component N times (distinct ids) never collides track targets. The factory returns `{ node, id, childId(sub?), targets(child, prop) }`. Duplicate names and missing/empty ids fail loud.

  **Machine-legible**: `describe().components` lists every component defined so far with its typed prop surface (a new optional manifest section, generated from a live registry — can't drift), so an agent or the studio sees what a component accepts. On the tree-shakeable `@glissade/scene/component` subpath (base embed unchanged), re-exported as `window.glissade.defineComponent`. New golden + showcase scene (a `LowerThird` instanced 3× — composing clip + box-valign). Docs: `docs/components.md`.

### Patch Changes

- bf56c5e: `defineComponent`: fail loud on a malformed prop spec

  A no-build author (unguarded by TypeScript) passing a string shorthand like `props: { x: 'string' }` used to be silently accepted and lose the type in `describe().components` (it became `{}`). `defineComponent` now validates each prop spec is `{ type: string, required? }` and throws a `ComponentError` naming the bad prop otherwise. (edcc canary nit `NcGk24ytSkNx`.)

  - @glissade/core@0.36.0

## 0.36.0-pre.1

### Patch Changes

- `defineComponent`: fail loud on a malformed prop spec

  A no-build author (unguarded by TypeScript) passing a string shorthand like `props: { x: 'string' }` used to be silently accepted and lose the type in `describe().components` (it became `{}`). `defineComponent` now validates each prop spec is `{ type: string, required? }` and throws a `ComponentError` naming the bad prop otherwise. (edcc canary nit `NcGk24ytSkNx`.)

  - @glissade/core@0.36.0-pre.1

## 0.36.0-pre.0

### Minor Changes

- `defineComponent()` — reusable, typed, describe()-legible animated subscenes

  The missing composition unit: `defineComponent({ name, props, build })` turns a parameterized subscene into a first-class building block — the user-defined generalization of the built-in `Grid()`/`Chart()`/`splitText()` factories (all already pure "props → subtree" build-time functions).

  ```js
  const LowerThird = defineComponent({
    name: "LowerThird",
    props: {
      name: { type: "string", required: true },
      accent: { type: "color" },
    },
    build: ({ name, accent }, cid) =>
      new Group({
        id: cid(),
        children: [
          new Rect({ id: cid("bar"), width: 6, height: 40, fill: accent }),
          new Text({ id: cid("name"), text: name, box: { valign: "center" } }),
        ],
      }),
  });
  const lt = LowerThird({ id: "intro", name: "Ada", accent: "#4ea1ff" });
  tl.to(lt.childId("bar") + "/height", 40, { from: 0 });
  ```

  **Pure build-time** — `build` runs once at construction and emits ordinary nodes, so `evaluate()` stays a pure function of time and every existing golden is byte-identical. **ID-scoping is the safety story**: every instance carries a required `id` and every child is stamped through `cid(sub)` → `<id>/<sub>`, so instancing the same component N times (distinct ids) never collides track targets. The factory returns `{ node, id, childId(sub?), targets(child, prop) }`. Duplicate names and missing/empty ids fail loud.

  **Machine-legible**: `describe().components` lists every component defined so far with its typed prop surface (a new optional manifest section, generated from a live registry — can't drift), so an agent or the studio sees what a component accepts. On the tree-shakeable `@glissade/scene/component` subpath (base embed unchanged), re-exported as `window.glissade.defineComponent`. New golden + showcase scene (a `LowerThird` instanced 3× — composing clip + box-valign). Docs: `docs/components.md`.

### Patch Changes

- @glissade/core@0.36.0-pre.0

## 0.35.0

### Minor Changes

- 9bd7523: Authoring-loop v1: word-level narration anchors + Text `box`-valign + `fitText` shrink-to-fit

  The "text/timing geometry the author shouldn't hand-roll" trio (from the OYP series QA sweep):

  - **`narration(timing).word(segId, word, nth?)`** (+ `.wordEnd`) — land a visual on the spoken WORD, not the whole segment. Reads the per-word timestamps already in the timing manifest (`words[]`); matches case- and punctuation-insensitively (`'busy'` finds `'busy.'`), `nth` disambiguates a repeat. Fails loud if the segment has no word timings or the word isn't found (no silent drift to segment start). Pure lookup — zero determinism impact.

  - **`Text({ box: { valign: 'center' | 'top' | 'bottom', h? } })`** — optically center a label in a box using its REAL ink metrics (ascent + descent, single- and multi-line), replacing the `fontSize * 0.35` fudge every boxed-text component hand-rolls. `'top'`/`'bottom'` frame the ink in an `h`-tall box centered on the position. **Opt-in and default-preserving** — omitting `box` is byte-identical, so every existing Text golden is unchanged; highlights/reveals follow the shifted text. New golden + showcase scene (`boxtext`: baseline vs ink-centered pills).

  - **`fitText(text, { maxW, maxLines?, maxH?, minPx? })`** / **`fitTextGroup([texts], { maxW })`** / **`fitTextSize(...)`** (on `@glissade/scene/type`) — shrink-to-fit + wrap-to-max-lines via a build-time binary search over the measurer (like `Grid`/`splitText`), including a real ink-width check so an unbreakable word can't overflow silently. `fitTextGroup` fits several texts to ONE shared size (kills the ragged-headers bug). Fails loud on impossible fit (or `onOverflow: 'clamp'`); pass `{ measurer }` for exact results. Re-exported onto the browser IIFE. Docs: `docs/text-fitting.md`.

### Patch Changes

- c60b039: `describe()`: list `fitTextSize` alongside `fitText`/`fitTextGroup`

  `fitTextSize` (the size-returning primitive `fitText`/`fitTextGroup` build on) resolved and worked but was missing from `describe().helpers`, so a no-build author reading the manifest couldn't discover it. Added — the three fit helpers now all appear. (edcc canary nit `slkgussGtv1A`.)

  - @glissade/core@0.35.0

## 0.35.0-pre.1

### Patch Changes

- `describe()`: list `fitTextSize` alongside `fitText`/`fitTextGroup`

  `fitTextSize` (the size-returning primitive `fitText`/`fitTextGroup` build on) resolved and worked but was missing from `describe().helpers`, so a no-build author reading the manifest couldn't discover it. Added — the three fit helpers now all appear. (edcc canary nit `slkgussGtv1A`.)

  - @glissade/core@0.35.0-pre.1

## 0.35.0-pre.0

### Minor Changes

- Authoring-loop v1: word-level narration anchors + Text `box`-valign + `fitText` shrink-to-fit

  The "text/timing geometry the author shouldn't hand-roll" trio (from the OYP series QA sweep):

  - **`narration(timing).word(segId, word, nth?)`** (+ `.wordEnd`) — land a visual on the spoken WORD, not the whole segment. Reads the per-word timestamps already in the timing manifest (`words[]`); matches case- and punctuation-insensitively (`'busy'` finds `'busy.'`), `nth` disambiguates a repeat. Fails loud if the segment has no word timings or the word isn't found (no silent drift to segment start). Pure lookup — zero determinism impact.

  - **`Text({ box: { valign: 'center' | 'top' | 'bottom', h? } })`** — optically center a label in a box using its REAL ink metrics (ascent + descent, single- and multi-line), replacing the `fontSize * 0.35` fudge every boxed-text component hand-rolls. `'top'`/`'bottom'` frame the ink in an `h`-tall box centered on the position. **Opt-in and default-preserving** — omitting `box` is byte-identical, so every existing Text golden is unchanged; highlights/reveals follow the shifted text. New golden + showcase scene (`boxtext`: baseline vs ink-centered pills).

  - **`fitText(text, { maxW, maxLines?, maxH?, minPx? })`** / **`fitTextGroup([texts], { maxW })`** / **`fitTextSize(...)`** (on `@glissade/scene/type`) — shrink-to-fit + wrap-to-max-lines via a build-time binary search over the measurer (like `Grid`/`splitText`), including a real ink-width check so an unbreakable word can't overflow silently. `fitTextGroup` fits several texts to ONE shared size (kills the ragged-headers bug). Fails loud on impossible fit (or `onOverflow: 'clamp'`); pass `{ measurer }` for exact results. Re-exported onto the browser IIFE. Docs: `docs/text-fitting.md`.

### Patch Changes

- @glissade/core@0.35.0-pre.0

## 0.34.0

### Minor Changes

- 04a008c: The compositing pair: `clip` on Group + `trackMatte()` — content clipped to a region, content masked by another layer

  **`clip` on `Group`** (the OYP audit's verified gap): children paint only inside a local-space region — a `{ w, h, r?, x?, y? }` rounded rect or an explicit `PathSeg[]` outline. The region rides the _existing_ `clip` DrawCommand inside the group's own layer (save/clip/children/restore), so it lands inside the cacheKey'd draw slice — a changed region can never serve a stale cached raster — and nested clips intersect. Construction-only; render-only in v1 (hit-testing unaffected); `Layout` doesn't accept it (wrap a Layout in a clipped Group).

  ```js
  new Group({ id: "card", clip: { w: 280, h: 170, r: 18 }, children: [feed] });
  ```

  **`trackMatte(content, matte, { mode? })`** — the motion-craft suite's fourth and final piece: content renders into an isolated layer, then the matte composites over it with `destination-in` — pixels survive only where the matte is opaque. Both subtrees are ordinary animatable nodes (a scaling circle irises a photo, a sliding gradient bar luma-wipes text in). `mode: 'alpha'` (default) is native and byte-exact on both canvas rasterizers; `mode: 'luma'` (white = keep, black = erase) runs one shared, deterministic straight-alpha CPU kernel (Rec.709 — the mesh-kernel discipline). The `destination-in` is isolated to the node's own layer — it can never erase siblings or the backdrop. Matte opacity scales the mask; matte `filters` feather it.

  **IR**: one optional `matte?: 'alpha' | 'luma'` field on `pushGroup` (the `shader?`/`cacheKey?` extension precedent) — the closed `BlendMode` union is untouched. Skia renders byte-exact (new `compositing` golden + showcase scene: a clipped card, an alpha iris, a luma wipe; all existing goldens byte-identical); browser↔Skia is perceptual at anti-aliased matte edges (SSIM corpus extended); backend-dom expresses clip natively via SVG `clipPath` and degrades matte honestly (`data-approx`, matte layer hidden). Toolchain fix folded in: @napi-rs applies the current transform to `putImageData` (against spec) — the luma kernel now resets/restores the transform around its write-back. Docs: `docs/compositing.md`; DESIGN.md carries the full decision record.

### Patch Changes

- 8d0806a: Compositing polish: `trackMatte` fails loud on an invalid mode; `describe()` reports clip's real shape

  Two canary nits from 0.34.0-pre.0 validation:

  - **`trackMatte({ mode })`** now throws at construction on any mode other than `'alpha'` / `'luma'` (_"trackMatte mode must be 'alpha' or 'luma', got …"_) — the fail-loud discipline the rest of the compositing/Chart/scale API follows. Previously a typo'd `'lumaa'` rode into the IR and the backend silently rendered it as `alpha` (wrong output, no error), which both the render and no-build seats caught.
  - **`describe().nodes.Group.props.clip.type`** now reports the actual shape `{ w, h, r?, x?, y? } | PathSeg[]` instead of the opaque `ClipRegion`, matching how `anchor` reports its enumerated shape rather than `AnchorSpec` — so an author reading the manifest can't mistake the type name for a constructor. `ClipRegion` remains a TS-only export for typed config.
  - @glissade/core@0.34.0

## 0.34.0-pre.1

### Patch Changes

- Compositing polish: `trackMatte` fails loud on an invalid mode; `describe()` reports clip's real shape

  Two canary nits from 0.34.0-pre.0 validation:

  - **`trackMatte({ mode })`** now throws at construction on any mode other than `'alpha'` / `'luma'` (_"trackMatte mode must be 'alpha' or 'luma', got …"_) — the fail-loud discipline the rest of the compositing/Chart/scale API follows. Previously a typo'd `'lumaa'` rode into the IR and the backend silently rendered it as `alpha` (wrong output, no error), which both the render and no-build seats caught.
  - **`describe().nodes.Group.props.clip.type`** now reports the actual shape `{ w, h, r?, x?, y? } | PathSeg[]` instead of the opaque `ClipRegion`, matching how `anchor` reports its enumerated shape rather than `AnchorSpec` — so an author reading the manifest can't mistake the type name for a constructor. `ClipRegion` remains a TS-only export for typed config.
  - @glissade/core@0.34.0-pre.1

## 0.34.0-pre.0

### Minor Changes

- The compositing pair: `clip` on Group + `trackMatte()` — content clipped to a region, content masked by another layer

  **`clip` on `Group`** (the OYP audit's verified gap): children paint only inside a local-space region — a `{ w, h, r?, x?, y? }` rounded rect or an explicit `PathSeg[]` outline. The region rides the _existing_ `clip` DrawCommand inside the group's own layer (save/clip/children/restore), so it lands inside the cacheKey'd draw slice — a changed region can never serve a stale cached raster — and nested clips intersect. Construction-only; render-only in v1 (hit-testing unaffected); `Layout` doesn't accept it (wrap a Layout in a clipped Group).

  ```js
  new Group({ id: "card", clip: { w: 280, h: 170, r: 18 }, children: [feed] });
  ```

  **`trackMatte(content, matte, { mode? })`** — the motion-craft suite's fourth and final piece: content renders into an isolated layer, then the matte composites over it with `destination-in` — pixels survive only where the matte is opaque. Both subtrees are ordinary animatable nodes (a scaling circle irises a photo, a sliding gradient bar luma-wipes text in). `mode: 'alpha'` (default) is native and byte-exact on both canvas rasterizers; `mode: 'luma'` (white = keep, black = erase) runs one shared, deterministic straight-alpha CPU kernel (Rec.709 — the mesh-kernel discipline). The `destination-in` is isolated to the node's own layer — it can never erase siblings or the backdrop. Matte opacity scales the mask; matte `filters` feather it.

  **IR**: one optional `matte?: 'alpha' | 'luma'` field on `pushGroup` (the `shader?`/`cacheKey?` extension precedent) — the closed `BlendMode` union is untouched. Skia renders byte-exact (new `compositing` golden + showcase scene: a clipped card, an alpha iris, a luma wipe; all existing goldens byte-identical); browser↔Skia is perceptual at anti-aliased matte edges (SSIM corpus extended); backend-dom expresses clip natively via SVG `clipPath` and degrades matte honestly (`data-approx`, matte layer hidden). Toolchain fix folded in: @napi-rs applies the current transform to `putImageData` (against spec) — the luma kernel now resets/restores the transform around its write-back. Docs: `docs/compositing.md`; DESIGN.md carries the full decision record.

### Patch Changes

- @glissade/core@0.34.0-pre.0

## 0.33.0

### Patch Changes

- 157c3f6: Chart: colour-by-value ramps just work + fail loud on negative data (audit fixes)

  Two 0.32 sharp edges found by the full-app audit: (1) a `colorRamp` built with the DEFAULT `[0, 1]` domain passed as `Chart({ fill })` clamped every real-world value to the last stop — a uniform chart for anyone following the header example. Chart now re-domains a default-domain ramp over `[0, max(y)]` when the data ranges past 1 (explicit domains are respected verbatim; genuinely-normalized data keeps `[0,1]`). (2) All-negative data silently produced bars ~50× the chart height (the `[0,1]` fallback domain mapped `-50` to `-5000px`); negative values now throw a `ChartError` explaining the zero-baseline bar MVP and the explicit-`yScale` escape hatch.

  - @glissade/core@0.33.0

## 0.33.0-pre.0

### Patch Changes

- 157c3f6: Chart: colour-by-value ramps just work + fail loud on negative data (audit fixes)

  Two 0.32 sharp edges found by the full-app audit: (1) a `colorRamp` built with the DEFAULT `[0, 1]` domain passed as `Chart({ fill })` clamped every real-world value to the last stop — a uniform chart for anyone following the header example. Chart now re-domains a default-domain ramp over `[0, max(y)]` when the data ranges past 1 (explicit domains are respected verbatim; genuinely-normalized data keeps `[0,1]`). (2) All-negative data silently produced bars ~50× the chart height (the `[0,1]` fallback domain mapped `-50` to `-5000px`); negative values now throw a `ChartError` explaining the zero-baseline bar MVP and the explicit-`yScale` escape hatch.

  - @glissade/core@0.33.0-pre.0

## 0.32.0

### Minor Changes

- e5f1d16: `Chart()` + scales — the data-motion stack (bind a table → an animatable bar chart)

  `Chart()` binds a table to a first-class, animatable bar chart. Like `Grid()` and `splitText()`, it is a **pure build-time fan-out** — it resolves your rows against serializable scales into positioned, sized child `Rect` bars _at construction_ and returns an ordinary `Group`. Nothing runs at play time, so `evaluate()` stays a pure function of time and the render is byte-deterministic (a new golden + showcase scene added; all existing goldens byte-identical).

  ```js
  import { Chart, colorRamp } from "@glissade/scene/chart";
  const chart = Chart({
    id: "sales",
    width: 560,
    height: 240,
    xKey: "month",
    yKey: "value",
    data: [
      { month: "Jan", value: 120 },
      { month: "Feb", value: 180 },
      { month: "Mar", value: 90 },
    ],
    fill: colorRamp(["#39e0ff", "#ff5ca8"]), // colour bars by value
  });
  // scene children: [chart.node]
  tl.stagger(
    chart.targets("height"),
    { from: 0, to: (i) => chart.bars[i].height() },
    { each: 0.08 }
  ); // bars rise in
  ```

  Each bar is anchored at its **base** (`anchor: 'bottom'`) and pinned to the axis, so animating its `height` grows the bar _upward_ from the axis — a bar-chart reveal or race is just a `height` track per bar (or a `fill` track for a colour sweep). `chart.targets(prop)` yields the ready-to-bind target ids in row order (`${id}/bars/${i}/${prop}`), the same shape as `splitText().targets(...)`.

  Ships with serializable **scales** on the same subpath: `linearScale` / `logScale` (value axis), `bandScale` (the categorical x axis Chart uses internally), and `colorRamp` (value → `#rrggbb`). Each is a plain `{ id, domain, range }` object and is listed in `describe()` so an AI consumer binds it correctly. Chart fails loud on empty data, a non-finite value, a missing key, or non-positive dimensions.

  On the tree-shakeable `@glissade/scene/chart` subpath (the **SACRED base embed is unchanged** — a metafile guard asserts the base scene excludes chart); re-exported onto the `@glissade/browser` IIFE so `window.glissade.Chart` + the scale factories survive for no-build data-viz. This MVP is vertical bar charts; line/scatter/axis-labels/time-series are a later minor (the fan-out shape generalizes). Docs: `docs/charts.md`.

### Patch Changes

- 4eb1a91: `Chart.targets()`: fail loud on a missing prop name

  `chart.targets()` with no (or an empty) argument used to emit `${id}/bars/${i}/undefined` target strings that surfaced much later as a confusing `UnboundTargetError`. It now throws `ChartError("Chart.targets(prop) needs a prop name, e.g. targets('height') or targets('fill')")` — matching Chart's otherwise-exemplary construction-time validation. Sibling to the track-layer non-numeric-keyframe guard (both close "a bad animation target should fail loud at the seam, not downstream"). Card `LPddSlVYosYg`.

- Updated dependencies [4eb1a91]
  - @glissade/core@0.32.0

## 0.32.0-pre.1

### Patch Changes

- `Chart.targets()`: fail loud on a missing prop name

  `chart.targets()` with no (or an empty) argument used to emit `${id}/bars/${i}/undefined` target strings that surfaced much later as a confusing `UnboundTargetError`. It now throws `ChartError("Chart.targets(prop) needs a prop name, e.g. targets('height') or targets('fill')")` — matching Chart's otherwise-exemplary construction-time validation. Sibling to the track-layer non-numeric-keyframe guard (both close "a bad animation target should fail loud at the seam, not downstream"). Card `LPddSlVYosYg`.

- Updated dependencies
  - @glissade/core@0.32.0-pre.1

## 0.32.0-pre.0

### Minor Changes

- `Chart()` + scales — the data-motion stack (bind a table → an animatable bar chart)

  `Chart()` binds a table to a first-class, animatable bar chart. Like `Grid()` and `splitText()`, it is a **pure build-time fan-out** — it resolves your rows against serializable scales into positioned, sized child `Rect` bars _at construction_ and returns an ordinary `Group`. Nothing runs at play time, so `evaluate()` stays a pure function of time and the render is byte-deterministic (a new golden + showcase scene added; all existing goldens byte-identical).

  ```js
  import { Chart, colorRamp } from "@glissade/scene/chart";
  const chart = Chart({
    id: "sales",
    width: 560,
    height: 240,
    xKey: "month",
    yKey: "value",
    data: [
      { month: "Jan", value: 120 },
      { month: "Feb", value: 180 },
      { month: "Mar", value: 90 },
    ],
    fill: colorRamp(["#39e0ff", "#ff5ca8"]), // colour bars by value
  });
  // scene children: [chart.node]
  tl.stagger(
    chart.targets("height"),
    { from: 0, to: (i) => chart.bars[i].height() },
    { each: 0.08 }
  ); // bars rise in
  ```

  Each bar is anchored at its **base** (`anchor: 'bottom'`) and pinned to the axis, so animating its `height` grows the bar _upward_ from the axis — a bar-chart reveal or race is just a `height` track per bar (or a `fill` track for a colour sweep). `chart.targets(prop)` yields the ready-to-bind target ids in row order (`${id}/bars/${i}/${prop}`), the same shape as `splitText().targets(...)`.

  Ships with serializable **scales** on the same subpath: `linearScale` / `logScale` (value axis), `bandScale` (the categorical x axis Chart uses internally), and `colorRamp` (value → `#rrggbb`). Each is a plain `{ id, domain, range }` object and is listed in `describe()` so an AI consumer binds it correctly. Chart fails loud on empty data, a non-finite value, a missing key, or non-positive dimensions.

  On the tree-shakeable `@glissade/scene/chart` subpath (the **SACRED base embed is unchanged** — a metafile guard asserts the base scene excludes chart); re-exported onto the `@glissade/browser` IIFE so `window.glissade.Chart` + the scale factories survive for no-build data-viz. This MVP is vertical bar charts; line/scatter/axis-labels/time-series are a later minor (the fan-out shape generalizes). Docs: `docs/charts.md`.

### Patch Changes

- @glissade/core@0.32.0-pre.0

## 0.31.0

### Patch Changes

- @glissade/core@0.31.0

## 0.31.0-pre.1

### Patch Changes

- @glissade/core@0.31.0-pre.1

## 0.31.0-pre.0

### Patch Changes

- @glissade/core@0.31.0-pre.0

## 0.30.0

### Minor Changes

- e651ed6: Motion-craft: `MotionBlur` / `motionBlur()` — real sampled motion blur

  Wrap a moving element and it renders at N sub-frame times across a shutter interval (centered on the frame) and AVERAGES them — so it smears exactly the way an analog shutter captures it, and it tracks EVERY animated prop (position, rotation, scale, path progress, colour), not a faked directional blur.

  ```js
  import { motionBlur } from "@glissade/scene";
  motionBlur(fastDot, { shutter: 0.06, samples: 16 }); // smears; its background stays crisp
  ```

  Like `Echo`, it re-addresses the scene playhead per sample (wrapped in `batch()`, restored after) — so `evaluate()` stays a pure function of the current time. The averaging is a **running mean** done with plain compositing (no backend change): the k-th sample is painted at opacity `1/(k+1)`, which over source-over is the exact equal-weight average of all N samples. Deterministic and **byte-exact on Skia** (a new golden + showcase scene added; all existing goldens byte-identical); browser↔Skia is perceptual-tier for blur, noted in `describe()`. `samples: 1` / `shutter: 0` is a plain group. Ships on the base scene index alongside `Echo`/`ShaderEffect` (off the closed 9-node taxonomy).

### Patch Changes

- @glissade/core@0.30.0

## 0.30.0-pre.0

### Minor Changes

- e651ed6: Motion-craft: `MotionBlur` / `motionBlur()` — real sampled motion blur

  Wrap a moving element and it renders at N sub-frame times across a shutter interval (centered on the frame) and AVERAGES them — so it smears exactly the way an analog shutter captures it, and it tracks EVERY animated prop (position, rotation, scale, path progress, colour), not a faked directional blur.

  ```js
  import { motionBlur } from "@glissade/scene";
  motionBlur(fastDot, { shutter: 0.06, samples: 16 }); // smears; its background stays crisp
  ```

  Like `Echo`, it re-addresses the scene playhead per sample (wrapped in `batch()`, restored after) — so `evaluate()` stays a pure function of the current time. The averaging is a **running mean** done with plain compositing (no backend change): the k-th sample is painted at opacity `1/(k+1)`, which over source-over is the exact equal-weight average of all N samples. Deterministic and **byte-exact on Skia** (a new golden + showcase scene added; all existing goldens byte-identical); browser↔Skia is perceptual-tier for blur, noted in `describe()`. `samples: 1` / `shutter: 0` is a plain group. Ships on the base scene index alongside `Echo`/`ShaderEffect` (off the closed 9-node taxonomy).

### Patch Changes

- @glissade/core@0.30.0-pre.0

## 0.29.0

### Patch Changes

- @glissade/core@0.29.0

## 0.29.0-pre.0

### Patch Changes

- @glissade/core@0.29.0-pre.0

## 0.28.0

### Patch Changes

- @glissade/core@0.28.0

## 0.28.0-pre.1

### Patch Changes

- @glissade/core@0.28.0-pre.1

## 0.28.0-pre.0

### Patch Changes

- @glissade/core@0.28.0-pre.0

## 0.27.1

### Patch Changes

- 13fcd2e: `gs render --cache`: disk-persistent **layer-cache tier** — a static subtree survives a re-narration

  The whole-frame cache (0.27) is defeated by a re-narration: new TTS shifts beats, so captions/timing frames change and every frame key flips. But an expensive _static_ subtree — a blurred mesh backdrop — is byte-identical across all of it. Its in-memory raster cache (§3.5) only spanned one render; now `--cache` also persists a `cache:true` group's device-space raster to disk (`.gscache/layers/`), so it rasterizes ONCE and re-blits on later renders even when the whole-frame cache misses.

  - **`@glissade/scene`**: the compositor (`raster2d.ts`) gains an injected `LayerStore` seam (`get`/`put` of a device-space RGBA + bounds). On an in-memory miss it consults the store and promotes the hit to RAM; on a store it persists the layer once. Scene stays Node-dep-free — the store is injected. `Ctx2DLike` gains `getImageData`.
  - **`@glissade/backend-skia`**: `new SkiaBackend(w, h, { layerStore })` / `backend.setLayerStore(...)`.
  - **`@glissade/cli`**: an fs-backed `LayerCache` (deflated RGBA + bounds, atomic, content-addressed) whose key is salted with the toolchain version ⊕ backend caps ⊕ frame size; wired into `render.ts` under `--cache`.

  A restored layer composites **byte-identically** to a fresh raster (RGBA round-trips through `putImageData`) — proven end-to-end. The tier is purely additive and opt-in: with no `--cache` (or `RASTER_CACHE=0`) the output is unchanged, and all 325 goldens stay byte-identical.

  - @glissade/core@0.27.1

## 0.27.1-pre.0

### Patch Changes

- 13fcd2e: `gs render --cache`: disk-persistent **layer-cache tier** — a static subtree survives a re-narration

  The whole-frame cache (0.27) is defeated by a re-narration: new TTS shifts beats, so captions/timing frames change and every frame key flips. But an expensive _static_ subtree — a blurred mesh backdrop — is byte-identical across all of it. Its in-memory raster cache (§3.5) only spanned one render; now `--cache` also persists a `cache:true` group's device-space raster to disk (`.gscache/layers/`), so it rasterizes ONCE and re-blits on later renders even when the whole-frame cache misses.

  - **`@glissade/scene`**: the compositor (`raster2d.ts`) gains an injected `LayerStore` seam (`get`/`put` of a device-space RGBA + bounds). On an in-memory miss it consults the store and promotes the hit to RAM; on a store it persists the layer once. Scene stays Node-dep-free — the store is injected. `Ctx2DLike` gains `getImageData`.
  - **`@glissade/backend-skia`**: `new SkiaBackend(w, h, { layerStore })` / `backend.setLayerStore(...)`.
  - **`@glissade/cli`**: an fs-backed `LayerCache` (deflated RGBA + bounds, atomic, content-addressed) whose key is salted with the toolchain version ⊕ backend caps ⊕ frame size; wired into `render.ts` under `--cache`.

  A restored layer composites **byte-identically** to a fresh raster (RGBA round-trips through `putImageData`) — proven end-to-end. The tier is purely additive and opt-in: with no `--cache` (or `RASTER_CACHE=0`) the output is unchanged, and all 325 goldens stay byte-identical.

  - @glissade/core@0.27.1-pre.0

## 0.27.0

### Patch Changes

- @glissade/core@0.27.0

## 0.27.0-pre.0

### Patch Changes

- @glissade/core@0.27.0-pre.0

## 0.26.0

### Minor Changes

- b3218c9: Motion-craft quick-win: `Echo` / `echo()` — motion trails & onion-skin

  A wrapper node that renders its subtree at the playhead **plus K−1 earlier offsets** (`t − i·spacing`), each trailing copy fading by `decay` — comet trails, strobe echoes, editor onion-skinning. The leading copy is the live frame; the ghosts are the subtree "as it was" a few slices ago (their positions come from whatever drives them — tracks, `followPath`, computed signals all re-derive at the offset time).

  It is the pure render form of "re-evaluate at t + k·spacing": within one frame Echo re-addresses the scene playhead to each offset, emits the children, then **restores** it before the walk continues — the whole dance wrapped in `batch()` so a player's repaint subscriber coalesces to a single idempotent notification at the restored time (never mid-emit reentrancy). Headless the playhead has no subscribers, so it's a plain pure multi-sample: `evaluate()` stays a pure function of time, the DisplayList is byte-stable, and the cache-cold determinism audit passes.

  ```js
  import { echo } from "@glissade/scene";
  echo(mover, { count: 6, spacing: 0.05, decay: 0.7 }); // mover leaves a fading trail
  ```

  `EvalContext` gains an optional `playhead` (the one channel a node may re-address within a frame); it's supplied by the real `evaluate()` / `emitWithIds()` / cache-audit, so existing nodes are unaffected. Ships on the base scene index alongside `ShaderEffect`; a golden + showcase scene added.

- b3218c9: Motion-craft quick-win: `orientToPath` + `lookAt` orientation drivers (`@glissade/scene/motion`)

  Two rotation-only companion nodes — the pure-model siblings of `followPath`. Each owns only its target's `rotation` via pull-based binding, so it composes with whatever drives position (keyframes, layout, a separate `followPath`). Tree-shakeable off the base embed; also on the browser IIFE (`window.glissade.orientToPath` / `.lookAt`).

  - **`orientToPath(target, path, { progress?, offset? })`** — banks a node to the path tangent at `progress` (the rotation half of `followPath`'s `orient`, usable when position comes from elsewhere).
  - **`lookAt(target, at, { offset? })`** — aims `target`'s local +x axis at another node's world origin (a turret tracking a mover). Reads the aimed node's world position through its parent matrix, and computes its own origin the same way, so there is no `rotation → worldMatrix → rotation` cycle.

  Both are pure functions of the signal graph — determinism and the golden corpus are unchanged (all existing goldens byte-identical; a new `orient` golden + showcase scene added).

  ```js
  import { orientToPath, lookAt } from "@glissade/scene/motion";
  orientToPath(rocket, track, { id: "bank", progress: 0.5 }); // drive 'bank/progress'
  lookAt(turret, rocket); // turret always faces the rocket
  ```

### Patch Changes

- bfadc4a: 0.26 discoverability (canary follow-up): runnable examples for the motion-craft helpers + `echo` in `describe().helpers`

  Both no-build and video canary seats flagged that the new helpers were correct but under-discoverable via `describe()`:

  - Added doctest-verified **corpus examples** (`@glissade/scene/examples`) for `orientToPath`, `lookAt`, `retime`, and `echo`, so `describe({ examples: true })` surfaces a copy-pasteable, verbatim-runnable snippet for each (the cold-agent onboarding path).
  - Added **`echo` to `describe().helpers`** — it shipped as a scene index export without a helper entry, so a cold agent couldn't discover it via `describe()` (now listed like `Grid`/`orientToPath`).

  Additive only — no render/determinism change; all goldens byte-identical.

- Updated dependencies [b3218c9]
  - @glissade/core@0.26.0

## 0.26.0-pre.1

### Patch Changes

- bfadc4a: 0.26 discoverability (canary follow-up): runnable examples for the motion-craft helpers + `echo` in `describe().helpers`

  Both no-build and video canary seats flagged that the new helpers were correct but under-discoverable via `describe()`:

  - Added doctest-verified **corpus examples** (`@glissade/scene/examples`) for `orientToPath`, `lookAt`, `retime`, and `echo`, so `describe({ examples: true })` surfaces a copy-pasteable, verbatim-runnable snippet for each (the cold-agent onboarding path).
  - Added **`echo` to `describe().helpers`** — it shipped as a scene index export without a helper entry, so a cold agent couldn't discover it via `describe()` (now listed like `Grid`/`orientToPath`).

  Additive only — no render/determinism change; all goldens byte-identical.

  - @glissade/core@0.26.0-pre.1

## 0.26.0-pre.0

### Minor Changes

- b3218c9: Motion-craft quick-win: `Echo` / `echo()` — motion trails & onion-skin

  A wrapper node that renders its subtree at the playhead **plus K−1 earlier offsets** (`t − i·spacing`), each trailing copy fading by `decay` — comet trails, strobe echoes, editor onion-skinning. The leading copy is the live frame; the ghosts are the subtree "as it was" a few slices ago (their positions come from whatever drives them — tracks, `followPath`, computed signals all re-derive at the offset time).

  It is the pure render form of "re-evaluate at t + k·spacing": within one frame Echo re-addresses the scene playhead to each offset, emits the children, then **restores** it before the walk continues — the whole dance wrapped in `batch()` so a player's repaint subscriber coalesces to a single idempotent notification at the restored time (never mid-emit reentrancy). Headless the playhead has no subscribers, so it's a plain pure multi-sample: `evaluate()` stays a pure function of time, the DisplayList is byte-stable, and the cache-cold determinism audit passes.

  ```js
  import { echo } from "@glissade/scene";
  echo(mover, { count: 6, spacing: 0.05, decay: 0.7 }); // mover leaves a fading trail
  ```

  `EvalContext` gains an optional `playhead` (the one channel a node may re-address within a frame); it's supplied by the real `evaluate()` / `emitWithIds()` / cache-audit, so existing nodes are unaffected. Ships on the base scene index alongside `ShaderEffect`; a golden + showcase scene added.

- b3218c9: Motion-craft quick-win: `orientToPath` + `lookAt` orientation drivers (`@glissade/scene/motion`)

  Two rotation-only companion nodes — the pure-model siblings of `followPath`. Each owns only its target's `rotation` via pull-based binding, so it composes with whatever drives position (keyframes, layout, a separate `followPath`). Tree-shakeable off the base embed; also on the browser IIFE (`window.glissade.orientToPath` / `.lookAt`).

  - **`orientToPath(target, path, { progress?, offset? })`** — banks a node to the path tangent at `progress` (the rotation half of `followPath`'s `orient`, usable when position comes from elsewhere).
  - **`lookAt(target, at, { offset? })`** — aims `target`'s local +x axis at another node's world origin (a turret tracking a mover). Reads the aimed node's world position through its parent matrix, and computes its own origin the same way, so there is no `rotation → worldMatrix → rotation` cycle.

  Both are pure functions of the signal graph — determinism and the golden corpus are unchanged (all existing goldens byte-identical; a new `orient` golden + showcase scene added).

  ```js
  import { orientToPath, lookAt } from "@glissade/scene/motion";
  orientToPath(rocket, track, { id: "bank", progress: 0.5 }); // drive 'bank/progress'
  lookAt(turret, rocket); // turret always faces the rocket
  ```

### Patch Changes

- Updated dependencies [b3218c9]
  - @glissade/core@0.26.0-pre.0

## 0.25.0

### Minor Changes

- d780cdd: Grid: `stretch` — size children to their cells

  `Grid` was position-only. Pass `stretch: true` to also SIZE each child to its cell: the resolved column-track width becomes the child's `width`, and `cellHeight` its `height`.

  ```js
  Grid({
    columns: 3,
    width: 360,
    cellHeight: 80,
    stretch: true,
    children: [rectA, rectB, rectC],
  }); // each 120×80
  ```

  A plain `signal.set`, so a later explicit bind still wins; only children exposing a settable `width`/`height` signal (Rect/Image) are sized (Circle/Text/Path keep their own size and are just positioned). Default `false` — position-only, byte-identical to before.

- d907a72: examples: no-build (IIFE) form of the example corpus

  The runnable example snippets are npm `import`-form, which don't run verbatim in a no-build `<script src>` page. New `toIifeForm(code)` (exported from `@glissade/scene/examples`) rewrites `import { X } from '...'` → `const { X } = window.glissade`, and `examplesByKey({ iife: true })` returns the transformed corpus. The `@glissade/browser` IIFE now registers the no-build form, so `window.glissade.describe({ examples: true })` gives a no-build agent snippets it can copy-paste and run as-is. npm consumers still get the `import`-form (the doctest + the generated reference are unchanged).

### Patch Changes

- d780cdd: mesh: per-point sub-path targets now fail loud (the docstring over-promised them)

  Animating a mesh point via `track('node/fill.points.0.pos', …)` never resolved — `fill` is a single signal, not a nested tree — but the `MeshPoint` docstring implied per-point sub-path tracks exist. Now: (1) the docstring documents the real mechanism (drive the WHOLE `fill` as a `paint` track; two same-point-count meshes interpolate pairwise), and (2) a `fill.points.<i>.*` target throws a SPECIFIC actionable error pointing at that whole-fill paint track, instead of the generic "no property signal resolves to it".

- Updated dependencies [d780cdd]
  - @glissade/core@0.25.0

## 0.25.0-pre.1

### Minor Changes

- d780cdd: Grid: `stretch` — size children to their cells

  `Grid` was position-only. Pass `stretch: true` to also SIZE each child to its cell: the resolved column-track width becomes the child's `width`, and `cellHeight` its `height`.

  ```js
  Grid({
    columns: 3,
    width: 360,
    cellHeight: 80,
    stretch: true,
    children: [rectA, rectB, rectC],
  }); // each 120×80
  ```

  A plain `signal.set`, so a later explicit bind still wins; only children exposing a settable `width`/`height` signal (Rect/Image) are sized (Circle/Text/Path keep their own size and are just positioned). Default `false` — position-only, byte-identical to before.

### Patch Changes

- d780cdd: mesh: per-point sub-path targets now fail loud (the docstring over-promised them)

  Animating a mesh point via `track('node/fill.points.0.pos', …)` never resolved — `fill` is a single signal, not a nested tree — but the `MeshPoint` docstring implied per-point sub-path tracks exist. Now: (1) the docstring documents the real mechanism (drive the WHOLE `fill` as a `paint` track; two same-point-count meshes interpolate pairwise), and (2) a `fill.points.<i>.*` target throws a SPECIFIC actionable error pointing at that whole-fill paint track, instead of the generic "no property signal resolves to it".

- Updated dependencies [d780cdd]
  - @glissade/core@0.25.0-pre.1

## 0.25.0-pre.0

### Minor Changes

- d907a72: examples: no-build (IIFE) form of the example corpus

  The runnable example snippets are npm `import`-form, which don't run verbatim in a no-build `<script src>` page. New `toIifeForm(code)` (exported from `@glissade/scene/examples`) rewrites `import { X } from '...'` → `const { X } = window.glissade`, and `examplesByKey({ iife: true })` returns the transformed corpus. The `@glissade/browser` IIFE now registers the no-build form, so `window.glissade.describe({ examples: true })` gives a no-build agent snippets it can copy-paste and run as-is. npm consumers still get the `import`-form (the doctest + the generated reference are unchanged).

### Patch Changes

- @glissade/core@0.25.0-pre.0

## 0.24.0

### Minor Changes

- d2f85c7: scene: executable examples registry + `describe({ examples: true })`

  The new `@glissade/scene/examples` subpath is a curated corpus of **runnable** examples — a copy-pasteable `code` snippet plus an executable `run` thunk against the real API. Importing it registers the corpus with `describe()`:

  ```js
  import "@glissade/scene/examples";
  import { describe } from "@glissade/scene/describe";
  const m = describe({ examples: true });
  m.nodes.Rect.examples; // → ["import { Rect } from '@glissade/scene';\nnew Rect({ … })"]
  m.helpers.find((h) => h.name === "splitText").examples;
  ```

  A vitest doctest harness runs every example's `run()` and asserts it never throws — so a snippet that references a renamed export or a changed shape fails CI, and the surfaced examples **can't drift** from the API. `describe()` (zero-arg) is byte-identical to before; the corpus is tree-shaken off the base embed (describe reads a registry it never imports), so the base embed and the browser IIFE are unchanged.

- 096e988: fail-loud: the `measureText` / `font.size` contract (0.24 sweep)

  A non-finite or non-positive `font.size` used to cascade NaN/0 metrics into zero-height layout boxes — broken wrapping/reveal, with **no error** (the silent-wrong-result class an agent can't glance-test). Now every measurement entry point fails loud:

  - new `assertFiniteFontSize(font, where)` (exported from `@glissade/scene`) — throws an actionable error naming the common `size`-vs-`fontSize` gotcha (the FontSpec field is `size`, not the Text-node `fontSize`).
  - enforced at the `breakLines` chokepoint (covers `intrinsicSize`/`lineBoxes`/`wordBoxes`/`measureWrappedText`) and at all three backend `measureText`s (the contract boundary).

  Valid sizes are unaffected — the 262 goldens are byte-identical. (Audited and verified NOT bugs, so unchanged: `track.ts` pre-first-key clamping, `grid.ts` single-row `cellHeight`, empty-text 0 metrics, degenerate gradients/rng.)

### Patch Changes

- ad0decf: scene: example snippets are now self-contained (copy-paste safe) + a doctest guard

  Two corpus snippets (`Stack`, `Grid`) used `new Rect(...)` in their `children` without importing `Rect`, so a copy-paste threw `ReferenceError` — in npm and no-build alike (found by the canary seats). Root cause: the doctest ran the `run` thunk (which had `Rect` in scope) but never checked the displayed `code` string was self-contained. Fixed both snippets, and added a doctest assertion that every example's `code` imports every glissade identifier it uses — so the `code`-vs-`run` divergence class can't recur (the displayed snippet is the product). The generated API reference also notes the IIFE adaptation (`import { X }` → `const { X } = window.glissade`).

  - @glissade/core@0.24.0

## 0.24.0-pre.3

### Patch Changes

- ad0decf: scene: example snippets are now self-contained (copy-paste safe) + a doctest guard

  Two corpus snippets (`Stack`, `Grid`) used `new Rect(...)` in their `children` without importing `Rect`, so a copy-paste threw `ReferenceError` — in npm and no-build alike (found by the canary seats). Root cause: the doctest ran the `run` thunk (which had `Rect` in scope) but never checked the displayed `code` string was self-contained. Fixed both snippets, and added a doctest assertion that every example's `code` imports every glissade identifier it uses — so the `code`-vs-`run` divergence class can't recur (the displayed snippet is the product). The generated API reference also notes the IIFE adaptation (`import { X }` → `const { X } = window.glissade`).

  - @glissade/core@0.24.0-pre.3

## 0.24.0-pre.2

### Patch Changes

- @glissade/core@0.24.0-pre.2

## 0.24.0-pre.1

### Minor Changes

- 096e988: fail-loud: the `measureText` / `font.size` contract (0.24 sweep)

  A non-finite or non-positive `font.size` used to cascade NaN/0 metrics into zero-height layout boxes — broken wrapping/reveal, with **no error** (the silent-wrong-result class an agent can't glance-test). Now every measurement entry point fails loud:

  - new `assertFiniteFontSize(font, where)` (exported from `@glissade/scene`) — throws an actionable error naming the common `size`-vs-`fontSize` gotcha (the FontSpec field is `size`, not the Text-node `fontSize`).
  - enforced at the `breakLines` chokepoint (covers `intrinsicSize`/`lineBoxes`/`wordBoxes`/`measureWrappedText`) and at all three backend `measureText`s (the contract boundary).

  Valid sizes are unaffected — the 262 goldens are byte-identical. (Audited and verified NOT bugs, so unchanged: `track.ts` pre-first-key clamping, `grid.ts` single-row `cellHeight`, empty-text 0 metrics, degenerate gradients/rng.)

### Patch Changes

- @glissade/core@0.24.0-pre.1

## 0.24.0-pre.0

### Minor Changes

- scene: executable examples registry + `describe({ examples: true })`

  The new `@glissade/scene/examples` subpath is a curated corpus of **runnable** examples — a copy-pasteable `code` snippet plus an executable `run` thunk against the real API. Importing it registers the corpus with `describe()`:

  ```js
  import "@glissade/scene/examples";
  import { describe } from "@glissade/scene/describe";
  const m = describe({ examples: true });
  m.nodes.Rect.examples; // → ["import { Rect } from '@glissade/scene';\nnew Rect({ … })"]
  m.helpers.find((h) => h.name === "splitText").examples;
  ```

  A vitest doctest harness runs every example's `run()` and asserts it never throws — so a snippet that references a renamed export or a changed shape fails CI, and the surfaced examples **can't drift** from the API. `describe()` (zero-arg) is byte-identical to before; the corpus is tree-shaken off the base embed (describe reads a registry it never imports), so the base embed and the browser IIFE are unchanged.

### Patch Changes

- @glissade/core@0.24.0-pre.0

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

- 7c8f184: scene: `measureWrappedText` — size a container to wrapped text without a Text node

  Sizing a bubble/card to _wrapped_ text previously meant re-implementing line-breaking consumer-side. `Text.measuredSize`/`lineBoxes` already cover a Text _node_; the new `measureWrappedText` covers a raw _string_:

  ```js
  const { width, lines, height, ascent, descent } = scene.measureWrappedText(
    text,
    font,
    width,
    lineHeight /* = 1.25 */
  );
  ```

  It reuses the renderer's own `breakLines` + measurer (the exact `Text.intrinsicSize` steps), so the line breaks match what gets drawn. Also exported standalone as `measureWrappedText(text, font, width, lineHeight, measurer)`, and surfaced in `describe()` (pointing at the Text-node analogue). `width <= 0` = no wrap (explicit `\n` still breaks).

### Patch Changes

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

- 33077e8: scene: `measureWrappedText` now fails loud on a missing/invalid `font.size`

  A `font.size` that wasn't a positive number made `height` `NaN` (which serializes to `null`) and `ascent`/`descent` `0` — a silent wrong result. The common cause is the field name: the `FontSpec` field is **`size`**, not `fontSize` (that's the Text node prop). `measureWrappedText` now throws an actionable error in that case instead of returning garbage.

- Updated dependencies [8209c61]
- Updated dependencies [e54d593]
  - @glissade/core@0.23.0

## 0.23.0-pre.5

### Patch Changes

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

- Updated dependencies [e54d593]
  - @glissade/core@0.23.0-pre.5

## 0.23.0-pre.4

### Patch Changes

- @glissade/core@0.23.0-pre.4

## 0.23.0-pre.3

### Patch Changes

- 33077e8: scene: `measureWrappedText` now fails loud on a missing/invalid `font.size`

  A `font.size` that wasn't a positive number made `height` `NaN` (which serializes to `null`) and `ascent`/`descent` `0` — a silent wrong result. The common cause is the field name: the `FontSpec` field is **`size`**, not `fontSize` (that's the Text node prop). `measureWrappedText` now throws an actionable error in that case instead of returning garbage.

  - @glissade/core@0.23.0-pre.3

## 0.23.0-pre.2

### Patch Changes

- @glissade/core@0.23.0-pre.2

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

### Patch Changes

- Updated dependencies [8209c61]
  - @glissade/core@0.23.0-pre.1

## 0.23.0-pre.0

### Minor Changes

- scene: `measureWrappedText` — size a container to wrapped text without a Text node

  Sizing a bubble/card to _wrapped_ text previously meant re-implementing line-breaking consumer-side. `Text.measuredSize`/`lineBoxes` already cover a Text _node_; the new `measureWrappedText` covers a raw _string_:

  ```js
  const { width, lines, height, ascent, descent } = scene.measureWrappedText(
    text,
    font,
    width,
    lineHeight /* = 1.25 */
  );
  ```

  It reuses the renderer's own `breakLines` + measurer (the exact `Text.intrinsicSize` steps), so the line breaks match what gets drawn. Also exported standalone as `measureWrappedText(text, font, width, lineHeight, measurer)`, and surfaced in `describe()` (pointing at the Text-node analogue). `width <= 0` = no wrap (explicit `\n` still breaks).

### Patch Changes

- @glissade/core@0.23.0-pre.0

## 0.22.0

### Minor Changes

- 095cfd2: Text: `letterSpacing` (tracking) — a cross-backend typography property

  `Text` gains a static `letterSpacing` prop (px between glyphs; negative tightens). It threads through the `FontSpec` to every backend 1:1 — `ctx.letterSpacing` on canvas2d **and** the Skia export path (`@napi-rs/canvas` honors it in render _and_ `measureText`, so wrapping stays correct), and CSS `letter-spacing` on the DOM backend. `splitText` parts inherit it, and `describe()` lists it (construction-only — static, not a track target in 0.21).

  Additive and golden-neutral: a Text without `letterSpacing` emits a byte-identical `FontSpec`, so all existing goldens are unchanged; a new `letter-spacing` golden proves the tracking reaches the glyphs on Skia. For em-relative tracking pass `em * fontSize`.

### Patch Changes

- 42d281e: describe(): surface node position anchors; backend-dom doc accuracy

  The `anchor` prop (pin `position` to any corner/edge, `'top-left'`/`[ax,ay]`, the rotation/scale pivot) already exists and works on every node — but it was undiscoverable, so consumers hit the Rect-center-vs-Text-baseline mismatch and pixel-measured around it (UhOVUlewfVz7). `describe()` now:

  - adds **`nodes.<T>.positionAnchor`** — what each node's `position` points at without an explicit anchor (`'center'` for shapes, `'baseline-left'` for Text, `'author-coords'` for Path), so the mismatch is in the manifest, and
  - **enumerates the `anchor` presets** in its type (`'center'|'top-left'|…|[ax,ay]`) instead of the opaque `AnchorSpec`, so `anchor:'top-left'` is discoverable as the fix.

  `@glissade/backend-dom` doc accuracy: `readPixels()` is documented as **async-reject** (it returns a `Promise` per the `RenderBackend` contract — `await`/`.catch`, not a bare `try/catch`); `measureText` `ascent`/`descent` are documented as estimates, and its measuring span now mounts in the live document so wrapping reflects the real font.

  - @glissade/core@0.22.0

## 0.22.0-pre.5

### Patch Changes

- @glissade/core@0.22.0-pre.5

## 0.22.0-pre.4

### Patch Changes

- @glissade/core@0.22.0-pre.4

## 0.22.0-pre.3

### Patch Changes

- 42d281e: describe(): surface node position anchors; backend-dom doc accuracy

  The `anchor` prop (pin `position` to any corner/edge, `'top-left'`/`[ax,ay]`, the rotation/scale pivot) already exists and works on every node — but it was undiscoverable, so consumers hit the Rect-center-vs-Text-baseline mismatch and pixel-measured around it (UhOVUlewfVz7). `describe()` now:

  - adds **`nodes.<T>.positionAnchor`** — what each node's `position` points at without an explicit anchor (`'center'` for shapes, `'baseline-left'` for Text, `'author-coords'` for Path), so the mismatch is in the manifest, and
  - **enumerates the `anchor` presets** in its type (`'center'|'top-left'|…|[ax,ay]`) instead of the opaque `AnchorSpec`, so `anchor:'top-left'` is discoverable as the fix.

  `@glissade/backend-dom` doc accuracy: `readPixels()` is documented as **async-reject** (it returns a `Promise` per the `RenderBackend` contract — `await`/`.catch`, not a bare `try/catch`); `measureText` `ascent`/`descent` are documented as estimates, and its measuring span now mounts in the live document so wrapping reflects the real font.

  - @glissade/core@0.22.0-pre.3

## 0.22.0-pre.2

### Patch Changes

- @glissade/core@0.22.0-pre.2

## 0.22.0-pre.1

### Patch Changes

- @glissade/core@0.22.0-pre.1

## 0.22.0-pre.0

### Minor Changes

- 095cfd2: Text: `letterSpacing` (tracking) — a cross-backend typography property

  `Text` gains a static `letterSpacing` prop (px between glyphs; negative tightens). It threads through the `FontSpec` to every backend 1:1 — `ctx.letterSpacing` on canvas2d **and** the Skia export path (`@napi-rs/canvas` honors it in render _and_ `measureText`, so wrapping stays correct), and CSS `letter-spacing` on the DOM backend. `splitText` parts inherit it, and `describe()` lists it (construction-only — static, not a track target in 0.21).

  Additive and golden-neutral: a Text without `letterSpacing` emits a byte-identical `FontSpec`, so all existing goldens are unchanged; a new `letter-spacing` golden proves the tracking reaches the glyphs on Skia. For em-relative tracking pass `em * fontSize`.

### Patch Changes

- @glissade/core@0.22.0-pre.0

## 0.21.0

### Patch Changes

- c954768: 0.21: new package `@glissade/backend-dom` — a DOM/SVG render backend (Stage S2, forward render)

  A new leaf backend that consumes the identical `DisplayList` IR the canvas2d/skia backends consume, but emits **HTML/SVG elements** instead of pixels — a **preview / non-parity** realtime tier for accessibility, selectable text, CSS-native embedding, and zero-raster structural preview. It is never on the `gs render` export path (export stays on the raster path).

  - `DomBackend` implements the full `RenderBackend` op set via a direct command walk (HTML divs for structure/transform/group/text; inline `<svg>` islands for path/gradient/clip/image geometry; `E` ellipse segs → SVG arcs). Real selectable text nodes.
  - Out-of-band node identity: `setIds(emitWithIds(...).ids)` stamps `data-node-id` for click-to-edit hosts (read identity → mutate the scene via `.set()`; one-way scene → DOM).
  - Honest degradation: mesh / non-linear gradient interpolation degrade to a best-effort solid and stamp `data-approx="true"`; shaders ignored (`caps.shaders=false`); `readPixels()` throws (no pixel buffer). `measureText` uses a hidden DOM element (with a documented line-break divergence from the canvas/export path).
  - **Stage S2 (forward render — rebuilds each frame)**; the retained-DOM reconciler (cross-frame patching keyed on `data-node-id`, required for in-progress inline-edit/selection/focus to survive) is **Stage S3**, a follow-up. Validated by the consumer spec on the board (the design-agent's editable-host workflow).

  Additive and golden-neutral — never instantiated by `evaluate`/canvas/Skia, so all 262 goldens stay byte-identical; off the base-embed and `@glissade/browser` IIFE budgets (npm/bundler consumer only).

  Docs cleanups (scene patch): clarify the Path `data`/`d` coercion (both accept `PathValue`, reject raw SVG `d` strings — only the rejection layer differs); enrich `docs/controlled-drive.md` with the host-owned `dt`-based rAF loop, the live-`.set()` guarantee, a note that glissade's springs are closed-form / deterministic-under-seek, and that controlled mode drives any backend (incl. the new DOM tier). The friendlier no-`new` DX guard (F3) stays deferred — ES class semantics throw before the constructor body, so it needs callable factory wrappers across 8 classes (taxes the tight base/IIFE budgets); better served later by an eslint rule or a `.d.ts` call-signature.

  - @glissade/core@0.21.0

## 0.21.0-pre.4

### Patch Changes

- @glissade/core@0.21.0-pre.4

## 0.21.0-pre.3

### Patch Changes

- @glissade/core@0.21.0-pre.3

## 0.21.0-pre.2

### Patch Changes

- @glissade/core@0.21.0-pre.2

## 0.21.0-pre.1

### Patch Changes

- @glissade/core@0.21.0-pre.1

## 0.21.0-pre.0

### Patch Changes

- c954768: 0.21: new package `@glissade/backend-dom` — a DOM/SVG render backend (Stage S2, forward render)

  A new leaf backend that consumes the identical `DisplayList` IR the canvas2d/skia backends consume, but emits **HTML/SVG elements** instead of pixels — a **preview / non-parity** realtime tier for accessibility, selectable text, CSS-native embedding, and zero-raster structural preview. It is never on the `gs render` export path (export stays on the raster path).

  - `DomBackend` implements the full `RenderBackend` op set via a direct command walk (HTML divs for structure/transform/group/text; inline `<svg>` islands for path/gradient/clip/image geometry; `E` ellipse segs → SVG arcs). Real selectable text nodes.
  - Out-of-band node identity: `setIds(emitWithIds(...).ids)` stamps `data-node-id` for click-to-edit hosts (read identity → mutate the scene via `.set()`; one-way scene → DOM).
  - Honest degradation: mesh / non-linear gradient interpolation degrade to a best-effort solid and stamp `data-approx="true"`; shaders ignored (`caps.shaders=false`); `readPixels()` throws (no pixel buffer). `measureText` uses a hidden DOM element (with a documented line-break divergence from the canvas/export path).
  - **Stage S2 (forward render — rebuilds each frame)**; the retained-DOM reconciler (cross-frame patching keyed on `data-node-id`, required for in-progress inline-edit/selection/focus to survive) is **Stage S3**, a follow-up. Validated by the consumer spec on the board (the design-agent's editable-host workflow).

  Additive and golden-neutral — never instantiated by `evaluate`/canvas/Skia, so all 262 goldens stay byte-identical; off the base-embed and `@glissade/browser` IIFE budgets (npm/bundler consumer only).

  Docs cleanups (scene patch): clarify the Path `data`/`d` coercion (both accept `PathValue`, reject raw SVG `d` strings — only the rejection layer differs); enrich `docs/controlled-drive.md` with the host-owned `dt`-based rAF loop, the live-`.set()` guarantee, a note that glissade's springs are closed-form / deterministic-under-seek, and that controlled mode drives any backend (incl. the new DOM tier). The friendlier no-`new` DX guard (F3) stays deferred — ES class semantics throw before the constructor body, so it needs callable factory wrappers across 8 classes (taxes the tight base/IIFE budgets); better served later by an eslint rule or a `.d.ts` call-signature.

  - @glissade/core@0.21.0-pre.0

## 0.20.1

### Patch Changes

- 86ae703: 0.20.1: fail-loud node constructors + splitText manifest/guard fixes (browser-canary findings)

  - **Node constructors now THROW on an unknown prop key** (`NodeConstructionError`) instead of silently dropping it — the construction-time sibling of the timeline builder's unknown-option guard. `new Rect({ size: [80, 80] })` (no such prop — Rect has `width`/`height`) used to leave a 0×0 invisible node with no warning (the browser guide even shipped that example); it now fails loud, naming the bad key, the node type, and the valid props. The allow-list is derived from the live `registerTarget` set + the construction-prop name sets (so it can't drift from what constructors honor); animatable dotted sub-paths like `position.x` stay timeline-only targets and are correctly rejected as constructor keys. Built-in nodes only — `Custom`/user subclasses (whose `new.target` matches no built-in) are never validated, keeping that extension seam lenient.
  - **`describe()` now describes `splitText` accurately** — the real object return shape `{ node, children, parts, targets }` (was `Node[]`), the real `by` enum `'word' | 'line' | 'grapheme'` (was `'word' | 'char'`), and the `id`/`measurer` opts (the latter is the documented escape hatch from the estimating-measurer footgun).
  - **`splitText` throws on an unknown `by`** instead of silently treating it as `grapheme` (the same fail-loud class).
  - **Docs:** the broken `new G.Rect({ size: [80, 80] })` examples in `docs/browser.md` (3×) and `docs/discovery.md` → `width`/`height` (doubly required — under the guard the old example would otherwise throw).

  Determinism preserved: the guard is construction-time / error-path, off the render path — all 262 goldens byte-identical. Base embed 35.62 → 36.00/39 (+0.38, well under ceiling); browser IIFE budget 48 → 49 (convenience bundle).

  - @glissade/core@0.20.1

## 0.20.1-pre.0

### Patch Changes

- 0.20.1: fail-loud node constructors + splitText manifest/guard fixes (browser-canary findings)

  - **Node constructors now THROW on an unknown prop key** (`NodeConstructionError`) instead of silently dropping it — the construction-time sibling of the timeline builder's unknown-option guard. `new Rect({ size: [80, 80] })` (no such prop — Rect has `width`/`height`) used to leave a 0×0 invisible node with no warning (the browser guide even shipped that example); it now fails loud, naming the bad key, the node type, and the valid props. The allow-list is derived from the live `registerTarget` set + the construction-prop name sets (so it can't drift from what constructors honor); animatable dotted sub-paths like `position.x` stay timeline-only targets and are correctly rejected as constructor keys. Built-in nodes only — `Custom`/user subclasses (whose `new.target` matches no built-in) are never validated, keeping that extension seam lenient.
  - **`describe()` now describes `splitText` accurately** — the real object return shape `{ node, children, parts, targets }` (was `Node[]`), the real `by` enum `'word' | 'line' | 'grapheme'` (was `'word' | 'char'`), and the `id`/`measurer` opts (the latter is the documented escape hatch from the estimating-measurer footgun).
  - **`splitText` throws on an unknown `by`** instead of silently treating it as `grapheme` (the same fail-loud class).
  - **Docs:** the broken `new G.Rect({ size: [80, 80] })` examples in `docs/browser.md` (3×) and `docs/discovery.md` → `width`/`height` (doubly required — under the guard the old example would otherwise throw).

  Determinism preserved: the guard is construction-time / error-path, off the render path — all 262 goldens byte-identical. Base embed 35.62 → 36.00/39 (+0.38, well under ceiling); browser IIFE budget 48 → 49 (convenience bundle).

  - @glissade/core@0.20.1-pre.0

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

- 0f5b066: 0.20: `describe()` helpers section (createPlayer/motionPath/clip/renderToDataURL/splitText)

  `glissade.describe()` already surfaced nodes, props, value types, easings, the
  timeline builder, `createScene`, and the tree-shakeable subpaths — but NOT the
  broader helper/factory API. An AI/agent consumer that discovers the surface by
  introspecting the manifest (not the website) would never find `createPlayer`,
  `motionPath`/`followPath`, `clip`/`clipList`, `renderToDataURL`/`snapshotCanvas`,
  or `splitText`, even though all of them work.

  The manifest now carries a curated **`helpers`** array (`ApiManifest.helpers:
DescribedHelper[]`), one entry per helper with a `name` (also the
  `window.glissade.<name>` global on the IIFE), a one-line `summary`, the npm
  `import` subpath, and a minimal `usage` string. Copy is kept verbatim with
  `docs/discovery.md`.

  `scene` can't import `player`/`backend-canvas2d` (they live above it in the dep
  graph), so this is a hand-kept literal — drift-guarded two ways: scene's
  `describe.test.ts` pins the structure + the npm import paths, and
  `@glissade/browser`'s smoke test (above scene, importing the whole IIFE surface)
  asserts every `describe().helpers[*].name` resolves to a real
  `window.glissade.<name>` function.

  `describe` stays on the tree-shaken `@glissade/scene/describe` subpath, so the
  base embed is unchanged (34.93 kB gz). The committed `glissade.api.json` is
  regenerated to include the new section.

- 1bd4507: 0.20: no-build layout split (Stack/Row/Column on the IIFE, Yoga stays async) + Grid (Fork B: scene/grid track resolver)

  Two layout slices, both build-time / off-render (the 262 goldens stay byte-identical).

  **No-build layout split.** The Yoga-free layout node ctors (`Layout`/`Stack`/
  `Row`/`Column`) moved onto a new tree-shakeable `@glissade/scene/layout-ctors`
  subpath, split off the Yoga loader (`loadYogaLayoutEngine`, now in its own
  module). The ctors only touch the LayoutEngine seam at _compute_ time, never
  `import('yoga-layout/load')` at construction, so the single-file
  `@glissade/browser` IIFE can now expose `glissade.Stack`/`Row`/`Column`/`Layout`
  **without inlining Yoga's wasm** (the loader's dynamic import is externalized in
  the IIFE build, keeping the bundle at ~45.3 kB gz instead of ~99). A no-build
  page must still `await glissade.loadYogaLayoutEngine()` (with a module resolver
  for `yoga-layout/load`) before evaluating a layout scene, else the first compute
  throws `LayoutEngineMissingError`.

  `@glissade/scene/layout` is **unchanged for existing importers** — it now
  re-exports the ctors plus the loader, so `import { Stack, loadYogaLayoutEngine }
from '@glissade/scene/layout'` keeps working exactly as before.

  **Grid.** New `Grid({ columns, gap, … })` on a tree-shakeable
  `@glissade/scene/grid` subpath (and `glissade.Grid` on the IIFE). A pure
  build-time fan-out — like `each()`/`splitText()`, **not** a Yoga feature: it
  resolves uniform `fr` / fixed-px column tracks + gaps into cell positions, moves
  each child to its cell center via the ordinary `position` signal, and wraps them
  in a `Group`. No layout engine, no id stamping, nothing at play time — so it
  works in a bare no-build page and composes with the goldens by construction.
  Position-only in v1 (cell `stretch` / sizing deferred); `fr` columns need an
  explicit `width`, multi-row grids need a `cellHeight` row pitch.

  Both stay off the base embed (still 34.93 kB gz); the IIFE budget is unchanged
  at 47 kB. See `docs/layout.md` for the no-build and Grid recipes.

- 2a30be9: 0.20: S1 NodeIdStream identity-stream producer (`emitWithIds`, opt-in, off-by-default — DOM-backend readiness)

  The Seam-1 producer from the `backend-dom` design memo (docs/design/dom-backend.md
  "Seam 1 — node identity: OUT-OF-BAND") now ships as a new tree-shakeable subpath
  **`@glissade/scene/identity`**:

  ```ts
  import { emitWithIds, type NodeIdStream } from "@glissade/scene/identity";

  const { displayList, ids } = emitWithIds(scene, timeline, t);
  // ids.length === displayList.commands.length;
  // ids[i] = the stable explicit id of the node that emitted command i (or undefined).
  ```

  `emitWithIds` runs the **same pure emit** as `evaluate()`, but through an
  instrumented `DisplayListBuilder` that records, positionally by command index, the
  emitting node's stable explicit id — a `NodeIdStream = (string | undefined)[]`
  emitted _alongside_ the DisplayList, **never inside it**. A node with no explicit
  id contributes `undefined`. Because the emit walk is already stable +
  deterministic, the stream is stable across re-emits of an unchanged graph at a
  given `t`. The DOM backend (a future milestone) consumes this to stamp
  `data-node-id` and key a retained-DOM reconciler.

  **Off by default — byte-identical normal path.** The mechanism is an out-of-band
  seam: `Node.emit` brackets each node's `save…restore` slice with guarded
  `out.enterNode?.(this.id)` / `out.exitNode?.()` calls. The default
  `createDisplayListBuilder` does NOT implement them, so they are no-ops on every
  normal `evaluate()` / `emit()` / `render()` — **every DrawCommand stays
  byte-identical** (the 262 goldens are frozen) and `emitWithIds`'s DisplayList is
  byte/deep-equal to `evaluate()`'s. The subpath is never imported by the base scene
  index (a `check:size` metafile guard asserts it), so the **base embed budget is
  unchanged** (~35.55 kB gz); it is npm-subpath-only and is NOT re-exported onto the
  `@glissade/browser` IIFE (zero IIFE delta). The only new symbols on the base scene
  index are the optional `enterNode`/`exitNode` methods on the `DisplayListBuilder`
  interface.

- 3760b47: 0.20: variable-font passthrough (`fontVariationSettings` → Skia rasterizer) + animation-deferred

  The 0.19.1 typed `Text.fontVariationSettings` prop was accepted-and-DROPPED (no
  rasterizer wiring). 0.20 WIRES it as **static passthrough**: the axis string
  threads `Text → FontSpec.fontVariationSettings → ctx.fontVariationSettings` and
  is applied by the rasterizer where the 2D context supports it.

  - **Skia / export path** (`@napi-rs/canvas`) exposes a settable
    `ctx.fontVariationSettings`, so the axes reach the glyphs — a heavier `"wght"`
    renders distinctly, and a mid weight no discrete named instance can reach (e.g.
    `"wght" 550`) is now expressible. The new `golden-variable-font` corpus pins
    three weights of one variable face rendering distinctly — the byte-exact proof
    the axis is applied, not dropped. The measurer applies the same axes, so
    line-breaking/box metrics match the draw.
  - **Browser** (DOM 2D canvas) has no `fontVariationSettings` property, so axes
    are **best-effort** there — a guarded no-op (never a throw), with a one-time
    dev-warning that the value wasn't applied. For perfect cross-backend parity,
    instance the face to a static sfnt at ingest (the `font-instanced` golden).

  **Default Text is byte-identical:** the axis key is OMITTED from the FontSpec
  when unset (all measure/layout/draw sites route through one `Text.fontSpec()`
  that spreads it conditionally), so the 262 pre-existing goldens stay
  byte-for-byte unchanged.

  **Animatable axes stay deferred to 1.0** (an opaque CSS string isn't
  interpolatable). `fontVariationSettings` is not a bindable target, so a timeline
  track on `<id>/fontVariationSettings` hard-throws `UnboundTargetError` — the
  loud signal for the deferred-animation case, not a silent drop. Use discrete
  `fontWeight` named instances for a weight that changes over time.

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

### Patch Changes

- 519e1f8: 0.20: `describe()` completeness — `Text.fontVariationSettings` (construction prop → discoverable + specific bind error) + `Grid` in the manifest (HNar9da3oDXb)

  A video-canary review found three gaps where the 0.20 surface rendered but was
  invisible to `glissade.describe()` (the machine-readable manifest an AI/agent
  consumer reads as ground truth). One name fix closes two of them:

  - **`Text.fontVariationSettings`** — the 0.20 headline variable-font prop was
    ABSENT from the manifest (`Text.props` listed `fontWeight`/`fontStyle`/
    `lineHeight` but not it) and binding a track to `<id>/fontVariationSettings`
    fell through to the generic `UnboundTargetError`. Adding it to the Text
    CONSTRUCTION-prop NAME set in `constructionProps.ts` (the single source both
    `describe()` and the bind guard read) makes it appear in the manifest as
    `{ type: 'string', animatable: false }` AND makes binding it throw the
    construction-prop-SPECIFIC message ("…is a construction prop… set it at
    construction") instead of the generic resolver error.
  - **`Grid`** (the `@glissade/scene/grid` build-time track resolver) — now listed
    in `describe().helpers` with its `@glissade/scene/grid` import and usage, so
    the no-build consumer discovers `window.glissade.Grid`. The `Stack`/`Row`/
    `Column` layout factories (`@glissade/scene/layout`) join it in the helpers
    section (they were already in `.nodes`, now also surfaced as the call-shaped
    factories an agent reaches for). The cross-package browser drift guard still
    passes (every `helpers[*].name` resolves to a real `window.glissade.<name>`).

  Pure manifest data + a name-set addition — no render change. All 262 goldens
  stay byte-identical; the committed `glissade.api.json` is regenerated.

- fffa420: 0.20: two no-build (IIFE) fixes the design-agent canary found on `0.20.0-pre.6`

  - **`loadYogaLayoutEngine()` couldn't self-load in the no-build bundle.** Its dynamic `import('yoga-layout/load')` is a bare specifier a browser can't resolve with no bundler/import map, so the headline no-build layout feature (`Stack`/`Row`/`Column`) threw _"Module name, 'yoga-layout/load' does not resolve to a valid URL."_ It now accepts an optional `{ url }` to point the loader at a CDN ESM build — `loadYogaLayoutEngine({ url: 'https://esm.sh/yoga-layout@3.2.1/load' })` — resolving it without an import map. The default (bare specifier) is unchanged and still byte-identical under npm/a bundler; `docs/layout.md` documents both the `{ url }` arg and the import-map approach.

  - **The construction-prop bind error fell back to the generic message in the minified IIFE.** `node.describeType` defaulted to `constructor.name`, which the bundle mangles, so `isConstructionProp(describeType, …)` missed for every node but `Image` — binding `card/fontFamily` looked identical to a typo. Every built-in node (Group/Rect/Circle/Path/Text/Video/Layout) now pins its taxonomy name as a string literal, so the specific _"'X' is a construction prop — set it at construction"_ message fires in the bundle too. Render-neutral: all 262 goldens byte-identical.

- fd12bb8: 0.20: move `tokenHighlight` (production render UI) off `/diagnostics` onto `@glissade/scene/tokens` (ai-training finding)

  `tokenHighlight` / `TokenHighlight` draw VISIBLE sub-line token tell-tags in real
  episodes — they are a PRODUCTION rendering component, not a DEV/CLI diagnostic.
  The 0.20 base-embed budget review wrongly grouped them onto
  `@glissade/scene/diagnostics` (alongside the diff/snapshot/audit DEBUG tools), so
  `import … from '@glissade/scene/diagnostics'` read as a debug import for visible
  UI. This splits the whole token-highlight surface back out onto its OWN
  PRODUCTION subpath **`@glissade/scene/tokens`**; the genuine diagnostics
  (`diffDisplayLists` / `formatDisplayDiff` / `serializeDisplayList` /
  `parseDisplaySnapshot` / `auditCacheCold`) stay on `/diagnostics`, which is now
  debug-only.

  **BREAKING import change** (these symbols now import from the new subpath, not
  `/diagnostics`):

  - **`@glissade/scene/tokens`** — `tokenHighlight`, `TokenHighlight`,
    `matchTokenRun`, `TokenMatchError`, `TokenHighlightProps`, `TokenRange`.

  This is a SECOND move for `tokenHighlight` in 0.20 (it went base index →
  `/diagnostics` in the budget review; now `/diagnostics` → `/tokens`, its
  production home). It stays OFF the base scene index (opt-in production UI — the
  base embed is unchanged at ~35.59 kB gz). It is npm-subpath-only: re-exporting it
  onto the `@glissade/browser` IIFE measured +1.16 kB gz (47.47 → 48.63), busting
  the 48 kB convenience-bundle ceiling, so a no-build author reaches it via the npm
  subpath rather than `window.glissade.*`.

  Pure module-graph relocation — all goldens stay byte-identical.

- Updated dependencies [c629b51]
- Updated dependencies [4a2117f]
- Updated dependencies [be35b11]
  - @glissade/core@0.20.0

## 0.20.0-pre.7

### Patch Changes

- 0.20: two no-build (IIFE) fixes the design-agent canary found on `0.20.0-pre.6`

  - **`loadYogaLayoutEngine()` couldn't self-load in the no-build bundle.** Its dynamic `import('yoga-layout/load')` is a bare specifier a browser can't resolve with no bundler/import map, so the headline no-build layout feature (`Stack`/`Row`/`Column`) threw _"Module name, 'yoga-layout/load' does not resolve to a valid URL."_ It now accepts an optional `{ url }` to point the loader at a CDN ESM build — `loadYogaLayoutEngine({ url: 'https://esm.sh/yoga-layout@3.2.1/load' })` — resolving it without an import map. The default (bare specifier) is unchanged and still byte-identical under npm/a bundler; `docs/layout.md` documents both the `{ url }` arg and the import-map approach.

  - **The construction-prop bind error fell back to the generic message in the minified IIFE.** `node.describeType` defaulted to `constructor.name`, which the bundle mangles, so `isConstructionProp(describeType, …)` missed for every node but `Image` — binding `card/fontFamily` looked identical to a typo. Every built-in node (Group/Rect/Circle/Path/Text/Video/Layout) now pins its taxonomy name as a string literal, so the specific _"'X' is a construction prop — set it at construction"_ message fires in the bundle too. Render-neutral: all 262 goldens byte-identical.
  - @glissade/core@0.20.0-pre.7

## 0.20.0-pre.6

### Patch Changes

- Updated dependencies [4a2117f]
  - @glissade/core@0.20.0-pre.6

## 0.20.0-pre.5

### Patch Changes

- fd12bb8: 0.20: move `tokenHighlight` (production render UI) off `/diagnostics` onto `@glissade/scene/tokens` (ai-training finding)

  `tokenHighlight` / `TokenHighlight` draw VISIBLE sub-line token tell-tags in real
  episodes — they are a PRODUCTION rendering component, not a DEV/CLI diagnostic.
  The 0.20 base-embed budget review wrongly grouped them onto
  `@glissade/scene/diagnostics` (alongside the diff/snapshot/audit DEBUG tools), so
  `import … from '@glissade/scene/diagnostics'` read as a debug import for visible
  UI. This splits the whole token-highlight surface back out onto its OWN
  PRODUCTION subpath **`@glissade/scene/tokens`**; the genuine diagnostics
  (`diffDisplayLists` / `formatDisplayDiff` / `serializeDisplayList` /
  `parseDisplaySnapshot` / `auditCacheCold`) stay on `/diagnostics`, which is now
  debug-only.

  **BREAKING import change** (these symbols now import from the new subpath, not
  `/diagnostics`):

  - **`@glissade/scene/tokens`** — `tokenHighlight`, `TokenHighlight`,
    `matchTokenRun`, `TokenMatchError`, `TokenHighlightProps`, `TokenRange`.

  This is a SECOND move for `tokenHighlight` in 0.20 (it went base index →
  `/diagnostics` in the budget review; now `/diagnostics` → `/tokens`, its
  production home). It stays OFF the base scene index (opt-in production UI — the
  base embed is unchanged at ~35.59 kB gz). It is npm-subpath-only: re-exporting it
  onto the `@glissade/browser` IIFE measured +1.16 kB gz (47.47 → 48.63), busting
  the 48 kB convenience-bundle ceiling, so a no-build author reaches it via the npm
  subpath rather than `window.glissade.*`.

  Pure module-graph relocation — all goldens stay byte-identical.

  - @glissade/core@0.20.0-pre.5

## 0.20.0-pre.4

### Patch Changes

- 519e1f8: 0.20: `describe()` completeness — `Text.fontVariationSettings` (construction prop → discoverable + specific bind error) + `Grid` in the manifest (HNar9da3oDXb)

  A video-canary review found three gaps where the 0.20 surface rendered but was
  invisible to `glissade.describe()` (the machine-readable manifest an AI/agent
  consumer reads as ground truth). One name fix closes two of them:

  - **`Text.fontVariationSettings`** — the 0.20 headline variable-font prop was
    ABSENT from the manifest (`Text.props` listed `fontWeight`/`fontStyle`/
    `lineHeight` but not it) and binding a track to `<id>/fontVariationSettings`
    fell through to the generic `UnboundTargetError`. Adding it to the Text
    CONSTRUCTION-prop NAME set in `constructionProps.ts` (the single source both
    `describe()` and the bind guard read) makes it appear in the manifest as
    `{ type: 'string', animatable: false }` AND makes binding it throw the
    construction-prop-SPECIFIC message ("…is a construction prop… set it at
    construction") instead of the generic resolver error.
  - **`Grid`** (the `@glissade/scene/grid` build-time track resolver) — now listed
    in `describe().helpers` with its `@glissade/scene/grid` import and usage, so
    the no-build consumer discovers `window.glissade.Grid`. The `Stack`/`Row`/
    `Column` layout factories (`@glissade/scene/layout`) join it in the helpers
    section (they were already in `.nodes`, now also surfaced as the call-shaped
    factories an agent reaches for). The cross-package browser drift guard still
    passes (every `helpers[*].name` resolves to a real `window.glissade.<name>`).

  Pure manifest data + a name-set addition — no render change. All 262 goldens
  stay byte-identical; the committed `glissade.api.json` is regenerated.

  - @glissade/core@0.20.0-pre.4

## 0.20.0-pre.3

### Minor Changes

- 2a30be9: 0.20: S1 NodeIdStream identity-stream producer (`emitWithIds`, opt-in, off-by-default — DOM-backend readiness)

  The Seam-1 producer from the `backend-dom` design memo (docs/design/dom-backend.md
  "Seam 1 — node identity: OUT-OF-BAND") now ships as a new tree-shakeable subpath
  **`@glissade/scene/identity`**:

  ```ts
  import { emitWithIds, type NodeIdStream } from "@glissade/scene/identity";

  const { displayList, ids } = emitWithIds(scene, timeline, t);
  // ids.length === displayList.commands.length;
  // ids[i] = the stable explicit id of the node that emitted command i (or undefined).
  ```

  `emitWithIds` runs the **same pure emit** as `evaluate()`, but through an
  instrumented `DisplayListBuilder` that records, positionally by command index, the
  emitting node's stable explicit id — a `NodeIdStream = (string | undefined)[]`
  emitted _alongside_ the DisplayList, **never inside it**. A node with no explicit
  id contributes `undefined`. Because the emit walk is already stable +
  deterministic, the stream is stable across re-emits of an unchanged graph at a
  given `t`. The DOM backend (a future milestone) consumes this to stamp
  `data-node-id` and key a retained-DOM reconciler.

  **Off by default — byte-identical normal path.** The mechanism is an out-of-band
  seam: `Node.emit` brackets each node's `save…restore` slice with guarded
  `out.enterNode?.(this.id)` / `out.exitNode?.()` calls. The default
  `createDisplayListBuilder` does NOT implement them, so they are no-ops on every
  normal `evaluate()` / `emit()` / `render()` — **every DrawCommand stays
  byte-identical** (the 262 goldens are frozen) and `emitWithIds`'s DisplayList is
  byte/deep-equal to `evaluate()`'s. The subpath is never imported by the base scene
  index (a `check:size` metafile guard asserts it), so the **base embed budget is
  unchanged** (~35.55 kB gz); it is npm-subpath-only and is NOT re-exported onto the
  `@glissade/browser` IIFE (zero IIFE delta). The only new symbols on the base scene
  index are the optional `enterNode`/`exitNode` methods on the `DisplayListBuilder`
  interface.

### Patch Changes

- @glissade/core@0.20.0-pre.3

## 0.20.0-pre.2

### Minor Changes

- 3760b47: 0.20: variable-font passthrough (`fontVariationSettings` → Skia rasterizer) + animation-deferred

  The 0.19.1 typed `Text.fontVariationSettings` prop was accepted-and-DROPPED (no
  rasterizer wiring). 0.20 WIRES it as **static passthrough**: the axis string
  threads `Text → FontSpec.fontVariationSettings → ctx.fontVariationSettings` and
  is applied by the rasterizer where the 2D context supports it.

  - **Skia / export path** (`@napi-rs/canvas`) exposes a settable
    `ctx.fontVariationSettings`, so the axes reach the glyphs — a heavier `"wght"`
    renders distinctly, and a mid weight no discrete named instance can reach (e.g.
    `"wght" 550`) is now expressible. The new `golden-variable-font` corpus pins
    three weights of one variable face rendering distinctly — the byte-exact proof
    the axis is applied, not dropped. The measurer applies the same axes, so
    line-breaking/box metrics match the draw.
  - **Browser** (DOM 2D canvas) has no `fontVariationSettings` property, so axes
    are **best-effort** there — a guarded no-op (never a throw), with a one-time
    dev-warning that the value wasn't applied. For perfect cross-backend parity,
    instance the face to a static sfnt at ingest (the `font-instanced` golden).

  **Default Text is byte-identical:** the axis key is OMITTED from the FontSpec
  when unset (all measure/layout/draw sites route through one `Text.fontSpec()`
  that spreads it conditionally), so the 262 pre-existing goldens stay
  byte-for-byte unchanged.

  **Animatable axes stay deferred to 1.0** (an opaque CSS string isn't
  interpolatable). `fontVariationSettings` is not a bindable target, so a timeline
  track on `<id>/fontVariationSettings` hard-throws `UnboundTargetError` — the
  loud signal for the deferred-animation case, not a silent drop. Use discrete
  `fontWeight` named instances for a weight that changes over time.

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

### Patch Changes

- Updated dependencies [be35b11]
  - @glissade/core@0.20.0-pre.2

## 0.20.0-pre.1

### Minor Changes

- 0f5b066: 0.20: `describe()` helpers section (createPlayer/motionPath/clip/renderToDataURL/splitText)

  `glissade.describe()` already surfaced nodes, props, value types, easings, the
  timeline builder, `createScene`, and the tree-shakeable subpaths — but NOT the
  broader helper/factory API. An AI/agent consumer that discovers the surface by
  introspecting the manifest (not the website) would never find `createPlayer`,
  `motionPath`/`followPath`, `clip`/`clipList`, `renderToDataURL`/`snapshotCanvas`,
  or `splitText`, even though all of them work.

  The manifest now carries a curated **`helpers`** array (`ApiManifest.helpers:
DescribedHelper[]`), one entry per helper with a `name` (also the
  `window.glissade.<name>` global on the IIFE), a one-line `summary`, the npm
  `import` subpath, and a minimal `usage` string. Copy is kept verbatim with
  `docs/discovery.md`.

  `scene` can't import `player`/`backend-canvas2d` (they live above it in the dep
  graph), so this is a hand-kept literal — drift-guarded two ways: scene's
  `describe.test.ts` pins the structure + the npm import paths, and
  `@glissade/browser`'s smoke test (above scene, importing the whole IIFE surface)
  asserts every `describe().helpers[*].name` resolves to a real
  `window.glissade.<name>` function.

  `describe` stays on the tree-shaken `@glissade/scene/describe` subpath, so the
  base embed is unchanged (34.93 kB gz). The committed `glissade.api.json` is
  regenerated to include the new section.

- 1bd4507: 0.20: no-build layout split (Stack/Row/Column on the IIFE, Yoga stays async) + Grid (Fork B: scene/grid track resolver)

  Two layout slices, both build-time / off-render (the 262 goldens stay byte-identical).

  **No-build layout split.** The Yoga-free layout node ctors (`Layout`/`Stack`/
  `Row`/`Column`) moved onto a new tree-shakeable `@glissade/scene/layout-ctors`
  subpath, split off the Yoga loader (`loadYogaLayoutEngine`, now in its own
  module). The ctors only touch the LayoutEngine seam at _compute_ time, never
  `import('yoga-layout/load')` at construction, so the single-file
  `@glissade/browser` IIFE can now expose `glissade.Stack`/`Row`/`Column`/`Layout`
  **without inlining Yoga's wasm** (the loader's dynamic import is externalized in
  the IIFE build, keeping the bundle at ~45.3 kB gz instead of ~99). A no-build
  page must still `await glissade.loadYogaLayoutEngine()` (with a module resolver
  for `yoga-layout/load`) before evaluating a layout scene, else the first compute
  throws `LayoutEngineMissingError`.

  `@glissade/scene/layout` is **unchanged for existing importers** — it now
  re-exports the ctors plus the loader, so `import { Stack, loadYogaLayoutEngine }
from '@glissade/scene/layout'` keeps working exactly as before.

  **Grid.** New `Grid({ columns, gap, … })` on a tree-shakeable
  `@glissade/scene/grid` subpath (and `glissade.Grid` on the IIFE). A pure
  build-time fan-out — like `each()`/`splitText()`, **not** a Yoga feature: it
  resolves uniform `fr` / fixed-px column tracks + gaps into cell positions, moves
  each child to its cell center via the ordinary `position` signal, and wraps them
  in a `Group`. No layout engine, no id stamping, nothing at play time — so it
  works in a bare no-build page and composes with the goldens by construction.
  Position-only in v1 (cell `stretch` / sizing deferred); `fr` columns need an
  explicit `width`, multi-row grids need a `cellHeight` row pitch.

  Both stay off the base embed (still 34.93 kB gz); the IIFE budget is unchanged
  at 47 kB. See `docs/layout.md` for the no-build and Grid recipes.

### Patch Changes

- @glissade/core@0.20.0-pre.1

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

### Patch Changes

- Updated dependencies [c629b51]
  - @glissade/core@0.20.0-pre.0

## 0.19.1

### Patch Changes

- 9fc4e90: 0.19.1 pitstop — IIFE re-eval guard for `<gs-player>` (no render change; the 262 goldens stay byte-identical):

  - **Re-evaluating the `@glissade/browser` IIFE in a realm that already loaded it no longer throws.** A second `<script src>` include (or any re-eval) used to abort at `customElements.define('gs-player', …)` ("already defined") _before_ the IIFE could reassign `window.glissade`, so the page silently kept the OLD bundle. `defineGsPlayer()` guards the register (`if (!customElements.get(tag)) customElements.define(...)`), so re-eval is now a clean no-op and `window.glissade` reassigns. A `@glissade/browser` smoke test locks the idempotency (`glissade.defineGsPlayer()` called twice never throws; the original registration survives).

  Deferred to 0.20 (NOT in this pitstop): exposing the layout **constructors** (`Stack`/`Row`/`Column`/`Layout`) on the IIFE. They live in the same module (`@glissade/scene/layout`) as `loadYogaLayoutEngine`, whose dynamic `import('yoga-layout/load')` esbuild **cannot** keep async in a single-file IIFE (no code-splitting in `format: 'iife'`) — it inlines Yoga's wasm-base64 statically, ballooning the bundle from ~46.6 to ~99 kB gz (47.5 kB even for the ctors alone), far past the 47 kB budget. Putting the ctors on the IIFE requires first splitting the lightweight node ctors out of the module that carries the Yoga loader — a 0.20 source refactor, not a pitstop re-export.

- 2f9e213: 0.19.1 pitstop: warn on dropped `fontVariationSettings` instead of silently
  swallowing it. Variable-font axes (`wght`, `opsz`, …) are not yet wired to
  either rasterizer, so a `Text` that passes variation settings used to vanish
  with no signal — the same footgun class as the splitText estimating-measurer
  (which 0.19 made loud).

  `Text` now accepts a typed `fontVariationSettings?` prop: setting it emits a
  dev-warning naming the dropped value and that axes aren't applied yet, and the
  value is introspectable on the node but never threaded into `FontSpec`/`ctx.font`.
  Default `Text` (no variations) is unchanged and byte-identical — the 262 goldens
  hold. Animatable axes remain a 0.20 feature; pick a weight via the discrete
  `fontWeight` named instance today. Documented in `docs/typewriter.md`.

  - @glissade/core@0.19.1

## 0.19.0

### Minor Changes

- 6124d7f: 0.19: bless controlled/imperative drive mode. Add an `evaluate(scene)` overload
  (no timeline argument) as the first-class entry point for a host that owns the
  clock and the values — drive nodes imperatively with `node.set(...)` between
  frames and render, with no timeline to compile. It evaluates against an empty
  timeline at the scene's current playhead, so imperative sets survive untouched
  into the DisplayList.

  The precedence contract is now documented and regression-tested: a live timeline
  track always overrides `set(...)` on the property it targets (last writer wins),
  per property — so a timeline can own the animated props while the host drives
  the rest by hand. See the new `docs/controlled-drive.md` recipe.

- bf0d4e8: 0.19 builder sugar — three additive, pure build-time slices that compile to the serializable Timeline document (goldens stay byte-identical):

  - **Unknown builder options now throw** (`k-g1zn`). `to` / `fromTo` / `set` / `stagger` validate their options object against a known-key allow-list and throw a `TimelineValidationError` naming the offending key(s) and the method, instead of silently swallowing it. Known keys: `to`/`fromTo` → `duration`, `ease`, `at`, `from`; `set` → `at`; `stagger` spec → `to`, `from`, `duration`, `ease`; `stagger` opts → `each`, `anchor`, `at`. **Mildly breaking:** stray keys that were previously ignored now fail loudly at build time.
  - **Per-target `stagger` spec values** (`ppCUmU`). `StaggerSpec.to` and `.from` now accept a function `(index, count) => value` resolved per target (a runtime `typeof` branch, consistent with `each` and scene `each()`), so a per-target-destination cascade is expressible. A plain value still fans uniformly. Emits N ordinary tweens, byte-identical to hand-authored.
  - **`tl.tracks(tracks)`** (`Isuo8Gxn`) — a fluent bridge for the clip tier. Inject the pre-built `Track[]` returned by `presence`/`clip`/`each`/`morph` straight into the document; they land as ordinary absolute-time track rows via the same finalize→coalesce path `add()` uses for child tracks. Scoped to raw absolute-time tracks (no cursor-offset/rebasing wrapper).

  `@glissade/scene`'s `describe()` manifest is updated in lockstep: the new `tracks` builder method is listed and the `stagger` signature reflects the `to`/`from` function form.

- 56eb184: 0.19: kinetic typography — `Text.revealFraction` + `splitText` sub-targets (scJv, x-YTLQ).

  - **`Text.revealFraction`** (0..1): pure count-rounding sugar over the shipped
    `reveal` grapheme count — `count = round(fraction * graphemeCount)`, resolved
    against the SAME grapheme stream and feeding the identical masked-emit path.
    Animatable (`'<id>/revealFraction'`), overrides `reveal` when set; unset (the
    default) is byte-identical to a Text without it, so every existing golden is
    unchanged. Whole-grapheme only — the sub-grapheme clip-wipe/softness is out of
    scope.

  - **`splitText(text, { by: 'word' | 'line' | 'grapheme' })`** on a NEW
    tree-shaken `@glissade/scene/type` subpath: a pure build-time expansion (like
    `each()`) of a Text into a `Group` of positioned, independently addressable
    per-part child Texts (ids `${id}/[i]`) — stagger a word-by-word reveal,
    scatter graphemes, etc. STATIC snapshot of the source's laid-out geometry and
    REPLACE-the-source semantics. Backed by a new `Text.graphemeBoxes()` (the
    per-grapheme analogue of `wordBoxes()`, boundaries matching the draw path).
    ZERO base-embed cost.

- 02968bd: 0.19 pre.5 — splitText part-handle ergonomics + a forgiving `tl.tracks` (no render change; the 262 goldens stay byte-identical — this is API shape + docs):

  - **`SplitPart.id`** (`@glissade/scene/type`). Each part now carries `id` — the child node's registered `${id}/${i}` (the SAME string the child `Text` was constructed with). The advertised kinetic-typography recipe `parts.map((p) => `${p.id}/revealFraction`)` now works verbatim instead of yielding `undefined/revealFraction` (the part shape was previously `{ text, node, line, box }` with no `id`, so the headline split→stagger recipe couldn't bind).
  - **`SplitTextResult.targets(prop)`** — returns the bind-ready ids `[`${id}/0/${prop}`, `${id}/1/${prop}`, …]` in reading order, so the recipe is one line: `tl.stagger(split.targets('revealFraction'), { from: 0, to: 1 }, { each: 0.1 })`.
  - **`tl.tracks` accepts a clip-tier RESULT object** (`@glissade/core`). `tl.tracks(presence(...))` previously threw "{} is not iterable" — you had to pass `.tracks`. It now accepts both a raw `Track[]` and a `{ tracks: Track[] }` result (presence/clip/each/morph all return the object), unwrapping `.tracks` for you.
  - **Docs:** `docs/typewriter.md` shows the `split.targets('revealFraction')` + `part.id` recipe and that `{ measurer }` is required for exact layout; `docs/browser.md` states `renderToDataURL` returns a `Promise<string>` (await it).

### Patch Changes

- fc58403: 0.19: fix `splitText()` part drift when no real text measurer is available
  (o_aLYFFPjFDf). `splitText` snapshots part geometry at build time; with no
  backend measurer injected (split before `setTextMeasurer`, no `{ measurer }`
  passed) it fell back to a rough per-character estimate whose error accumulates
  left-to-right — so a consumer who split before wiring the backend got visibly
  drifted parts, silently.

  `splitText` (and the `Text.wordBoxes`/`graphemeBoxes`/`lineBoxes` it builds on)
  now emit a one-shot dev-warning when they resolve to the estimating fallback,
  naming the fix: pass `{ measurer: backend }` or split after `setTextMeasurer()`/
  `setDefaultMeasurer()`. The estimate is no longer silent. No behavior change when
  a real measurer is in play — exact layout was always available, this surfaces the
  footgun and documents the contract.

- Updated dependencies [bf0d4e8]
- Updated dependencies [02968bd]
  - @glissade/core@0.19.0

## 0.19.0-pre.5

### Minor Changes

- 02968bd: 0.19 pre.5 — splitText part-handle ergonomics + a forgiving `tl.tracks` (no render change; the 262 goldens stay byte-identical — this is API shape + docs):

  - **`SplitPart.id`** (`@glissade/scene/type`). Each part now carries `id` — the child node's registered `${id}/${i}` (the SAME string the child `Text` was constructed with). The advertised kinetic-typography recipe `parts.map((p) => `${p.id}/revealFraction`)` now works verbatim instead of yielding `undefined/revealFraction` (the part shape was previously `{ text, node, line, box }` with no `id`, so the headline split→stagger recipe couldn't bind).
  - **`SplitTextResult.targets(prop)`** — returns the bind-ready ids `[`${id}/0/${prop}`, `${id}/1/${prop}`, …]` in reading order, so the recipe is one line: `tl.stagger(split.targets('revealFraction'), { from: 0, to: 1 }, { each: 0.1 })`.
  - **`tl.tracks` accepts a clip-tier RESULT object** (`@glissade/core`). `tl.tracks(presence(...))` previously threw "{} is not iterable" — you had to pass `.tracks`. It now accepts both a raw `Track[]` and a `{ tracks: Track[] }` result (presence/clip/each/morph all return the object), unwrapping `.tracks` for you.
  - **Docs:** `docs/typewriter.md` shows the `split.targets('revealFraction')` + `part.id` recipe and that `{ measurer }` is required for exact layout; `docs/browser.md` states `renderToDataURL` returns a `Promise<string>` (await it).

### Patch Changes

- Updated dependencies [02968bd]
  - @glissade/core@0.19.0-pre.5

## 0.19.0-pre.4

### Patch Changes

- @glissade/core@0.19.0-pre.4

## 0.19.0-pre.3

### Patch Changes

- fc58403: 0.19: fix `splitText()` part drift when no real text measurer is available
  (o_aLYFFPjFDf). `splitText` snapshots part geometry at build time; with no
  backend measurer injected (split before `setTextMeasurer`, no `{ measurer }`
  passed) it fell back to a rough per-character estimate whose error accumulates
  left-to-right — so a consumer who split before wiring the backend got visibly
  drifted parts, silently.

  `splitText` (and the `Text.wordBoxes`/`graphemeBoxes`/`lineBoxes` it builds on)
  now emit a one-shot dev-warning when they resolve to the estimating fallback,
  naming the fix: pass `{ measurer: backend }` or split after `setTextMeasurer()`/
  `setDefaultMeasurer()`. The estimate is no longer silent. No behavior change when
  a real measurer is in play — exact layout was always available, this surfaces the
  footgun and documents the contract.

  - @glissade/core@0.19.0-pre.3

## 0.19.0-pre.2

### Patch Changes

- @glissade/core@0.19.0-pre.2

## 0.19.0-pre.1

### Minor Changes

- 56eb184: 0.19: kinetic typography — `Text.revealFraction` + `splitText` sub-targets (scJv, x-YTLQ).

  - **`Text.revealFraction`** (0..1): pure count-rounding sugar over the shipped
    `reveal` grapheme count — `count = round(fraction * graphemeCount)`, resolved
    against the SAME grapheme stream and feeding the identical masked-emit path.
    Animatable (`'<id>/revealFraction'`), overrides `reveal` when set; unset (the
    default) is byte-identical to a Text without it, so every existing golden is
    unchanged. Whole-grapheme only — the sub-grapheme clip-wipe/softness is out of
    scope.

  - **`splitText(text, { by: 'word' | 'line' | 'grapheme' })`** on a NEW
    tree-shaken `@glissade/scene/type` subpath: a pure build-time expansion (like
    `each()`) of a Text into a `Group` of positioned, independently addressable
    per-part child Texts (ids `${id}/[i]`) — stagger a word-by-word reveal,
    scatter graphemes, etc. STATIC snapshot of the source's laid-out geometry and
    REPLACE-the-source semantics. Backed by a new `Text.graphemeBoxes()` (the
    per-grapheme analogue of `wordBoxes()`, boundaries matching the draw path).
    ZERO base-embed cost.

### Patch Changes

- @glissade/core@0.19.0-pre.1

## 0.19.0-pre.0

### Minor Changes

- 6124d7f: 0.19: bless controlled/imperative drive mode. Add an `evaluate(scene)` overload
  (no timeline argument) as the first-class entry point for a host that owns the
  clock and the values — drive nodes imperatively with `node.set(...)` between
  frames and render, with no timeline to compile. It evaluates against an empty
  timeline at the scene's current playhead, so imperative sets survive untouched
  into the DisplayList.

  The precedence contract is now documented and regression-tested: a live timeline
  track always overrides `set(...)` on the property it targets (last writer wins),
  per property — so a timeline can own the animated props while the host drives
  the rest by hand. See the new `docs/controlled-drive.md` recipe.

- bf0d4e8: 0.19 builder sugar — three additive, pure build-time slices that compile to the serializable Timeline document (goldens stay byte-identical):

  - **Unknown builder options now throw** (`k-g1zn`). `to` / `fromTo` / `set` / `stagger` validate their options object against a known-key allow-list and throw a `TimelineValidationError` naming the offending key(s) and the method, instead of silently swallowing it. Known keys: `to`/`fromTo` → `duration`, `ease`, `at`, `from`; `set` → `at`; `stagger` spec → `to`, `from`, `duration`, `ease`; `stagger` opts → `each`, `anchor`, `at`. **Mildly breaking:** stray keys that were previously ignored now fail loudly at build time.
  - **Per-target `stagger` spec values** (`ppCUmU`). `StaggerSpec.to` and `.from` now accept a function `(index, count) => value` resolved per target (a runtime `typeof` branch, consistent with `each` and scene `each()`), so a per-target-destination cascade is expressible. A plain value still fans uniformly. Emits N ordinary tweens, byte-identical to hand-authored.
  - **`tl.tracks(tracks)`** (`Isuo8Gxn`) — a fluent bridge for the clip tier. Inject the pre-built `Track[]` returned by `presence`/`clip`/`each`/`morph` straight into the document; they land as ordinary absolute-time track rows via the same finalize→coalesce path `add()` uses for child tracks. Scoped to raw absolute-time tracks (no cursor-offset/rebasing wrapper).

  `@glissade/scene`'s `describe()` manifest is updated in lockstep: the new `tracks` builder method is listed and the `stagger` signature reflects the `to`/`from` function form.

### Patch Changes

- Updated dependencies [bf0d4e8]
  - @glissade/core@0.19.0-pre.0

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

- 3dc7adb: feat(scene,browser): `describe()` construction-completeness — construction props + layout nodes + assets map + negative-space guard

  `glissade.describe()` now describes **construction + animation**, not just
  animation. Two AI-consumer canaries independently converged on the same gap: the
  pre.5 manifest listed only ANIMATABLE props (those from `registerTarget`), so an
  AI could not _construct_ a node from it (no `assetId`, no `fontFamily`, no layout
  nodes). Still PURE INTROSPECTION — every golden is byte-identical, and `describe`
  stays tree-shaken off the base embed path (base embed UNCHANGED at 38.15 kB gz).

  - **Non-animatable construction props** are now in the manifest, flagged
    `{ animatable: false }` with NO `target`:
    - Image/Video `assetId` — `{ type:'string', animatable:false, required:true }`
      (you cannot construct the node without it; the media URL lives in the
      Timeline `assets` map, keyed by this id).
    - Text `fontFamily`/`align`/`anchor` (and `fontWeight`/`fontStyle`/`lineHeight`)
      — construction-only; `fontSize`/`text`/`fill`/`width`/`reveal` stay animatable
      targets.
    - Shape `sketch`/`sketchFill`/`sketchSeed`, Video clip props
      (`at`/`trimStart`/`playbackRate`/`clipDuration`/`sourceFps`), Group/Layout
      `children`, and the shared base-`NodeProps` set (`id`/`blend`/`filters`/
      `anchor`/`cache`).
  - **Layout family** (`Layout`/`Stack`/`Row`/`Column`) are now first-class
    `.nodes` entries, each tagged with `subpath: '@glissade/scene/layout'`. Their
    `width`/`height`/`gap`/`padding` are animatable targets;
    `direction`/`justify`/`align`/`children` are construction.
  - **`createScene`** surfaces the asset manifest shape: media is declared on the
    Timeline document via `timeline({ assets: { <id>: { kind:'image'|'video', url
} } })`, and an Image/Video node's `assetId` names an entry there.
  - **`stagger`** signature shows the non-uniform form:
    `each: number | ((rank, count) => number)`.

  **Negative-space guard** (the manifest's core value — the targets it does NOT
  list): a `{ animatable:false }` prop is never a real track target. A new test
  affirmatively confirms that binding a track to a construction-only prop
  (`<id>/assetId`, `<id>/fontFamily`) is REJECTED by the bind guard, so an
  accidentally-animatable construction prop is caught. A drift guard constructs
  each node from exactly the manifest's construction props (the constructor must
  accept them) and asserts no construction prop name collides with an animatable
  target.

  The richer manifest pushed the single-file `@glissade/browser` convenience
  bundle from 44.48 → 45.09 kB gz; its budget moved 45 → 46 kB (the base embed is
  unaffected — `describe` is not on it).

- 0a8967c: feat(scene): `Row` / `Column` named aliases for `Stack` on `@glissade/scene/layout`

  A named pair reads better than `Stack({ direction })` for the two common cases:

  ```js
  import { Row, Column } from "@glissade/scene/layout";

  const labels = Column({
    gap: 8,
    children: [
      /* … */
    ],
  }); // vertical, left-aligned
  const toolbar = Row({
    gap: 12,
    children: [
      /* … */
    ],
  }); // horizontal
  ```

  Trivial aliases that pin the direction — `Row(props)` is identical to
  `Stack({ ...props, direction: 'row' })`, `Column(props)` to `direction: 'column'`.
  `direction` is omitted from their prop type (it's already fixed). They inherit
  Stack's `align:'start'` default and Layout's pure, memoized resolve. Only on the
  `/layout` entry — Yoga stays off the base embed and browser IIFE (same rule as
  `Stack`).

- 8b88d27: feat(scene): `Stack` — a discoverable factory alias over the Yoga `Layout` node

  `Stack(props)` is a thin convenience on the already-shipped `@glissade/scene/layout`
  entry that constructs a `Layout` with stack-ergonomic defaults — NOT a new class and
  NOT new signals, so it inherits Layout's memoized, pure, dependency-tracked resolve
  verbatim. A `Stack(props)` and the equivalent hand-written `Layout({...})` produce
  identical child positions.

  Defaults that diverge from `Layout` (everything else passes through):

  - `direction` defaults to `'column'` (the common vertical stack).
  - `align` defaults to `'start'` — a true left edge for a label column — vs Layout's
    `'center'`.

  Yoga stays on the separately-budgeted `@glissade/scene/layout` entry; `Stack` adds no
  bytes to the base embed. New `docs/layout.md` surfaces the layout entry, the
  `await loadYogaLayoutEngine()` requirement, and a tree-shakeable subpath map
  (`@glissade/scene/layout`, `@glissade/scene/path`, `@glissade/core/clips`).

### Patch Changes

- Updated dependencies [746b3d0]
- Updated dependencies [0a8967c]
- Updated dependencies [7f815f9]
- Updated dependencies [d3d9206]
- Updated dependencies [35968a1]
- Updated dependencies [e3a2f6a]
  - @glissade/core@0.18.0

## 0.18.0-pre.6

### Minor Changes

- 3dc7adb: feat(scene,browser): `describe()` construction-completeness — construction props + layout nodes + assets map + negative-space guard

  `glissade.describe()` now describes **construction + animation**, not just
  animation. Two AI-consumer canaries independently converged on the same gap: the
  pre.5 manifest listed only ANIMATABLE props (those from `registerTarget`), so an
  AI could not _construct_ a node from it (no `assetId`, no `fontFamily`, no layout
  nodes). Still PURE INTROSPECTION — every golden is byte-identical, and `describe`
  stays tree-shaken off the base embed path (base embed UNCHANGED at 38.15 kB gz).

  - **Non-animatable construction props** are now in the manifest, flagged
    `{ animatable: false }` with NO `target`:
    - Image/Video `assetId` — `{ type:'string', animatable:false, required:true }`
      (you cannot construct the node without it; the media URL lives in the
      Timeline `assets` map, keyed by this id).
    - Text `fontFamily`/`align`/`anchor` (and `fontWeight`/`fontStyle`/`lineHeight`)
      — construction-only; `fontSize`/`text`/`fill`/`width`/`reveal` stay animatable
      targets.
    - Shape `sketch`/`sketchFill`/`sketchSeed`, Video clip props
      (`at`/`trimStart`/`playbackRate`/`clipDuration`/`sourceFps`), Group/Layout
      `children`, and the shared base-`NodeProps` set (`id`/`blend`/`filters`/
      `anchor`/`cache`).
  - **Layout family** (`Layout`/`Stack`/`Row`/`Column`) are now first-class
    `.nodes` entries, each tagged with `subpath: '@glissade/scene/layout'`. Their
    `width`/`height`/`gap`/`padding` are animatable targets;
    `direction`/`justify`/`align`/`children` are construction.
  - **`createScene`** surfaces the asset manifest shape: media is declared on the
    Timeline document via `timeline({ assets: { <id>: { kind:'image'|'video', url
} } })`, and an Image/Video node's `assetId` names an entry there.
  - **`stagger`** signature shows the non-uniform form:
    `each: number | ((rank, count) => number)`.

  **Negative-space guard** (the manifest's core value — the targets it does NOT
  list): a `{ animatable:false }` prop is never a real track target. A new test
  affirmatively confirms that binding a track to a construction-only prop
  (`<id>/assetId`, `<id>/fontFamily`) is REJECTED by the bind guard, so an
  accidentally-animatable construction prop is caught. A drift guard constructs
  each node from exactly the manifest's construction props (the constructor must
  accept them) and asserts no construction prop name collides with an animatable
  target.

  The richer manifest pushed the single-file `@glissade/browser` convenience
  bundle from 44.48 → 45.09 kB gz; its budget moved 45 → 46 kB (the base embed is
  unaffected — `describe` is not on it).

### Patch Changes

- @glissade/core@0.18.0-pre.6

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

### Patch Changes

- Updated dependencies [746b3d0]
  - @glissade/core@0.18.0-pre.5

## 0.18.0-pre.4

### Minor Changes

- 0a8967c: feat(scene): `Row` / `Column` named aliases for `Stack` on `@glissade/scene/layout`

  A named pair reads better than `Stack({ direction })` for the two common cases:

  ```js
  import { Row, Column } from "@glissade/scene/layout";

  const labels = Column({
    gap: 8,
    children: [
      /* … */
    ],
  }); // vertical, left-aligned
  const toolbar = Row({
    gap: 12,
    children: [
      /* … */
    ],
  }); // horizontal
  ```

  Trivial aliases that pin the direction — `Row(props)` is identical to
  `Stack({ ...props, direction: 'row' })`, `Column(props)` to `direction: 'column'`.
  `direction` is omitted from their prop type (it's already fixed). They inherit
  Stack's `align:'start'` default and Layout's pure, memoized resolve. Only on the
  `/layout` entry — Yoga stays off the base embed and browser IIFE (same rule as
  `Stack`).

### Patch Changes

- Updated dependencies [0a8967c]
- Updated dependencies [35968a1]
  - @glissade/core@0.18.0-pre.4

## 0.18.0-pre.3

### Patch Changes

- Updated dependencies [7f815f9]
  - @glissade/core@0.18.0-pre.3

## 0.18.0-pre.2

### Minor Changes

- 8b88d27: feat(scene): `Stack` — a discoverable factory alias over the Yoga `Layout` node

  `Stack(props)` is a thin convenience on the already-shipped `@glissade/scene/layout`
  entry that constructs a `Layout` with stack-ergonomic defaults — NOT a new class and
  NOT new signals, so it inherits Layout's memoized, pure, dependency-tracked resolve
  verbatim. A `Stack(props)` and the equivalent hand-written `Layout({...})` produce
  identical child positions.

  Defaults that diverge from `Layout` (everything else passes through):

  - `direction` defaults to `'column'` (the common vertical stack).
  - `align` defaults to `'start'` — a true left edge for a label column — vs Layout's
    `'center'`.

  Yoga stays on the separately-budgeted `@glissade/scene/layout` entry; `Stack` adds no
  bytes to the base embed. New `docs/layout.md` surfaces the layout entry, the
  `await loadYogaLayoutEngine()` requirement, and a tree-shakeable subpath map
  (`@glissade/scene/layout`, `@glissade/scene/path`, `@glissade/core/clips`).

### Patch Changes

- @glissade/core@0.18.0-pre.2

## 0.18.0-pre.1

### Patch Changes

- Updated dependencies [d3d9206]
  - @glissade/core@0.18.0-pre.1

## 0.18.0-pre.0

### Patch Changes

- Updated dependencies [e3a2f6a]
  - @glissade/core@0.18.0-pre.0

## 0.17.1

### Patch Changes

- 3731dd4: `Path.data` now throws a clear construction-time error on a string (was a render-time crash — `TypeError … s.v.length`, the contour walk dereferencing `.v` on a string char): `Path.data expects PathValue (PathContour[]); for an SVG path 'd' string, parse it with pathFromSvg(d) from "@glissade/scene/path" (or window.glissade.pathFromSvg in the browser bundle)`.

  SVG `d` strings parse via the new `pathFromSvg` / `parseSvgPathData` on the **tree-shakeable `@glissade/scene/path` subpath** (mirrors `@glissade/scene/layout`), kept OFF the base scene index — and thus off the base embed path. An embed that never parses an SVG string no longer pays for the parser, bringing the base embed comfortably back under the 38 kB budget. `pathFromSvg(d)` = `pathFromSegs(parseSvgPathData(d))`; use it then build the node: `new Path({ data: pathFromSvg('M0 0 …') })`. The lean parser still covers `M/L/H/V/C/Q/Z` (absolute + relative) with no `@glissade/svg` dependency. The single-file `@glissade/browser` bundle re-exports the subpath, so `window.glissade.pathFromSvg` / `window.glissade.parseSvgPathData` are present there. Existing `PathContour[]` `data` is unchanged.

  - @glissade/core@0.17.1

## 0.17.1-pre.0

### Patch Changes

- 3731dd4: `Path({ data })` now accepts a raw SVG `d` STRING (parsed at construction to a `PathValue` via a lean in-package `M/L/H/V/C/Q/Z` parser — no `@glissade/svg` dependency, so the enforced dependency direction is preserved). Previously a `d` string built fine but threw `TypeError … s.v.length` at render because the contour walk dereferenced `.v` on a string char. A non-string, non-`PathValue` `data` (e.g. a number) now throws a clear construction-time error (`Path.data expects PathValue (PathContour[]) or an SVG path string; got <type>`) instead of crashing at render. Existing `PathContour[]` `data` is unchanged. Exposes `parseSvgPathData` and `coercePathData`.
  - @glissade/core@0.17.1-pre.0

## 0.17.0

### Patch Changes

- @glissade/core@0.17.0

## 0.17.0-pre.0

### Patch Changes

- @glissade/core@0.17.0-pre.0

## 0.16.0

### Patch Changes

- @glissade/core@0.16.0

## 0.16.0-pre.1

### Patch Changes

- @glissade/core@0.16.0-pre.1

## 0.16.0-pre.0

### Patch Changes

- @glissade/core@0.16.0-pre.0

## 0.15.0

### Patch Changes

- c87e88b: 0.15 guard-repr-compat: generalize the bind guard from strict id-equality to single-hop representation-compatibility, and retire the vec2-arc array-tag hack.

  `ValueType` gains an optional `repr?: ValueTypeId` — the built-in type a custom type is representationally compatible with (a `cents` type sets `repr: 'number'`, `vec2-arc` sets `repr: 'vec2'`). The bind-time guard (`binding.ts`) now resolves both the track's value-type and the target's `expects` to their repr (single-hop; an id with no `repr` resolves to itself) and accepts when the reprs match. This reopens the documented extension door: a custom `number`-repr track binds to a `number` prop without throwing.

  The 0.14 `['vec2','vec2-arc']` array-tags on `Node.position`/`Node.scale` and `tokenHighlight` `offset` are reverted to plain `'vec2'` — repr-compat handles vec2-arc now. `Shape.fill`'s `['color','paint']` stays: that is genuine polymorphism (distinct reprs). Bind-time only — all goldens stay byte-identical.

- Updated dependencies [c87e88b]
- Updated dependencies [53030d0]
  - @glissade/core@0.15.0

## 0.15.0-pre.1

### Patch Changes

- @glissade/core@0.15.0-pre.1

## 0.15.0-pre.0

### Patch Changes

- c87e88b: 0.15 guard-repr-compat: generalize the bind guard from strict id-equality to single-hop representation-compatibility, and retire the vec2-arc array-tag hack.

  `ValueType` gains an optional `repr?: ValueTypeId` — the built-in type a custom type is representationally compatible with (a `cents` type sets `repr: 'number'`, `vec2-arc` sets `repr: 'vec2'`). The bind-time guard (`binding.ts`) now resolves both the track's value-type and the target's `expects` to their repr (single-hop; an id with no `repr` resolves to itself) and accepts when the reprs match. This reopens the documented extension door: a custom `number`-repr track binds to a `number` prop without throwing.

  The 0.14 `['vec2','vec2-arc']` array-tags on `Node.position`/`Node.scale` and `tokenHighlight` `offset` are reverted to plain `'vec2'` — repr-compat handles vec2-arc now. `Shape.fill`'s `['color','paint']` stays: that is genuine polymorphism (distinct reprs). Bind-time only — all goldens stay byte-identical.

- Updated dependencies [c87e88b]
- Updated dependencies [53030d0]
  - @glissade/core@0.15.0-pre.0

## 0.14.0

### Minor Changes

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

- 3281514: 0.14 DX bundle — three render-surface paper-cuts:

  - **Clearer undeclared-asset error.** `gs render` now pre-validates every Image/Video `assetId` against `timeline.assets` before evaluation, throwing an `UnknownAssetError` that names the real mistake — an Image/Video needs an `assetId` + a `timeline.assets` entry `{ kind, url }`, not a `src` URL (§2.5: remote URLs are not fetched at render) — instead of the downstream `asset 'undefined' not ready` ColdAssetError. (Image/Video carry a new `static assetKind` marker so the walk stays robust; the validation lives in the CLI, off the embed path.)
  - **No false font-validation warning for GlobalFonts/system families.** `gs render` builds an `osFamilies` set from `GlobalFonts.families` and exempts those families from the §3.6 unregistered-family check, so a family registered via `GlobalFonts.registerFromPath` (or OS-installed) no longer warns as "unregistered". A genuinely-unregistered family still warns.
  - **`each()` jitter decorrelation.** The per-index motion-jitter RNG is now salted (`mix(mix(baseSeed, i), JITTER_SALT)`) so it decorrelates from `ctx.rng` (both previously derived from the same `mix(baseSeed, i)` stream). Determinism-neutral; no corpus golden uses each-jitter, so all golden frames stay byte-identical.

- Updated dependencies [f13486d]
- Updated dependencies [1795d1c]
- Updated dependencies [7456761]
  - @glissade/core@0.14.0

## 0.14.0-pre.1

### Patch Changes

- f13486d: 0.14 canary fixes (1, 2, 5) — bind-time guard correctness + the orphaned-message-key check. Three mount-time / build-time fixes; no `evaluate()` change, so all 262 goldens stay byte-identical.

  - **FIX 1 (BLOCKER) — vec2-arc false-throws on every vec2 prop.** The public `vec2-arc` value type samples to a valid `Vec2`, but every vec2 `registerTarget` site tagged the scalar `'vec2'`, so binding a `vec2-arc` track to `position`/`scale`/Highlight `offset` hard-threw `BindTypeMismatchError` at mount. Those targets are now tagged polymorphically `['vec2', 'vec2-arc']` (`@glissade/scene`: `node.ts` position/scale, `tokenHighlight.ts` offset). A `vec2-arc` track binds and samples to a finite `Vec2`.

  - **FIX 2 (BLOCKER) — `registerTarget`'s required 3rd arg broke the public Custom-node seam + 0.13 back-compat.** `registerTarget(path, sig, expects)` made `expects` required, so external `Custom`/`Node` subclasses (and prebuilt 0.13 custom nodes calling the 2-arg form) hit `binding.ts` with `expects === undefined` → every track on a custom prop hard-threw. `expects` is now OPTIONAL (no default — left `undefined`), and `bindTimeline`'s guard skips an UNtagged target (`expects === undefined || …includes(got) …`). An untagged custom-node prop binds ANY track (0.13 had no guard); built-in tagged targets keep their guard. `BindTarget.expects` / `BindablePropTarget.expects` widen to `… | undefined`.

  - **FIX 5 (HIGH) — stale/typo'd `messages.<locale>.json` key silently dropped.** `localize()` consumed table entries by membership only, so a key matching no node-id (and no `t()` id) silently localized nothing — that node shipped base text, no error. `localize` now collects the node-ids it consumes, folds in the `t()`-consumed ids (`getConsumedMessageIds()`, reset by `setMessageTable`, passed via the new `LocalizeOptions.consumedIds`), and throws a `LocalizationError` naming every orphaned key. A fully-matched table is silent.

- Updated dependencies [f13486d]
  - @glissade/core@0.14.0-pre.1

## 0.14.0-pre.0

### Minor Changes

- 7456761: Add the 0.14 scalar→vec2 **bind-time type guard** (§2.2) — the runtime correctness floor for the silent-NaN class. A scalar `number` track bound to a `vec2` prop (e.g. authoring `scale: 0.8` instead of `[0.8, 0.8]`) used to silently sample to `[undefined, undefined]` → a NaN matrix → the node and its whole subtree vanishing, with no error. Any track-type ↔ target-shape mismatch (a `number` track on a `paint`/`path` prop, a `color` on a `number`, …) was the same silent failure.

  Now `bindTimeline` (`@glissade/core`) checks each compiled track's `type` against the target's declared accepted type and hard-throws a typed `BindTypeMismatchError` — naming the target, the got (track) type, the expected (prop) type, and a fix hint (`scale.x`/`scale.y` for the vec2 case). This matches the existing "unbound tracks are build errors" precedent (`UnboundTargetError`): a mismatched bind is a build error, not a silent no-op.

  Mechanism (additive, golden-safe — a _correct_ bind is unchanged, so all 252 goldens stay byte-identical):

  - `BindTarget` (core) gains `readonly expects: ValueTypeId | readonly ValueTypeId[]` (an array for a polymorphic prop — a Shape `fill` accepts both `color` and `paint`). New exports: `BindTypeMismatchError`, the `Vec2Component` type.
  - `vec2Signal` tags its compound (`'vec2'`) and its `.x`/`.y` sub-signals (`'number'`).
  - `registerTarget` (`@glissade/scene`) takes the prop's accepted type and stamps it; every node prop is tagged (`position`/`scale` vec2; their `.x`/`.y` + `opacity`/`rotation`/`zIndex`/`width`/`height`/`cornerRadius`/`radius`/`strokeWidth`/`reveal`/`fontSize`/Layout/shader uniforms number; `fill` color|paint, `stroke`/Text-`fill`/Highlight color, `d` path, `text` string).

  The 0.13 clip stdlib `popIn`/`pulse` already author vec2 `scale` keys, so they pass the new guard unchanged. The scalar→pair _broadcast_ (lifting `0.8` → `[0.8, 0.8]`) is deliberately deferred to 0.15 — it would mask the wrong-prop mistakes this guard is meant to catch.

### Patch Changes

- 3281514: 0.14 DX bundle — three render-surface paper-cuts:

  - **Clearer undeclared-asset error.** `gs render` now pre-validates every Image/Video `assetId` against `timeline.assets` before evaluation, throwing an `UnknownAssetError` that names the real mistake — an Image/Video needs an `assetId` + a `timeline.assets` entry `{ kind, url }`, not a `src` URL (§2.5: remote URLs are not fetched at render) — instead of the downstream `asset 'undefined' not ready` ColdAssetError. (Image/Video carry a new `static assetKind` marker so the walk stays robust; the validation lives in the CLI, off the embed path.)
  - **No false font-validation warning for GlobalFonts/system families.** `gs render` builds an `osFamilies` set from `GlobalFonts.families` and exempts those families from the §3.6 unregistered-family check, so a family registered via `GlobalFonts.registerFromPath` (or OS-installed) no longer warns as "unregistered". A genuinely-unregistered family still warns.
  - **`each()` jitter decorrelation.** The per-index motion-jitter RNG is now salted (`mix(mix(baseSeed, i), JITTER_SALT)`) so it decorrelates from `ctx.rng` (both previously derived from the same `mix(baseSeed, i)` stream). Determinism-neutral; no corpus golden uses each-jitter, so all golden frames stay byte-identical.

- Updated dependencies [1795d1c]
- Updated dependencies [7456761]
  - @glissade/core@0.14.0-pre.0

## 0.13.0

### Minor Changes

- 88ba5bc: Add `each()` (0.13) — deterministic parametric instancing in `@glissade/scene` (base entry). Pure build-time sugar: generate N scene nodes from a factory, lay them out in aspect-fraction space (`row`/`column`/`grid`/`ring` discriminated-union layouts, or an `(i, n) => [fx, fy]` escape hatch), and optionally fan a motion `clip` across the clones with `stagger` + `distribute` (`'delay'`/`'from-center'`/`'from-edges'`) + seeded `jitter`. Returns `{ node, children, tracks, end, places }`.

  Each clone is stamped with a stable `${id}/${i}` id (a factory-set conflicting id is rejected, an unset one is filled), wrapped in a `Group({ id })`, and its prop signals become ordinary `clip.apply` track targets — so every `--workers` export shard reconstructs the identical id set and the emitted `Track[]` are byte-indistinguishable from hand-authored ones (a golden holds by construction). Per-clone RNG is the seeded `random(mix(seed ?? hash(id), i))` from core, never `Math.random`, so jitter is reproducible and clean under `withDeterminismGuards`. The clip runtime is imported TYPE-ONLY, so `each` adds no clip bytes to the embed.

  Also: the scene target resolver now splits a track target on its LAST `/` (was the first), so node ids that contain slashes — the `${id}/${i}` ids `each` mints — resolve their prop suffix correctly. Single-slash targets are unaffected (no registered prop path contains a slash), so existing scenes are byte-identical.

### Patch Changes

- d1e81b7: 0.13 canary fix: the scene `resolveTarget` now disambiguates a track target's node id from its prop path by the LONGEST REGISTERED NODE-ID PREFIX, rather than splitting on the last (or first) `/`. Both an `each()` clone id (`card/3`) and a `TokenHighlight` range prop path (`money/fill`) carry slashes, so any fixed split mis-resolved one of them: a last-slash split threw `UnboundTargetError` on a normal mount binding a `TokenHighlight` range prop (`hl/money/fill` → nonexistent node `hl/money`), while a first-slash split silently animated the wrong node. The resolver now walks slash boundaries from the longest candidate node id down, binding the first prefix that is an actually-registered node and treating the remainder as the prop path. `card/3/opacity` → node `card/3` + prop `opacity`; `hl/money/fill` → node `hl` + prop `money/fill`.
- 707d228: displayDiff: the shared collapse-replacer now maps `NaN`/`Infinity`/`-Infinity`
  to DISTINCT string sentinels instead of letting `JSON.stringify` collapse all
  three to `null`. Two DisplayLists differing only in WHICH non-finite value
  reaches a draw field previously collided the §3.5 raster cacheKey (stale raster
  - a `cacheColdAudit` false-OK); they are now distinguished. FINITE-number
    serialization is byte-identical — the pinned cacheKey is unchanged.
- Updated dependencies [d1e81b7]
- Updated dependencies [1995ee8]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
- Updated dependencies [8bec181]
- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0

## 0.13.0-pre.3

### Patch Changes

- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0-pre.3

## 0.13.0-pre.2

### Patch Changes

- Updated dependencies [8bec181]
  - @glissade/core@0.13.0-pre.2

## 0.13.0-pre.1

### Patch Changes

- d1e81b7: 0.13 canary fix: the scene `resolveTarget` now disambiguates a track target's node id from its prop path by the LONGEST REGISTERED NODE-ID PREFIX, rather than splitting on the last (or first) `/`. Both an `each()` clone id (`card/3`) and a `TokenHighlight` range prop path (`money/fill`) carry slashes, so any fixed split mis-resolved one of them: a last-slash split threw `UnboundTargetError` on a normal mount binding a `TokenHighlight` range prop (`hl/money/fill` → nonexistent node `hl/money`), while a first-slash split silently animated the wrong node. The resolver now walks slash boundaries from the longest candidate node id down, binding the first prefix that is an actually-registered node and treating the remainder as the prop path. `card/3/opacity` → node `card/3` + prop `opacity`; `hl/money/fill` → node `hl` + prop `money/fill`.
- Updated dependencies [d1e81b7]
  - @glissade/core@0.13.0-pre.1

## 0.13.0-pre.0

### Minor Changes

- 88ba5bc: Add `each()` (0.13) — deterministic parametric instancing in `@glissade/scene` (base entry). Pure build-time sugar: generate N scene nodes from a factory, lay them out in aspect-fraction space (`row`/`column`/`grid`/`ring` discriminated-union layouts, or an `(i, n) => [fx, fy]` escape hatch), and optionally fan a motion `clip` across the clones with `stagger` + `distribute` (`'delay'`/`'from-center'`/`'from-edges'`) + seeded `jitter`. Returns `{ node, children, tracks, end, places }`.

  Each clone is stamped with a stable `${id}/${i}` id (a factory-set conflicting id is rejected, an unset one is filled), wrapped in a `Group({ id })`, and its prop signals become ordinary `clip.apply` track targets — so every `--workers` export shard reconstructs the identical id set and the emitted `Track[]` are byte-indistinguishable from hand-authored ones (a golden holds by construction). Per-clone RNG is the seeded `random(mix(seed ?? hash(id), i))` from core, never `Math.random`, so jitter is reproducible and clean under `withDeterminismGuards`. The clip runtime is imported TYPE-ONLY, so `each` adds no clip bytes to the embed.

  Also: the scene target resolver now splits a track target on its LAST `/` (was the first), so node ids that contain slashes — the `${id}/${i}` ids `each` mints — resolve their prop suffix correctly. Single-slash targets are unaffected (no registered prop path contains a slash), so existing scenes are byte-identical.

### Patch Changes

- 707d228: displayDiff: the shared collapse-replacer now maps `NaN`/`Infinity`/`-Infinity`
  to DISTINCT string sentinels instead of letting `JSON.stringify` collapse all
  three to `null`. Two DisplayLists differing only in WHICH non-finite value
  reaches a draw field previously collided the §3.5 raster cacheKey (stale raster
  - a `cacheColdAudit` false-OK); they are now distinguished. FINITE-number
    serialization is byte-identical — the pinned cacheKey is unchanged.
- Updated dependencies [1995ee8]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
  - @glissade/core@0.13.0-pre.0

## 0.12.1

### Patch Changes

- Updated dependencies [56fa1f3]
  - @glissade/core@0.12.1

## 0.12.0

### Minor Changes

- 796b568: feat(diff): `gs diff` — DisplayList diff + serializable IR snapshots (gs-diff)

  The determinism-diagnostic substrate (§3.3). Operating on the already-pure
  DisplayList IR (no raster, no audio), it turns an opaque golden-hash mismatch
  into a command-level explanation.

  - `@glissade/scene`: `diffDisplayLists(a, b): DisplayDiff` — index-aligned,
    positional per-command deltas (changed fields named; `add`/`remove` for
    trailing commands). `serializeDisplayList`/`parseDisplaySnapshot` produce a
    committable `.dl.json` baseline, registered as the third versioned
    interchange schema (`dlSnapshotVersion`, §7.4). The byte-preserving
    collapse-replacer that backs the §3.5 raster cacheKey is extracted to a
    single shared function (a pinned-cacheKey regression guard proves the
    extraction did not move a byte). All diff/snapshot surface tree-shakes out of
    the embed bundle.
  - `@glissade/cli`: a `gs diff <scene> --at <t> --against <baseline.dl.json|.png>`
    subcommand — prints a command tree and exits non-zero on divergence
    (`--against .png` is a raw `encodePng` byte-compare only). `--snapshot <out>`
    writes a `.dl.json` baseline.

  The golden harness's `assertFrameMatches` now attaches a DisplayList diff (from
  a fresh-scene cold re-evaluation) to the thrown error, so a purity break names
  the exact op/field that moved.

  KNOWN v1 cliff: the positional alignment cascades on a leading insert/remove;
  LCS/Myers alignment is deferred.

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

- 2a520c5: feat(verify): `gs verify-determinism` — the cross-shard/backend divergence locator (§5.5/§5.6)

  A new CLI subcommand that VERIFIES the frame-level determinism tenet a
  sharded / cross-machine render leans on — without perturbing it. It emits a
  `frames.manifest` (per-frame `sha256` of the raw RGBA from `backend.readPixels()`
  — NOT `encodePng`, sidestepping PNG-encoder nondeterminism; `node:crypto`
  sha256, no new hash dep — plus per-node DisplayList sub-hashes reusing the
  shipped `serializeDisplayList`), and bisects the first divergence to a
  `(frame, node, op)`.

  - `gs verify-determinism <scene> [--shards N] [--against <manifest>] [--range a..b] [--bisect] [--emit <p>]`.
  - `--shards N` diffs a linear render vs an N-shard render of the same range
    (each shard re-runs the module from scratch, exactly as `gs render --workers`
    does); `--against` diffs a committed / other-machine manifest; `--bisect`
    drills the divergent node via `diffDisplayLists` + `formatDisplayDiff`.
  - Evaluates under the SAME `withDeterminismGuards('throw')` as `gs render`, so a
    clock/random/timer call in scene code throws DURING verification.
  - HONEST SCOPE (§5.5 item 6): byte-equality is Skia↔Skia (cross-machine/shard)
    ONLY. The manifest stamps its `backend`, and an `--against` cross-backend
    byte-compare is REJECTED with a clear error — browser↔Skia is perceptual
    (SSIM) parity, never byte-identity. The full-frame RGBA hash is the byte
    authority; the per-node sub-hashes only LOCALIZE where a frame diverged.

  `@glissade/scene`: `CacheColdResult` gains an additive `delta?: CommandDelta`
  (the WHOLE `CommandDelta` of the first divergent leaf node's isolated emit, not
  a flattened op/index — a multi-field change isn't lost). The existing
  `{ ok, node? }` callers are unaffected.

### Patch Changes

- Updated dependencies [78393f1]
- Updated dependencies [2850386]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
  - @glissade/core@0.12.0

## 0.12.0-pre.1

### Patch Changes

- Updated dependencies [78393f1]
  - @glissade/core@0.12.0-pre.1

## 0.12.0-pre.0

### Minor Changes

- 796b568: feat(diff): `gs diff` — DisplayList diff + serializable IR snapshots (gs-diff)

  The determinism-diagnostic substrate (§3.3). Operating on the already-pure
  DisplayList IR (no raster, no audio), it turns an opaque golden-hash mismatch
  into a command-level explanation.

  - `@glissade/scene`: `diffDisplayLists(a, b): DisplayDiff` — index-aligned,
    positional per-command deltas (changed fields named; `add`/`remove` for
    trailing commands). `serializeDisplayList`/`parseDisplaySnapshot` produce a
    committable `.dl.json` baseline, registered as the third versioned
    interchange schema (`dlSnapshotVersion`, §7.4). The byte-preserving
    collapse-replacer that backs the §3.5 raster cacheKey is extracted to a
    single shared function (a pinned-cacheKey regression guard proves the
    extraction did not move a byte). All diff/snapshot surface tree-shakes out of
    the embed bundle.
  - `@glissade/cli`: a `gs diff <scene> --at <t> --against <baseline.dl.json|.png>`
    subcommand — prints a command tree and exits non-zero on divergence
    (`--against .png` is a raw `encodePng` byte-compare only). `--snapshot <out>`
    writes a `.dl.json` baseline.

  The golden harness's `assertFrameMatches` now attaches a DisplayList diff (from
  a fresh-scene cold re-evaluation) to the thrown error, so a purity break names
  the exact op/field that moved.

  KNOWN v1 cliff: the positional alignment cascades on a leading insert/remove;
  LCS/Myers alignment is deferred.

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

- 2a520c5: feat(verify): `gs verify-determinism` — the cross-shard/backend divergence locator (§5.5/§5.6)

  A new CLI subcommand that VERIFIES the frame-level determinism tenet a
  sharded / cross-machine render leans on — without perturbing it. It emits a
  `frames.manifest` (per-frame `sha256` of the raw RGBA from `backend.readPixels()`
  — NOT `encodePng`, sidestepping PNG-encoder nondeterminism; `node:crypto`
  sha256, no new hash dep — plus per-node DisplayList sub-hashes reusing the
  shipped `serializeDisplayList`), and bisects the first divergence to a
  `(frame, node, op)`.

  - `gs verify-determinism <scene> [--shards N] [--against <manifest>] [--range a..b] [--bisect] [--emit <p>]`.
  - `--shards N` diffs a linear render vs an N-shard render of the same range
    (each shard re-runs the module from scratch, exactly as `gs render --workers`
    does); `--against` diffs a committed / other-machine manifest; `--bisect`
    drills the divergent node via `diffDisplayLists` + `formatDisplayDiff`.
  - Evaluates under the SAME `withDeterminismGuards('throw')` as `gs render`, so a
    clock/random/timer call in scene code throws DURING verification.
  - HONEST SCOPE (§5.5 item 6): byte-equality is Skia↔Skia (cross-machine/shard)
    ONLY. The manifest stamps its `backend`, and an `--against` cross-backend
    byte-compare is REJECTED with a clear error — browser↔Skia is perceptual
    (SSIM) parity, never byte-identity. The full-frame RGBA hash is the byte
    authority; the per-node sub-hashes only LOCALIZE where a frame diverged.

  `@glissade/scene`: `CacheColdResult` gains an additive `delta?: CommandDelta`
  (the WHOLE `CommandDelta` of the first divergent leaf node's isolated emit, not
  a flattened op/index — a multi-field change isn't lost). The existing
  `{ ok, node? }` callers are unaffected.

### Patch Changes

- Updated dependencies [2850386]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
  - @glissade/core@0.12.0-pre.0

## 0.11.0

### Patch Changes

- c7c6660: Publishing & release readiness: add per-package `engines.node >=20.19` to every publishable package, and introduce the unscoped `glissade` umbrella package — a one-import realtime embed surface that re-exports `@glissade/core`, `@glissade/scene`, and `@glissade/player` (and only those, per the §7.1 import direction). Also documents the `0.x` lockstep breaking-change policy in a root `BREAKING.md`.
- 230b7ad: docs: reserve a comment-only `glyphRun` op seam in the `DrawCommand` union (§3 text shaping) for a future harfbuzzjs shaper, deferred to post-1.0. No type or runtime surface is added.
- f742c55: Lock the closed §3.1 node taxonomy and add the named `Custom` extension point.

  - Add `export abstract class Custom extends Node {}` — the documented base authors subclass to emit IR commands (the ninth taxonomy member).
  - Add the frozen `NODE_TAXONOMY` tuple (`['Group','Rect','Circle','Path','Text','Image','Video','Layout','Custom']`) and the `NodeTypeName` type — an enumerable lock on the "small, closed set" guarantee.
  - Export `Image` as an alias of `ImageNode` so the public name matches DESIGN §3.1 (`ImageNode` remains exported for back-compat).

  Additive only — no node behavior changes; goldens are byte-identical.

- Updated dependencies [c7c6660]
  - @glissade/core@0.11.0

## 0.11.0-pre.1

### Patch Changes

- @glissade/core@0.11.0-pre.1

## 0.11.0-pre.0

### Patch Changes

- c7c6660: Publishing & release readiness: add per-package `engines.node >=20.19` to every publishable package, and introduce the unscoped `glissade` umbrella package — a one-import realtime embed surface that re-exports `@glissade/core`, `@glissade/scene`, and `@glissade/player` (and only those, per the §7.1 import direction). Also documents the `0.x` lockstep breaking-change policy in a root `BREAKING.md`.
- 230b7ad: docs: reserve a comment-only `glyphRun` op seam in the `DrawCommand` union (§3 text shaping) for a future harfbuzzjs shaper, deferred to post-1.0. No type or runtime surface is added.
- f742c55: Lock the closed §3.1 node taxonomy and add the named `Custom` extension point.

  - Add `export abstract class Custom extends Node {}` — the documented base authors subclass to emit IR commands (the ninth taxonomy member).
  - Add the frozen `NODE_TAXONOMY` tuple (`['Group','Rect','Circle','Path','Text','Image','Video','Layout','Custom']`) and the `NodeTypeName` type — an enumerable lock on the "small, closed set" guarantee.
  - Export `Image` as an alias of `ImageNode` so the public name matches DESIGN §3.1 (`ImageNode` remains exported for back-compat).

  Additive only — no node behavior changes; goldens are byte-identical.

- Updated dependencies [c7c6660]
  - @glissade/core@0.11.0-pre.0

## 0.10.1

### Patch Changes

- f9f7ebe: Gradient `Paint` gains a per-gradient `interpolation` mode: `'linear'` (the canvas-native ramp, default — byte-identical), `'smooth'` (a smoothstep S-curve, no Mach-banding at stops), or `'gaussian'` (a soft gaussian shoulder that melts like a wide blur with 2–3 stops). `smooth`/`gaussian` densify and oklab-interpolate the stops at raster, so a soft-light fill reads as smooth as a Gaussian-blur filter with no offscreen composite. Deterministic + golden-byte-exact; `linear`/no-mode gradients are unchanged.
- 7482378: **Gradient `Paint` — animatable linear & radial gradient fills.** `Paint` is now a core animatable document value (`{ kind: 'color' | 'linear' | 'radial' }`), and shape `fill` accepts a `Paint` as well as a color string. Gradients render as a fill with no offscreen composite and no filter — the cheap, soft-light alternative to a Gaussian blur (≈100× faster per frame in a soft-light-heavy scene). Geometry (`from`/`to`, `center`/`radius`) defaults to the shape's path bounds when omitted.

  Gradients animate two ways: **signal-driven** (a computed `fill: () => ({ kind:'radial', center:[x(), y()], ... })` re-evaluates each frame) and **keyframe-driven** via the new `paint` value type — `tl.to('rect/fill', gradient, { ease })` interpolates stops (offset + oklab color) and geometry; a solid color lifts to a uniform gradient to meet a gradient; a mismatched kind/stop-count snaps with a dev warning. Deterministic and golden-byte-exact. Existing color fills are unchanged.

- Updated dependencies [f9f7ebe]
- Updated dependencies [7482378]
  - @glissade/core@0.10.1

## 0.10.1-pre.1

### Patch Changes

- f9f7ebe: Gradient `Paint` gains a per-gradient `interpolation` mode: `'linear'` (the canvas-native ramp, default — byte-identical), `'smooth'` (a smoothstep S-curve, no Mach-banding at stops), or `'gaussian'` (a soft gaussian shoulder that melts like a wide blur with 2–3 stops). `smooth`/`gaussian` densify and oklab-interpolate the stops at raster, so a soft-light fill reads as smooth as a Gaussian-blur filter with no offscreen composite. Deterministic + golden-byte-exact; `linear`/no-mode gradients are unchanged.
- Updated dependencies [f9f7ebe]
  - @glissade/core@0.10.1-pre.1

## 0.10.1-pre.0

### Patch Changes

- 7482378: **Gradient `Paint` — animatable linear & radial gradient fills.** `Paint` is now a core animatable document value (`{ kind: 'color' | 'linear' | 'radial' }`), and shape `fill` accepts a `Paint` as well as a color string. Gradients render as a fill with no offscreen composite and no filter — the cheap, soft-light alternative to a Gaussian blur (≈100× faster per frame in a soft-light-heavy scene). Geometry (`from`/`to`, `center`/`radius`) defaults to the shape's path bounds when omitted.

  Gradients animate two ways: **signal-driven** (a computed `fill: () => ({ kind:'radial', center:[x(), y()], ... })` re-evaluates each frame) and **keyframe-driven** via the new `paint` value type — `tl.to('rect/fill', gradient, { ease })` interpolates stops (offset + oklab color) and geometry; a solid color lifts to a uniform gradient to meet a gradient; a mismatched kind/stop-count snaps with a dev warning. Deterministic and golden-byte-exact. Existing color fills are unchanged.

- Updated dependencies [7482378]
  - @glissade/core@0.10.1-pre.0

## 0.10.0

### Minor Changes

- 0cc640f: Add the **cross-frame subtree raster cache** (§3.5, card ScMm) — an opt-in bitmap
  LRU that re-blits an unchanged subtree under a moving parent instead of
  re-rasterizing it, shared by **both** backends (Canvas2D and the golden-tested
  Skia/CLI path) through the one `Raster2D`.

  - **Opt-in via `cache?: boolean` on `NodeProps`.** A `cache:true` node FORCES a
    group (so an opacity-1 / source-over / no-filter static subtree becomes
    cacheable) and stamps a `cacheKey` on its `pushGroup`. Strictly gated: a scene
    that never sets `cache` emits **zero** new groups and is **byte-identical** to
    before. No auto-heuristic.
  - **`cacheKey = FNV-1a(group's command slice + the full content of every
referenced resource)`**, computed in `Node.emit` from the already-emitted plain
    DisplayList via a stable serializer (resource ids are remapped to local
    ordinals; opaque buffers collapse to a length marker, mirroring the cache-cold
    audit). The group's live opacity/blend/filter stay OUT of the key — they're
    applied on the composite, not baked into the bitmap.
  - **The LRU key is `cacheKey` AND the inherited DEVICE transform** (rounded to
    1e-4 to shed float jitter). The layer is rasterized in device space, so a HIT
    blits at identity — keying on the transform too is what makes a stale-CTM blit
    impossible and the cache provably byte-identical.
  - **Pure performance layer.** Cache-enabled output is byte-for-byte identical to
    cache-disabled output (the non-negotiable AC, gate-tested both ways); the cache
    is disabled with the `RASTER_CACHE=0` env var or a `Raster2D` constructor flag.
    Hardcoded LRU cap of 16; evicted canvases return to the raster pool.

  New public surface on `@glissade/scene`: `cache?` on `NodeProps`, `Node.cache`,
  the optional `mark`/`cacheKey`/`patchCacheKey` seam on `DisplayListBuilder`, and a
  `cacheEnabled` constructor param on `Raster2D`.

### Patch Changes

- fbdcc44: The `computed()`-backed Layout memo now re-runs on the two structural inputs it previously missed: a child add/remove (`Group` gains a tracked structural version, plus a reactive `Group.remove()`) and a scene `TextMeasurer` swap (the scene measurer is now a signal). Previously an auto-sized Layout could return a stale size after a child was added/removed or after a measurer was swapped (e.g. post-webfont-load) on an already-primed memo. Fixed-tree rendering and goldens are unchanged.
- 278ea05: Back the `scene/layout` memo with a core `computed()` signal (pALZ, DESIGN §3).

  The hand-rolled `#memoKey`/`JSON.stringify`-compare memo in `Layout` is replaced
  by a dependency-tracked `computed()` keyed on the _participating_ signals: the
  computed reads exactly the container props and child intrinsic-size signals it
  consumes, so the signal graph records those as deps and re-invokes Yoga only
  when one of THEM changes. Mutating a non-participating signal (e.g. the
  container's or a child's `opacity`) no longer re-runs `compute()`; the old memo
  recomputed its key but the stringify-compare hid the wasted invalidation —
  now invalidation is precise.

  Layout RESULTS are unchanged (goldens byte-identical) — the memo is a pure
  performance layer. The `computedSize(customMeasurer)` escape hatch bypasses the
  cache: a caller-supplied non-default measurer computes fresh & uncached so it
  can never read (or poison) a memo keyed on the scene-singleton measurer.

  No public API change.

- e4190b5: Docs: `gs render --workers` now notes it helps CPU-bound, per-frame-cheap scenes — a single render is already internally multi-threaded, so bandwidth-bound / blur-heavy scenes gain little from sharding. `NodeProps.cache` now documents that the cache is for a static subtree under a _moving parent_ (a subtree that drifts on sub-pixel positions misses every frame), and that a `filter` is a live composite parameter never baked into the cached bitmap. (0.10 downstream validation.)
- 0a1844c: Ratify the pre-measure text-layout design: promote the 0.5px measurement
  quantum to a single named export `MEASURE_QUANTUM_PX` and route `quantize`
  through it. Scene-owned code quantizes advances once to this grid and hands
  Yoga frozen integers; a Yoga `setMeasureFunc` was considered and rejected
  (it reintroduces wasm-owned measure-mode line-breaking for no determinism
  gain). Pure refactor — byte-identical rounding, goldens unchanged.
- Updated dependencies [fbdcc44]
- Updated dependencies [b2f1fd7]
- Updated dependencies [680f8ae]
  - @glissade/core@0.10.0

## 0.10.0-pre.1

### Patch Changes

- fbdcc44: The `computed()`-backed Layout memo now re-runs on the two structural inputs it previously missed: a child add/remove (`Group` gains a tracked structural version, plus a reactive `Group.remove()`) and a scene `TextMeasurer` swap (the scene measurer is now a signal). Previously an auto-sized Layout could return a stale size after a child was added/removed or after a measurer was swapped (e.g. post-webfont-load) on an already-primed memo. Fixed-tree rendering and goldens are unchanged.
- Updated dependencies [fbdcc44]
  - @glissade/core@0.10.0-pre.1

## 0.10.0-pre.0

### Minor Changes

- 0cc640f: Add the **cross-frame subtree raster cache** (§3.5, card ScMm) — an opt-in bitmap
  LRU that re-blits an unchanged subtree under a moving parent instead of
  re-rasterizing it, shared by **both** backends (Canvas2D and the golden-tested
  Skia/CLI path) through the one `Raster2D`.

  - **Opt-in via `cache?: boolean` on `NodeProps`.** A `cache:true` node FORCES a
    group (so an opacity-1 / source-over / no-filter static subtree becomes
    cacheable) and stamps a `cacheKey` on its `pushGroup`. Strictly gated: a scene
    that never sets `cache` emits **zero** new groups and is **byte-identical** to
    before. No auto-heuristic.
  - **`cacheKey = FNV-1a(group's command slice + the full content of every
referenced resource)`**, computed in `Node.emit` from the already-emitted plain
    DisplayList via a stable serializer (resource ids are remapped to local
    ordinals; opaque buffers collapse to a length marker, mirroring the cache-cold
    audit). The group's live opacity/blend/filter stay OUT of the key — they're
    applied on the composite, not baked into the bitmap.
  - **The LRU key is `cacheKey` AND the inherited DEVICE transform** (rounded to
    1e-4 to shed float jitter). The layer is rasterized in device space, so a HIT
    blits at identity — keying on the transform too is what makes a stale-CTM blit
    impossible and the cache provably byte-identical.
  - **Pure performance layer.** Cache-enabled output is byte-for-byte identical to
    cache-disabled output (the non-negotiable AC, gate-tested both ways); the cache
    is disabled with the `RASTER_CACHE=0` env var or a `Raster2D` constructor flag.
    Hardcoded LRU cap of 16; evicted canvases return to the raster pool.

  New public surface on `@glissade/scene`: `cache?` on `NodeProps`, `Node.cache`,
  the optional `mark`/`cacheKey`/`patchCacheKey` seam on `DisplayListBuilder`, and a
  `cacheEnabled` constructor param on `Raster2D`.

### Patch Changes

- 278ea05: Back the `scene/layout` memo with a core `computed()` signal (pALZ, DESIGN §3).

  The hand-rolled `#memoKey`/`JSON.stringify`-compare memo in `Layout` is replaced
  by a dependency-tracked `computed()` keyed on the _participating_ signals: the
  computed reads exactly the container props and child intrinsic-size signals it
  consumes, so the signal graph records those as deps and re-invokes Yoga only
  when one of THEM changes. Mutating a non-participating signal (e.g. the
  container's or a child's `opacity`) no longer re-runs `compute()`; the old memo
  recomputed its key but the stringify-compare hid the wasted invalidation —
  now invalidation is precise.

  Layout RESULTS are unchanged (goldens byte-identical) — the memo is a pure
  performance layer. The `computedSize(customMeasurer)` escape hatch bypasses the
  cache: a caller-supplied non-default measurer computes fresh & uncached so it
  can never read (or poison) a memo keyed on the scene-singleton measurer.

  No public API change.

- 0a1844c: Ratify the pre-measure text-layout design: promote the 0.5px measurement
  quantum to a single named export `MEASURE_QUANTUM_PX` and route `quantize`
  through it. Scene-owned code quantizes advances once to this grid and hands
  Yoga frozen integers; a Yoga `setMeasureFunc` was considered and rejected
  (it reintroduces wasm-owned measure-mode line-breaking for no determinism
  gain). Pure refactor — byte-identical rounding, goldens unchanged.
- Updated dependencies [b2f1fd7]
- Updated dependencies [680f8ae]
  - @glissade/core@0.10.0-pre.0

## 0.9.1

### Patch Changes

- @glissade/core@0.9.1

## 0.9.1-pre.0

### Patch Changes

- @glissade/core@0.9.1-pre.0

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

### Patch Changes

- f3b471b: Hardening from the in-house 0.9 canary (all confined to the opt-in studio-host / strict-font surfaces; the determinism gate was clean):

  - **Undo is now byte-exact even on un-normalized sidecars.** The snapshot-restore inverse is a `verbatim` setTrackKeys that replays the prior state as-is, instead of re-running `normalizeEditedKeys` (which re-pinned spring keys / re-nudged collisions and silently mutated the curve on externally-sourced or `setSidecarTrack`-written sidecars).
  - **`parseCmap` can't hang on a corrupt font.** The format-12 group count is clamped to what the buffer holds — a truncated subtable that declared billions of groups (a ~30s stall on the `--strict` font path) now returns empty instantly.
  - **The editable-host rule is enforced on the write surface.** `applyPatches` (setTrackKeys/addKey) and `setSidecarTrack` now reject structural `~Type.ordinal` / empty-nodeId targets, so a low-level consumer can't persist a sidecar track that then crashes `evaluate()`.
  - **Reserved-id guard at construction.** A node id in the reserved `~` namespace throws `ReservedNodeIdError` at `createScene` (was accepted, then failed confusingly at the first tween).
  - **Undo of a baseline-seeded first edit** restores `{timelines:{}}` exactly (prunes the timeline only when the transaction created it), instead of leaving an empty `{tracks:{}}` shell.

- Updated dependencies [f3b471b]
- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0

## 0.9.0-pre.1

### Patch Changes

- f3b471b: Hardening from the in-house 0.9 canary (all confined to the opt-in studio-host / strict-font surfaces; the determinism gate was clean):

  - **Undo is now byte-exact even on un-normalized sidecars.** The snapshot-restore inverse is a `verbatim` setTrackKeys that replays the prior state as-is, instead of re-running `normalizeEditedKeys` (which re-pinned spring keys / re-nudged collisions and silently mutated the curve on externally-sourced or `setSidecarTrack`-written sidecars).
  - **`parseCmap` can't hang on a corrupt font.** The format-12 group count is clamped to what the buffer holds — a truncated subtable that declared billions of groups (a ~30s stall on the `--strict` font path) now returns empty instantly.
  - **The editable-host rule is enforced on the write surface.** `applyPatches` (setTrackKeys/addKey) and `setSidecarTrack` now reject structural `~Type.ordinal` / empty-nodeId targets, so a low-level consumer can't persist a sidecar track that then crashes `evaluate()`.
  - **Reserved-id guard at construction.** A node id in the reserved `~` namespace throws `ReservedNodeIdError` at `createScene` (was accepted, then failed confusingly at the first tween).
  - **Undo of a baseline-seeded first edit** restores `{timelines:{}}` exactly (prunes the timeline only when the transaction created it), instead of leaving an empty `{tracks:{}}` shell.

- Updated dependencies [f3b471b]
  - @glissade/core@0.9.0-pre.1

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

### Minor Changes

- 7290397: Declare a `RenderBackend` interface (§3.4) in `@glissade/scene` — the renderer extension seam both v1 backends now `implement`. It `extends TextMeasurer` and adds a queryable `caps: { filters, shaders, maxTextureSize }`, `render`, `readPixels(): Promise<Uint8ClampedArray>` (reconciling Skia's previously-sync readPixels to the Promise contract so callers await uniformly), an optional `toVideoFrame`, and the asset setters. `SkiaBackend.caps.shaders` is `false` (headless CPU); `Canvas2DBackend.caps.shaders` reflects whether an effects-webgpu runner is registered. `ShaderRef` gains an optional reserved `textures` map for future multi-input passes.

### Patch Changes

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

### Minor Changes

- 7290397: Declare a `RenderBackend` interface (§3.4) in `@glissade/scene` — the renderer extension seam both v1 backends now `implement`. It `extends TextMeasurer` and adds a queryable `caps: { filters, shaders, maxTextureSize }`, `render`, `readPixels(): Promise<Uint8ClampedArray>` (reconciling Skia's previously-sync readPixels to the Promise contract so callers await uniformly), an optional `toVideoFrame`, and the asset setters. `SkiaBackend.caps.shaders` is `false` (headless CPU); `Canvas2DBackend.caps.shaders` reflects whether an effects-webgpu runner is registered. `ShaderRef` gains an optional reserved `textures` map for future multi-input passes.

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0-pre.0

## 0.7.0

### Minor Changes

- 9a360b2: New `auditCacheCold(createScene, doc, t)` DEV harness (§2.1/§5.5): evaluates two fresh scenes from the same factory at the same `t` — the coldest possible re-eval, which (unlike merely clearing the binding cache) also defeats a signal cache that doesn't depend on the playhead — and confirms the DisplayLists are byte-identical. On a mismatch it returns the id of the first node whose isolated `emit()` diverged (preferring the specific leaf over its container Group), so an impure node (wall clock, unseeded random, cross-frame state) is named rather than silently degrading the render. The runtime complement to the static eslint rules and the render-mode guards.
- 9aa42e6: Render-mode determinism guards (§5.5): `withDeterminismGuards(mode, fn)` from `@glissade/scene` patches the banned globals (`Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`) for the synchronous scope of a single `evaluate()` — throwing a `DeterminismViolationError` under `throw` mode (CLI/CI), warning-once-then-delegating under `warn` (dev), and always restoring them afterward. `gs render` now wraps every frame's `evaluate()` in `throw` mode, so a scene that reads a wall clock or unseeded random is rejected at render time instead of producing a silently nondeterministic export. This is the runtime backstop to the static `@glissade/eslint-plugin` rules.

### Patch Changes

- Updated dependencies [0c0a583]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0

## 0.7.0-pre.0

### Minor Changes

- 9a360b2: New `auditCacheCold(createScene, doc, t)` DEV harness (§2.1/§5.5): evaluates two fresh scenes from the same factory at the same `t` — the coldest possible re-eval, which (unlike merely clearing the binding cache) also defeats a signal cache that doesn't depend on the playhead — and confirms the DisplayLists are byte-identical. On a mismatch it returns the id of the first node whose isolated `emit()` diverged (preferring the specific leaf over its container Group), so an impure node (wall clock, unseeded random, cross-frame state) is named rather than silently degrading the render. The runtime complement to the static eslint rules and the render-mode guards.
- 9aa42e6: Render-mode determinism guards (§5.5): `withDeterminismGuards(mode, fn)` from `@glissade/scene` patches the banned globals (`Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`) for the synchronous scope of a single `evaluate()` — throwing a `DeterminismViolationError` under `throw` mode (CLI/CI), warning-once-then-delegating under `warn` (dev), and always restoring them afterward. `gs render` now wraps every frame's `evaluate()` in `throw` mode, so a scene that reads a wall clock or unseeded random is rejected at render time instead of producing a silently nondeterministic export. This is the runtime backstop to the static `@glissade/eslint-plugin` rules.

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
