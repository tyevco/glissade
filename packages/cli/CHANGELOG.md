# @glissade/cli

## 0.52.0

### Minor Changes

- a0ad1ff: Lottie export now bakes width-wrapped text so it survives the round-trip.

  Previously a Text node with a wrap `width` (no explicit `\n`) exported its raw string and dropped the width, so the re-imported/played Lottie collapsed the paragraph onto one line — a real interchange fidelity gap (measured on `gs parity`: a wrapped caption band dropped to ~0.20–0.88 SSIM vs the Skia reference). `exportLottie` gains an optional `measurer?: TextMeasurer`; when present and a Text uses width-wrap, it materializes glissade's own line breaks (`breakLines`) into the Lottie text document `t` (joined with `\n`, the same path explicit-`\n` text already round-trips through). Baking is done on the sampled value per frame, so animated text/fontSize/width re-wrap correctly. `gs export --lottie` and the `gs parity` lottie leg pass a real Skia measurer, so exported captions now round-trip faithfully.

  Gated strictly on width-wrap being active with a measurer present — non-wrapped Text and the no-measurer path are byte-identical to before (existing goldens/exports unchanged). CLI/lottie-only; zero base-embed impact; determinism preserved (`breakLines` is a pure function of text + width + font + measurer).

### Patch Changes

- Updated dependencies [a0ad1ff]
  - @glissade/lottie@0.52.0
  - @glissade/backend-skia@0.52.0
  - @glissade/core@0.52.0
  - @glissade/interact@0.52.0
  - @glissade/narrate@0.52.0
  - @glissade/player@0.52.0
  - @glissade/scene@0.52.0
  - @glissade/sfx@0.52.0
  - @glissade/svg@0.52.0

## 0.52.0-pre.0

### Minor Changes

- Lottie export now bakes width-wrapped text so it survives the round-trip.

  Previously a Text node with a wrap `width` (no explicit `\n`) exported its raw string and dropped the width, so the re-imported/played Lottie collapsed the paragraph onto one line — a real interchange fidelity gap (measured on `gs parity`: a wrapped caption band dropped to ~0.20–0.88 SSIM vs the Skia reference). `exportLottie` gains an optional `measurer?: TextMeasurer`; when present and a Text uses width-wrap, it materializes glissade's own line breaks (`breakLines`) into the Lottie text document `t` (joined with `\n`, the same path explicit-`\n` text already round-trips through). Baking is done on the sampled value per frame, so animated text/fontSize/width re-wrap correctly. `gs export --lottie` and the `gs parity` lottie leg pass a real Skia measurer, so exported captions now round-trip faithfully.

  Gated strictly on width-wrap being active with a measurer present — non-wrapped Text and the no-measurer path are byte-identical to before (existing goldens/exports unchanged). CLI/lottie-only; zero base-embed impact; determinism preserved (`breakLines` is a pure function of text + width + font + measurer).

### Patch Changes

- Updated dependencies
  - @glissade/lottie@0.52.0-pre.0
  - @glissade/backend-skia@0.52.0-pre.0
  - @glissade/core@0.52.0-pre.0
  - @glissade/interact@0.52.0-pre.0
  - @glissade/narrate@0.52.0-pre.0
  - @glissade/player@0.52.0-pre.0
  - @glissade/scene@0.52.0-pre.0
  - @glissade/sfx@0.52.0-pre.0
  - @glissade/svg@0.52.0-pre.0

## 0.51.0

### Patch Changes

- Updated dependencies [92bd6ef]
- Updated dependencies [1496e54]
  - @glissade/lottie@0.51.0
  - @glissade/core@0.51.0
  - @glissade/scene@0.51.0
  - @glissade/backend-skia@0.51.0
  - @glissade/interact@0.51.0
  - @glissade/narrate@0.51.0
  - @glissade/player@0.51.0
  - @glissade/sfx@0.51.0
  - @glissade/svg@0.51.0

## 0.51.0-pre.1

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.51.0-pre.1
  - @glissade/backend-skia@0.51.0-pre.1
  - @glissade/interact@0.51.0-pre.1
  - @glissade/lottie@0.51.0-pre.1
  - @glissade/narrate@0.51.0-pre.1
  - @glissade/player@0.51.0-pre.1
  - @glissade/svg@0.51.0-pre.1
  - @glissade/core@0.51.0-pre.1
  - @glissade/sfx@0.51.0-pre.1

## 0.51.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/lottie@0.51.0-pre.0
  - @glissade/core@0.51.0-pre.0
  - @glissade/backend-skia@0.51.0-pre.0
  - @glissade/interact@0.51.0-pre.0
  - @glissade/narrate@0.51.0-pre.0
  - @glissade/player@0.51.0-pre.0
  - @glissade/scene@0.51.0-pre.0
  - @glissade/sfx@0.51.0-pre.0
  - @glissade/svg@0.51.0-pre.0

## 0.50.0

### Minor Changes

- a25792b: `gs parity <scene> --baseline <file> [--update-baseline] [--tolerance <eps>]` — turn the
  red-by-design fidelity readout into a real regression gate. Instead of flooring every frame
  at an absolute 0.98 SSIM (which the documented scope-outs — non-center-anchor transforms,
  gradient/mesh fills, variable-font axes, text-wrap, media — legitimately fail), `--baseline`
  compares each per-frame per-backend mean against a committed per-scene baseline of EXPECTED
  drops and alerts only on a DEVIATION: a new/worse drop is a `⚠ REGRESSION` (non-zero exit),
  while a documented scope-out that matches its pin PASSES even below the floor (`✓
expected-drop`). A frame/backend with no pin is `＋ NEW` (fail — accept it explicitly), and a
  mean risen above its pin is `▲ improved` (pass, re-pin tighter). `--update-baseline` (re)writes
  the baseline from the live run (mirrors `gs repin`'s write/compare split; exits 0); `--tolerance`
  sets the expected-SSIM band (default 1e-4). The baseline header (width/height/fps/reference) is
  validated against the live run — a config mismatch fails loud. `--baseline` takes precedence over
  `--min`. Additive and CLI-only: non-gate runs are byte-identical to before, no scene/core/backend
  change, no new dependencies, off the base embed path, zero determinism impact (read-only
  measurement + a static JSON read; writes only under explicit `--update-baseline`).

### Patch Changes

- @glissade/backend-skia@0.50.0
- @glissade/core@0.50.0
- @glissade/interact@0.50.0
- @glissade/lottie@0.50.0
- @glissade/narrate@0.50.0
- @glissade/player@0.50.0
- @glissade/scene@0.50.0
- @glissade/sfx@0.50.0
- @glissade/svg@0.50.0

## 0.50.0-pre.0

### Minor Changes

- `gs parity <scene> --baseline <file> [--update-baseline] [--tolerance <eps>]` — turn the
  red-by-design fidelity readout into a real regression gate. Instead of flooring every frame
  at an absolute 0.98 SSIM (which the documented scope-outs — non-center-anchor transforms,
  gradient/mesh fills, variable-font axes, text-wrap, media — legitimately fail), `--baseline`
  compares each per-frame per-backend mean against a committed per-scene baseline of EXPECTED
  drops and alerts only on a DEVIATION: a new/worse drop is a `⚠ REGRESSION` (non-zero exit),
  while a documented scope-out that matches its pin PASSES even below the floor (`✓
expected-drop`). A frame/backend with no pin is `＋ NEW` (fail — accept it explicitly), and a
  mean risen above its pin is `▲ improved` (pass, re-pin tighter). `--update-baseline` (re)writes
  the baseline from the live run (mirrors `gs repin`'s write/compare split; exits 0); `--tolerance`
  sets the expected-SSIM band (default 1e-4). The baseline header (width/height/fps/reference) is
  validated against the live run — a config mismatch fails loud. `--baseline` takes precedence over
  `--min`. Additive and CLI-only: non-gate runs are byte-identical to before, no scene/core/backend
  change, no new dependencies, off the base embed path, zero determinism impact (read-only
  measurement + a static JSON read; writes only under explicit `--update-baseline`).

### Patch Changes

- @glissade/backend-skia@0.50.0-pre.0
- @glissade/core@0.50.0-pre.0
- @glissade/interact@0.50.0-pre.0
- @glissade/lottie@0.50.0-pre.0
- @glissade/narrate@0.50.0-pre.0
- @glissade/player@0.50.0-pre.0
- @glissade/scene@0.50.0-pre.0
- @glissade/sfx@0.50.0-pre.0
- @glissade/svg@0.50.0-pre.0

## 0.49.0

### Minor Changes

- fd7eb5f: `gs parity <scene> --backends skia,lottie [--ssim] [--heatmap <dir>] [--min <ssim>]` — a
  cross-backend fidelity command: render one scene across backends and report per-frame SSIM
  plus a worst-tile heatmap, in one command (productizes the hand-rolled cross-backend read).
  Skia is the reference; the `lottie` leg is the export→import→Skia round-trip, so `gs parity`
  measures Lottie interchange fidelity directly and localizes any gap with a heatmap PNG. Exits
  non-zero on any frame below the SSIM floor (default 0.98). Read-only measurement — zero
  determinism impact, no new dependencies, off the base embed. The `dom` backend leg (a
  Playwright browser-render harness) fails loud as a not-yet-shipped Phase B; unknown backends
  fail loud too — a requested backend is never silently skipped.

### Patch Changes

- e89e0e2: `gs parity` pre.1 — render through the same environment as `gs render` (fix a silent
  false-PASS). The parity command's Skia reference render only set the text measurer and
  evaluated — it skipped the font-face + variable-font-axis registration, Yoga layout init,
  asset decode, and determinism guard that `gs render` performs. So a variable-font scene
  rendered at the font's default weight on BOTH legs (the reference never registered the
  face), and `gs parity` reported a false SSIM 1.0 / PASS on a real interchange loss (the
  Lottie export drops `fontAxes`); Layout and media scenes errored outright. The render-env
  setup is now a shared `prepareSkiaRenderEnv` helper that both `gs render` and both parity
  legs use, so parity matches render by construction: a variable-font scene now correctly
  surfaces the ~0.79 loss, and Layout/media scenes render instead of erroring. `gs render`
  output is byte-identical (the extraction changed no render behavior).
  - @glissade/backend-skia@0.49.0
  - @glissade/core@0.49.0
  - @glissade/interact@0.49.0
  - @glissade/lottie@0.49.0
  - @glissade/narrate@0.49.0
  - @glissade/player@0.49.0
  - @glissade/scene@0.49.0
  - @glissade/sfx@0.49.0
  - @glissade/svg@0.49.0

## 0.49.0-pre.1

### Patch Changes

- `gs parity` pre.1 — render through the same environment as `gs render` (fix a silent
  false-PASS). The parity command's Skia reference render only set the text measurer and
  evaluated — it skipped the font-face + variable-font-axis registration, Yoga layout init,
  asset decode, and determinism guard that `gs render` performs. So a variable-font scene
  rendered at the font's default weight on BOTH legs (the reference never registered the
  face), and `gs parity` reported a false SSIM 1.0 / PASS on a real interchange loss (the
  Lottie export drops `fontAxes`); Layout and media scenes errored outright. The render-env
  setup is now a shared `prepareSkiaRenderEnv` helper that both `gs render` and both parity
  legs use, so parity matches render by construction: a variable-font scene now correctly
  surfaces the ~0.79 loss, and Layout/media scenes render instead of erroring. `gs render`
  output is byte-identical (the extraction changed no render behavior).
  - @glissade/backend-skia@0.49.0-pre.1
  - @glissade/core@0.49.0-pre.1
  - @glissade/interact@0.49.0-pre.1
  - @glissade/lottie@0.49.0-pre.1
  - @glissade/narrate@0.49.0-pre.1
  - @glissade/player@0.49.0-pre.1
  - @glissade/scene@0.49.0-pre.1
  - @glissade/sfx@0.49.0-pre.1
  - @glissade/svg@0.49.0-pre.1

## 0.49.0-pre.0

### Minor Changes

- `gs parity <scene> --backends skia,lottie [--ssim] [--heatmap <dir>] [--min <ssim>]` — a
  cross-backend fidelity command: render one scene across backends and report per-frame SSIM
  plus a worst-tile heatmap, in one command (productizes the hand-rolled cross-backend read).
  Skia is the reference; the `lottie` leg is the export→import→Skia round-trip, so `gs parity`
  measures Lottie interchange fidelity directly and localizes any gap with a heatmap PNG. Exits
  non-zero on any frame below the SSIM floor (default 0.98). Read-only measurement — zero
  determinism impact, no new dependencies, off the base embed. The `dom` backend leg (a
  Playwright browser-render harness) fails loud as a not-yet-shipped Phase B; unknown backends
  fail loud too — a requested backend is never silently skipped.

### Patch Changes

- @glissade/backend-skia@0.49.0-pre.0
- @glissade/core@0.49.0-pre.0
- @glissade/interact@0.49.0-pre.0
- @glissade/lottie@0.49.0-pre.0
- @glissade/narrate@0.49.0-pre.0
- @glissade/player@0.49.0-pre.0
- @glissade/scene@0.49.0-pre.0
- @glissade/sfx@0.49.0-pre.0
- @glissade/svg@0.49.0-pre.0

## 0.48.0

### Patch Changes

- Updated dependencies [cb629ec]
- Updated dependencies [2fd5dc9]
- Updated dependencies [0e195a9]
  - @glissade/lottie@0.48.0
  - @glissade/backend-skia@0.48.0
  - @glissade/core@0.48.0
  - @glissade/interact@0.48.0
  - @glissade/narrate@0.48.0
  - @glissade/player@0.48.0
  - @glissade/scene@0.48.0
  - @glissade/sfx@0.48.0
  - @glissade/svg@0.48.0

## 0.48.0-pre.2

### Patch Changes

- Updated dependencies
  - @glissade/lottie@0.48.0-pre.2
  - @glissade/backend-skia@0.48.0-pre.2
  - @glissade/core@0.48.0-pre.2
  - @glissade/interact@0.48.0-pre.2
  - @glissade/narrate@0.48.0-pre.2
  - @glissade/player@0.48.0-pre.2
  - @glissade/scene@0.48.0-pre.2
  - @glissade/sfx@0.48.0-pre.2
  - @glissade/svg@0.48.0-pre.2

## 0.48.0-pre.1

### Patch Changes

- Updated dependencies
  - @glissade/lottie@0.48.0-pre.1
  - @glissade/backend-skia@0.48.0-pre.1
  - @glissade/core@0.48.0-pre.1
  - @glissade/interact@0.48.0-pre.1
  - @glissade/narrate@0.48.0-pre.1
  - @glissade/player@0.48.0-pre.1
  - @glissade/scene@0.48.0-pre.1
  - @glissade/sfx@0.48.0-pre.1
  - @glissade/svg@0.48.0-pre.1

## 0.48.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/lottie@0.48.0-pre.0
  - @glissade/backend-skia@0.48.0-pre.0
  - @glissade/core@0.48.0-pre.0
  - @glissade/interact@0.48.0-pre.0
  - @glissade/narrate@0.48.0-pre.0
  - @glissade/player@0.48.0-pre.0
  - @glissade/scene@0.48.0-pre.0
  - @glissade/sfx@0.48.0-pre.0
  - @glissade/svg@0.48.0-pre.0

## 0.47.0

### Minor Changes

- e63249f: Verifiable ground-truth: make `describe()` a machine-checkable contract for the
  `window.glissade` runtime surface, and give the no-build author types.

  - **`describe()` gains an additive `surface` taxonomy** — one machine-readable
    enumeration of every export a `<script src>` author reaches on the IIFE (node
    constructors, helper/factory functions, the core callables, value objects, and the
    opaque type-only names signatures reference), each tagged `kind`/`form`/`iife`/`arity`.
    Optional and off the base embed (describe is tree-shaken off the base index), so it's
    additive and determinism-neutral.
  - **`gs describe --lint`** + a `check:describe` CI gate — assert every `window.glissade`
    runtime export appears in `describe()`, every described type-name is type-only or
    resolves to a runtime value, and callable arities agree. Converts a recurring
    manual catch (a helper or type silently drifting out of the manifest) into a
    systematic gate, checked against the real built `@glissade/browser` bundle.
  - **`gs types --global` / `--iife`** — emit a self-contained ambient `.d.ts`
    (`declare const glissade` + `interface Window { glissade }`) typing the whole IIFE
    surface from the manifest, so a no-build `<script>` author gets the same
    typo→compile-error safety `gs types` gave ESM `track()` authors. `--check`-guarded.

### Patch Changes

- f0e56bf: `gs describe --lint` / `gs types --global` pre.1 — two canary-caught fixes to the
  `surface` taxonomy:

  - **Complete the surface.** 15 real public `window.glissade` authoring exports were
    missing (`key`, `signal`, `spring`, `cubicBezier`, `namedEasing`, `springTo`,
    `pathFromSvg`, and the `glow`/`morph`/`typewriter`/`pulse`/`popIn`/`slideIn`/
    `presence`/`highlight` motion helpers), so the ambient `.d.ts` red-lined valid
    no-build code like `track('x/o','number',[key(0,0)])`. All are now surfaced (65
    entries). The generated node-prop interfaces also carry an index signature so a
    valid-but-unmodeled construction prop no longer red-lines.
  - **Make the gate bidirectional.** `gs describe --lint` and `check:describe` now assert
    BOTH directions: no phantom (every surface entry resolves on the runtime bundle) AND
    no missing (every public `window.glissade` runtime export is surfaced or in an
    explicit, documented exempt-list). The keystone previously only checked no-phantom, so
    it stayed green on an incomplete surface — it now fails on an omission, which is the
    class it was built to gate.

- Updated dependencies [f0e56bf]
- Updated dependencies [e63249f]
  - @glissade/scene@0.47.0
  - @glissade/backend-skia@0.47.0
  - @glissade/interact@0.47.0
  - @glissade/lottie@0.47.0
  - @glissade/narrate@0.47.0
  - @glissade/player@0.47.0
  - @glissade/svg@0.47.0
  - @glissade/core@0.47.0
  - @glissade/sfx@0.47.0

## 0.47.0-pre.1

### Patch Changes

- `gs describe --lint` / `gs types --global` pre.1 — two canary-caught fixes to the
  `surface` taxonomy:

  - **Complete the surface.** 15 real public `window.glissade` authoring exports were
    missing (`key`, `signal`, `spring`, `cubicBezier`, `namedEasing`, `springTo`,
    `pathFromSvg`, and the `glow`/`morph`/`typewriter`/`pulse`/`popIn`/`slideIn`/
    `presence`/`highlight` motion helpers), so the ambient `.d.ts` red-lined valid
    no-build code like `track('x/o','number',[key(0,0)])`. All are now surfaced (65
    entries). The generated node-prop interfaces also carry an index signature so a
    valid-but-unmodeled construction prop no longer red-lines.
  - **Make the gate bidirectional.** `gs describe --lint` and `check:describe` now assert
    BOTH directions: no phantom (every surface entry resolves on the runtime bundle) AND
    no missing (every public `window.glissade` runtime export is surfaced or in an
    explicit, documented exempt-list). The keystone previously only checked no-phantom, so
    it stayed green on an incomplete surface — it now fails on an omission, which is the
    class it was built to gate.

- Updated dependencies
  - @glissade/scene@0.47.0-pre.1
  - @glissade/backend-skia@0.47.0-pre.1
  - @glissade/interact@0.47.0-pre.1
  - @glissade/lottie@0.47.0-pre.1
  - @glissade/narrate@0.47.0-pre.1
  - @glissade/player@0.47.0-pre.1
  - @glissade/svg@0.47.0-pre.1
  - @glissade/core@0.47.0-pre.1
  - @glissade/sfx@0.47.0-pre.1

## 0.47.0-pre.0

### Minor Changes

- Verifiable ground-truth: make `describe()` a machine-checkable contract for the
  `window.glissade` runtime surface, and give the no-build author types.

  - **`describe()` gains an additive `surface` taxonomy** — one machine-readable
    enumeration of every export a `<script src>` author reaches on the IIFE (node
    constructors, helper/factory functions, the core callables, value objects, and the
    opaque type-only names signatures reference), each tagged `kind`/`form`/`iife`/`arity`.
    Optional and off the base embed (describe is tree-shaken off the base index), so it's
    additive and determinism-neutral.
  - **`gs describe --lint`** + a `check:describe` CI gate — assert every `window.glissade`
    runtime export appears in `describe()`, every described type-name is type-only or
    resolves to a runtime value, and callable arities agree. Converts a recurring
    manual catch (a helper or type silently drifting out of the manifest) into a
    systematic gate, checked against the real built `@glissade/browser` bundle.
  - **`gs types --global` / `--iife`** — emit a self-contained ambient `.d.ts`
    (`declare const glissade` + `interface Window { glissade }`) typing the whole IIFE
    surface from the manifest, so a no-build `<script>` author gets the same
    typo→compile-error safety `gs types` gave ESM `track()` authors. `--check`-guarded.

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.47.0-pre.0
  - @glissade/backend-skia@0.47.0-pre.0
  - @glissade/interact@0.47.0-pre.0
  - @glissade/lottie@0.47.0-pre.0
  - @glissade/narrate@0.47.0-pre.0
  - @glissade/player@0.47.0-pre.0
  - @glissade/svg@0.47.0-pre.0
  - @glissade/core@0.47.0-pre.0
  - @glissade/sfx@0.47.0-pre.0

## 0.46.0

### Patch Changes

- Updated dependencies [a5deab3]
  - @glissade/lottie@0.46.0
  - @glissade/backend-skia@0.46.0
  - @glissade/core@0.46.0
  - @glissade/interact@0.46.0
  - @glissade/narrate@0.46.0
  - @glissade/player@0.46.0
  - @glissade/scene@0.46.0
  - @glissade/sfx@0.46.0
  - @glissade/svg@0.46.0

## 0.46.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/lottie@0.46.0-pre.0
  - @glissade/backend-skia@0.46.0-pre.0
  - @glissade/core@0.46.0-pre.0
  - @glissade/interact@0.46.0-pre.0
  - @glissade/narrate@0.46.0-pre.0
  - @glissade/player@0.46.0-pre.0
  - @glissade/scene@0.46.0-pre.0
  - @glissade/sfx@0.46.0-pre.0
  - @glissade/svg@0.46.0-pre.0

## 0.45.0

### Minor Changes

- fc3b727: Track → Lottie export (`gs export --lottie`): compile a scene's timeline into
  Lottie/dotLottie JSON — the inverse of Lottie import. `exportLottie(sceneModule, opts)`
  walks the node tree into hierarchical Lottie layers and turns each `<id>/<prop>` track
  into an animated channel (position/opacity/scale/rotation, solid fill/stroke color,
  `Path.d`, sampled primitive geometry). `cubicBezier`/hold easings invert exactly to
  Lottie handles; named easings, springs, and `Expr` tracks are baked to dense sampled
  keyframes. Text, gradient/mesh paint, shaders, non-center anchors, and group-opacity
  compositing are warned-and-dropped in this MVP. Verified by an in-process
  export→import→Skia SSIM round-trip gate. Additive and off the embed path — no scene/core
  change, determinism and goldens unaffected.

### Patch Changes

- Updated dependencies [fffb2f8]
- Updated dependencies [e1b7830]
- Updated dependencies [fc3b727]
  - @glissade/lottie@0.45.0
  - @glissade/backend-skia@0.45.0
  - @glissade/core@0.45.0
  - @glissade/interact@0.45.0
  - @glissade/narrate@0.45.0
  - @glissade/player@0.45.0
  - @glissade/scene@0.45.0
  - @glissade/sfx@0.45.0
  - @glissade/svg@0.45.0

## 0.45.0-pre.2

### Patch Changes

- Updated dependencies
  - @glissade/lottie@0.45.0-pre.2
  - @glissade/backend-skia@0.45.0-pre.2
  - @glissade/core@0.45.0-pre.2
  - @glissade/interact@0.45.0-pre.2
  - @glissade/narrate@0.45.0-pre.2
  - @glissade/player@0.45.0-pre.2
  - @glissade/scene@0.45.0-pre.2
  - @glissade/sfx@0.45.0-pre.2
  - @glissade/svg@0.45.0-pre.2

## 0.45.0-pre.1

### Patch Changes

- Updated dependencies
  - @glissade/lottie@0.45.0-pre.1
  - @glissade/backend-skia@0.45.0-pre.1
  - @glissade/core@0.45.0-pre.1
  - @glissade/interact@0.45.0-pre.1
  - @glissade/narrate@0.45.0-pre.1
  - @glissade/player@0.45.0-pre.1
  - @glissade/scene@0.45.0-pre.1
  - @glissade/sfx@0.45.0-pre.1
  - @glissade/svg@0.45.0-pre.1

## 0.45.0-pre.0

### Minor Changes

- Track → Lottie export (`gs export --lottie`): compile a scene's timeline into
  Lottie/dotLottie JSON — the inverse of Lottie import. `exportLottie(sceneModule, opts)`
  walks the node tree into hierarchical Lottie layers and turns each `<id>/<prop>` track
  into an animated channel (position/opacity/scale/rotation, solid fill/stroke color,
  `Path.d`, sampled primitive geometry). `cubicBezier`/hold easings invert exactly to
  Lottie handles; named easings, springs, and `Expr` tracks are baked to dense sampled
  keyframes. Text, gradient/mesh paint, shaders, non-center anchors, and group-opacity
  compositing are warned-and-dropped in this MVP. Verified by an in-process
  export→import→Skia SSIM round-trip gate. Additive and off the embed path — no scene/core
  change, determinism and goldens unaffected.

### Patch Changes

- Updated dependencies
  - @glissade/lottie@0.45.0-pre.0
  - @glissade/backend-skia@0.45.0-pre.0
  - @glissade/core@0.45.0-pre.0
  - @glissade/interact@0.45.0-pre.0
  - @glissade/narrate@0.45.0-pre.0
  - @glissade/player@0.45.0-pre.0
  - @glissade/scene@0.45.0-pre.0
  - @glissade/sfx@0.45.0-pre.0
  - @glissade/svg@0.45.0-pre.0

## 0.44.0

### Minor Changes

- c976657: `gs types` — codegen a type-checked `track()` SDK from the describe() manifest

  `describe()` already tells an agent which props are animatable and their value types, but at _runtime_ — nothing stops authoring `track('circle/opasity', 'color', …)` until it throws at bind time. `gs types` makes guessing a track target a **compile error**:

  ```sh
  gs types --out src/glissade-targets.ts          # generate from the live describe() manifest
  gs types --out src/glissade-targets.ts --check  # CI gate: fail if it drifted from describe()
  ```

  The generated file declares a `KnownTrackPath` union (every animatable path in the taxonomy + your `defineComponent` targets), a `TrackTarget` template (`` `${string}/${KnownTrackPath}` ``), and per-path value-type maps — then re-exports a **type-narrowed `track`** whose runtime _is_ `@glissade/core`'s `track` (zero added runtime). Importing `track` from it turns a typo'd prop-path or a wrong value-type id into a TypeScript error, closing the "read the d.ts, don't guess" loop for agent authorship. Deterministic output (drift-guardable with `--check`, like the generated API reference); reads the live manifest or a committed `--from api.json`.

  Scope: the manifest is instance-free, so this checks the prop-path + value type — verifying a scene's node `<id>` is real is a follow-up (a bad id still fails loud at bind time). CLI-only; base embed unchanged. Docs: `docs/for-agents.md`.

### Patch Changes

- 3111e34: `gs types`: a polymorphic prop's value type is a UNION (fixes a false-positive)

  The typed SDK emitted a polymorphic value type (the manifest's pipe-joined `'color|paint'` on `fill`) as a single string literal, so a valid `track('…/fill', 'color', …)` failed `TS2345` — the generated types red-lined _correct_ code (a real consumer counted ~16 valid `fill` call sites). `gs types` now splits an ambiguous value type on `|` and unions it: `TypeIdOf<…/fill> = 'color' | 'paint'` and `ValueOf` the value union (`string | Paint`), so passing either member type-checks while a genuinely-wrong type (`'number'` on `fill`) and a typo'd path still error. The same union covers a path that carries different types across node types. A `color|paint` regression test guards it so single-value-type coverage can't hide it again.

  - @glissade/backend-skia@0.44.0
  - @glissade/core@0.44.0
  - @glissade/interact@0.44.0
  - @glissade/lottie@0.44.0
  - @glissade/narrate@0.44.0
  - @glissade/player@0.44.0
  - @glissade/scene@0.44.0
  - @glissade/sfx@0.44.0
  - @glissade/svg@0.44.0

## 0.44.0-pre.1

### Patch Changes

- `gs types`: a polymorphic prop's value type is a UNION (fixes a false-positive)

  The typed SDK emitted a polymorphic value type (the manifest's pipe-joined `'color|paint'` on `fill`) as a single string literal, so a valid `track('…/fill', 'color', …)` failed `TS2345` — the generated types red-lined _correct_ code (a real consumer counted ~16 valid `fill` call sites). `gs types` now splits an ambiguous value type on `|` and unions it: `TypeIdOf<…/fill> = 'color' | 'paint'` and `ValueOf` the value union (`string | Paint`), so passing either member type-checks while a genuinely-wrong type (`'number'` on `fill`) and a typo'd path still error. The same union covers a path that carries different types across node types. A `color|paint` regression test guards it so single-value-type coverage can't hide it again.

  - @glissade/backend-skia@0.44.0-pre.1
  - @glissade/core@0.44.0-pre.1
  - @glissade/interact@0.44.0-pre.1
  - @glissade/lottie@0.44.0-pre.1
  - @glissade/narrate@0.44.0-pre.1
  - @glissade/player@0.44.0-pre.1
  - @glissade/scene@0.44.0-pre.1
  - @glissade/sfx@0.44.0-pre.1
  - @glissade/svg@0.44.0-pre.1

## 0.44.0-pre.0

### Minor Changes

- `gs types` — codegen a type-checked `track()` SDK from the describe() manifest

  `describe()` already tells an agent which props are animatable and their value types, but at _runtime_ — nothing stops authoring `track('circle/opasity', 'color', …)` until it throws at bind time. `gs types` makes guessing a track target a **compile error**:

  ```sh
  gs types --out src/glissade-targets.ts          # generate from the live describe() manifest
  gs types --out src/glissade-targets.ts --check  # CI gate: fail if it drifted from describe()
  ```

  The generated file declares a `KnownTrackPath` union (every animatable path in the taxonomy + your `defineComponent` targets), a `TrackTarget` template (`` `${string}/${KnownTrackPath}` ``), and per-path value-type maps — then re-exports a **type-narrowed `track`** whose runtime _is_ `@glissade/core`'s `track` (zero added runtime). Importing `track` from it turns a typo'd prop-path or a wrong value-type id into a TypeScript error, closing the "read the d.ts, don't guess" loop for agent authorship. Deterministic output (drift-guardable with `--check`, like the generated API reference); reads the live manifest or a committed `--from api.json`.

  Scope: the manifest is instance-free, so this checks the prop-path + value type — verifying a scene's node `<id>` is real is a follow-up (a bad id still fails loud at bind time). CLI-only; base embed unchanged. Docs: `docs/for-agents.md`.

### Patch Changes

- @glissade/backend-skia@0.44.0-pre.0
- @glissade/core@0.44.0-pre.0
- @glissade/interact@0.44.0-pre.0
- @glissade/lottie@0.44.0-pre.0
- @glissade/narrate@0.44.0-pre.0
- @glissade/player@0.44.0-pre.0
- @glissade/scene@0.44.0-pre.0
- @glissade/sfx@0.44.0-pre.0
- @glissade/svg@0.44.0-pre.0

## 0.43.1

### Patch Changes

- 49a7a99: `gs build`: `ProjectConfig.ignore`, a positional-config note, and per-project font flags

  Three config papercuts from the 0.43 real-project consumer read (ai-training):

  - **`ignore` exclude globs.** The documented `scenes: ['episodes/**/*.ts']` swept colocated `*.test.ts` in as scenes — which `gs build` then tried to _load_, importing vitest and crashing. Add `ignore: ['*.test.ts']` to the config to exclude them: a `/`-less pattern matches the basename at any depth (`*.test.ts`), a `/`-bearing one matches the config-relative path (`_wip/**`).
  - **A positional is a scene FILTER, not a config path.** `gs build my.config.ts` used to be silently treated as a filter (matching no scene) and fall back to `glissade.config.ts`; it now prints a note pointing you at `--config`. `gs build --help` prints usage.
  - **Per-project font flags.** `defaults.strictFonts` / `defaults.allowSystemFonts` thread through to every render, so a series can enforce the §3.6 font gate (fail on a missing face) or opt into system fonts from the config instead of per-invocation.
  - @glissade/backend-skia@0.43.1
  - @glissade/core@0.43.1
  - @glissade/interact@0.43.1
  - @glissade/lottie@0.43.1
  - @glissade/narrate@0.43.1
  - @glissade/player@0.43.1
  - @glissade/scene@0.43.1
  - @glissade/sfx@0.43.1
  - @glissade/svg@0.43.1

## 0.43.1-pre.0

### Patch Changes

- `gs build`: `ProjectConfig.ignore`, a positional-config note, and per-project font flags

  Three config papercuts from the 0.43 real-project consumer read (ai-training):

  - **`ignore` exclude globs.** The documented `scenes: ['episodes/**/*.ts']` swept colocated `*.test.ts` in as scenes — which `gs build` then tried to _load_, importing vitest and crashing. Add `ignore: ['*.test.ts']` to the config to exclude them: a `/`-less pattern matches the basename at any depth (`*.test.ts`), a `/`-bearing one matches the config-relative path (`_wip/**`).
  - **A positional is a scene FILTER, not a config path.** `gs build my.config.ts` used to be silently treated as a filter (matching no scene) and fall back to `glissade.config.ts`; it now prints a note pointing you at `--config`. `gs build --help` prints usage.
  - **Per-project font flags.** `defaults.strictFonts` / `defaults.allowSystemFonts` thread through to every render, so a series can enforce the §3.6 font gate (fail on a missing face) or opt into system fonts from the config instead of per-invocation.
  - @glissade/backend-skia@0.43.1-pre.0
  - @glissade/core@0.43.1-pre.0
  - @glissade/interact@0.43.1-pre.0
  - @glissade/lottie@0.43.1-pre.0
  - @glissade/narrate@0.43.1-pre.0
  - @glissade/player@0.43.1-pre.0
  - @glissade/scene@0.43.1-pre.0
  - @glissade/sfx@0.43.1-pre.0
  - @glissade/svg@0.43.1-pre.0

## 0.43.0

### Minor Changes

- 10196ce: `gs build` project runtime — `--affected <git-ref>` + a shared-master phase

  `gs build` becomes a DAG-aware project runtime, not just a per-scene loop:

  - **`gs build --affected <git-ref>`** pre-filters to the scenes a git diff since `<ref>` touched (source or any sidecar input), composed with the existing per-step content-hash staleness — the "rebuild only what this change set touched" CI story. Never runs a scene the diff didn't touch; never skips a real change within the ones it keeps.
  - **A shared-master phase.** A `master` block on the config (`defineProject({ scenes, master: { profile, consistency, limiter } })`) makes `gs build` run a two-phase schedule with an explicit barrier: render every stale scene → **barrier** → master the whole project to one shared LUFS target + true-peak limiter (`runMaster`, extracted from `gs master` so both drive the same core) → the render staleness remuxes exactly the members whose committed `loudness.json` moved (a fast mix-only re-encode, not a full re-render). The master always measures all members (the shared target is the quietest member's reach), so `--affected` narrows the render phase while the master still considers the whole project. An unchanged project settles — byte-identical loudness, nothing remuxes.

  CLI-only (no scene/embed surface, base embed unchanged); the per-scene staleness, hashes, and determinism are untouched. This is the first slice of the DAG-project-runtime capstone; `toolchain.lock`, sub-scene `anchorHash`, and `gs remaster` are follow-on work.

### Patch Changes

- 5ec73fb: `gs build --affected`: never silently skip an unattributable code change

  `--affected` tracks each scene by its own files (source + sidecars), but a scene `.ts` _imports_ other modules — so a change to a shared `src/util.ts` (or the config) affects scenes transitively, invisibly to the file-level diff. Selecting nothing on such a change would ship stale renders — the exact silent-skip the rest of the pipeline fails loud on (a real consumer's remaster edited shared `src/theme.ts` + backgrounds and would have shipped 16 stale episodes).

  `--affected` now falls back **safe-by-default**: if the diff touched a code file (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs`) that is NOT any scene's recognized input — a shared module, or `glissade.config.ts` itself — it does **not** narrow; it rebuilds every scene (the per-step content hash still skips the genuinely fresh ones). A diff of only non-code files (docs, an unrelated JSON) narrows normally. Precise import-graph affectedness (rebuild only true dependents) is a follow-up.

  - @glissade/backend-skia@0.43.0
  - @glissade/core@0.43.0
  - @glissade/interact@0.43.0
  - @glissade/lottie@0.43.0
  - @glissade/narrate@0.43.0
  - @glissade/player@0.43.0
  - @glissade/scene@0.43.0
  - @glissade/sfx@0.43.0
  - @glissade/svg@0.43.0

## 0.43.0-pre.1

### Patch Changes

- `gs build --affected`: never silently skip an unattributable code change

  `--affected` tracks each scene by its own files (source + sidecars), but a scene `.ts` _imports_ other modules — so a change to a shared `src/util.ts` (or the config) affects scenes transitively, invisibly to the file-level diff. Selecting nothing on such a change would ship stale renders — the exact silent-skip the rest of the pipeline fails loud on (a real consumer's remaster edited shared `src/theme.ts` + backgrounds and would have shipped 16 stale episodes).

  `--affected` now falls back **safe-by-default**: if the diff touched a code file (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs`) that is NOT any scene's recognized input — a shared module, or `glissade.config.ts` itself — it does **not** narrow; it rebuilds every scene (the per-step content hash still skips the genuinely fresh ones). A diff of only non-code files (docs, an unrelated JSON) narrows normally. Precise import-graph affectedness (rebuild only true dependents) is a follow-up.

  - @glissade/backend-skia@0.43.0-pre.1
  - @glissade/core@0.43.0-pre.1
  - @glissade/interact@0.43.0-pre.1
  - @glissade/lottie@0.43.0-pre.1
  - @glissade/narrate@0.43.0-pre.1
  - @glissade/player@0.43.0-pre.1
  - @glissade/scene@0.43.0-pre.1
  - @glissade/sfx@0.43.0-pre.1
  - @glissade/svg@0.43.0-pre.1

## 0.43.0-pre.0

### Minor Changes

- `gs build` project runtime — `--affected <git-ref>` + a shared-master phase

  `gs build` becomes a DAG-aware project runtime, not just a per-scene loop:

  - **`gs build --affected <git-ref>`** pre-filters to the scenes a git diff since `<ref>` touched (source or any sidecar input), composed with the existing per-step content-hash staleness — the "rebuild only what this change set touched" CI story. Never runs a scene the diff didn't touch; never skips a real change within the ones it keeps.
  - **A shared-master phase.** A `master` block on the config (`defineProject({ scenes, master: { profile, consistency, limiter } })`) makes `gs build` run a two-phase schedule with an explicit barrier: render every stale scene → **barrier** → master the whole project to one shared LUFS target + true-peak limiter (`runMaster`, extracted from `gs master` so both drive the same core) → the render staleness remuxes exactly the members whose committed `loudness.json` moved (a fast mix-only re-encode, not a full re-render). The master always measures all members (the shared target is the quietest member's reach), so `--affected` narrows the render phase while the master still considers the whole project. An unchanged project settles — byte-identical loudness, nothing remuxes.

  CLI-only (no scene/embed surface, base embed unchanged); the per-scene staleness, hashes, and determinism are untouched. This is the first slice of the DAG-project-runtime capstone; `toolchain.lock`, sub-scene `anchorHash`, and `gs remaster` are follow-on work.

### Patch Changes

- @glissade/backend-skia@0.43.0-pre.0
- @glissade/core@0.43.0-pre.0
- @glissade/interact@0.43.0-pre.0
- @glissade/lottie@0.43.0-pre.0
- @glissade/narrate@0.43.0-pre.0
- @glissade/player@0.43.0-pre.0
- @glissade/scene@0.43.0-pre.0
- @glissade/sfx@0.43.0-pre.0
- @glissade/svg@0.43.0-pre.0

## 0.42.0

### Minor Changes

- 150b53b: `gs localize` — fork a narration into a new locale + preflight parity before TTS

  Render already fans out across locales (`--locales en,zh`), but nothing _created_ the per-locale artifacts — hand-forking a narration drifts silently (a dropped beat id breaks a `.start()` anchor; an orphaned message id throws), and you only discover it after a minute of TTS. `gs localize scene.ts --to zh` does the fork up front and runs the render path's checks _before_ any synthesis:

  ```sh
  gs localize scene.ts --to zh            # dry run: fork plan + a parity/localize preflight (exits non-zero on drift)
  gs localize scene.ts --to zh --write    # emit scene.zh.narration.json + messages.zh.json
  ```

  - **Forks the narration** (`<base>.narration.json`, or the committed timing when that's all there is) into `<base>.<locale>.narration.json`, **preserving every segment/pause id** so `.start()`/`beats.at()` anchors survive; the voice is dropped so the locale picks its own (`--keep-voice` retains it).
  - **Stubs `messages.<locale>.json`** from the ids the scene actually uses — every `t()` id (harvested by loading the scene under a recording table) plus every `type:'string'` track node-id — sorted for a diff-stable file. A re-localize **carries existing translations over** (never blanks work done); `--from <locale>` seeds placeholders from a base locale.
  - **Preflights** with the same `requireParity` + dry `localize()` the render runs, as one non-throwing report so all drift surfaces at once. Dry-run by default (non-zero exit on any issue — a CI gate); `--write` is the fix-forward.

  CLI-only (no scene/embed surface, base embed unchanged); never synthesizes audio or calls `evaluate()`. Docs: `docs/narration.md` (Localizing to a new locale).

### Patch Changes

- 877d7f8: `gs localize`: carry over translated narration (no silent wipe) + `--strict` + a no-message fast-path

  Three fixes from the 0.42 real-episode consumer read (ai-training):

  - **Data-loss fix (top):** a re-localize `--write` used to re-fork the base narration text every time, silently wiping a translator's already-localized `<base>.<locale>.narration.json`. It now **carries the existing per-segment translation over by id** (symmetric with the message-table carry-over) — a re-localize preserves translated segments and re-stubs only NEW ones. The report shows the carried-over count.
  - **`--strict`:** refuses to emit on a preflight failure (exit 1, no write), mirroring the dry-run gate — a CI-friendly "don't write drifted artifacts" mode. Plain `--write` stays the fix-forward (exit 0).
  - **Multi-cue + no-`t()` fast-path:** the id harvest no longer offers **multi-cue** string tracks (a many-cue caption/typewriter node) as message-table targets — `localize()` can't table-localize them, so offering them only kept the preflight permanently red. And a scene with **no localizable messages** (no `t()` ids, no single-cue string tracks) now skips `messages.<locale>.json` entirely and reaches a clean parity-only preflight.
  - @glissade/backend-skia@0.42.0
  - @glissade/core@0.42.0
  - @glissade/interact@0.42.0
  - @glissade/lottie@0.42.0
  - @glissade/narrate@0.42.0
  - @glissade/player@0.42.0
  - @glissade/scene@0.42.0
  - @glissade/sfx@0.42.0
  - @glissade/svg@0.42.0

## 0.42.0-pre.1

### Patch Changes

- `gs localize`: carry over translated narration (no silent wipe) + `--strict` + a no-message fast-path

  Three fixes from the 0.42 real-episode consumer read (ai-training):

  - **Data-loss fix (top):** a re-localize `--write` used to re-fork the base narration text every time, silently wiping a translator's already-localized `<base>.<locale>.narration.json`. It now **carries the existing per-segment translation over by id** (symmetric with the message-table carry-over) — a re-localize preserves translated segments and re-stubs only NEW ones. The report shows the carried-over count.
  - **`--strict`:** refuses to emit on a preflight failure (exit 1, no write), mirroring the dry-run gate — a CI-friendly "don't write drifted artifacts" mode. Plain `--write` stays the fix-forward (exit 0).
  - **Multi-cue + no-`t()` fast-path:** the id harvest no longer offers **multi-cue** string tracks (a many-cue caption/typewriter node) as message-table targets — `localize()` can't table-localize them, so offering them only kept the preflight permanently red. And a scene with **no localizable messages** (no `t()` ids, no single-cue string tracks) now skips `messages.<locale>.json` entirely and reaches a clean parity-only preflight.
  - @glissade/backend-skia@0.42.0-pre.1
  - @glissade/core@0.42.0-pre.1
  - @glissade/interact@0.42.0-pre.1
  - @glissade/lottie@0.42.0-pre.1
  - @glissade/narrate@0.42.0-pre.1
  - @glissade/player@0.42.0-pre.1
  - @glissade/scene@0.42.0-pre.1
  - @glissade/sfx@0.42.0-pre.1
  - @glissade/svg@0.42.0-pre.1

## 0.42.0-pre.0

### Minor Changes

- `gs localize` — fork a narration into a new locale + preflight parity before TTS

  Render already fans out across locales (`--locales en,zh`), but nothing _created_ the per-locale artifacts — hand-forking a narration drifts silently (a dropped beat id breaks a `.start()` anchor; an orphaned message id throws), and you only discover it after a minute of TTS. `gs localize scene.ts --to zh` does the fork up front and runs the render path's checks _before_ any synthesis:

  ```sh
  gs localize scene.ts --to zh            # dry run: fork plan + a parity/localize preflight (exits non-zero on drift)
  gs localize scene.ts --to zh --write    # emit scene.zh.narration.json + messages.zh.json
  ```

  - **Forks the narration** (`<base>.narration.json`, or the committed timing when that's all there is) into `<base>.<locale>.narration.json`, **preserving every segment/pause id** so `.start()`/`beats.at()` anchors survive; the voice is dropped so the locale picks its own (`--keep-voice` retains it).
  - **Stubs `messages.<locale>.json`** from the ids the scene actually uses — every `t()` id (harvested by loading the scene under a recording table) plus every `type:'string'` track node-id — sorted for a diff-stable file. A re-localize **carries existing translations over** (never blanks work done); `--from <locale>` seeds placeholders from a base locale.
  - **Preflights** with the same `requireParity` + dry `localize()` the render runs, as one non-throwing report so all drift surfaces at once. Dry-run by default (non-zero exit on any issue — a CI gate); `--write` is the fix-forward.

  CLI-only (no scene/embed surface, base embed unchanged); never synthesizes audio or calls `evaluate()`. Docs: `docs/narration.md` (Localizing to a new locale).

### Patch Changes

- @glissade/backend-skia@0.42.0-pre.0
- @glissade/core@0.42.0-pre.0
- @glissade/interact@0.42.0-pre.0
- @glissade/lottie@0.42.0-pre.0
- @glissade/narrate@0.42.0-pre.0
- @glissade/player@0.42.0-pre.0
- @glissade/scene@0.42.0-pre.0
- @glissade/sfx@0.42.0-pre.0
- @glissade/svg@0.42.0-pre.0

## 0.41.1

### Patch Changes

- ed74686: `gs render`: accurate `--incremental` progress + an actionable missing-audio error

  Two DX papercuts from the 0.41 real-episode dirty-beat review (ai-training):

  - **`--incremental` progress now reports the re-rendered count, not the whole timeline.** A splice that re-renders 637 of 1530 frames printed `rendering 1530/1530 frames`, which read like a full render even though 893 frames were spliced from the intermediate. It now prints `rendering 637/637` (the frames actually re-rendered), alongside the existing `incremental: 637/1530 frames changed — splicing 893` line.
  - **A missing audio input fails with an actionable message.** A committed narration/sfx timing manifest can reference a cache WAV that isn't on disk (the audio cache is usually git-ignored, so a fresh checkout lacks it); the render used to die deep in ffmpeg with a bare `hook-….wav: No such file`. `gs render` now preflights the mix inputs and, on a missing file, names it and points at the fix (`gs narrate` / `gs sfx`, or `--narration off` / `--sfx off`).

- Updated dependencies [ed74686]
  - @glissade/core@0.41.1
  - @glissade/backend-skia@0.41.1
  - @glissade/interact@0.41.1
  - @glissade/lottie@0.41.1
  - @glissade/narrate@0.41.1
  - @glissade/player@0.41.1
  - @glissade/scene@0.41.1
  - @glissade/sfx@0.41.1
  - @glissade/svg@0.41.1

## 0.41.1-pre.0

### Patch Changes

- `gs render`: accurate `--incremental` progress + an actionable missing-audio error

  Two DX papercuts from the 0.41 real-episode dirty-beat review (ai-training):

  - **`--incremental` progress now reports the re-rendered count, not the whole timeline.** A splice that re-renders 637 of 1530 frames printed `rendering 1530/1530 frames`, which read like a full render even though 893 frames were spliced from the intermediate. It now prints `rendering 637/637` (the frames actually re-rendered), alongside the existing `incremental: 637/1530 frames changed — splicing 893` line.
  - **A missing audio input fails with an actionable message.** A committed narration/sfx timing manifest can reference a cache WAV that isn't on disk (the audio cache is usually git-ignored, so a fresh checkout lacks it); the render used to die deep in ffmpeg with a bare `hook-….wav: No such file`. `gs render` now preflights the mix inputs and, on a missing file, names it and points at the fix (`gs narrate` / `gs sfx`, or `--narration off` / `--sfx off`).

- Updated dependencies
  - @glissade/core@0.41.1-pre.0
  - @glissade/backend-skia@0.41.1-pre.0
  - @glissade/interact@0.41.1-pre.0
  - @glissade/lottie@0.41.1-pre.0
  - @glissade/narrate@0.41.1-pre.0
  - @glissade/player@0.41.1-pre.0
  - @glissade/scene@0.41.1-pre.0
  - @glissade/sfx@0.41.1-pre.0
  - @glissade/svg@0.41.1-pre.0

## 0.41.0

### Minor Changes

- 1ce45cc: `gs render --incremental` — dirty-beat incremental render (re-render only the frames that changed)

  An edit that shifts timing — move one beat, re-narrate, nudge a keyframe — changes **every downstream frame's** DisplayList, so it misses the whole-frame cache (every content key shifts) AND the audio-only remux fast path (the rolled-up digest flips). A 35-minute episode re-renders in full for a three-second change. `--incremental` kills that: it persists the **ordered per-frame content-key vector** in the render manifest, diffs it against the prior render, and re-renders **only the changed frame runs** — splicing the unchanged runs verbatim out of a retained FFV1 lossless intermediate.

  ```sh
  gs render episode.ts --out ep.mp4 --incremental   # first run: builds the intermediate
  # …edit one beat in the middle…
  gs render episode.ts --out ep.mp4 --incremental   # re-renders only the changed run, splices the rest
  #   incremental: 61/1530 frames changed — re-rendering those, splicing 1469 from the intermediate
  ```

  **Determinism holds byte-exact THROUGH the optimization.** A warm splice is byte-for-byte identical to a cold `--incremental` render of the same edited scene: FFV1 is lossless and intra-only, so a kept segment decodes to the exact pixels a re-render would produce, and one final encode over the spliced stream is the cold render. The per-frame key is the same proof the frame cache and the golden corpus trust — an end-to-end test asserts splice ≡ cold-full byte-identity (forward edit, unchanged re-render, and reverse edit). Implies the lossless-intermediate pipeline; video output only; a duration change (frame-count mismatch), an encode-param change, or a GPU/shader scene falls back to a full render. The manifest gains an optional `frameKeys` field, so pre-0.41 manifests simply full-render the first time. Docs: `docs/caching.md`.

### Patch Changes

- dc996d7: `gs render`: warn on a `@glissade/*` version skew (dual-package adopt trap)

  Installing `@glissade/cli` at a different version than the `@glissade/core` a scene resolves is a dual-package hazard: the subpath side-effect registries (`@glissade/core/expr`'s track sampler, Yoga `layout`'s engine) register per-package-**instance**, so under a skew a _correctly_ imported `@glissade/core/expr` or `layout` still fails with a misleading `expr tracks need import '@glissade/core/expr'` / `no LayoutEngine registered` — even though the import is present. `gs render` now resolves the scene's `@glissade/core` version, compares it to its own, and prints a clear **"version skew — align every @glissade/\* to X"** warning before evaluate, turning a confusing failure into an actionable one. A warning, never a hard error (it never blocks a render and stays silent when versions match or core can't be resolved). glissade is lockstep — bump all `@glissade/*` together.

  - @glissade/backend-skia@0.41.0
  - @glissade/core@0.41.0
  - @glissade/interact@0.41.0
  - @glissade/lottie@0.41.0
  - @glissade/narrate@0.41.0
  - @glissade/player@0.41.0
  - @glissade/scene@0.41.0
  - @glissade/sfx@0.41.0
  - @glissade/svg@0.41.0

## 0.41.0-pre.1

### Patch Changes

- dc996d7: `gs render`: warn on a `@glissade/*` version skew (dual-package adopt trap)

  Installing `@glissade/cli` at a different version than the `@glissade/core` a scene resolves is a dual-package hazard: the subpath side-effect registries (`@glissade/core/expr`'s track sampler, Yoga `layout`'s engine) register per-package-**instance**, so under a skew a _correctly_ imported `@glissade/core/expr` or `layout` still fails with a misleading `expr tracks need import '@glissade/core/expr'` / `no LayoutEngine registered` — even though the import is present. `gs render` now resolves the scene's `@glissade/core` version, compares it to its own, and prints a clear **"version skew — align every @glissade/\* to X"** warning before evaluate, turning a confusing failure into an actionable one. A warning, never a hard error (it never blocks a render and stays silent when versions match or core can't be resolved). glissade is lockstep — bump all `@glissade/*` together.

  - @glissade/backend-skia@0.41.0-pre.1
  - @glissade/core@0.41.0-pre.1
  - @glissade/interact@0.41.0-pre.1
  - @glissade/lottie@0.41.0-pre.1
  - @glissade/narrate@0.41.0-pre.1
  - @glissade/player@0.41.0-pre.1
  - @glissade/scene@0.41.0-pre.1
  - @glissade/sfx@0.41.0-pre.1
  - @glissade/svg@0.41.0-pre.1

## 0.41.0-pre.0

### Minor Changes

- `gs render --incremental` — dirty-beat incremental render (re-render only the frames that changed)

  An edit that shifts timing — move one beat, re-narrate, nudge a keyframe — changes **every downstream frame's** DisplayList, so it misses the whole-frame cache (every content key shifts) AND the audio-only remux fast path (the rolled-up digest flips). A 35-minute episode re-renders in full for a three-second change. `--incremental` kills that: it persists the **ordered per-frame content-key vector** in the render manifest, diffs it against the prior render, and re-renders **only the changed frame runs** — splicing the unchanged runs verbatim out of a retained FFV1 lossless intermediate.

  ```sh
  gs render episode.ts --out ep.mp4 --incremental   # first run: builds the intermediate
  # …edit one beat in the middle…
  gs render episode.ts --out ep.mp4 --incremental   # re-renders only the changed run, splices the rest
  #   incremental: 61/1530 frames changed — re-rendering those, splicing 1469 from the intermediate
  ```

  **Determinism holds byte-exact THROUGH the optimization.** A warm splice is byte-for-byte identical to a cold `--incremental` render of the same edited scene: FFV1 is lossless and intra-only, so a kept segment decodes to the exact pixels a re-render would produce, and one final encode over the spliced stream is the cold render. The per-frame key is the same proof the frame cache and the golden corpus trust — an end-to-end test asserts splice ≡ cold-full byte-identity (forward edit, unchanged re-render, and reverse edit). Implies the lossless-intermediate pipeline; video output only; a duration change (frame-count mismatch), an encode-param change, or a GPU/shader scene falls back to a full render. The manifest gains an optional `frameKeys` field, so pre-0.41 manifests simply full-render the first time. Docs: `docs/caching.md`.

### Patch Changes

- @glissade/backend-skia@0.41.0-pre.0
- @glissade/core@0.41.0-pre.0
- @glissade/interact@0.41.0-pre.0
- @glissade/lottie@0.41.0-pre.0
- @glissade/narrate@0.41.0-pre.0
- @glissade/player@0.41.0-pre.0
- @glissade/scene@0.41.0-pre.0
- @glissade/sfx@0.41.0-pre.0
- @glissade/svg@0.41.0-pre.0

## 0.40.0

### Patch Changes

- Updated dependencies [e7cbe29]
- Updated dependencies [18f27a0]
  - @glissade/core@0.40.0
  - @glissade/scene@0.40.0
  - @glissade/backend-skia@0.40.0
  - @glissade/interact@0.40.0
  - @glissade/lottie@0.40.0
  - @glissade/narrate@0.40.0
  - @glissade/player@0.40.0
  - @glissade/sfx@0.40.0
  - @glissade/svg@0.40.0

## 0.40.0-pre.1

### Patch Changes

- Updated dependencies [e7cbe29]
  - @glissade/core@0.40.0-pre.1
  - @glissade/scene@0.40.0-pre.1
  - @glissade/backend-skia@0.40.0-pre.1
  - @glissade/interact@0.40.0-pre.1
  - @glissade/lottie@0.40.0-pre.1
  - @glissade/narrate@0.40.0-pre.1
  - @glissade/player@0.40.0-pre.1
  - @glissade/sfx@0.40.0-pre.1
  - @glissade/svg@0.40.0-pre.1

## 0.40.0-pre.0

### Patch Changes

- Updated dependencies [18f27a0]
  - @glissade/core@0.40.0-pre.0
  - @glissade/scene@0.40.0-pre.0
  - @glissade/backend-skia@0.40.0-pre.0
  - @glissade/interact@0.40.0-pre.0
  - @glissade/lottie@0.40.0-pre.0
  - @glissade/narrate@0.40.0-pre.0
  - @glissade/player@0.40.0-pre.0
  - @glissade/sfx@0.40.0-pre.0
  - @glissade/svg@0.40.0-pre.0

## 0.39.0

### Minor Changes

- e80a82f: 0.39: `gs master` — series-consistent loudness + the true-peak limiter

  `gs measure-loudness` gains one asset at a time and clamps the gain against the
  source peak (no limiter), so a peaky short lands LUs below target and a series ends
  up inconsistent (−14 episodes / −16 shorts). `gs master glissade.master.json`:

  - measures **all** members together (globs, like `gs build`'s `scenes`), picks the
    loudest shared LUFS target the whole set can reach under a shared true-peak
    ceiling, and ships the deferred brickwall **true-peak limiter** so a peaky member
    recovers headroom instead of landing low;
  - **verifies** each member (applies gain+limiter, re-measures the output) and
    reports the real `out` LUFS/dBTP — exits non-zero if any verified peak still
    exceeds the ceiling;
  - writes the ordinary `<scene>.loudness.json` sidecar + a `limiter` block, so it
    **composes with the render-time mixHash preflight** (a re-narrate still
    invalidates it loudly before frame 1) and **applies as a mix-only remux** (~20 s/
    asset) — `render` copies the video stream and re-muxes audio through
    `volume=<gain>dB, alimiter=…`, never re-rendering frames.

  `consistency: 'shared-target'` (default) normalizes every member to one LUFS;
  `'per-asset'` drives each to its own max. `limiter: false` keeps the legacy
  peak-clamp. The limiter is the one non-linear stage, baked from committed params in
  the audio graph (deterministic on a pinned ffmpeg) — a mastered render stays
  byte-identical run-to-run. Visual determinism untouched (audio-only). `render`'s
  `resolveLoudnessGainDb` now returns `{ gainDb, limiter? }` instead of a bare number.

### Patch Changes

- e33b136: 0.39.0-pre.1: gs master — make `truepeak` an ACTUAL true-peak limiter (canary defect mIoSZoacbuHM)

  ai-training's real-audio read (corroborated structurally by video-canary) caught
  that `mode:'truepeak'` wasn't true-peak: `alimiter=limit=10^(ceilingDb/20)` is a
  **sample-peak** brickwall fed a dBFS number — it holds the sample peak at −1 but
  the inter-sample / TRUE peak leaked to +1.0 dBTP (clipping over the ceiling), and
  `gs master`'s own verify pass then `exit 1`'d on the documented youtube/−1 config.

  Fix: the limiter now **oversamples 4×** (`aresample` up → `alimiter` → `aresample`
  down) so it sees and holds the inter-sample peaks, with an ~0.8 dB guard for the
  downsample residue. Empirically the worst case (clipped-noise, +5.64 dBTP raw)
  lands at −1.3 dBTP; a quiet source is untouched. The verify pass now passes (no
  self-inflicted `exit 1`) and stays a real gate for a genuine over-ceiling.

  The gain/limiter chain is shared (`loudnessFilterNodes`) between the `gs master`
  verify pass and the render `filter_complex`, so the committed limiter and the
  rendered output are the identical deterministic chain. Added a peaky-source
  regression test asserting rendered true-peak ≤ ceiling (the fixture gap that let
  the defect through: with-audio is quiet, so the limiter never engaged). The other
  three mechanics (shared-target, mix-only remux, mixHash preflight) were verified
  green by both seats. `masterAfChain` is now async.

  - @glissade/backend-skia@0.39.0
  - @glissade/core@0.39.0
  - @glissade/interact@0.39.0
  - @glissade/lottie@0.39.0
  - @glissade/narrate@0.39.0
  - @glissade/player@0.39.0
  - @glissade/scene@0.39.0
  - @glissade/sfx@0.39.0
  - @glissade/svg@0.39.0

## 0.39.0-pre.1

### Patch Changes

- e33b136: 0.39.0-pre.1: gs master — make `truepeak` an ACTUAL true-peak limiter (canary defect mIoSZoacbuHM)

  ai-training's real-audio read (corroborated structurally by video-canary) caught
  that `mode:'truepeak'` wasn't true-peak: `alimiter=limit=10^(ceilingDb/20)` is a
  **sample-peak** brickwall fed a dBFS number — it holds the sample peak at −1 but
  the inter-sample / TRUE peak leaked to +1.0 dBTP (clipping over the ceiling), and
  `gs master`'s own verify pass then `exit 1`'d on the documented youtube/−1 config.

  Fix: the limiter now **oversamples 4×** (`aresample` up → `alimiter` → `aresample`
  down) so it sees and holds the inter-sample peaks, with an ~0.8 dB guard for the
  downsample residue. Empirically the worst case (clipped-noise, +5.64 dBTP raw)
  lands at −1.3 dBTP; a quiet source is untouched. The verify pass now passes (no
  self-inflicted `exit 1`) and stays a real gate for a genuine over-ceiling.

  The gain/limiter chain is shared (`loudnessFilterNodes`) between the `gs master`
  verify pass and the render `filter_complex`, so the committed limiter and the
  rendered output are the identical deterministic chain. Added a peaky-source
  regression test asserting rendered true-peak ≤ ceiling (the fixture gap that let
  the defect through: with-audio is quiet, so the limiter never engaged). The other
  three mechanics (shared-target, mix-only remux, mixHash preflight) were verified
  green by both seats. `masterAfChain` is now async.

  - @glissade/backend-skia@0.39.0-pre.1
  - @glissade/core@0.39.0-pre.1
  - @glissade/interact@0.39.0-pre.1
  - @glissade/lottie@0.39.0-pre.1
  - @glissade/narrate@0.39.0-pre.1
  - @glissade/player@0.39.0-pre.1
  - @glissade/scene@0.39.0-pre.1
  - @glissade/sfx@0.39.0-pre.1
  - @glissade/svg@0.39.0-pre.1

## 0.39.0-pre.0

### Minor Changes

- e80a82f: 0.39: `gs master` — series-consistent loudness + the true-peak limiter

  `gs measure-loudness` gains one asset at a time and clamps the gain against the
  source peak (no limiter), so a peaky short lands LUs below target and a series ends
  up inconsistent (−14 episodes / −16 shorts). `gs master glissade.master.json`:

  - measures **all** members together (globs, like `gs build`'s `scenes`), picks the
    loudest shared LUFS target the whole set can reach under a shared true-peak
    ceiling, and ships the deferred brickwall **true-peak limiter** so a peaky member
    recovers headroom instead of landing low;
  - **verifies** each member (applies gain+limiter, re-measures the output) and
    reports the real `out` LUFS/dBTP — exits non-zero if any verified peak still
    exceeds the ceiling;
  - writes the ordinary `<scene>.loudness.json` sidecar + a `limiter` block, so it
    **composes with the render-time mixHash preflight** (a re-narrate still
    invalidates it loudly before frame 1) and **applies as a mix-only remux** (~20 s/
    asset) — `render` copies the video stream and re-muxes audio through
    `volume=<gain>dB, alimiter=…`, never re-rendering frames.

  `consistency: 'shared-target'` (default) normalizes every member to one LUFS;
  `'per-asset'` drives each to its own max. `limiter: false` keeps the legacy
  peak-clamp. The limiter is the one non-linear stage, baked from committed params in
  the audio graph (deterministic on a pinned ffmpeg) — a mastered render stays
  byte-identical run-to-run. Visual determinism untouched (audio-only). `render`'s
  `resolveLoudnessGainDb` now returns `{ gainDb, limiter? }` instead of a bare number.

### Patch Changes

- @glissade/backend-skia@0.39.0-pre.0
- @glissade/core@0.39.0-pre.0
- @glissade/interact@0.39.0-pre.0
- @glissade/lottie@0.39.0-pre.0
- @glissade/narrate@0.39.0-pre.0
- @glissade/player@0.39.0-pre.0
- @glissade/scene@0.39.0-pre.0
- @glissade/sfx@0.39.0-pre.0
- @glissade/svg@0.39.0-pre.0

## 0.38.0

### Patch Changes

- Updated dependencies [57b56d0]
- Updated dependencies [474fc66]
  - @glissade/scene@0.38.0
  - @glissade/backend-skia@0.38.0
  - @glissade/interact@0.38.0
  - @glissade/lottie@0.38.0
  - @glissade/narrate@0.38.0
  - @glissade/player@0.38.0
  - @glissade/svg@0.38.0
  - @glissade/core@0.38.0
  - @glissade/sfx@0.38.0

## 0.38.0-pre.1

### Patch Changes

- Updated dependencies [57b56d0]
  - @glissade/scene@0.38.0-pre.1
  - @glissade/backend-skia@0.38.0-pre.1
  - @glissade/interact@0.38.0-pre.1
  - @glissade/lottie@0.38.0-pre.1
  - @glissade/narrate@0.38.0-pre.1
  - @glissade/player@0.38.0-pre.1
  - @glissade/svg@0.38.0-pre.1
  - @glissade/core@0.38.0-pre.1
  - @glissade/sfx@0.38.0-pre.1

## 0.38.0-pre.0

### Patch Changes

- Updated dependencies [474fc66]
  - @glissade/scene@0.38.0-pre.0
  - @glissade/backend-skia@0.38.0-pre.0
  - @glissade/interact@0.38.0-pre.0
  - @glissade/lottie@0.38.0-pre.0
  - @glissade/narrate@0.38.0-pre.0
  - @glissade/player@0.38.0-pre.0
  - @glissade/svg@0.38.0-pre.0
  - @glissade/core@0.38.0-pre.0
  - @glissade/sfx@0.38.0-pre.0

## 0.37.0

### Minor Changes

- 001364b: 0.37: `gs repin` — the narration-aware golden reviewer, on a shipped perceptual tier

  The lived pain: one re-narration re-flows every beat, so all of a project's
  golden PNGs go stale at once and get re-pinned blind with `vitest -u` — the exact
  thing that makes a re-narration batch un-landable.

  - **`gs repin <scene-module> --golden <dir>`** renders the current scene
    frame-by-frame against the committed goldens and, for every changed frame,
    reports a perceptual delta (mean SSIM + the worst 8×8 tile — _where_ it
    changed) and a one-line **cause** by diffing the scene's
    `*.narration.timing.json` sibling against a git ref: `seg-4 moved +0.21s:
re-narration` (a downstream beat is attributed to its upstream shift). Default
    is a **dry run**; `--write` re-pins, `--only` gates per-frame, `--floor <ssim>`
    **refuses** a bigger-than-expected drop until `--force`, and `--heatmap <dir>`
    emits a thermal review PNG. Byte-equality stays the acceptance test — SSIM only
    explains and gates a divergence, never silently accepts one.
  - **Perceptual golden tier**: the SSIM metric is promoted from the test-only
    PARITY helper to a shipped `@glissade/backend-skia` export — `ssim` (scalar,
    bit-identical to before), `ssimMap` (per-tile grid + worst tile), and
    `heatmapRgba`. Headless-twin only; never on the browser embed path.

  Determinism hash and all existing goldens are unchanged (no `core`/`scene`/node
  draw touched).

### Patch Changes

- f6ac53c: 0.37.0-pre.1: gs repin cause-line — attribute the edit site + trace downstream to root (ai-training canary evidence)

  The ai-training canary's real e01-short re-narration found the flagship's headline
  half-delivered: a re-narration changes the edited segment's **duration** (not its
  start) and pushes every later beat, but `causeFor()` only attributed _start_
  shifts — so the actually-edited segment got no cause line, and each downstream
  beat claimed its own derived shift instead of tracing to the root.

  - **Edit-site attribution**: `diffTiming` now tracks per-segment `deltaDuration`;
    the edited segment is named by its duration change (`s2 re-narrated (+0.53s
duration): re-narration`) even though its start didn't move.
  - **Downstream → root**: a purely-shifted beat is attributed `downstream of s2
(+0.53s)` — traced to the nearest upstream re-narration — instead of naming its
    own pushed start.
  - **Culprit marker**: the report flags the lowest-SSIM changed frame `◀ likely
edit-site` (a content edit drops SSIM hard; a pure time-shift barely dents it) —
    works even with no timing sibling.
  - **`ssimMap` sub-8×8 guard**: an image smaller than one 8×8 tile returns a
    vacuous mean 1 instead of NaN (0/0).
  - **Discoverability**: `@glissade/cli`'s shipped README now documents `gs repin`
    - points to the guide (both canaries flagged that docs/golden-review.md isn't in
      the npm tarball).

  Determinism/goldens unchanged; the SSIM scalar stays bit-identical for all real
  (≥8×8) frames.

- Updated dependencies [f6ac53c]
- Updated dependencies [001364b]
  - @glissade/backend-skia@0.37.0
  - @glissade/core@0.37.0
  - @glissade/interact@0.37.0
  - @glissade/lottie@0.37.0
  - @glissade/narrate@0.37.0
  - @glissade/player@0.37.0
  - @glissade/scene@0.37.0
  - @glissade/sfx@0.37.0
  - @glissade/svg@0.37.0

## 0.37.0-pre.1

### Patch Changes

- f6ac53c: 0.37.0-pre.1: gs repin cause-line — attribute the edit site + trace downstream to root (ai-training canary evidence)

  The ai-training canary's real e01-short re-narration found the flagship's headline
  half-delivered: a re-narration changes the edited segment's **duration** (not its
  start) and pushes every later beat, but `causeFor()` only attributed _start_
  shifts — so the actually-edited segment got no cause line, and each downstream
  beat claimed its own derived shift instead of tracing to the root.

  - **Edit-site attribution**: `diffTiming` now tracks per-segment `deltaDuration`;
    the edited segment is named by its duration change (`s2 re-narrated (+0.53s
duration): re-narration`) even though its start didn't move.
  - **Downstream → root**: a purely-shifted beat is attributed `downstream of s2
(+0.53s)` — traced to the nearest upstream re-narration — instead of naming its
    own pushed start.
  - **Culprit marker**: the report flags the lowest-SSIM changed frame `◀ likely
edit-site` (a content edit drops SSIM hard; a pure time-shift barely dents it) —
    works even with no timing sibling.
  - **`ssimMap` sub-8×8 guard**: an image smaller than one 8×8 tile returns a
    vacuous mean 1 instead of NaN (0/0).
  - **Discoverability**: `@glissade/cli`'s shipped README now documents `gs repin`
    - points to the guide (both canaries flagged that docs/golden-review.md isn't in
      the npm tarball).

  Determinism/goldens unchanged; the SSIM scalar stays bit-identical for all real
  (≥8×8) frames.

- Updated dependencies [f6ac53c]
  - @glissade/backend-skia@0.37.0-pre.1
  - @glissade/core@0.37.0-pre.1
  - @glissade/interact@0.37.0-pre.1
  - @glissade/lottie@0.37.0-pre.1
  - @glissade/narrate@0.37.0-pre.1
  - @glissade/player@0.37.0-pre.1
  - @glissade/scene@0.37.0-pre.1
  - @glissade/sfx@0.37.0-pre.1
  - @glissade/svg@0.37.0-pre.1

## 0.37.0-pre.0

### Minor Changes

- 001364b: 0.37: `gs repin` — the narration-aware golden reviewer, on a shipped perceptual tier

  The lived pain: one re-narration re-flows every beat, so all of a project's
  golden PNGs go stale at once and get re-pinned blind with `vitest -u` — the exact
  thing that makes a re-narration batch un-landable.

  - **`gs repin <scene-module> --golden <dir>`** renders the current scene
    frame-by-frame against the committed goldens and, for every changed frame,
    reports a perceptual delta (mean SSIM + the worst 8×8 tile — _where_ it
    changed) and a one-line **cause** by diffing the scene's
    `*.narration.timing.json` sibling against a git ref: `seg-4 moved +0.21s:
re-narration` (a downstream beat is attributed to its upstream shift). Default
    is a **dry run**; `--write` re-pins, `--only` gates per-frame, `--floor <ssim>`
    **refuses** a bigger-than-expected drop until `--force`, and `--heatmap <dir>`
    emits a thermal review PNG. Byte-equality stays the acceptance test — SSIM only
    explains and gates a divergence, never silently accepts one.
  - **Perceptual golden tier**: the SSIM metric is promoted from the test-only
    PARITY helper to a shipped `@glissade/backend-skia` export — `ssim` (scalar,
    bit-identical to before), `ssimMap` (per-tile grid + worst tile), and
    `heatmapRgba`. Headless-twin only; never on the browser embed path.

  Determinism hash and all existing goldens are unchanged (no `core`/`scene`/node
  draw touched).

### Patch Changes

- Updated dependencies [001364b]
  - @glissade/backend-skia@0.37.0-pre.0
  - @glissade/core@0.37.0-pre.0
  - @glissade/interact@0.37.0-pre.0
  - @glissade/lottie@0.37.0-pre.0
  - @glissade/narrate@0.37.0-pre.0
  - @glissade/player@0.37.0-pre.0
  - @glissade/scene@0.37.0-pre.0
  - @glissade/sfx@0.37.0-pre.0
  - @glissade/svg@0.37.0-pre.0

## 0.36.0

### Patch Changes

- Updated dependencies [bf56c5e]
- Updated dependencies [81c97ad]
  - @glissade/scene@0.36.0
  - @glissade/backend-skia@0.36.0
  - @glissade/interact@0.36.0
  - @glissade/lottie@0.36.0
  - @glissade/narrate@0.36.0
  - @glissade/player@0.36.0
  - @glissade/svg@0.36.0
  - @glissade/core@0.36.0
  - @glissade/sfx@0.36.0

## 0.36.0-pre.1

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.36.0-pre.1
  - @glissade/backend-skia@0.36.0-pre.1
  - @glissade/interact@0.36.0-pre.1
  - @glissade/lottie@0.36.0-pre.1
  - @glissade/narrate@0.36.0-pre.1
  - @glissade/player@0.36.0-pre.1
  - @glissade/svg@0.36.0-pre.1
  - @glissade/core@0.36.0-pre.1
  - @glissade/sfx@0.36.0-pre.1

## 0.36.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.36.0-pre.0
  - @glissade/backend-skia@0.36.0-pre.0
  - @glissade/interact@0.36.0-pre.0
  - @glissade/lottie@0.36.0-pre.0
  - @glissade/narrate@0.36.0-pre.0
  - @glissade/player@0.36.0-pre.0
  - @glissade/svg@0.36.0-pre.0
  - @glissade/core@0.36.0-pre.0
  - @glissade/sfx@0.36.0-pre.0

## 0.35.0

### Patch Changes

- 9bd7523: Two authoring-loop papercuts: `gs migrate --check` and `gs dev` layout parity

  - **`gs migrate --check`** exits non-zero when the diff has any breaking change — a CI gate for engine bumps (default stays advisory, exit 0). Pairs with committed per-release manifests from `gs describe --out`.
  - **`gs dev`** now loads the Yoga layout engine when the scene uses `Layout`/`Stack`/`Row`/`Column` (the same `hasLayout` check `gs render`/`gs mcp` already do) — a layout scene under `gs dev` used to throw `LayoutEngineMissingError`.

- Updated dependencies [c60b039]
- Updated dependencies [9bd7523]
  - @glissade/scene@0.35.0
  - @glissade/narrate@0.35.0
  - @glissade/backend-skia@0.35.0
  - @glissade/interact@0.35.0
  - @glissade/lottie@0.35.0
  - @glissade/player@0.35.0
  - @glissade/svg@0.35.0
  - @glissade/core@0.35.0
  - @glissade/sfx@0.35.0

## 0.35.0-pre.1

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.35.0-pre.1
  - @glissade/backend-skia@0.35.0-pre.1
  - @glissade/interact@0.35.0-pre.1
  - @glissade/lottie@0.35.0-pre.1
  - @glissade/narrate@0.35.0-pre.1
  - @glissade/player@0.35.0-pre.1
  - @glissade/svg@0.35.0-pre.1
  - @glissade/core@0.35.0-pre.1
  - @glissade/sfx@0.35.0-pre.1

## 0.35.0-pre.0

### Patch Changes

- Two authoring-loop papercuts: `gs migrate --check` and `gs dev` layout parity

  - **`gs migrate --check`** exits non-zero when the diff has any breaking change — a CI gate for engine bumps (default stays advisory, exit 0). Pairs with committed per-release manifests from `gs describe --out`.
  - **`gs dev`** now loads the Yoga layout engine when the scene uses `Layout`/`Stack`/`Row`/`Column` (the same `hasLayout` check `gs render`/`gs mcp` already do) — a layout scene under `gs dev` used to throw `LayoutEngineMissingError`.

- Updated dependencies
  - @glissade/scene@0.35.0-pre.0
  - @glissade/narrate@0.35.0-pre.0
  - @glissade/backend-skia@0.35.0-pre.0
  - @glissade/interact@0.35.0-pre.0
  - @glissade/lottie@0.35.0-pre.0
  - @glissade/player@0.35.0-pre.0
  - @glissade/svg@0.35.0-pre.0
  - @glissade/core@0.35.0-pre.0
  - @glissade/sfx@0.35.0-pre.0

## 0.34.0

### Patch Changes

- Updated dependencies [8d0806a]
- Updated dependencies [04a008c]
  - @glissade/scene@0.34.0
  - @glissade/backend-skia@0.34.0
  - @glissade/interact@0.34.0
  - @glissade/lottie@0.34.0
  - @glissade/narrate@0.34.0
  - @glissade/player@0.34.0
  - @glissade/svg@0.34.0
  - @glissade/core@0.34.0
  - @glissade/sfx@0.34.0

## 0.34.0-pre.1

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.34.0-pre.1
  - @glissade/backend-skia@0.34.0-pre.1
  - @glissade/interact@0.34.0-pre.1
  - @glissade/lottie@0.34.0-pre.1
  - @glissade/narrate@0.34.0-pre.1
  - @glissade/player@0.34.0-pre.1
  - @glissade/svg@0.34.0-pre.1
  - @glissade/core@0.34.0-pre.1
  - @glissade/sfx@0.34.0-pre.1

## 0.34.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.34.0-pre.0
  - @glissade/backend-skia@0.34.0-pre.0
  - @glissade/interact@0.34.0-pre.0
  - @glissade/lottie@0.34.0-pre.0
  - @glissade/narrate@0.34.0-pre.0
  - @glissade/player@0.34.0-pre.0
  - @glissade/svg@0.34.0-pre.0
  - @glissade/core@0.34.0-pre.0
  - @glissade/sfx@0.34.0-pre.0

## 0.33.0

### Minor Changes

- af2e9d1: `gs build`: render-option defaults in the project config + two loudness-pipeline fixes (the burned-captions batch, end to end)

  A consumer's first full-series `gs build` (49 steps, 310 min) burned captions into 8 episode masters that ship soft captions — and the hand re-render batch that followed surfaced two more pipeline defects. All three are fixed:

  **1. `defaults` now carries render options.** `ProjectConfig.defaults` was `{ fps, cache }` only, so every `gs build` render used the `--captions burn` default with no way to say otherwise:

  ```ts
  export default defineProject({
    scenes: ["episodes/**/*.ts"],
    out: "dist",
    defaults: { captions: "sidecar", fps: 30 }, // narration/music/sfx/loudness too
  });
  ```

  The new options (`captions`, `narration`, `music`, `sfx`, `loudness`) thread into render, the mix modes ALSO thread into `measure-loudness` (the measured mix must be the rendered mix), and — critically — they **fold into the per-step staleness hash**: flipping `captions: 'sidecar'` re-runs render instead of serving the stale burned master from a fresh-looking cache. `cache` stays out of the hash (a speed knob, never an output input). Verified end to end: flip re-runs ONLY render; burn vs sidecar masters differ; the sidecar master carries no baked-in caption pixels.

  **2. `mixHash` is now invocation-path-independent.** `computeMixHash` folded verbatim path strings (siblings derive from `modulePath`), so `gs build` (absolute path) and a standalone `gs measure-loudness <relative>` produced different hashes over byte-identical mixes — a `gs build`-committed measurement then read as _stale_ from any standalone render. Inputs are now folded under scene-relative labels: `rel == abs == ./`-form, while content changes still invalidate. **Migration note:** committed `*.loudness.json` hashes from ≤0.32.0 will read stale once — the error message says so; one `gs measure-loudness` re-run migrates each (same measured numbers, new hash format).

  **3. The stale-loudness guard now PREFLIGHTS.** It used to first run inside audio planning — _after_ the entire frame loop — so a stale mixHash surfaced only after ~30 min of doomed rendering per episode (~2.5 h lost across the batch). Every input the guard reads exists at t=0; it now resolves (and throws) before frame 1, and the regression test asserts no output artifact is written on a stale render.

### Patch Changes

- 157c3f6: Audit hardening sweep: migrate props crash, --fps validation, MCP write-boundary values, and CLI fail-loud polish

  Fixes from the 2026-07-01 full-app audit:

  - **`gs migrate`**: an old baseline NODE lacking `props` crashed the added-props diff loop (`Cannot read properties of undefined`) — the 0.31 missing⇒empty contract now covers `node.props` on both sides (old-side missing ⇒ additive, new-side missing ⇒ breaking).
  - **`--fps 0` / negative** was silently accepted and rendered the WRONG frame with exit 0 (`t = frame/0 = Infinity` clamps to the timeline end). All three fps-consuming commands now fail loud.
  - **`gs mcp apply_patch`** validated targets but not VALUES: a keyframe of `'oops'` / `Infinity` (JSON `1e999`) applied `ok:true` and detonated at the next `render_frame`, poisoning the session. Values are now validated at the write boundary — the doc is untouched on rejection.
  - **Layer cache**: a corrupted entry header with an intact payload could escape as a false "hit"; the decoder now rejects any payload whose length ≠ w×h×4, so every corruption is a clean miss.
  - **Polish**: `gs --version`; `gs import` rejects non-`.json`/`.svg` inputs with a clear message; a typo'd scene path fails with one clean line (no phantom require stack); a multi-frame render to a `.png` path errors instead of silently creating a directory named `foo.png`; a frame range past the timeline end warns (frozen-tail padding stays possible); `gs measure-loudness` no longer prints its mix notes twice.

- Updated dependencies [157c3f6]
  - @glissade/scene@0.33.0
  - @glissade/backend-skia@0.33.0
  - @glissade/interact@0.33.0
  - @glissade/lottie@0.33.0
  - @glissade/narrate@0.33.0
  - @glissade/player@0.33.0
  - @glissade/svg@0.33.0
  - @glissade/core@0.33.0
  - @glissade/sfx@0.33.0

## 0.33.0-pre.0

### Minor Changes

- `gs build`: render-option defaults in the project config + two loudness-pipeline fixes (the burned-captions batch, end to end)

  A consumer's first full-series `gs build` (49 steps, 310 min) burned captions into 8 episode masters that ship soft captions — and the hand re-render batch that followed surfaced two more pipeline defects. All three are fixed:

  **1. `defaults` now carries render options.** `ProjectConfig.defaults` was `{ fps, cache }` only, so every `gs build` render used the `--captions burn` default with no way to say otherwise:

  ```ts
  export default defineProject({
    scenes: ["episodes/**/*.ts"],
    out: "dist",
    defaults: { captions: "sidecar", fps: 30 }, // narration/music/sfx/loudness too
  });
  ```

  The new options (`captions`, `narration`, `music`, `sfx`, `loudness`) thread into render, the mix modes ALSO thread into `measure-loudness` (the measured mix must be the rendered mix), and — critically — they **fold into the per-step staleness hash**: flipping `captions: 'sidecar'` re-runs render instead of serving the stale burned master from a fresh-looking cache. `cache` stays out of the hash (a speed knob, never an output input). Verified end to end: flip re-runs ONLY render; burn vs sidecar masters differ; the sidecar master carries no baked-in caption pixels.

  **2. `mixHash` is now invocation-path-independent.** `computeMixHash` folded verbatim path strings (siblings derive from `modulePath`), so `gs build` (absolute path) and a standalone `gs measure-loudness <relative>` produced different hashes over byte-identical mixes — a `gs build`-committed measurement then read as _stale_ from any standalone render. Inputs are now folded under scene-relative labels: `rel == abs == ./`-form, while content changes still invalidate. **Migration note:** committed `*.loudness.json` hashes from ≤0.32.0 will read stale once — the error message says so; one `gs measure-loudness` re-run migrates each (same measured numbers, new hash format).

  **3. The stale-loudness guard now PREFLIGHTS.** It used to first run inside audio planning — _after_ the entire frame loop — so a stale mixHash surfaced only after ~30 min of doomed rendering per episode (~2.5 h lost across the batch). Every input the guard reads exists at t=0; it now resolves (and throws) before frame 1, and the regression test asserts no output artifact is written on a stale render.

### Patch Changes

- 157c3f6: Audit hardening sweep: migrate props crash, --fps validation, MCP write-boundary values, and CLI fail-loud polish

  Fixes from the 2026-07-01 full-app audit:

  - **`gs migrate`**: an old baseline NODE lacking `props` crashed the added-props diff loop (`Cannot read properties of undefined`) — the 0.31 missing⇒empty contract now covers `node.props` on both sides (old-side missing ⇒ additive, new-side missing ⇒ breaking).
  - **`--fps 0` / negative** was silently accepted and rendered the WRONG frame with exit 0 (`t = frame/0 = Infinity` clamps to the timeline end). All three fps-consuming commands now fail loud.
  - **`gs mcp apply_patch`** validated targets but not VALUES: a keyframe of `'oops'` / `Infinity` (JSON `1e999`) applied `ok:true` and detonated at the next `render_frame`, poisoning the session. Values are now validated at the write boundary — the doc is untouched on rejection.
  - **Layer cache**: a corrupted entry header with an intact payload could escape as a false "hit"; the decoder now rejects any payload whose length ≠ w×h×4, so every corruption is a clean miss.
  - **Polish**: `gs --version`; `gs import` rejects non-`.json`/`.svg` inputs with a clear message; a typo'd scene path fails with one clean line (no phantom require stack); a multi-frame render to a `.png` path errors instead of silently creating a directory named `foo.png`; a frame range past the timeline end warns (frozen-tail padding stays possible); `gs measure-loudness` no longer prints its mix notes twice.

- Updated dependencies [157c3f6]
  - @glissade/scene@0.33.0-pre.0
  - @glissade/backend-skia@0.33.0-pre.0
  - @glissade/interact@0.33.0-pre.0
  - @glissade/lottie@0.33.0-pre.0
  - @glissade/narrate@0.33.0-pre.0
  - @glissade/player@0.33.0-pre.0
  - @glissade/svg@0.33.0-pre.0
  - @glissade/core@0.33.0-pre.0
  - @glissade/sfx@0.33.0-pre.0

## 0.32.0

### Patch Changes

- Updated dependencies [4eb1a91]
- Updated dependencies [e5f1d16]
- Updated dependencies [4eb1a91]
  - @glissade/scene@0.32.0
  - @glissade/core@0.32.0
  - @glissade/backend-skia@0.32.0
  - @glissade/interact@0.32.0
  - @glissade/lottie@0.32.0
  - @glissade/narrate@0.32.0
  - @glissade/player@0.32.0
  - @glissade/svg@0.32.0
  - @glissade/sfx@0.32.0

## 0.32.0-pre.1

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @glissade/scene@0.32.0-pre.1
  - @glissade/core@0.32.0-pre.1
  - @glissade/backend-skia@0.32.0-pre.1
  - @glissade/interact@0.32.0-pre.1
  - @glissade/lottie@0.32.0-pre.1
  - @glissade/narrate@0.32.0-pre.1
  - @glissade/player@0.32.0-pre.1
  - @glissade/svg@0.32.0-pre.1
  - @glissade/sfx@0.32.0-pre.1

## 0.32.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.32.0-pre.0
  - @glissade/backend-skia@0.32.0-pre.0
  - @glissade/interact@0.32.0-pre.0
  - @glissade/lottie@0.32.0-pre.0
  - @glissade/narrate@0.32.0-pre.0
  - @glissade/player@0.32.0-pre.0
  - @glissade/svg@0.32.0-pre.0
  - @glissade/core@0.32.0-pre.0
  - @glissade/sfx@0.32.0-pre.0

## 0.31.0

### Minor Changes

- 7113436: `gs migrate` + `gs describe` — the describe()-driven engine-bump assistant (ends the adopt-debt)

  Bumping the engine across several minors used to mean hand-repointing moved imports (`tokenHighlight`→`/scene/tokens`, `motionPath`→`/scene/motion`), guessing which symbols were removed, and eyeballing a scary unreviewable batch. But `describe()` (0.18) already pins version + node/prop taxonomy + import subpaths + builder signatures per release — **so the diff between two manifests IS the migration surface.**

  ```sh
  gs describe --out api-0.30.json     # snapshot THIS engine's API manifest (commit it per release)
  gs migrate api-0.30.json            # diff that baseline against the current engine
  gs migrate api-0.30.json --json     # machine-readable report (an agent codemod's input)
  ```

  `gs migrate` reports, with the right breaking/additive classification and a suggested fix per breaking item:

  ```
  gs migrate: 0.13.0 → 0.31.0
    3 breaking · 5 additive · 8 total

  BREAKING — action needed:
    → [helper] tokenHighlight: import moved @glissade/scene/diagnostics → @glissade/scene/tokens
        ↳ import { tokenHighlight } from '@glissade/scene/tokens'
    ✗ [node]   LegacyThing: node type removed (was imported from @glissade/scene)
    ~ [prop]   Text.wrap: value type number → vec2
        ↳ a Track on Text.wrap now expects a vec2 value — VERIFY every keyframe
  ADDITIVE — new in this engine:
    + [node]   MotionBlur: new node type (import from @glissade/scene)
    …
  ```

  The report is generated **FROM the real registry** — it cannot claim a move that didn't happen, so the no-drift guarantee extends to migration itself (an identical manifest yields an empty report). It detects moved imports (node subpath + helper import), removed/added nodes · props · helpers · builder methods · value types · easings, prop value-type changes, and animatable transitions — each `breaking` when a consumer on the old engine could break, `additive` otherwise.

  This MVP is **advisory** — it hands you the precise, exhaustive change list + a suggested action per item; it never touches your files. (AST source-rewriting is deferred: the `--json` report here is exactly the input such a codemod would consume.) Ships entirely in `cli`; nothing added to the embed path.

### Patch Changes

- f938c44: `gs migrate`: don't crash on a baseline that predates a `describe()` field (the deep-jump case)

  `gs migrate` reads a saved API manifest and diffs it against the current engine — and the whole point is _deep_ jumps. But a baseline older than a given `describe()` field simply doesn't have that field: `helpers` was added after 0.19, and `builder` / `valueTypes` / `easings` each have their own introduction point. The manifest-validity check only requires `version` + `nodes`, so an old-but-valid manifest passed validation and then threw a raw `TypeError` (`Cannot read properties of undefined (reading 'map')`) in the diff — on exactly the long-lived-jump path the tool exists for.

  `diffManifests` now treats **every** collection as possibly-absent on either side (missing ⇒ empty): a field the current engine has but the baseline didn't records as _additive_, a field the baseline had but the current engine dropped records as _breaking_, and nothing crashes. Verified on a real 0.19.1 (pre-`helpers`) manifest end-to-end, plus a regression test for each direction. Also documents the data-history nuance in the migration guide: a symbol shows up as **moved** only when the baseline recorded its old import path — a baseline older than a move sees the symbol as additive-at-its-current-path (still the exact import you need). Caught by two canary seats on 0.31.0-pre.0.

  - @glissade/backend-skia@0.31.0
  - @glissade/core@0.31.0
  - @glissade/interact@0.31.0
  - @glissade/lottie@0.31.0
  - @glissade/narrate@0.31.0
  - @glissade/player@0.31.0
  - @glissade/scene@0.31.0
  - @glissade/sfx@0.31.0
  - @glissade/svg@0.31.0

## 0.31.0-pre.1

### Patch Changes

- `gs migrate`: don't crash on a baseline that predates a `describe()` field (the deep-jump case)

  `gs migrate` reads a saved API manifest and diffs it against the current engine — and the whole point is _deep_ jumps. But a baseline older than a given `describe()` field simply doesn't have that field: `helpers` was added after 0.19, and `builder` / `valueTypes` / `easings` each have their own introduction point. The manifest-validity check only requires `version` + `nodes`, so an old-but-valid manifest passed validation and then threw a raw `TypeError` (`Cannot read properties of undefined (reading 'map')`) in the diff — on exactly the long-lived-jump path the tool exists for.

  `diffManifests` now treats **every** collection as possibly-absent on either side (missing ⇒ empty): a field the current engine has but the baseline didn't records as _additive_, a field the baseline had but the current engine dropped records as _breaking_, and nothing crashes. Verified on a real 0.19.1 (pre-`helpers`) manifest end-to-end, plus a regression test for each direction. Also documents the data-history nuance in the migration guide: a symbol shows up as **moved** only when the baseline recorded its old import path — a baseline older than a move sees the symbol as additive-at-its-current-path (still the exact import you need). Caught by two canary seats on 0.31.0-pre.0.

  - @glissade/backend-skia@0.31.0-pre.1
  - @glissade/core@0.31.0-pre.1
  - @glissade/interact@0.31.0-pre.1
  - @glissade/lottie@0.31.0-pre.1
  - @glissade/narrate@0.31.0-pre.1
  - @glissade/player@0.31.0-pre.1
  - @glissade/scene@0.31.0-pre.1
  - @glissade/sfx@0.31.0-pre.1
  - @glissade/svg@0.31.0-pre.1

## 0.31.0-pre.0

### Minor Changes

- `gs migrate` + `gs describe` — the describe()-driven engine-bump assistant (ends the adopt-debt)

  Bumping the engine across several minors used to mean hand-repointing moved imports (`tokenHighlight`→`/scene/tokens`, `motionPath`→`/scene/motion`), guessing which symbols were removed, and eyeballing a scary unreviewable batch. But `describe()` (0.18) already pins version + node/prop taxonomy + import subpaths + builder signatures per release — **so the diff between two manifests IS the migration surface.**

  ```sh
  gs describe --out api-0.30.json     # snapshot THIS engine's API manifest (commit it per release)
  gs migrate api-0.30.json            # diff that baseline against the current engine
  gs migrate api-0.30.json --json     # machine-readable report (an agent codemod's input)
  ```

  `gs migrate` reports, with the right breaking/additive classification and a suggested fix per breaking item:

  ```
  gs migrate: 0.13.0 → 0.31.0
    3 breaking · 5 additive · 8 total

  BREAKING — action needed:
    → [helper] tokenHighlight: import moved @glissade/scene/diagnostics → @glissade/scene/tokens
        ↳ import { tokenHighlight } from '@glissade/scene/tokens'
    ✗ [node]   LegacyThing: node type removed (was imported from @glissade/scene)
    ~ [prop]   Text.wrap: value type number → vec2
        ↳ a Track on Text.wrap now expects a vec2 value — VERIFY every keyframe
  ADDITIVE — new in this engine:
    + [node]   MotionBlur: new node type (import from @glissade/scene)
    …
  ```

  The report is generated **FROM the real registry** — it cannot claim a move that didn't happen, so the no-drift guarantee extends to migration itself (an identical manifest yields an empty report). It detects moved imports (node subpath + helper import), removed/added nodes · props · helpers · builder methods · value types · easings, prop value-type changes, and animatable transitions — each `breaking` when a consumer on the old engine could break, `additive` otherwise.

  This MVP is **advisory** — it hands you the precise, exhaustive change list + a suggested action per item; it never touches your files. (AST source-rewriting is deferred: the `--json` report here is exactly the input such a codemod would consume.) Ships entirely in `cli`; nothing added to the embed path.

### Patch Changes

- @glissade/backend-skia@0.31.0-pre.0
- @glissade/core@0.31.0-pre.0
- @glissade/interact@0.31.0-pre.0
- @glissade/lottie@0.31.0-pre.0
- @glissade/narrate@0.31.0-pre.0
- @glissade/player@0.31.0-pre.0
- @glissade/scene@0.31.0-pre.0
- @glissade/sfx@0.31.0-pre.0
- @glissade/svg@0.31.0-pre.0

## 0.30.0

### Patch Changes

- Updated dependencies [e651ed6]
  - @glissade/scene@0.30.0
  - @glissade/backend-skia@0.30.0
  - @glissade/interact@0.30.0
  - @glissade/lottie@0.30.0
  - @glissade/narrate@0.30.0
  - @glissade/player@0.30.0
  - @glissade/svg@0.30.0
  - @glissade/core@0.30.0
  - @glissade/sfx@0.30.0

## 0.30.0-pre.0

### Patch Changes

- Updated dependencies [e651ed6]
  - @glissade/scene@0.30.0-pre.0
  - @glissade/backend-skia@0.30.0-pre.0
  - @glissade/interact@0.30.0-pre.0
  - @glissade/lottie@0.30.0-pre.0
  - @glissade/narrate@0.30.0-pre.0
  - @glissade/player@0.30.0-pre.0
  - @glissade/svg@0.30.0-pre.0
  - @glissade/core@0.30.0-pre.0
  - @glissade/sfx@0.30.0-pre.0

## 0.29.0

### Minor Changes

- 99b4188: `gs build` — a content-graph DAG runner that runs only the stale subtree

  A `glissade.config.ts` lists a project's scenes; `gs build` derives each scene's narrate → sfx → measure-loudness → render pipeline, content-hashes every step's inputs (source + upstream outputs + glissade version), and runs ONLY what's stale. A one-segment re-narration re-narrates that asset, re-syncs ITS sfx, re-measures ITS loudness, re-renders it — and touches nothing else. The 5-step × N-asset manual batch becomes one command.

  ```ts
  // glissade.config.ts
  import { defineProject } from "@glissade/cli/config";
  export default defineProject({ scenes: ["episodes/**/*.ts"] });
  ```

  ```
  gs build              # build everything stale
  gs build e07          # restrict to matching scenes
  gs build --explain    # print the plan (run/skip + reason per step), run nothing
  ```

  Staleness propagates by content hashing — a step's inputs include its upstream's outputs, so a changed upstream re-triggers everything downstream (and only that scene's downstream; other assets stay fresh). A per-scene `.gsbuild.json` records each step's last-built input hash. It reuses the shipped `narrate`/`sfx`/`measure-loudness`/`render` commands (and their fail-loud guards like `mixHash`), so it stays deterministic; step execution is injectable, so the orchestration is unit-tested without a TTS venv or ffmpeg. CLI-only — the base embed is unchanged.

### Patch Changes

- @glissade/backend-skia@0.29.0
- @glissade/core@0.29.0
- @glissade/interact@0.29.0
- @glissade/lottie@0.29.0
- @glissade/narrate@0.29.0
- @glissade/player@0.29.0
- @glissade/scene@0.29.0
- @glissade/sfx@0.29.0
- @glissade/svg@0.29.0

## 0.29.0-pre.0

### Minor Changes

- 99b4188: `gs build` — a content-graph DAG runner that runs only the stale subtree

  A `glissade.config.ts` lists a project's scenes; `gs build` derives each scene's narrate → sfx → measure-loudness → render pipeline, content-hashes every step's inputs (source + upstream outputs + glissade version), and runs ONLY what's stale. A one-segment re-narration re-narrates that asset, re-syncs ITS sfx, re-measures ITS loudness, re-renders it — and touches nothing else. The 5-step × N-asset manual batch becomes one command.

  ```ts
  // glissade.config.ts
  import { defineProject } from "@glissade/cli/config";
  export default defineProject({ scenes: ["episodes/**/*.ts"] });
  ```

  ```
  gs build              # build everything stale
  gs build e07          # restrict to matching scenes
  gs build --explain    # print the plan (run/skip + reason per step), run nothing
  ```

  Staleness propagates by content hashing — a step's inputs include its upstream's outputs, so a changed upstream re-triggers everything downstream (and only that scene's downstream; other assets stay fresh). A per-scene `.gsbuild.json` records each step's last-built input hash. It reuses the shipped `narrate`/`sfx`/`measure-loudness`/`render` commands (and their fail-loud guards like `mixHash`), so it stays deterministic; step execution is injectable, so the orchestration is unit-tested without a TTS venv or ffmpeg. CLI-only — the base embed is unchanged.

### Patch Changes

- @glissade/backend-skia@0.29.0-pre.0
- @glissade/core@0.29.0-pre.0
- @glissade/interact@0.29.0-pre.0
- @glissade/lottie@0.29.0-pre.0
- @glissade/narrate@0.29.0-pre.0
- @glissade/player@0.29.0-pre.0
- @glissade/scene@0.29.0-pre.0
- @glissade/sfx@0.29.0-pre.0
- @glissade/svg@0.29.0-pre.0

## 0.28.0

### Minor Changes

- 2a9f74c: `gs mcp <scene>` — the AI-native write layer: an MCP stdio server for authoring a scene

  Turns `describe()` from a read-only manifest (the observation space) into a full **author → render → verify** loop (the action space). `gs mcp <scene-module>` starts a Model Context Protocol stdio server for that scene, exposing tools an agent calls without ever reading source:

  - **`describe`** — the API manifest: which props are animatable, per node type.
  - **`list_targets`** — the concrete `<nodeId>/<prop>` animatable targets of THIS scene (id-substituted, with value types).
  - **`apply_patch`** — a **validated, reversible** Timeline Patch batch. A target that isn't animatable on this scene is rejected before it touches the doc (fail-loud write boundary); every apply records its inverse.
  - **`undo`** — revert the last `apply_patch`.
  - **`render_frame(t)`** — render one frame of the (patched) scene → a PNG returned inline as an image. The deterministic verifier.
  - **`get_timeline`** — the current merged timeline (code + edits) as JSON.

  It rides only shipped primitives — `describe()` (can't drift, examples run in CI), Timeline Patch (pure doc→doc, reversible, sidecar-merged), and a single deterministic Skia frame — so the whole loop stays pure. Lives in `@glissade/cli` (Node-only, `@modelcontextprotocol/sdk`) — never on the embed path; the base embed is unchanged.

  ```
  gs mcp my-scene.ts   # then point an MCP client (an agent) at it
  ```

### Patch Changes

- 01719fe: `gs mcp`: fix `render_frame` staleness after `undo` returns the sidecar to baseline

  `render_frame` reused one scene instance across calls. `evaluate` binds the current merged timeline's tracks but does not unbind a track that was present in a prior evaluate and absent now — so undoing the last edit (sidecar back to empty) left the removed track's stale binding on the reused scene, and `render_frame` kept rendering the pre-undo frame even though `get_timeline` correctly reverted. `render_frame` now builds a fresh scene per call (stateless, like `gs render` per run), so it's a pure function of the current merged timeline + t. Found independently by two canary seats; a regression test (apply → render → undo → render == baseline byte-identical) is added.

  - @glissade/backend-skia@0.28.0
  - @glissade/core@0.28.0
  - @glissade/interact@0.28.0
  - @glissade/lottie@0.28.0
  - @glissade/narrate@0.28.0
  - @glissade/player@0.28.0
  - @glissade/scene@0.28.0
  - @glissade/sfx@0.28.0
  - @glissade/svg@0.28.0

## 0.28.0-pre.1

### Patch Changes

- 01719fe: `gs mcp`: fix `render_frame` staleness after `undo` returns the sidecar to baseline

  `render_frame` reused one scene instance across calls. `evaluate` binds the current merged timeline's tracks but does not unbind a track that was present in a prior evaluate and absent now — so undoing the last edit (sidecar back to empty) left the removed track's stale binding on the reused scene, and `render_frame` kept rendering the pre-undo frame even though `get_timeline` correctly reverted. `render_frame` now builds a fresh scene per call (stateless, like `gs render` per run), so it's a pure function of the current merged timeline + t. Found independently by two canary seats; a regression test (apply → render → undo → render == baseline byte-identical) is added.

  - @glissade/backend-skia@0.28.0-pre.1
  - @glissade/core@0.28.0-pre.1
  - @glissade/interact@0.28.0-pre.1
  - @glissade/lottie@0.28.0-pre.1
  - @glissade/narrate@0.28.0-pre.1
  - @glissade/player@0.28.0-pre.1
  - @glissade/scene@0.28.0-pre.1
  - @glissade/sfx@0.28.0-pre.1
  - @glissade/svg@0.28.0-pre.1

## 0.28.0-pre.0

### Minor Changes

- 2a9f74c: `gs mcp <scene>` — the AI-native write layer: an MCP stdio server for authoring a scene

  Turns `describe()` from a read-only manifest (the observation space) into a full **author → render → verify** loop (the action space). `gs mcp <scene-module>` starts a Model Context Protocol stdio server for that scene, exposing tools an agent calls without ever reading source:

  - **`describe`** — the API manifest: which props are animatable, per node type.
  - **`list_targets`** — the concrete `<nodeId>/<prop>` animatable targets of THIS scene (id-substituted, with value types).
  - **`apply_patch`** — a **validated, reversible** Timeline Patch batch. A target that isn't animatable on this scene is rejected before it touches the doc (fail-loud write boundary); every apply records its inverse.
  - **`undo`** — revert the last `apply_patch`.
  - **`render_frame(t)`** — render one frame of the (patched) scene → a PNG returned inline as an image. The deterministic verifier.
  - **`get_timeline`** — the current merged timeline (code + edits) as JSON.

  It rides only shipped primitives — `describe()` (can't drift, examples run in CI), Timeline Patch (pure doc→doc, reversible, sidecar-merged), and a single deterministic Skia frame — so the whole loop stays pure. Lives in `@glissade/cli` (Node-only, `@modelcontextprotocol/sdk`) — never on the embed path; the base embed is unchanged.

  ```
  gs mcp my-scene.ts   # then point an MCP client (an agent) at it
  ```

### Patch Changes

- @glissade/backend-skia@0.28.0-pre.0
- @glissade/core@0.28.0-pre.0
- @glissade/interact@0.28.0-pre.0
- @glissade/lottie@0.28.0-pre.0
- @glissade/narrate@0.28.0-pre.0
- @glissade/player@0.28.0-pre.0
- @glissade/scene@0.28.0-pre.0
- @glissade/sfx@0.28.0-pre.0
- @glissade/svg@0.28.0-pre.0

## 0.27.1

### Patch Changes

- 13fcd2e: `gs render --cache`: disk-persistent **layer-cache tier** — a static subtree survives a re-narration

  The whole-frame cache (0.27) is defeated by a re-narration: new TTS shifts beats, so captions/timing frames change and every frame key flips. But an expensive _static_ subtree — a blurred mesh backdrop — is byte-identical across all of it. Its in-memory raster cache (§3.5) only spanned one render; now `--cache` also persists a `cache:true` group's device-space raster to disk (`.gscache/layers/`), so it rasterizes ONCE and re-blits on later renders even when the whole-frame cache misses.

  - **`@glissade/scene`**: the compositor (`raster2d.ts`) gains an injected `LayerStore` seam (`get`/`put` of a device-space RGBA + bounds). On an in-memory miss it consults the store and promotes the hit to RAM; on a store it persists the layer once. Scene stays Node-dep-free — the store is injected. `Ctx2DLike` gains `getImageData`.
  - **`@glissade/backend-skia`**: `new SkiaBackend(w, h, { layerStore })` / `backend.setLayerStore(...)`.
  - **`@glissade/cli`**: an fs-backed `LayerCache` (deflated RGBA + bounds, atomic, content-addressed) whose key is salted with the toolchain version ⊕ backend caps ⊕ frame size; wired into `render.ts` under `--cache`.

  A restored layer composites **byte-identically** to a fresh raster (RGBA round-trips through `putImageData`) — proven end-to-end. The tier is purely additive and opt-in: with no `--cache` (or `RASTER_CACHE=0`) the output is unchanged, and all 325 goldens stay byte-identical.

- Updated dependencies [13fcd2e]
  - @glissade/scene@0.27.1
  - @glissade/backend-skia@0.27.1
  - @glissade/interact@0.27.1
  - @glissade/lottie@0.27.1
  - @glissade/narrate@0.27.1
  - @glissade/player@0.27.1
  - @glissade/svg@0.27.1
  - @glissade/core@0.27.1
  - @glissade/sfx@0.27.1

## 0.27.1-pre.0

### Patch Changes

- 13fcd2e: `gs render --cache`: disk-persistent **layer-cache tier** — a static subtree survives a re-narration

  The whole-frame cache (0.27) is defeated by a re-narration: new TTS shifts beats, so captions/timing frames change and every frame key flips. But an expensive _static_ subtree — a blurred mesh backdrop — is byte-identical across all of it. Its in-memory raster cache (§3.5) only spanned one render; now `--cache` also persists a `cache:true` group's device-space raster to disk (`.gscache/layers/`), so it rasterizes ONCE and re-blits on later renders even when the whole-frame cache misses.

  - **`@glissade/scene`**: the compositor (`raster2d.ts`) gains an injected `LayerStore` seam (`get`/`put` of a device-space RGBA + bounds). On an in-memory miss it consults the store and promotes the hit to RAM; on a store it persists the layer once. Scene stays Node-dep-free — the store is injected. `Ctx2DLike` gains `getImageData`.
  - **`@glissade/backend-skia`**: `new SkiaBackend(w, h, { layerStore })` / `backend.setLayerStore(...)`.
  - **`@glissade/cli`**: an fs-backed `LayerCache` (deflated RGBA + bounds, atomic, content-addressed) whose key is salted with the toolchain version ⊕ backend caps ⊕ frame size; wired into `render.ts` under `--cache`.

  A restored layer composites **byte-identically** to a fresh raster (RGBA round-trips through `putImageData`) — proven end-to-end. The tier is purely additive and opt-in: with no `--cache` (or `RASTER_CACHE=0`) the output is unchanged, and all 325 goldens stay byte-identical.

- Updated dependencies [13fcd2e]
  - @glissade/scene@0.27.1-pre.0
  - @glissade/backend-skia@0.27.1-pre.0
  - @glissade/interact@0.27.1-pre.0
  - @glissade/lottie@0.27.1-pre.0
  - @glissade/narrate@0.27.1-pre.0
  - @glissade/player@0.27.1-pre.0
  - @glissade/svg@0.27.1-pre.0
  - @glissade/core@0.27.1-pre.0
  - @glissade/sfx@0.27.1-pre.0

## 0.27.0

### Minor Changes

- 6880dbc: `gs render --cache`: audio-only **remux fast path** — a voice re-master becomes a remux, not a re-render

  The persistent whole-frame cache (0.12) already skips _rendering_ frames whose visual inputs are unchanged — but an all-cache-hit render still re-_encoded_ the video. Now, when rendering a video with `--cache`, `gs render` writes a `<out>.gsrender.json` manifest recording the ordered digest of every frame's content-cache key. On a re-render, a cheap **key-only pre-pass** (evaluate + hash, no raster) recomputes that digest; if it matches the prior manifest and the output + encode params are unchanged, the video is byte-identical, so glissade skips the frame loop entirely and `ffmpeg -c:v copy` remuxes just the new audio:

  ```
  gs render e07.ts --out e07.mp4 --cache .gscache
    240/240 frames unchanged (audio-only) — video copy + remux → e07.mp4
  ```

  The frame-key digest **is** a determinism proof: identical DisplayLists per frame ⇒ identical raster on the pinned Skia toolchain ⇒ identical encode. Any pixel change flips the digest and falls back to a full encode; a codec / container / fps / frame-count change also forces a re-encode. No new flag — `--cache` just gets smarter. The encode path is byte-for-byte unchanged.

  _(The disk-persistent layer-cache tier from the same card — a marked `Group`'s raster surviving a re-narration — is a fast-follow.)_

### Patch Changes

- @glissade/backend-skia@0.27.0
- @glissade/core@0.27.0
- @glissade/interact@0.27.0
- @glissade/lottie@0.27.0
- @glissade/narrate@0.27.0
- @glissade/player@0.27.0
- @glissade/scene@0.27.0
- @glissade/sfx@0.27.0
- @glissade/svg@0.27.0

## 0.27.0-pre.0

### Minor Changes

- 6880dbc: `gs render --cache`: audio-only **remux fast path** — a voice re-master becomes a remux, not a re-render

  The persistent whole-frame cache (0.12) already skips _rendering_ frames whose visual inputs are unchanged — but an all-cache-hit render still re-_encoded_ the video. Now, when rendering a video with `--cache`, `gs render` writes a `<out>.gsrender.json` manifest recording the ordered digest of every frame's content-cache key. On a re-render, a cheap **key-only pre-pass** (evaluate + hash, no raster) recomputes that digest; if it matches the prior manifest and the output + encode params are unchanged, the video is byte-identical, so glissade skips the frame loop entirely and `ffmpeg -c:v copy` remuxes just the new audio:

  ```
  gs render e07.ts --out e07.mp4 --cache .gscache
    240/240 frames unchanged (audio-only) — video copy + remux → e07.mp4
  ```

  The frame-key digest **is** a determinism proof: identical DisplayLists per frame ⇒ identical raster on the pinned Skia toolchain ⇒ identical encode. Any pixel change flips the digest and falls back to a full encode; a codec / container / fps / frame-count change also forces a re-encode. No new flag — `--cache` just gets smarter. The encode path is byte-for-byte unchanged.

  _(The disk-persistent layer-cache tier from the same card — a marked `Group`'s raster surviving a re-narration — is a fast-follow.)_

### Patch Changes

- @glissade/backend-skia@0.27.0-pre.0
- @glissade/core@0.27.0-pre.0
- @glissade/interact@0.27.0-pre.0
- @glissade/lottie@0.27.0-pre.0
- @glissade/narrate@0.27.0-pre.0
- @glissade/player@0.27.0-pre.0
- @glissade/scene@0.27.0-pre.0
- @glissade/sfx@0.27.0-pre.0
- @glissade/svg@0.27.0-pre.0

## 0.26.0

### Patch Changes

- Updated dependencies [b3218c9]
- Updated dependencies [bfadc4a]
- Updated dependencies [b3218c9]
- Updated dependencies [b3218c9]
  - @glissade/scene@0.26.0
  - @glissade/core@0.26.0
  - @glissade/backend-skia@0.26.0
  - @glissade/interact@0.26.0
  - @glissade/lottie@0.26.0
  - @glissade/narrate@0.26.0
  - @glissade/player@0.26.0
  - @glissade/svg@0.26.0
  - @glissade/sfx@0.26.0

## 0.26.0-pre.1

### Patch Changes

- Updated dependencies [bfadc4a]
  - @glissade/scene@0.26.0-pre.1
  - @glissade/backend-skia@0.26.0-pre.1
  - @glissade/interact@0.26.0-pre.1
  - @glissade/lottie@0.26.0-pre.1
  - @glissade/narrate@0.26.0-pre.1
  - @glissade/player@0.26.0-pre.1
  - @glissade/svg@0.26.0-pre.1
  - @glissade/core@0.26.0-pre.1
  - @glissade/sfx@0.26.0-pre.1

## 0.26.0-pre.0

### Patch Changes

- Updated dependencies [b3218c9]
- Updated dependencies [b3218c9]
- Updated dependencies [b3218c9]
  - @glissade/scene@0.26.0-pre.0
  - @glissade/core@0.26.0-pre.0
  - @glissade/backend-skia@0.26.0-pre.0
  - @glissade/interact@0.26.0-pre.0
  - @glissade/lottie@0.26.0-pre.0
  - @glissade/narrate@0.26.0-pre.0
  - @glissade/player@0.26.0-pre.0
  - @glissade/svg@0.26.0-pre.0
  - @glissade/sfx@0.26.0-pre.0

## 0.25.0

### Patch Changes

- Updated dependencies [d780cdd]
- Updated dependencies [d907a72]
- Updated dependencies [d780cdd]
  - @glissade/scene@0.25.0
  - @glissade/core@0.25.0
  - @glissade/backend-skia@0.25.0
  - @glissade/interact@0.25.0
  - @glissade/lottie@0.25.0
  - @glissade/narrate@0.25.0
  - @glissade/player@0.25.0
  - @glissade/svg@0.25.0
  - @glissade/sfx@0.25.0

## 0.25.0-pre.1

### Patch Changes

- Updated dependencies [d780cdd]
- Updated dependencies [d780cdd]
  - @glissade/scene@0.25.0-pre.1
  - @glissade/core@0.25.0-pre.1
  - @glissade/backend-skia@0.25.0-pre.1
  - @glissade/interact@0.25.0-pre.1
  - @glissade/lottie@0.25.0-pre.1
  - @glissade/narrate@0.25.0-pre.1
  - @glissade/player@0.25.0-pre.1
  - @glissade/svg@0.25.0-pre.1
  - @glissade/sfx@0.25.0-pre.1

## 0.25.0-pre.0

### Patch Changes

- Updated dependencies [d907a72]
  - @glissade/scene@0.25.0-pre.0
  - @glissade/backend-skia@0.25.0-pre.0
  - @glissade/interact@0.25.0-pre.0
  - @glissade/lottie@0.25.0-pre.0
  - @glissade/narrate@0.25.0-pre.0
  - @glissade/player@0.25.0-pre.0
  - @glissade/svg@0.25.0-pre.0
  - @glissade/core@0.25.0-pre.0
  - @glissade/sfx@0.25.0-pre.0

## 0.24.0

### Patch Changes

- Updated dependencies [d2f85c7]
- Updated dependencies [ad0decf]
- Updated dependencies [096e988]
  - @glissade/scene@0.24.0
  - @glissade/backend-skia@0.24.0
  - @glissade/interact@0.24.0
  - @glissade/lottie@0.24.0
  - @glissade/narrate@0.24.0
  - @glissade/player@0.24.0
  - @glissade/svg@0.24.0
  - @glissade/core@0.24.0
  - @glissade/sfx@0.24.0

## 0.24.0-pre.3

### Patch Changes

- Updated dependencies [ad0decf]
  - @glissade/scene@0.24.0-pre.3
  - @glissade/backend-skia@0.24.0-pre.3
  - @glissade/interact@0.24.0-pre.3
  - @glissade/lottie@0.24.0-pre.3
  - @glissade/narrate@0.24.0-pre.3
  - @glissade/player@0.24.0-pre.3
  - @glissade/svg@0.24.0-pre.3
  - @glissade/core@0.24.0-pre.3
  - @glissade/sfx@0.24.0-pre.3

## 0.24.0-pre.2

### Patch Changes

- @glissade/backend-skia@0.24.0-pre.2
- @glissade/core@0.24.0-pre.2
- @glissade/interact@0.24.0-pre.2
- @glissade/lottie@0.24.0-pre.2
- @glissade/narrate@0.24.0-pre.2
- @glissade/player@0.24.0-pre.2
- @glissade/scene@0.24.0-pre.2
- @glissade/sfx@0.24.0-pre.2
- @glissade/svg@0.24.0-pre.2

## 0.24.0-pre.1

### Patch Changes

- Updated dependencies [096e988]
  - @glissade/scene@0.24.0-pre.1
  - @glissade/backend-skia@0.24.0-pre.1
  - @glissade/interact@0.24.0-pre.1
  - @glissade/lottie@0.24.0-pre.1
  - @glissade/narrate@0.24.0-pre.1
  - @glissade/player@0.24.0-pre.1
  - @glissade/svg@0.24.0-pre.1
  - @glissade/core@0.24.0-pre.1
  - @glissade/sfx@0.24.0-pre.1

## 0.24.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.24.0-pre.0
  - @glissade/backend-skia@0.24.0-pre.0
  - @glissade/interact@0.24.0-pre.0
  - @glissade/lottie@0.24.0-pre.0
  - @glissade/narrate@0.24.0-pre.0
  - @glissade/player@0.24.0-pre.0
  - @glissade/svg@0.24.0-pre.0
  - @glissade/core@0.24.0-pre.0
  - @glissade/sfx@0.24.0-pre.0

## 0.23.0

### Patch Changes

- Updated dependencies [60fc247]
- Updated dependencies [8209c61]
- Updated dependencies [e54d593]
- Updated dependencies [33077e8]
- Updated dependencies [7c8f184]
  - @glissade/narrate@0.23.0
  - @glissade/core@0.23.0
  - @glissade/scene@0.23.0
  - @glissade/backend-skia@0.23.0
  - @glissade/interact@0.23.0
  - @glissade/lottie@0.23.0
  - @glissade/player@0.23.0
  - @glissade/sfx@0.23.0
  - @glissade/svg@0.23.0

## 0.23.0-pre.5

### Patch Changes

- Updated dependencies [e54d593]
  - @glissade/core@0.23.0-pre.5
  - @glissade/scene@0.23.0-pre.5
  - @glissade/backend-skia@0.23.0-pre.5
  - @glissade/interact@0.23.0-pre.5
  - @glissade/lottie@0.23.0-pre.5
  - @glissade/narrate@0.23.0-pre.5
  - @glissade/player@0.23.0-pre.5
  - @glissade/sfx@0.23.0-pre.5
  - @glissade/svg@0.23.0-pre.5

## 0.23.0-pre.4

### Patch Changes

- Updated dependencies [60fc247]
  - @glissade/narrate@0.23.0-pre.4
  - @glissade/backend-skia@0.23.0-pre.4
  - @glissade/core@0.23.0-pre.4
  - @glissade/interact@0.23.0-pre.4
  - @glissade/lottie@0.23.0-pre.4
  - @glissade/player@0.23.0-pre.4
  - @glissade/scene@0.23.0-pre.4
  - @glissade/sfx@0.23.0-pre.4
  - @glissade/svg@0.23.0-pre.4

## 0.23.0-pre.3

### Patch Changes

- Updated dependencies [33077e8]
  - @glissade/scene@0.23.0-pre.3
  - @glissade/backend-skia@0.23.0-pre.3
  - @glissade/interact@0.23.0-pre.3
  - @glissade/lottie@0.23.0-pre.3
  - @glissade/narrate@0.23.0-pre.3
  - @glissade/player@0.23.0-pre.3
  - @glissade/svg@0.23.0-pre.3
  - @glissade/core@0.23.0-pre.3
  - @glissade/sfx@0.23.0-pre.3

## 0.23.0-pre.2

### Patch Changes

- @glissade/backend-skia@0.23.0-pre.2
- @glissade/core@0.23.0-pre.2
- @glissade/interact@0.23.0-pre.2
- @glissade/lottie@0.23.0-pre.2
- @glissade/narrate@0.23.0-pre.2
- @glissade/player@0.23.0-pre.2
- @glissade/scene@0.23.0-pre.2
- @glissade/sfx@0.23.0-pre.2
- @glissade/svg@0.23.0-pre.2

## 0.23.0-pre.1

### Patch Changes

- Updated dependencies [8209c61]
  - @glissade/core@0.23.0-pre.1
  - @glissade/scene@0.23.0-pre.1
  - @glissade/backend-skia@0.23.0-pre.1
  - @glissade/interact@0.23.0-pre.1
  - @glissade/lottie@0.23.0-pre.1
  - @glissade/narrate@0.23.0-pre.1
  - @glissade/player@0.23.0-pre.1
  - @glissade/sfx@0.23.0-pre.1
  - @glissade/svg@0.23.0-pre.1

## 0.23.0-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.23.0-pre.0
  - @glissade/backend-skia@0.23.0-pre.0
  - @glissade/interact@0.23.0-pre.0
  - @glissade/lottie@0.23.0-pre.0
  - @glissade/narrate@0.23.0-pre.0
  - @glissade/player@0.23.0-pre.0
  - @glissade/svg@0.23.0-pre.0
  - @glissade/core@0.23.0-pre.0
  - @glissade/sfx@0.23.0-pre.0

## 0.22.0

### Patch Changes

- Updated dependencies [42d281e]
- Updated dependencies [7f880e7]
- Updated dependencies [095cfd2]
  - @glissade/scene@0.22.0
  - @glissade/narrate@0.22.0
  - @glissade/backend-skia@0.22.0
  - @glissade/interact@0.22.0
  - @glissade/lottie@0.22.0
  - @glissade/player@0.22.0
  - @glissade/svg@0.22.0
  - @glissade/core@0.22.0
  - @glissade/sfx@0.22.0

## 0.22.0-pre.5

### Patch Changes

- @glissade/backend-skia@0.22.0-pre.5
- @glissade/core@0.22.0-pre.5
- @glissade/interact@0.22.0-pre.5
- @glissade/lottie@0.22.0-pre.5
- @glissade/narrate@0.22.0-pre.5
- @glissade/player@0.22.0-pre.5
- @glissade/scene@0.22.0-pre.5
- @glissade/sfx@0.22.0-pre.5
- @glissade/svg@0.22.0-pre.5

## 0.22.0-pre.4

### Patch Changes

- Updated dependencies [7f880e7]
  - @glissade/narrate@0.22.0-pre.4
  - @glissade/backend-skia@0.22.0-pre.4
  - @glissade/core@0.22.0-pre.4
  - @glissade/interact@0.22.0-pre.4
  - @glissade/lottie@0.22.0-pre.4
  - @glissade/player@0.22.0-pre.4
  - @glissade/scene@0.22.0-pre.4
  - @glissade/sfx@0.22.0-pre.4
  - @glissade/svg@0.22.0-pre.4

## 0.22.0-pre.3

### Patch Changes

- Updated dependencies [42d281e]
  - @glissade/scene@0.22.0-pre.3
  - @glissade/backend-skia@0.22.0-pre.3
  - @glissade/interact@0.22.0-pre.3
  - @glissade/lottie@0.22.0-pre.3
  - @glissade/narrate@0.22.0-pre.3
  - @glissade/player@0.22.0-pre.3
  - @glissade/svg@0.22.0-pre.3
  - @glissade/core@0.22.0-pre.3
  - @glissade/sfx@0.22.0-pre.3

## 0.22.0-pre.2

### Patch Changes

- @glissade/backend-skia@0.22.0-pre.2
- @glissade/core@0.22.0-pre.2
- @glissade/interact@0.22.0-pre.2
- @glissade/lottie@0.22.0-pre.2
- @glissade/narrate@0.22.0-pre.2
- @glissade/player@0.22.0-pre.2
- @glissade/scene@0.22.0-pre.2
- @glissade/sfx@0.22.0-pre.2
- @glissade/svg@0.22.0-pre.2

## 0.22.0-pre.1

### Patch Changes

- @glissade/backend-skia@0.22.0-pre.1
- @glissade/core@0.22.0-pre.1
- @glissade/interact@0.22.0-pre.1
- @glissade/lottie@0.22.0-pre.1
- @glissade/narrate@0.22.0-pre.1
- @glissade/player@0.22.0-pre.1
- @glissade/scene@0.22.0-pre.1
- @glissade/sfx@0.22.0-pre.1
- @glissade/svg@0.22.0-pre.1

## 0.22.0-pre.0

### Patch Changes

- Updated dependencies [095cfd2]
  - @glissade/scene@0.22.0-pre.0
  - @glissade/backend-skia@0.22.0-pre.0
  - @glissade/interact@0.22.0-pre.0
  - @glissade/lottie@0.22.0-pre.0
  - @glissade/narrate@0.22.0-pre.0
  - @glissade/player@0.22.0-pre.0
  - @glissade/svg@0.22.0-pre.0
  - @glissade/core@0.22.0-pre.0
  - @glissade/sfx@0.22.0-pre.0

## 0.21.0

### Patch Changes

- Updated dependencies [c954768]
  - @glissade/scene@0.21.0
  - @glissade/backend-skia@0.21.0
  - @glissade/interact@0.21.0
  - @glissade/lottie@0.21.0
  - @glissade/narrate@0.21.0
  - @glissade/player@0.21.0
  - @glissade/svg@0.21.0
  - @glissade/core@0.21.0
  - @glissade/sfx@0.21.0

## 0.21.0-pre.4

### Patch Changes

- @glissade/backend-skia@0.21.0-pre.4
- @glissade/core@0.21.0-pre.4
- @glissade/interact@0.21.0-pre.4
- @glissade/lottie@0.21.0-pre.4
- @glissade/narrate@0.21.0-pre.4
- @glissade/player@0.21.0-pre.4
- @glissade/scene@0.21.0-pre.4
- @glissade/sfx@0.21.0-pre.4
- @glissade/svg@0.21.0-pre.4

## 0.21.0-pre.3

### Patch Changes

- @glissade/backend-skia@0.21.0-pre.3
- @glissade/core@0.21.0-pre.3
- @glissade/interact@0.21.0-pre.3
- @glissade/lottie@0.21.0-pre.3
- @glissade/narrate@0.21.0-pre.3
- @glissade/player@0.21.0-pre.3
- @glissade/scene@0.21.0-pre.3
- @glissade/sfx@0.21.0-pre.3
- @glissade/svg@0.21.0-pre.3

## 0.21.0-pre.2

### Patch Changes

- @glissade/backend-skia@0.21.0-pre.2
- @glissade/core@0.21.0-pre.2
- @glissade/interact@0.21.0-pre.2
- @glissade/lottie@0.21.0-pre.2
- @glissade/narrate@0.21.0-pre.2
- @glissade/player@0.21.0-pre.2
- @glissade/scene@0.21.0-pre.2
- @glissade/sfx@0.21.0-pre.2
- @glissade/svg@0.21.0-pre.2

## 0.21.0-pre.1

### Patch Changes

- @glissade/backend-skia@0.21.0-pre.1
- @glissade/core@0.21.0-pre.1
- @glissade/interact@0.21.0-pre.1
- @glissade/lottie@0.21.0-pre.1
- @glissade/narrate@0.21.0-pre.1
- @glissade/player@0.21.0-pre.1
- @glissade/scene@0.21.0-pre.1
- @glissade/sfx@0.21.0-pre.1
- @glissade/svg@0.21.0-pre.1

## 0.21.0-pre.0

### Patch Changes

- Updated dependencies [c954768]
  - @glissade/scene@0.21.0-pre.0
  - @glissade/backend-skia@0.21.0-pre.0
  - @glissade/interact@0.21.0-pre.0
  - @glissade/lottie@0.21.0-pre.0
  - @glissade/narrate@0.21.0-pre.0
  - @glissade/player@0.21.0-pre.0
  - @glissade/svg@0.21.0-pre.0
  - @glissade/core@0.21.0-pre.0
  - @glissade/sfx@0.21.0-pre.0

## 0.20.1

### Patch Changes

- Updated dependencies [86ae703]
  - @glissade/scene@0.20.1
  - @glissade/backend-skia@0.20.1
  - @glissade/interact@0.20.1
  - @glissade/lottie@0.20.1
  - @glissade/narrate@0.20.1
  - @glissade/player@0.20.1
  - @glissade/svg@0.20.1
  - @glissade/core@0.20.1
  - @glissade/sfx@0.20.1

## 0.20.1-pre.0

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.20.1-pre.0
  - @glissade/backend-skia@0.20.1-pre.0
  - @glissade/interact@0.20.1-pre.0
  - @glissade/lottie@0.20.1-pre.0
  - @glissade/narrate@0.20.1-pre.0
  - @glissade/player@0.20.1-pre.0
  - @glissade/svg@0.20.1-pre.0
  - @glissade/core@0.20.1-pre.0
  - @glissade/sfx@0.20.1-pre.0

## 0.20.0

### Patch Changes

- Updated dependencies [c629b51]
- Updated dependencies [519e1f8]
- Updated dependencies [0f5b066]
- Updated dependencies [9a69e18]
- Updated dependencies [1bd4507]
- Updated dependencies [fffa420]
- Updated dependencies [2a30be9]
- Updated dependencies [4a2117f]
- Updated dependencies [fd12bb8]
- Updated dependencies [3760b47]
- Updated dependencies [be35b11]
  - @glissade/core@0.20.0
  - @glissade/scene@0.20.0
  - @glissade/player@0.20.0
  - @glissade/backend-skia@0.20.0
  - @glissade/interact@0.20.0
  - @glissade/lottie@0.20.0
  - @glissade/narrate@0.20.0
  - @glissade/sfx@0.20.0
  - @glissade/svg@0.20.0

## 0.20.0-pre.7

### Patch Changes

- Updated dependencies
  - @glissade/scene@0.20.0-pre.7
  - @glissade/backend-skia@0.20.0-pre.7
  - @glissade/interact@0.20.0-pre.7
  - @glissade/lottie@0.20.0-pre.7
  - @glissade/narrate@0.20.0-pre.7
  - @glissade/player@0.20.0-pre.7
  - @glissade/svg@0.20.0-pre.7
  - @glissade/core@0.20.0-pre.7
  - @glissade/sfx@0.20.0-pre.7

## 0.20.0-pre.6

### Patch Changes

- Updated dependencies [4a2117f]
  - @glissade/core@0.20.0-pre.6
  - @glissade/backend-skia@0.20.0-pre.6
  - @glissade/interact@0.20.0-pre.6
  - @glissade/lottie@0.20.0-pre.6
  - @glissade/narrate@0.20.0-pre.6
  - @glissade/player@0.20.0-pre.6
  - @glissade/scene@0.20.0-pre.6
  - @glissade/sfx@0.20.0-pre.6
  - @glissade/svg@0.20.0-pre.6

## 0.20.0-pre.5

### Patch Changes

- Updated dependencies [fd12bb8]
  - @glissade/scene@0.20.0-pre.5
  - @glissade/backend-skia@0.20.0-pre.5
  - @glissade/interact@0.20.0-pre.5
  - @glissade/lottie@0.20.0-pre.5
  - @glissade/narrate@0.20.0-pre.5
  - @glissade/player@0.20.0-pre.5
  - @glissade/svg@0.20.0-pre.5
  - @glissade/core@0.20.0-pre.5
  - @glissade/sfx@0.20.0-pre.5

## 0.20.0-pre.4

### Patch Changes

- Updated dependencies [519e1f8]
  - @glissade/scene@0.20.0-pre.4
  - @glissade/backend-skia@0.20.0-pre.4
  - @glissade/interact@0.20.0-pre.4
  - @glissade/lottie@0.20.0-pre.4
  - @glissade/narrate@0.20.0-pre.4
  - @glissade/player@0.20.0-pre.4
  - @glissade/svg@0.20.0-pre.4
  - @glissade/core@0.20.0-pre.4
  - @glissade/sfx@0.20.0-pre.4

## 0.20.0-pre.3

### Patch Changes

- Updated dependencies [9a69e18]
- Updated dependencies [2a30be9]
  - @glissade/player@0.20.0-pre.3
  - @glissade/scene@0.20.0-pre.3
  - @glissade/interact@0.20.0-pre.3
  - @glissade/backend-skia@0.20.0-pre.3
  - @glissade/lottie@0.20.0-pre.3
  - @glissade/narrate@0.20.0-pre.3
  - @glissade/svg@0.20.0-pre.3
  - @glissade/core@0.20.0-pre.3
  - @glissade/sfx@0.20.0-pre.3

## 0.20.0-pre.2

### Patch Changes

- Updated dependencies [3760b47]
- Updated dependencies [be35b11]
  - @glissade/scene@0.20.0-pre.2
  - @glissade/backend-skia@0.20.0-pre.2
  - @glissade/core@0.20.0-pre.2
  - @glissade/interact@0.20.0-pre.2
  - @glissade/lottie@0.20.0-pre.2
  - @glissade/narrate@0.20.0-pre.2
  - @glissade/player@0.20.0-pre.2
  - @glissade/svg@0.20.0-pre.2
  - @glissade/sfx@0.20.0-pre.2

## 0.20.0-pre.1

### Patch Changes

- Updated dependencies [0f5b066]
- Updated dependencies [1bd4507]
  - @glissade/scene@0.20.0-pre.1
  - @glissade/backend-skia@0.20.0-pre.1
  - @glissade/interact@0.20.0-pre.1
  - @glissade/lottie@0.20.0-pre.1
  - @glissade/narrate@0.20.0-pre.1
  - @glissade/player@0.20.0-pre.1
  - @glissade/svg@0.20.0-pre.1
  - @glissade/core@0.20.0-pre.1
  - @glissade/sfx@0.20.0-pre.1

## 0.20.0-pre.0

### Patch Changes

- Updated dependencies [c629b51]
  - @glissade/core@0.20.0-pre.0
  - @glissade/scene@0.20.0-pre.0
  - @glissade/backend-skia@0.20.0-pre.0
  - @glissade/interact@0.20.0-pre.0
  - @glissade/lottie@0.20.0-pre.0
  - @glissade/narrate@0.20.0-pre.0
  - @glissade/player@0.20.0-pre.0
  - @glissade/sfx@0.20.0-pre.0
  - @glissade/svg@0.20.0-pre.0

## 0.19.1

### Patch Changes

- Updated dependencies [9fc4e90]
- Updated dependencies [2f9e213]
  - @glissade/scene@0.19.1
  - @glissade/backend-skia@0.19.1
  - @glissade/interact@0.19.1
  - @glissade/lottie@0.19.1
  - @glissade/narrate@0.19.1
  - @glissade/player@0.19.1
  - @glissade/svg@0.19.1
  - @glissade/core@0.19.1
  - @glissade/sfx@0.19.1

## 0.19.0

### Patch Changes

- Updated dependencies [6124d7f]
- Updated dependencies [bf0d4e8]
- Updated dependencies [56eb184]
- Updated dependencies [fc58403]
- Updated dependencies [02968bd]
  - @glissade/scene@0.19.0
  - @glissade/core@0.19.0
  - @glissade/backend-skia@0.19.0
  - @glissade/interact@0.19.0
  - @glissade/lottie@0.19.0
  - @glissade/narrate@0.19.0
  - @glissade/player@0.19.0
  - @glissade/svg@0.19.0
  - @glissade/sfx@0.19.0

## 0.19.0-pre.5

### Patch Changes

- Updated dependencies [02968bd]
  - @glissade/scene@0.19.0-pre.5
  - @glissade/core@0.19.0-pre.5
  - @glissade/backend-skia@0.19.0-pre.5
  - @glissade/interact@0.19.0-pre.5
  - @glissade/lottie@0.19.0-pre.5
  - @glissade/narrate@0.19.0-pre.5
  - @glissade/player@0.19.0-pre.5
  - @glissade/svg@0.19.0-pre.5
  - @glissade/sfx@0.19.0-pre.5

## 0.19.0-pre.4

### Patch Changes

- @glissade/backend-skia@0.19.0-pre.4
- @glissade/core@0.19.0-pre.4
- @glissade/interact@0.19.0-pre.4
- @glissade/lottie@0.19.0-pre.4
- @glissade/narrate@0.19.0-pre.4
- @glissade/player@0.19.0-pre.4
- @glissade/scene@0.19.0-pre.4
- @glissade/sfx@0.19.0-pre.4
- @glissade/svg@0.19.0-pre.4

## 0.19.0-pre.3

### Patch Changes

- Updated dependencies [fc58403]
  - @glissade/scene@0.19.0-pre.3
  - @glissade/backend-skia@0.19.0-pre.3
  - @glissade/interact@0.19.0-pre.3
  - @glissade/lottie@0.19.0-pre.3
  - @glissade/narrate@0.19.0-pre.3
  - @glissade/player@0.19.0-pre.3
  - @glissade/svg@0.19.0-pre.3
  - @glissade/core@0.19.0-pre.3
  - @glissade/sfx@0.19.0-pre.3

## 0.19.0-pre.2

### Patch Changes

- @glissade/backend-skia@0.19.0-pre.2
- @glissade/core@0.19.0-pre.2
- @glissade/interact@0.19.0-pre.2
- @glissade/lottie@0.19.0-pre.2
- @glissade/narrate@0.19.0-pre.2
- @glissade/player@0.19.0-pre.2
- @glissade/scene@0.19.0-pre.2
- @glissade/sfx@0.19.0-pre.2
- @glissade/svg@0.19.0-pre.2

## 0.19.0-pre.1

### Patch Changes

- Updated dependencies [56eb184]
  - @glissade/scene@0.19.0-pre.1
  - @glissade/backend-skia@0.19.0-pre.1
  - @glissade/interact@0.19.0-pre.1
  - @glissade/lottie@0.19.0-pre.1
  - @glissade/narrate@0.19.0-pre.1
  - @glissade/player@0.19.0-pre.1
  - @glissade/svg@0.19.0-pre.1
  - @glissade/core@0.19.0-pre.1
  - @glissade/sfx@0.19.0-pre.1

## 0.19.0-pre.0

### Patch Changes

- Updated dependencies [6124d7f]
- Updated dependencies [bf0d4e8]
  - @glissade/scene@0.19.0-pre.0
  - @glissade/core@0.19.0-pre.0
  - @glissade/backend-skia@0.19.0-pre.0
  - @glissade/interact@0.19.0-pre.0
  - @glissade/lottie@0.19.0-pre.0
  - @glissade/narrate@0.19.0-pre.0
  - @glissade/player@0.19.0-pre.0
  - @glissade/svg@0.19.0-pre.0
  - @glissade/sfx@0.19.0-pre.0

## 0.18.0

### Patch Changes

- Updated dependencies [746b3d0]
- Updated dependencies [3dc7adb]
- Updated dependencies [0a8967c]
- Updated dependencies [7f815f9]
- Updated dependencies [0a8967c]
- Updated dependencies [d3d9206]
- Updated dependencies [8b88d27]
- Updated dependencies [35968a1]
- Updated dependencies [e3a2f6a]
  - @glissade/core@0.18.0
  - @glissade/scene@0.18.0
  - @glissade/backend-skia@0.18.0
  - @glissade/interact@0.18.0
  - @glissade/lottie@0.18.0
  - @glissade/narrate@0.18.0
  - @glissade/player@0.18.0
  - @glissade/sfx@0.18.0
  - @glissade/svg@0.18.0

## 0.18.0-pre.6

### Patch Changes

- Updated dependencies [3dc7adb]
  - @glissade/scene@0.18.0-pre.6
  - @glissade/backend-skia@0.18.0-pre.6
  - @glissade/interact@0.18.0-pre.6
  - @glissade/lottie@0.18.0-pre.6
  - @glissade/narrate@0.18.0-pre.6
  - @glissade/player@0.18.0-pre.6
  - @glissade/svg@0.18.0-pre.6
  - @glissade/core@0.18.0-pre.6
  - @glissade/sfx@0.18.0-pre.6

## 0.18.0-pre.5

### Patch Changes

- Updated dependencies [746b3d0]
  - @glissade/core@0.18.0-pre.5
  - @glissade/scene@0.18.0-pre.5
  - @glissade/backend-skia@0.18.0-pre.5
  - @glissade/interact@0.18.0-pre.5
  - @glissade/lottie@0.18.0-pre.5
  - @glissade/narrate@0.18.0-pre.5
  - @glissade/player@0.18.0-pre.5
  - @glissade/sfx@0.18.0-pre.5
  - @glissade/svg@0.18.0-pre.5

## 0.18.0-pre.4

### Patch Changes

- Updated dependencies [0a8967c]
- Updated dependencies [0a8967c]
- Updated dependencies [35968a1]
  - @glissade/core@0.18.0-pre.4
  - @glissade/scene@0.18.0-pre.4
  - @glissade/backend-skia@0.18.0-pre.4
  - @glissade/interact@0.18.0-pre.4
  - @glissade/lottie@0.18.0-pre.4
  - @glissade/narrate@0.18.0-pre.4
  - @glissade/player@0.18.0-pre.4
  - @glissade/sfx@0.18.0-pre.4
  - @glissade/svg@0.18.0-pre.4

## 0.18.0-pre.3

### Patch Changes

- Updated dependencies [7f815f9]
  - @glissade/core@0.18.0-pre.3
  - @glissade/backend-skia@0.18.0-pre.3
  - @glissade/interact@0.18.0-pre.3
  - @glissade/lottie@0.18.0-pre.3
  - @glissade/narrate@0.18.0-pre.3
  - @glissade/player@0.18.0-pre.3
  - @glissade/scene@0.18.0-pre.3
  - @glissade/sfx@0.18.0-pre.3
  - @glissade/svg@0.18.0-pre.3

## 0.18.0-pre.2

### Patch Changes

- Updated dependencies [8b88d27]
  - @glissade/scene@0.18.0-pre.2
  - @glissade/backend-skia@0.18.0-pre.2
  - @glissade/interact@0.18.0-pre.2
  - @glissade/lottie@0.18.0-pre.2
  - @glissade/narrate@0.18.0-pre.2
  - @glissade/player@0.18.0-pre.2
  - @glissade/svg@0.18.0-pre.2
  - @glissade/core@0.18.0-pre.2
  - @glissade/sfx@0.18.0-pre.2

## 0.18.0-pre.1

### Patch Changes

- Updated dependencies [d3d9206]
  - @glissade/core@0.18.0-pre.1
  - @glissade/backend-skia@0.18.0-pre.1
  - @glissade/interact@0.18.0-pre.1
  - @glissade/lottie@0.18.0-pre.1
  - @glissade/narrate@0.18.0-pre.1
  - @glissade/player@0.18.0-pre.1
  - @glissade/scene@0.18.0-pre.1
  - @glissade/sfx@0.18.0-pre.1
  - @glissade/svg@0.18.0-pre.1

## 0.18.0-pre.0

### Patch Changes

- Updated dependencies [e3a2f6a]
  - @glissade/core@0.18.0-pre.0
  - @glissade/backend-skia@0.18.0-pre.0
  - @glissade/interact@0.18.0-pre.0
  - @glissade/lottie@0.18.0-pre.0
  - @glissade/narrate@0.18.0-pre.0
  - @glissade/player@0.18.0-pre.0
  - @glissade/scene@0.18.0-pre.0
  - @glissade/sfx@0.18.0-pre.0
  - @glissade/svg@0.18.0-pre.0

## 0.17.1

### Patch Changes

- Updated dependencies [3731dd4]
  - @glissade/scene@0.17.1
  - @glissade/backend-skia@0.17.1
  - @glissade/interact@0.17.1
  - @glissade/lottie@0.17.1
  - @glissade/narrate@0.17.1
  - @glissade/player@0.17.1
  - @glissade/svg@0.17.1
  - @glissade/core@0.17.1
  - @glissade/sfx@0.17.1

## 0.17.1-pre.0

### Patch Changes

- Updated dependencies [3731dd4]
  - @glissade/scene@0.17.1-pre.0
  - @glissade/backend-skia@0.17.1-pre.0
  - @glissade/interact@0.17.1-pre.0
  - @glissade/lottie@0.17.1-pre.0
  - @glissade/narrate@0.17.1-pre.0
  - @glissade/player@0.17.1-pre.0
  - @glissade/svg@0.17.1-pre.0
  - @glissade/core@0.17.1-pre.0
  - @glissade/sfx@0.17.1-pre.0

## 0.17.0

### Patch Changes

- @glissade/backend-skia@0.17.0
- @glissade/core@0.17.0
- @glissade/interact@0.17.0
- @glissade/lottie@0.17.0
- @glissade/narrate@0.17.0
- @glissade/player@0.17.0
- @glissade/scene@0.17.0
- @glissade/sfx@0.17.0
- @glissade/svg@0.17.0

## 0.17.0-pre.0

### Patch Changes

- @glissade/backend-skia@0.17.0-pre.0
- @glissade/core@0.17.0-pre.0
- @glissade/interact@0.17.0-pre.0
- @glissade/lottie@0.17.0-pre.0
- @glissade/narrate@0.17.0-pre.0
- @glissade/player@0.17.0-pre.0
- @glissade/scene@0.17.0-pre.0
- @glissade/sfx@0.17.0-pre.0
- @glissade/svg@0.17.0-pre.0

## 0.16.0

### Patch Changes

- Updated dependencies [577f485]
- Updated dependencies [6ce395e]
  - @glissade/narrate@0.16.0
  - @glissade/backend-skia@0.16.0
  - @glissade/core@0.16.0
  - @glissade/interact@0.16.0
  - @glissade/lottie@0.16.0
  - @glissade/player@0.16.0
  - @glissade/scene@0.16.0
  - @glissade/sfx@0.16.0
  - @glissade/svg@0.16.0

## 0.16.0-pre.1

### Patch Changes

- Updated dependencies [577f485]
  - @glissade/narrate@0.16.0-pre.1
  - @glissade/backend-skia@0.16.0-pre.1
  - @glissade/core@0.16.0-pre.1
  - @glissade/interact@0.16.0-pre.1
  - @glissade/lottie@0.16.0-pre.1
  - @glissade/player@0.16.0-pre.1
  - @glissade/scene@0.16.0-pre.1
  - @glissade/sfx@0.16.0-pre.1
  - @glissade/svg@0.16.0-pre.1

## 0.16.0-pre.0

### Patch Changes

- Updated dependencies [6ce395e]
  - @glissade/narrate@0.16.0-pre.0
  - @glissade/backend-skia@0.16.0-pre.0
  - @glissade/core@0.16.0-pre.0
  - @glissade/interact@0.16.0-pre.0
  - @glissade/lottie@0.16.0-pre.0
  - @glissade/player@0.16.0-pre.0
  - @glissade/scene@0.16.0-pre.0
  - @glissade/sfx@0.16.0-pre.0
  - @glissade/svg@0.16.0-pre.0

## 0.15.0

### Minor Changes

- a7189dd: Add `gs render <scene> --locales <a,b,c>` (0.15) — render a scene ONCE PER comma-separated locale in a single invocation, over the existing 0.14 `--locale <code>` path. Pure CLI orchestration: each per-locale render IS the 0.14 single-`--locale` render (the locale's `messages.<code>.json` ambient table + the preferred `<base>.<code>.narration.timing.json` sibling, then `render()` runs `localize()`), so `--locales en,zh` ≡ `--locale en` then `--locale zh` with distinct outputs. No render-path change — the 252 goldens stay byte-identical.

  Per-locale output convention: a video/png `--out` gets a locale segment before the extension (`out/episode.mp4` → `out/episode.<locale>.mp4`); a directory `--out` (the PNG-sequence default) gets a per-locale subdir (`out/` → `out/<locale>/`). `--format png-seq` forces the directory convention even for a video-looking name.

  `--locale` and `--locales` are mutually exclusive (passing both is a hard error). A locale in the list with NO resolvable assets (neither a message table nor a narration sibling) throws the 0.14 `UnknownLocaleError` naming the bad locale, aborting the whole fan-out loudly — never silently skipped. The fan-out loop is sequential and the per-locale ambient i18n table can't leak between iterations (`loadSceneModule` re-installs the table at the top of every render). New programmatic exports: `renderLocales`, `parseLocalesList`, `localeOutPath`, `LocaleArgsError`.

### Patch Changes

- 53030d0: 0.15 i18n-hardening 5-pack — residual localization robustness gaps, all OFF the `evaluate()` path (252 goldens byte-identical; the no-locale base path unchanged). Each fix has a violating-input regression test.

  FIX 1 (multi-cue collapse → hard-throw): `localize()` broadcasts `table[id]` to every key of a matched string track. For a multi-cue caption (a string track with >1 DISTINCT keyed value) that froze one caption over the whole video. `localize` now HARD-THROWS a `LocalizationError` naming the id and directing to per-locale narration regen; a single-value / single-key string track still localizes by broadcast.

  FIX 2 (flat-table key collision → throw-on-ambiguity): a key matching BOTH a node-id-with-a-string-track AND a free-standing `t()` id (`opts.consumedIds`) silently rewrote the node's track. `localize` now throws a clear `LocalizationError` on any such collision. PURE ADDITIVE GUARD — the flat `messages.<locale>.json` shape (`MessageTable = Record<string, string>`) is UNCHANGED; no sectioned `{tracks,messages}` format introduced.

  FIX 3 (ambient `t()` race across concurrent renders): the process-global ambient table/consumed-id set was shared across concurrent programmatic `render()`/`loadSceneModule` flows for different locales → wrong-language static `Text`. Added `runWithMessageTable(table, fn)` — an `AsyncLocalStorage`-scoped ambient table that isolates each async flow (lazily loaded `node:async_hooks`, off the embed; `core/i18n` stays 1.5 kB gz). `setMessageTable`/`getMessageTable`/`getConsumedMessageIds`/`t()` now read the active scope (ALS if present, else the process-global). Added `preservingMessageTable(fn)` (snapshot/restore the global ambient table), wired around the no-locale audio-mix helpers in the CLI (`collectMixAudioInputs`/`buildMixWav`) so they don't clobber or leak a concurrent locale's table. The CLI one-shot is unaffected.

  FIX 4 (`requireParity` within-manifest duplicate ids): the Set-based union/diff swallowed `{en:['a','a','b']}`. `requireParity` now runs a per-manifest duplicate check (`new Set(m.ids).size !== m.ids.length`) FIRST — naming the locale + dup id and throwing a `ParityError` — even for a single (or zero) manifest, before the cross-manifest diff.

  FIX 5 (`osFamilies` brand-warn gap): `buildFontExemptSet` folded the OS catalog into the exempt set; a registered/declared brand family whose name collides with an OS family could be waved through as "OS-only". The OS-catalog fold now SKIPS any name that collides with a registered family, so a declared brand font stays subject to glyph-coverage validation (a missing glyph still warns / throws under `--strict`). The exemption is for genuinely-OS-only families.

- ec57f23: 0.15 canary fix (FIX 2): support per-locale publish loudness so a localized render isn't a loudness dead-end.

  A localized render (`gs render --locale zh`) mixes the per-locale narration (the zh wavs) → a different `mixHash` than the base mix, but `gs measure-loudness` was locale-unaware: the committed `*.loudness.json` measured the BASE narration, so `resolveLoudnessGainDb` hard-threw `stale mixHash` for ANY localized video with committed loudness, with no supported way to commit a per-locale measurement.

  `loudnessPathFor(modulePath, locale?)` now emits `<stem>.<locale>.loudness.json` when a locale is set (the base `<stem>.loudness.json` is unchanged for no-locale). `gs measure-loudness --locale <code>` measures the per-locale mix (threaded through `buildMixWav` / `collectMixAudioInputs`) and commits the per-locale file. `resolveLoudnessGainDb` reads the per-locale measurement first when rendering with a locale, and when it is MISSING throws an ACTIONABLE per-locale error (`no <stem>.<locale>.loudness.json — run gs measure-loudness <scene> --locale <locale>`) instead of the generic stale message. `renderLocales` names the failing locale on a per-locale dead-end (still fails loudly, never swallowed). The no-locale loudness path and all goldens are byte-identical.

- Updated dependencies [c87e88b]
- Updated dependencies [53030d0]
- Updated dependencies [ec57f23]
- Updated dependencies [b21fa79]
  - @glissade/core@0.15.0
  - @glissade/scene@0.15.0
  - @glissade/narrate@0.15.0
  - @glissade/backend-skia@0.15.0
  - @glissade/interact@0.15.0
  - @glissade/lottie@0.15.0
  - @glissade/player@0.15.0
  - @glissade/sfx@0.15.0
  - @glissade/svg@0.15.0

## 0.15.0-pre.1

### Patch Changes

- ec57f23: 0.15 canary fix (FIX 2): support per-locale publish loudness so a localized render isn't a loudness dead-end.

  A localized render (`gs render --locale zh`) mixes the per-locale narration (the zh wavs) → a different `mixHash` than the base mix, but `gs measure-loudness` was locale-unaware: the committed `*.loudness.json` measured the BASE narration, so `resolveLoudnessGainDb` hard-threw `stale mixHash` for ANY localized video with committed loudness, with no supported way to commit a per-locale measurement.

  `loudnessPathFor(modulePath, locale?)` now emits `<stem>.<locale>.loudness.json` when a locale is set (the base `<stem>.loudness.json` is unchanged for no-locale). `gs measure-loudness --locale <code>` measures the per-locale mix (threaded through `buildMixWav` / `collectMixAudioInputs`) and commits the per-locale file. `resolveLoudnessGainDb` reads the per-locale measurement first when rendering with a locale, and when it is MISSING throws an ACTIONABLE per-locale error (`no <stem>.<locale>.loudness.json — run gs measure-loudness <scene> --locale <locale>`) instead of the generic stale message. `renderLocales` names the failing locale on a per-locale dead-end (still fails loudly, never swallowed). The no-locale loudness path and all goldens are byte-identical.

- Updated dependencies [ec57f23]
  - @glissade/narrate@0.15.0-pre.1
  - @glissade/backend-skia@0.15.0-pre.1
  - @glissade/core@0.15.0-pre.1
  - @glissade/interact@0.15.0-pre.1
  - @glissade/lottie@0.15.0-pre.1
  - @glissade/player@0.15.0-pre.1
  - @glissade/scene@0.15.0-pre.1
  - @glissade/sfx@0.15.0-pre.1
  - @glissade/svg@0.15.0-pre.1

## 0.15.0-pre.0

### Minor Changes

- a7189dd: Add `gs render <scene> --locales <a,b,c>` (0.15) — render a scene ONCE PER comma-separated locale in a single invocation, over the existing 0.14 `--locale <code>` path. Pure CLI orchestration: each per-locale render IS the 0.14 single-`--locale` render (the locale's `messages.<code>.json` ambient table + the preferred `<base>.<code>.narration.timing.json` sibling, then `render()` runs `localize()`), so `--locales en,zh` ≡ `--locale en` then `--locale zh` with distinct outputs. No render-path change — the 252 goldens stay byte-identical.

  Per-locale output convention: a video/png `--out` gets a locale segment before the extension (`out/episode.mp4` → `out/episode.<locale>.mp4`); a directory `--out` (the PNG-sequence default) gets a per-locale subdir (`out/` → `out/<locale>/`). `--format png-seq` forces the directory convention even for a video-looking name.

  `--locale` and `--locales` are mutually exclusive (passing both is a hard error). A locale in the list with NO resolvable assets (neither a message table nor a narration sibling) throws the 0.14 `UnknownLocaleError` naming the bad locale, aborting the whole fan-out loudly — never silently skipped. The fan-out loop is sequential and the per-locale ambient i18n table can't leak between iterations (`loadSceneModule` re-installs the table at the top of every render). New programmatic exports: `renderLocales`, `parseLocalesList`, `localeOutPath`, `LocaleArgsError`.

### Patch Changes

- 53030d0: 0.15 i18n-hardening 5-pack — residual localization robustness gaps, all OFF the `evaluate()` path (252 goldens byte-identical; the no-locale base path unchanged). Each fix has a violating-input regression test.

  FIX 1 (multi-cue collapse → hard-throw): `localize()` broadcasts `table[id]` to every key of a matched string track. For a multi-cue caption (a string track with >1 DISTINCT keyed value) that froze one caption over the whole video. `localize` now HARD-THROWS a `LocalizationError` naming the id and directing to per-locale narration regen; a single-value / single-key string track still localizes by broadcast.

  FIX 2 (flat-table key collision → throw-on-ambiguity): a key matching BOTH a node-id-with-a-string-track AND a free-standing `t()` id (`opts.consumedIds`) silently rewrote the node's track. `localize` now throws a clear `LocalizationError` on any such collision. PURE ADDITIVE GUARD — the flat `messages.<locale>.json` shape (`MessageTable = Record<string, string>`) is UNCHANGED; no sectioned `{tracks,messages}` format introduced.

  FIX 3 (ambient `t()` race across concurrent renders): the process-global ambient table/consumed-id set was shared across concurrent programmatic `render()`/`loadSceneModule` flows for different locales → wrong-language static `Text`. Added `runWithMessageTable(table, fn)` — an `AsyncLocalStorage`-scoped ambient table that isolates each async flow (lazily loaded `node:async_hooks`, off the embed; `core/i18n` stays 1.5 kB gz). `setMessageTable`/`getMessageTable`/`getConsumedMessageIds`/`t()` now read the active scope (ALS if present, else the process-global). Added `preservingMessageTable(fn)` (snapshot/restore the global ambient table), wired around the no-locale audio-mix helpers in the CLI (`collectMixAudioInputs`/`buildMixWav`) so they don't clobber or leak a concurrent locale's table. The CLI one-shot is unaffected.

  FIX 4 (`requireParity` within-manifest duplicate ids): the Set-based union/diff swallowed `{en:['a','a','b']}`. `requireParity` now runs a per-manifest duplicate check (`new Set(m.ids).size !== m.ids.length`) FIRST — naming the locale + dup id and throwing a `ParityError` — even for a single (or zero) manifest, before the cross-manifest diff.

  FIX 5 (`osFamilies` brand-warn gap): `buildFontExemptSet` folded the OS catalog into the exempt set; a registered/declared brand family whose name collides with an OS family could be waved through as "OS-only". The OS-catalog fold now SKIPS any name that collides with a registered family, so a declared brand font stays subject to glyph-coverage validation (a missing glyph still warns / throws under `--strict`). The exemption is for genuinely-OS-only families.

- Updated dependencies [c87e88b]
- Updated dependencies [53030d0]
- Updated dependencies [b21fa79]
  - @glissade/core@0.15.0-pre.0
  - @glissade/scene@0.15.0-pre.0
  - @glissade/narrate@0.15.0-pre.0
  - @glissade/backend-skia@0.15.0-pre.0
  - @glissade/interact@0.15.0-pre.0
  - @glissade/lottie@0.15.0-pre.0
  - @glissade/player@0.15.0-pre.0
  - @glissade/sfx@0.15.0-pre.0
  - @glissade/svg@0.15.0-pre.0

## 0.14.0

### Minor Changes

- 1795d1c: Add the **0.14 localization core** — build-time + render-time i18n sugar that resolves a scene's strings against a per-locale message table, with NOTHING on the `evaluate()` path (the goldens stay byte-identical; the no-`--locale` render path is byte-identical to today).

  New tree-shakeable sub-path `@glissade/core/i18n` (off the base index, like `@glissade/core/clips`), with three pure pieces:

  - **`requireParity(...manifests: { locale, ids }[]): void`** — a pure cross-locale id-set diff (the cross-language analogue of `narration().require`); throws a `ParityError` naming every missing/extra id per locale.
  - **`localize(doc, table, { locale }): TimelineDoc`** — a pure doc→doc resolver that substitutes string-track key values whose target node-id is a key in the table (captions / narration-derived text live in the doc as string tracks). Returns a NEW doc; non-matching tracks pass through byte-identical.
  - **`t(id): string`** — build-time sugar resolving `id` against an ambient message table (`setMessageTable`/`getMessageTable`), for static Text-node text not animated by a track. Hard-fails on an unknown id (mirrors `require()`); with no table installed returns `id` verbatim (the base path).

  `@glissade/cli`: `gs render --locale <code>` selects `messages.<code>.json` (relative to the scene module) and prefers the locale-tagged narration sibling `<base>.<code>.narration.timing.json` (the suffix is a single clearly-commented constant in `cli/src/locale.ts`), injecting the table into the ambient context `loadSceneModule` uses and running `localize` over the doc. No `--locale` resolves the BASE files → byte-identical to today.

  `@glissade/narrate`: `narration().idManifest(locale)` returns `{ locale, ids }` (every addressable beat id) to feed `requireParity`.

### Patch Changes

- f13486d: 0.14 canary fixes (3, 4, 6) — localization + font-validation render-path correctness. No `evaluate()` change; the base (no-`--locale`, no-`--strict`) render path is byte-identical to today, all 262 goldens unchanged.

  - **FIX 3 (BLOCKER) — `--locale` CJK glyph gap passes `--strict` then renders tofu.** `validateSceneFonts` validated the authored BASE `node.text()` (read BEFORE `localize()` binds the localized string tracks), so a Latin-only declared font + a localized CJK track PASSED `--strict` then rendered `.notdef` tofu. Render now also validates the POST-localize document's string-track values: new `collectLocalizedTextUsages(scene, doc)` (`@glissade/scene`) walks `doc.tracks` of type `'string'`, resolves the target Text node's `fontFamily`, and the values flow into `validateSceneFonts` via the new `ValidateSceneFontsOptions.extraUsages`. Base (no-locale) render is unaffected.

  - **FIX 4 (HIGH) — `--locale xx` with a missing messages file silently renders base.** An absent `messages.<locale>.json` made `loadMessageTable` return undefined → `localize` skipped → a declared `--locale` with unresolvable assets wrote a BASE-language artifact at exit 0, no warning. Render now resolves BOTH `messages.<locale>.json` AND the `<base>.<locale>.narration.timing.json` sibling up front and throws a new `UnknownLocaleError` (naming both attempted paths) when NEITHER resolves. A narration-only locale (sibling present, no messages file) still works.

  - **FIX 6 (HIGH) — `osFamilies` made `--strict` font validation host-dependent.** The font-exempt set was seeded from the full OS `GlobalFonts.families` catalog (3 families on clean Linux, hundreds on macOS), so an unregistered `'Helvetica Neue'` passed `--strict` on macOS but threw on Linux CI — the verdict depended on the host. The exempt set now seeds ONLY from the families glissade actually registered out of `doc.assets` (new pure `buildFontExemptSet`). True-OS-font exemption is gated behind a new `--allow-system-fonts` flag (off by default) AND ignored under `--strict`, so `--strict` is host-independent. A glissade-registered (doc.assets) family still doesn't false-warn.

- 3281514: 0.14 DX bundle — three render-surface paper-cuts:

  - **Clearer undeclared-asset error.** `gs render` now pre-validates every Image/Video `assetId` against `timeline.assets` before evaluation, throwing an `UnknownAssetError` that names the real mistake — an Image/Video needs an `assetId` + a `timeline.assets` entry `{ kind, url }`, not a `src` URL (§2.5: remote URLs are not fetched at render) — instead of the downstream `asset 'undefined' not ready` ColdAssetError. (Image/Video carry a new `static assetKind` marker so the walk stays robust; the validation lives in the CLI, off the embed path.)
  - **No false font-validation warning for GlobalFonts/system families.** `gs render` builds an `osFamilies` set from `GlobalFonts.families` and exempts those families from the §3.6 unregistered-family check, so a family registered via `GlobalFonts.registerFromPath` (or OS-installed) no longer warns as "unregistered". A genuinely-unregistered family still warns.
  - **`each()` jitter decorrelation.** The per-index motion-jitter RNG is now salted (`mix(mix(baseSeed, i), JITTER_SALT)`) so it decorrelates from `ctx.rng` (both previously derived from the same `mix(baseSeed, i)` stream). Determinism-neutral; no corpus golden uses each-jitter, so all golden frames stay byte-identical.

- Updated dependencies [f13486d]
- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7ea5371]
- Updated dependencies [7456761]
  - @glissade/core@0.14.0
  - @glissade/scene@0.14.0
  - @glissade/narrate@0.14.0
  - @glissade/backend-skia@0.14.0
  - @glissade/interact@0.14.0
  - @glissade/lottie@0.14.0
  - @glissade/player@0.14.0
  - @glissade/sfx@0.14.0
  - @glissade/svg@0.14.0

## 0.14.0-pre.1

### Patch Changes

- f13486d: 0.14 canary fixes (3, 4, 6) — localization + font-validation render-path correctness. No `evaluate()` change; the base (no-`--locale`, no-`--strict`) render path is byte-identical to today, all 262 goldens unchanged.

  - **FIX 3 (BLOCKER) — `--locale` CJK glyph gap passes `--strict` then renders tofu.** `validateSceneFonts` validated the authored BASE `node.text()` (read BEFORE `localize()` binds the localized string tracks), so a Latin-only declared font + a localized CJK track PASSED `--strict` then rendered `.notdef` tofu. Render now also validates the POST-localize document's string-track values: new `collectLocalizedTextUsages(scene, doc)` (`@glissade/scene`) walks `doc.tracks` of type `'string'`, resolves the target Text node's `fontFamily`, and the values flow into `validateSceneFonts` via the new `ValidateSceneFontsOptions.extraUsages`. Base (no-locale) render is unaffected.

  - **FIX 4 (HIGH) — `--locale xx` with a missing messages file silently renders base.** An absent `messages.<locale>.json` made `loadMessageTable` return undefined → `localize` skipped → a declared `--locale` with unresolvable assets wrote a BASE-language artifact at exit 0, no warning. Render now resolves BOTH `messages.<locale>.json` AND the `<base>.<locale>.narration.timing.json` sibling up front and throws a new `UnknownLocaleError` (naming both attempted paths) when NEITHER resolves. A narration-only locale (sibling present, no messages file) still works.

  - **FIX 6 (HIGH) — `osFamilies` made `--strict` font validation host-dependent.** The font-exempt set was seeded from the full OS `GlobalFonts.families` catalog (3 families on clean Linux, hundreds on macOS), so an unregistered `'Helvetica Neue'` passed `--strict` on macOS but threw on Linux CI — the verdict depended on the host. The exempt set now seeds ONLY from the families glissade actually registered out of `doc.assets` (new pure `buildFontExemptSet`). True-OS-font exemption is gated behind a new `--allow-system-fonts` flag (off by default) AND ignored under `--strict`, so `--strict` is host-independent. A glissade-registered (doc.assets) family still doesn't false-warn.

- Updated dependencies [f13486d]
  - @glissade/core@0.14.0-pre.1
  - @glissade/scene@0.14.0-pre.1
  - @glissade/backend-skia@0.14.0-pre.1
  - @glissade/interact@0.14.0-pre.1
  - @glissade/lottie@0.14.0-pre.1
  - @glissade/narrate@0.14.0-pre.1
  - @glissade/player@0.14.0-pre.1
  - @glissade/sfx@0.14.0-pre.1
  - @glissade/svg@0.14.0-pre.1

## 0.14.0-pre.0

### Minor Changes

- 1795d1c: Add the **0.14 localization core** — build-time + render-time i18n sugar that resolves a scene's strings against a per-locale message table, with NOTHING on the `evaluate()` path (the goldens stay byte-identical; the no-`--locale` render path is byte-identical to today).

  New tree-shakeable sub-path `@glissade/core/i18n` (off the base index, like `@glissade/core/clips`), with three pure pieces:

  - **`requireParity(...manifests: { locale, ids }[]): void`** — a pure cross-locale id-set diff (the cross-language analogue of `narration().require`); throws a `ParityError` naming every missing/extra id per locale.
  - **`localize(doc, table, { locale }): TimelineDoc`** — a pure doc→doc resolver that substitutes string-track key values whose target node-id is a key in the table (captions / narration-derived text live in the doc as string tracks). Returns a NEW doc; non-matching tracks pass through byte-identical.
  - **`t(id): string`** — build-time sugar resolving `id` against an ambient message table (`setMessageTable`/`getMessageTable`), for static Text-node text not animated by a track. Hard-fails on an unknown id (mirrors `require()`); with no table installed returns `id` verbatim (the base path).

  `@glissade/cli`: `gs render --locale <code>` selects `messages.<code>.json` (relative to the scene module) and prefers the locale-tagged narration sibling `<base>.<code>.narration.timing.json` (the suffix is a single clearly-commented constant in `cli/src/locale.ts`), injecting the table into the ambient context `loadSceneModule` uses and running `localize` over the doc. No `--locale` resolves the BASE files → byte-identical to today.

  `@glissade/narrate`: `narration().idManifest(locale)` returns `{ locale, ids }` (every addressable beat id) to feed `requireParity`.

### Patch Changes

- 3281514: 0.14 DX bundle — three render-surface paper-cuts:

  - **Clearer undeclared-asset error.** `gs render` now pre-validates every Image/Video `assetId` against `timeline.assets` before evaluation, throwing an `UnknownAssetError` that names the real mistake — an Image/Video needs an `assetId` + a `timeline.assets` entry `{ kind, url }`, not a `src` URL (§2.5: remote URLs are not fetched at render) — instead of the downstream `asset 'undefined' not ready` ColdAssetError. (Image/Video carry a new `static assetKind` marker so the walk stays robust; the validation lives in the CLI, off the embed path.)
  - **No false font-validation warning for GlobalFonts/system families.** `gs render` builds an `osFamilies` set from `GlobalFonts.families` and exempts those families from the §3.6 unregistered-family check, so a family registered via `GlobalFonts.registerFromPath` (or OS-installed) no longer warns as "unregistered". A genuinely-unregistered family still warns.
  - **`each()` jitter decorrelation.** The per-index motion-jitter RNG is now salted (`mix(mix(baseSeed, i), JITTER_SALT)`) so it decorrelates from `ctx.rng` (both previously derived from the same `mix(baseSeed, i)` stream). Determinism-neutral; no corpus golden uses each-jitter, so all golden frames stay byte-identical.

- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7ea5371]
- Updated dependencies [7456761]
  - @glissade/scene@0.14.0-pre.0
  - @glissade/core@0.14.0-pre.0
  - @glissade/narrate@0.14.0-pre.0
  - @glissade/backend-skia@0.14.0-pre.0
  - @glissade/interact@0.14.0-pre.0
  - @glissade/lottie@0.14.0-pre.0
  - @glissade/player@0.14.0-pre.0
  - @glissade/svg@0.14.0-pre.0
  - @glissade/sfx@0.14.0-pre.0

## 0.13.0

### Patch Changes

- 5f1729b: Three small 0.13 cli/narrate consumer/canary fixes.

  **Fix 1 — loudness publish gain can no longer overshoot the -1 dBTP ceiling.**
  The committed gain was rounded to 2 decimals with `Math.round` (round-to-nearest),
  which on a peak-clamp-bound mix could land the gain ~0.005 dB _above_ the computed
  clamp (e.g. -1.005 → -1.00), pushing the published true-peak over -1 dBTP. The
  committed gain now uses `Math.floor` (floor-to-2-decimals), which is always ≤ the
  computed clamp, so the publish guarantee holds.

  **Fix 2 — `gs render --cache scene.js` no longer eats the scene path.**
  `parseArgs` treated every non-`=` flag as value-taking, so the boolean `--cache`
  greedily consumed the following positional. A `KNOWN_BOOLEAN_FLAGS` set (`record`,
  `force`, `strict`, `cache`, `json`, `fix`, `no-warnings`, `lossless-intermediate`,
  `allow-gpu-shards`, `verbose`, `allow-degraded`, `bisect`, `watch`) now prevents
  boolean flags from consuming the next token. Use `--cache=<dir>` to set a custom
  cache directory.

  **Fix 3 — kokoro Chinese (z\*) voices now hard-error instead of emitting garble.**
  kokoro-js routes Chinese through espeak-ng `cmn`, not the misaki[zh] g2p the `z*`
  voices were trained on (mismatched phonemes → garbled audio). `kokoroProvider`
  now throws a clear `NarrationError` for any `zf_`/`zm_` voice, naming misaki[zh]
  and pointing to `--provider piper` for Chinese. English voices are unaffected.

- d486e73: Harden `gs verify-determinism --against`: reject an incomparable baseline grid (different `fps` or `size`) instead of silently byte-comparing the wrong frames, and stop the per-node divergence-localizer from misattributing a frame divergence to a baseline node id absent from the current render (renamed/removed nodes). Tooling-correctness only — no determinism-contract or render-path impact.
- Updated dependencies [d1e81b7]
- Updated dependencies [d1e81b7]
- Updated dependencies [1995ee8]
- Updated dependencies [707d228]
- Updated dependencies [5f1729b]
- Updated dependencies [88ba5bc]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
- Updated dependencies [8bec181]
- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0
  - @glissade/scene@0.13.0
  - @glissade/narrate@0.13.0
  - @glissade/backend-skia@0.13.0
  - @glissade/interact@0.13.0
  - @glissade/lottie@0.13.0
  - @glissade/player@0.13.0
  - @glissade/sfx@0.13.0
  - @glissade/svg@0.13.0

## 0.13.0-pre.3

### Patch Changes

- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0-pre.3
  - @glissade/backend-skia@0.13.0-pre.3
  - @glissade/interact@0.13.0-pre.3
  - @glissade/lottie@0.13.0-pre.3
  - @glissade/narrate@0.13.0-pre.3
  - @glissade/player@0.13.0-pre.3
  - @glissade/scene@0.13.0-pre.3
  - @glissade/sfx@0.13.0-pre.3
  - @glissade/svg@0.13.0-pre.3

## 0.13.0-pre.2

### Patch Changes

- Updated dependencies [8bec181]
  - @glissade/core@0.13.0-pre.2
  - @glissade/backend-skia@0.13.0-pre.2
  - @glissade/interact@0.13.0-pre.2
  - @glissade/lottie@0.13.0-pre.2
  - @glissade/narrate@0.13.0-pre.2
  - @glissade/player@0.13.0-pre.2
  - @glissade/scene@0.13.0-pre.2
  - @glissade/sfx@0.13.0-pre.2
  - @glissade/svg@0.13.0-pre.2

## 0.13.0-pre.1

### Patch Changes

- Updated dependencies [d1e81b7]
- Updated dependencies [d1e81b7]
  - @glissade/core@0.13.0-pre.1
  - @glissade/scene@0.13.0-pre.1
  - @glissade/backend-skia@0.13.0-pre.1
  - @glissade/interact@0.13.0-pre.1
  - @glissade/lottie@0.13.0-pre.1
  - @glissade/narrate@0.13.0-pre.1
  - @glissade/player@0.13.0-pre.1
  - @glissade/sfx@0.13.0-pre.1
  - @glissade/svg@0.13.0-pre.1

## 0.13.0-pre.0

### Patch Changes

- 5f1729b: Three small 0.13 cli/narrate consumer/canary fixes.

  **Fix 1 — loudness publish gain can no longer overshoot the -1 dBTP ceiling.**
  The committed gain was rounded to 2 decimals with `Math.round` (round-to-nearest),
  which on a peak-clamp-bound mix could land the gain ~0.005 dB _above_ the computed
  clamp (e.g. -1.005 → -1.00), pushing the published true-peak over -1 dBTP. The
  committed gain now uses `Math.floor` (floor-to-2-decimals), which is always ≤ the
  computed clamp, so the publish guarantee holds.

  **Fix 2 — `gs render --cache scene.js` no longer eats the scene path.**
  `parseArgs` treated every non-`=` flag as value-taking, so the boolean `--cache`
  greedily consumed the following positional. A `KNOWN_BOOLEAN_FLAGS` set (`record`,
  `force`, `strict`, `cache`, `json`, `fix`, `no-warnings`, `lossless-intermediate`,
  `allow-gpu-shards`, `verbose`, `allow-degraded`, `bisect`, `watch`) now prevents
  boolean flags from consuming the next token. Use `--cache=<dir>` to set a custom
  cache directory.

  **Fix 3 — kokoro Chinese (z\*) voices now hard-error instead of emitting garble.**
  kokoro-js routes Chinese through espeak-ng `cmn`, not the misaki[zh] g2p the `z*`
  voices were trained on (mismatched phonemes → garbled audio). `kokoroProvider`
  now throws a clear `NarrationError` for any `zf_`/`zm_` voice, naming misaki[zh]
  and pointing to `--provider piper` for Chinese. English voices are unaffected.

- d486e73: Harden `gs verify-determinism --against`: reject an incomparable baseline grid (different `fps` or `size`) instead of silently byte-comparing the wrong frames, and stop the per-node divergence-localizer from misattributing a frame divergence to a baseline node id absent from the current render (renamed/removed nodes). Tooling-correctness only — no determinism-contract or render-path impact.
- Updated dependencies [1995ee8]
- Updated dependencies [707d228]
- Updated dependencies [5f1729b]
- Updated dependencies [88ba5bc]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
  - @glissade/core@0.13.0-pre.0
  - @glissade/scene@0.13.0-pre.0
  - @glissade/narrate@0.13.0-pre.0
  - @glissade/backend-skia@0.13.0-pre.0
  - @glissade/interact@0.13.0-pre.0
  - @glissade/lottie@0.13.0-pre.0
  - @glissade/player@0.13.0-pre.0
  - @glissade/sfx@0.13.0-pre.0
  - @glissade/svg@0.13.0-pre.0

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

- Updated dependencies [56fa1f3]
  - @glissade/narrate@0.12.1
  - @glissade/core@0.12.1
  - @glissade/backend-skia@0.12.1
  - @glissade/interact@0.12.1
  - @glissade/lottie@0.12.1
  - @glissade/player@0.12.1
  - @glissade/scene@0.12.1
  - @glissade/sfx@0.12.1
  - @glissade/svg@0.12.1

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

- c46321d: feat(loudness): `gs measure-loudness` — loudness-normalized publish profiles via a deterministic peak-clamped scalar gain (loudness)

  Publish-loudness normalization that keeps the render hot path single-pass and
  byte-deterministic. The insight: YouTube/Shorts re-normalize loudness
  platform-side, so the publish target is _≤ target-LUFS AND ≤ -1 dBTP_, not exact
  — which means no two-pass limiter is needed.

  - **`gs measure-loudness <scene> [--profile <id>]`** builds the final mix to a
    WAV (the same `collectAudioClips` + `planAudioMix` render uses) and runs
    ffmpeg's `loudnorm` measurement pass over it at MEASURE-time, then commits a
    `<scene>.loudness.json { loudnessVersion, profileId, inputI, inputTp, inputLra,
gain, mixHash }`. The gain is peak-clamped:
    `gain = min(targetLufs - inputI, truePeakDb - inputTp)` — the clamp uses the
    MEASURED true-peak, so the published output is guaranteed ≤ -1 dBTP with no
    render-time oversampling.
  - **At render**: `<scene>.loudness.json` is read and `gain` is applied as a PURE
    `volume=<gain>dB` scalar on the FINAL mix node — a single scalar in the
    existing filter graph, NOT a second ffmpeg pass. The scalar gain is bit-exact
    (verified) and golden-hashable; the only non-deterministic stages (mix-to-PCM,
    measure-time ebur128) stay quarantined to commit/measure-time per §5.3.
  - **PublishProfiles**: `youtube`/`shorts` (-14 LUFS), `podcast` (-16),
    `broadcast`/`ebu` (-23) — all at a -1 dBTP ceiling. YouTube/Shorts ship fully;
    the brickwall true-peak limiter is deferred — an un-normalized profile whose
    peaky source can't reach its target without clipping gets an advisory warning.
  - **mixHash** binds the committed measurement to the mix CONTENT (a hash of the
    narration/music/sfx timing-manifest bytes, not mtime). Render recomputes it and
    HARD-THROWS naming the command on a mismatch, so a re-narrate invalidates the
    measurement loudly instead of silently mis-normalizing. `--loudness off` skips
    it entirely.

- 4ad8291: feat(narrate): `gs narration-lint` — catch slow-re-narrate failures at BUILD (narrlint)

  Lint the COMMITTED narration timing manifest + the REAL measured caption
  geometry, so a re-narrate that overran its beat, a caption too dense to read, or
  a caption that overflows its box fails CI now instead of surfacing render-hours
  later. Pure over the committed JSON + the injected measurer — no clock, RNG, or
  I/O beyond reading the committed files.

  - `@glissade/narrate`: a schema bump for anchor budgets — a script-level
    `budgets?: Record<string, number>` (per-id ceilings, segments + pauses share
    the id namespace) and a per-segment `maxSec?` (which wins). Both are committed
    with the script ("animation is data") and persisted into the timing manifest
    (`NarrationTiming.budgets`, `TimedSegment.maxSec`) so the lint reads them from
    the committed JSON. Default-off: omit them and the manifest is byte-identical.
  - `@glissade/cli`: `lintNarration(timing, opts): Diagnostic[]` + a
    `gs narration-lint <scene-module|*.narration.timing.json>` subcommand.
    - Tier-1 (HARD, can fail CI / exit non-zero): `reading-speed`
      (chars-per-second over each committed cue vs `--max-cps`, default 17),
      `anchor-budget` (a beat over its `maxSec`/`budgets` ceiling), `caption-fit`
      (a cue that overflows its box / exceeds `maxLines`, using the REAL measured
      geometry — the lint DEFAULTS to the Skia measurer with the render's own
      fonts and drives the actual caption node, so a passing lint can't
      burn-overflow).
    - Tier-2 (WARN-only, never fails CI): `beat-drift`, `silence` sanity.
    - Output: a human table, `--json`, and `--fix` (a git-apply-able budget-bump
      diff for the SCRIPT — it NEVER writes a committed artifact).

- e41e9f0: feat(render): persistent whole-frame raster cache (`.gscache`) — content-addressed disk cache (§3.5)

  `gs render --cache [<dir>] [--cache-max-size <bytes|2GB>]` (and `render({ cache: { dir, mode } })`)
  adds a persistent whole-frame raster cache so a one-line edit doesn't re-rasterize every blur-heavy
  frame across runs/shards. OFF by default (`mode:'off'`), preserving the exact current equality
  baseline — opting in only changes speed, never output.

  - **Whole-frame granularity** (per-group disk tiling deferred to 0.13): the key is over the ENTIRE
    frame's DisplayList, so a hit is byte-safe by construction.
  - **Complete key:** `sha256(serializeDisplayList(frame) ++ glissadeVersion ++ capsId)` — folds the
    DisplayList-snapshot bytes (geometry/paint/transform), the glissade version (bump-on-version
    invalidation), and the BackendCaps id. version/capsId are INJECTED via `CacheKeyContext`.
  - **HIT == MISS:** a hit loads stored RGBA into the backend (`SkiaBackend.putPixels`) and encodes
    through the IDENTICAL `encodePng` path, so it is byte-identical to a cold render.
  - **Storage:** raw-RGBA + zlib, one atomically-written file per frame. Shards share one `.gscache`.
  - **Size-capped LRU from day one** (default 2 GB, mtime/access-time ordered).
  - **`gs cache verify <scene>`:** renders cache-hits vs cache-off and asserts the `encodePng` bytes
    are equal frame-for-frame (a sampled fraction is logged). A NEGATIVE test proves an incomplete key
    makes the gate fail.

  Honesty: the cache wins repeated renders + the unchanged-prefix of a single-segment edit. A full
  re-narrate shifts every frame's timing → every DisplayList changes → every frame misses.

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

- Updated dependencies [78393f1]
- Updated dependencies [2850386]
- Updated dependencies [796b568]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
- Updated dependencies [4ad8291]
- Updated dependencies [e41e9f0]
- Updated dependencies [2a520c5]
  - @glissade/core@0.12.0
  - @glissade/scene@0.12.0
  - @glissade/narrate@0.12.0
  - @glissade/backend-skia@0.12.0
  - @glissade/interact@0.12.0
  - @glissade/lottie@0.12.0
  - @glissade/player@0.12.0
  - @glissade/sfx@0.12.0
  - @glissade/svg@0.12.0

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

- Updated dependencies [78393f1]
  - @glissade/core@0.12.0-pre.1
  - @glissade/backend-skia@0.12.0-pre.1
  - @glissade/interact@0.12.0-pre.1
  - @glissade/lottie@0.12.0-pre.1
  - @glissade/narrate@0.12.0-pre.1
  - @glissade/player@0.12.0-pre.1
  - @glissade/scene@0.12.0-pre.1
  - @glissade/sfx@0.12.0-pre.1
  - @glissade/svg@0.12.0-pre.1

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

- c46321d: feat(loudness): `gs measure-loudness` — loudness-normalized publish profiles via a deterministic peak-clamped scalar gain (loudness)

  Publish-loudness normalization that keeps the render hot path single-pass and
  byte-deterministic. The insight: YouTube/Shorts re-normalize loudness
  platform-side, so the publish target is _≤ target-LUFS AND ≤ -1 dBTP_, not exact
  — which means no two-pass limiter is needed.

  - **`gs measure-loudness <scene> [--profile <id>]`** builds the final mix to a
    WAV (the same `collectAudioClips` + `planAudioMix` render uses) and runs
    ffmpeg's `loudnorm` measurement pass over it at MEASURE-time, then commits a
    `<scene>.loudness.json { loudnessVersion, profileId, inputI, inputTp, inputLra,
gain, mixHash }`. The gain is peak-clamped:
    `gain = min(targetLufs - inputI, truePeakDb - inputTp)` — the clamp uses the
    MEASURED true-peak, so the published output is guaranteed ≤ -1 dBTP with no
    render-time oversampling.
  - **At render**: `<scene>.loudness.json` is read and `gain` is applied as a PURE
    `volume=<gain>dB` scalar on the FINAL mix node — a single scalar in the
    existing filter graph, NOT a second ffmpeg pass. The scalar gain is bit-exact
    (verified) and golden-hashable; the only non-deterministic stages (mix-to-PCM,
    measure-time ebur128) stay quarantined to commit/measure-time per §5.3.
  - **PublishProfiles**: `youtube`/`shorts` (-14 LUFS), `podcast` (-16),
    `broadcast`/`ebu` (-23) — all at a -1 dBTP ceiling. YouTube/Shorts ship fully;
    the brickwall true-peak limiter is deferred — an un-normalized profile whose
    peaky source can't reach its target without clipping gets an advisory warning.
  - **mixHash** binds the committed measurement to the mix CONTENT (a hash of the
    narration/music/sfx timing-manifest bytes, not mtime). Render recomputes it and
    HARD-THROWS naming the command on a mismatch, so a re-narrate invalidates the
    measurement loudly instead of silently mis-normalizing. `--loudness off` skips
    it entirely.

- 4ad8291: feat(narrate): `gs narration-lint` — catch slow-re-narrate failures at BUILD (narrlint)

  Lint the COMMITTED narration timing manifest + the REAL measured caption
  geometry, so a re-narrate that overran its beat, a caption too dense to read, or
  a caption that overflows its box fails CI now instead of surfacing render-hours
  later. Pure over the committed JSON + the injected measurer — no clock, RNG, or
  I/O beyond reading the committed files.

  - `@glissade/narrate`: a schema bump for anchor budgets — a script-level
    `budgets?: Record<string, number>` (per-id ceilings, segments + pauses share
    the id namespace) and a per-segment `maxSec?` (which wins). Both are committed
    with the script ("animation is data") and persisted into the timing manifest
    (`NarrationTiming.budgets`, `TimedSegment.maxSec`) so the lint reads them from
    the committed JSON. Default-off: omit them and the manifest is byte-identical.
  - `@glissade/cli`: `lintNarration(timing, opts): Diagnostic[]` + a
    `gs narration-lint <scene-module|*.narration.timing.json>` subcommand.
    - Tier-1 (HARD, can fail CI / exit non-zero): `reading-speed`
      (chars-per-second over each committed cue vs `--max-cps`, default 17),
      `anchor-budget` (a beat over its `maxSec`/`budgets` ceiling), `caption-fit`
      (a cue that overflows its box / exceeds `maxLines`, using the REAL measured
      geometry — the lint DEFAULTS to the Skia measurer with the render's own
      fonts and drives the actual caption node, so a passing lint can't
      burn-overflow).
    - Tier-2 (WARN-only, never fails CI): `beat-drift`, `silence` sanity.
    - Output: a human table, `--json`, and `--fix` (a git-apply-able budget-bump
      diff for the SCRIPT — it NEVER writes a committed artifact).

- e41e9f0: feat(render): persistent whole-frame raster cache (`.gscache`) — content-addressed disk cache (§3.5)

  `gs render --cache [<dir>] [--cache-max-size <bytes|2GB>]` (and `render({ cache: { dir, mode } })`)
  adds a persistent whole-frame raster cache so a one-line edit doesn't re-rasterize every blur-heavy
  frame across runs/shards. OFF by default (`mode:'off'`), preserving the exact current equality
  baseline — opting in only changes speed, never output.

  - **Whole-frame granularity** (per-group disk tiling deferred to 0.13): the key is over the ENTIRE
    frame's DisplayList, so a hit is byte-safe by construction.
  - **Complete key:** `sha256(serializeDisplayList(frame) ++ glissadeVersion ++ capsId)` — folds the
    DisplayList-snapshot bytes (geometry/paint/transform), the glissade version (bump-on-version
    invalidation), and the BackendCaps id. version/capsId are INJECTED via `CacheKeyContext`.
  - **HIT == MISS:** a hit loads stored RGBA into the backend (`SkiaBackend.putPixels`) and encodes
    through the IDENTICAL `encodePng` path, so it is byte-identical to a cold render.
  - **Storage:** raw-RGBA + zlib, one atomically-written file per frame. Shards share one `.gscache`.
  - **Size-capped LRU from day one** (default 2 GB, mtime/access-time ordered).
  - **`gs cache verify <scene>`:** renders cache-hits vs cache-off and asserts the `encodePng` bytes
    are equal frame-for-frame (a sampled fraction is logged). A NEGATIVE test proves an incomplete key
    makes the gate fail.

  Honesty: the cache wins repeated renders + the unchanged-prefix of a single-segment edit. A full
  re-narrate shifts every frame's timing → every DisplayList changes → every frame misses.

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
- Updated dependencies [796b568]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
- Updated dependencies [4ad8291]
- Updated dependencies [e41e9f0]
- Updated dependencies [2a520c5]
  - @glissade/core@0.12.0-pre.0
  - @glissade/scene@0.12.0-pre.0
  - @glissade/narrate@0.12.0-pre.0
  - @glissade/backend-skia@0.12.0-pre.0
  - @glissade/interact@0.12.0-pre.0
  - @glissade/lottie@0.12.0-pre.0
  - @glissade/player@0.12.0-pre.0
  - @glissade/sfx@0.12.0-pre.0
  - @glissade/svg@0.12.0-pre.0

## 0.11.0

### Patch Changes

- 9150f03: Remove the dead `RenderOptions.videoOnly` shard option. It was never set to `true` (no `--video-only` flag exists) and its gated branches never ran — shard children render video-only via `--format png-seq` + `--narration/music/sfx off`. Pure cleanup; identical runtime behavior.
- Updated dependencies [6d3e061]
- Updated dependencies [6d3e061]
- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
- Updated dependencies [f716bfc]
  - @glissade/interact@0.11.0
  - @glissade/player@0.11.0
  - @glissade/core@0.11.0
  - @glissade/scene@0.11.0
  - @glissade/backend-skia@0.11.0
  - @glissade/lottie@0.11.0
  - @glissade/narrate@0.11.0
  - @glissade/sfx@0.11.0
  - @glissade/svg@0.11.0

## 0.11.0-pre.1

### Patch Changes

- Updated dependencies [6d3e061]
- Updated dependencies [6d3e061]
  - @glissade/interact@0.11.0-pre.1
  - @glissade/player@0.11.0-pre.1
  - @glissade/backend-skia@0.11.0-pre.1
  - @glissade/core@0.11.0-pre.1
  - @glissade/lottie@0.11.0-pre.1
  - @glissade/narrate@0.11.0-pre.1
  - @glissade/scene@0.11.0-pre.1
  - @glissade/sfx@0.11.0-pre.1
  - @glissade/svg@0.11.0-pre.1

## 0.11.0-pre.0

### Patch Changes

- 9150f03: Remove the dead `RenderOptions.videoOnly` shard option. It was never set to `true` (no `--video-only` flag exists) and its gated branches never ran — shard children render video-only via `--format png-seq` + `--narration/music/sfx off`. Pure cleanup; identical runtime behavior.
- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
- Updated dependencies [f716bfc]
  - @glissade/core@0.11.0-pre.0
  - @glissade/scene@0.11.0-pre.0
  - @glissade/player@0.11.0-pre.0
  - @glissade/interact@0.11.0-pre.0
  - @glissade/backend-skia@0.11.0-pre.0
  - @glissade/lottie@0.11.0-pre.0
  - @glissade/narrate@0.11.0-pre.0
  - @glissade/sfx@0.11.0-pre.0
  - @glissade/svg@0.11.0-pre.0

## 0.10.1

### Patch Changes

- Updated dependencies [f9f7ebe]
- Updated dependencies [7482378]
  - @glissade/core@0.10.1
  - @glissade/scene@0.10.1
  - @glissade/backend-skia@0.10.1
  - @glissade/interact@0.10.1
  - @glissade/lottie@0.10.1
  - @glissade/narrate@0.10.1
  - @glissade/player@0.10.1
  - @glissade/sfx@0.10.1
  - @glissade/svg@0.10.1

## 0.10.1-pre.1

### Patch Changes

- Updated dependencies [f9f7ebe]
  - @glissade/core@0.10.1-pre.1
  - @glissade/scene@0.10.1-pre.1
  - @glissade/backend-skia@0.10.1-pre.1
  - @glissade/interact@0.10.1-pre.1
  - @glissade/lottie@0.10.1-pre.1
  - @glissade/narrate@0.10.1-pre.1
  - @glissade/player@0.10.1-pre.1
  - @glissade/sfx@0.10.1-pre.1
  - @glissade/svg@0.10.1-pre.1

## 0.10.1-pre.0

### Patch Changes

- Updated dependencies [7482378]
  - @glissade/core@0.10.1-pre.0
  - @glissade/scene@0.10.1-pre.0
  - @glissade/backend-skia@0.10.1-pre.0
  - @glissade/interact@0.10.1-pre.0
  - @glissade/lottie@0.10.1-pre.0
  - @glissade/narrate@0.10.1-pre.0
  - @glissade/player@0.10.1-pre.0
  - @glissade/sfx@0.10.1-pre.0
  - @glissade/svg@0.10.1-pre.0

## 0.10.0

### Minor Changes

- 050db0a: Add `gs render --workers N` — **sharded parallel export** (§5.6, §8.1). The frame
  range is split into N contiguous sub-ranges, each rendered in a **separate `gs`
  child process** (not worker_threads — `@napi-rs/canvas`/`GlobalFonts` hold unsafe
  process-global state, and separate processes are cross-machine-ready). Because
  `evaluate` is a pure function of time, each shard re-runs the scene module from
  scratch — re-deriving any module-level `bake()` for its prefix — so an N-worker
  render of a range is **byte-identical to a single-worker render of the same range**
  at the frame level (verified by a determinism gate test).

  Shards render **video-only**; the orchestrator mixes timeline + auto-mixed
  (narration/music/sfx) audio **once** over the joined result, and emits caption/cue
  sidecars once. Two join strategies (the §8.1 decision):

  - **default** — per-shard encode to the final codec with a forced keyframe at each
    shard boundary (`-force_key_frames`), joined by the FFmpeg concat demuxer
    (verbatim `-c copy`).
  - **`--lossless-intermediate`** — FFV1 shards + a single final encode (the
    guaranteed byte-faithful path). Auto-enabled with a stderr note when the picked
    encoder can't honor precise boundary keyframes (mpeg4 / openh264), since a
    concat-copy of imprecise-GOP codecs would drop/dupe boundary frames.

  GPU/shader scenes are outside the cross-process reproducibility guarantee (§3.7):
  a scene containing a `ShaderEffect` **refuses to shard** unless `--allow-gpu-shards`
  is passed.

  New `RenderOptions`: `workers?`, `losslessIntermediate?`, `allowGpuShards?`. New
  CLI flags: `--workers <n>`, `--lossless-intermediate`, `--allow-gpu-shards`. New
  exports from `@glissade/cli`: `renderSharded`, `splitFrameRange`,
  `sceneHasGpuNodes`, `planFinalAudio`, `ShardError`.

  Note: serialized shipped-checkpoint warming for checkpointed `bake()` sources
  (§2.8) remains a follow-up; each shard currently re-derives its prefix.

### Patch Changes

- fbdcc44: `gs render --workers N` now caps the sharded frame range to the timeline extent (`ceil(duration*fps)`), matching the linear path's `-t <duration>` trim. Previously an explicit over-range (e.g. `--range 0..119` on a shorter timeline) or an `--fps` override emitted more frames from the sharded path than the single-worker path — a silent break of the documented N-worker == 1-worker contract. (A copy-mode `-t` on the concat join is not frame-accurate, so the cap is applied to the rendered frames instead.)
- e4190b5: Docs: `gs render --workers` now notes it helps CPU-bound, per-frame-cheap scenes — a single render is already internally multi-threaded, so bandwidth-bound / blur-heavy scenes gain little from sharding. `NodeProps.cache` now documents that the cache is for a static subtree under a _moving parent_ (a subtree that drifts on sub-pixel positions misses every frame), and that a `filter` is a live composite parameter never baked into the cached bitmap. (0.10 downstream validation.)
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
  - @glissade/backend-skia@0.10.0
  - @glissade/interact@0.10.0
  - @glissade/lottie@0.10.0
  - @glissade/narrate@0.10.0
  - @glissade/player@0.10.0
  - @glissade/svg@0.10.0
  - @glissade/sfx@0.10.0

## 0.10.0-pre.1

### Patch Changes

- fbdcc44: `gs render --workers N` now caps the sharded frame range to the timeline extent (`ceil(duration*fps)`), matching the linear path's `-t <duration>` trim. Previously an explicit over-range (e.g. `--range 0..119` on a shorter timeline) or an `--fps` override emitted more frames from the sharded path than the single-worker path — a silent break of the documented N-worker == 1-worker contract. (A copy-mode `-t` on the concat join is not frame-accurate, so the cap is applied to the rendered frames instead.)
- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
  - @glissade/scene@0.10.0-pre.1
  - @glissade/core@0.10.0-pre.1
  - @glissade/backend-skia@0.10.0-pre.1
  - @glissade/interact@0.10.0-pre.1
  - @glissade/lottie@0.10.0-pre.1
  - @glissade/narrate@0.10.0-pre.1
  - @glissade/player@0.10.0-pre.1
  - @glissade/svg@0.10.0-pre.1
  - @glissade/sfx@0.10.0-pre.1

## 0.10.0-pre.0

### Minor Changes

- 050db0a: Add `gs render --workers N` — **sharded parallel export** (§5.6, §8.1). The frame
  range is split into N contiguous sub-ranges, each rendered in a **separate `gs`
  child process** (not worker_threads — `@napi-rs/canvas`/`GlobalFonts` hold unsafe
  process-global state, and separate processes are cross-machine-ready). Because
  `evaluate` is a pure function of time, each shard re-runs the scene module from
  scratch — re-deriving any module-level `bake()` for its prefix — so an N-worker
  render of a range is **byte-identical to a single-worker render of the same range**
  at the frame level (verified by a determinism gate test).

  Shards render **video-only**; the orchestrator mixes timeline + auto-mixed
  (narration/music/sfx) audio **once** over the joined result, and emits caption/cue
  sidecars once. Two join strategies (the §8.1 decision):

  - **default** — per-shard encode to the final codec with a forced keyframe at each
    shard boundary (`-force_key_frames`), joined by the FFmpeg concat demuxer
    (verbatim `-c copy`).
  - **`--lossless-intermediate`** — FFV1 shards + a single final encode (the
    guaranteed byte-faithful path). Auto-enabled with a stderr note when the picked
    encoder can't honor precise boundary keyframes (mpeg4 / openh264), since a
    concat-copy of imprecise-GOP codecs would drop/dupe boundary frames.

  GPU/shader scenes are outside the cross-process reproducibility guarantee (§3.7):
  a scene containing a `ShaderEffect` **refuses to shard** unless `--allow-gpu-shards`
  is passed.

  New `RenderOptions`: `workers?`, `losslessIntermediate?`, `allowGpuShards?`. New
  CLI flags: `--workers <n>`, `--lossless-intermediate`, `--allow-gpu-shards`. New
  exports from `@glissade/cli`: `renderSharded`, `splitFrameRange`,
  `sceneHasGpuNodes`, `planFinalAudio`, `ShardError`.

  Note: serialized shipped-checkpoint warming for checkpointed `bake()` sources
  (§2.8) remains a follow-up; each shard currently re-derives its prefix.

### Patch Changes

- Updated dependencies [b2f1fd7]
- Updated dependencies [278ea05]
- Updated dependencies [680f8ae]
- Updated dependencies [0cc640f]
- Updated dependencies [0a1844c]
  - @glissade/core@0.10.0-pre.0
  - @glissade/scene@0.10.0-pre.0
  - @glissade/backend-skia@0.10.0-pre.0
  - @glissade/interact@0.10.0-pre.0
  - @glissade/lottie@0.10.0-pre.0
  - @glissade/narrate@0.10.0-pre.0
  - @glissade/player@0.10.0-pre.0
  - @glissade/sfx@0.10.0-pre.0
  - @glissade/svg@0.10.0-pre.0

## 0.9.1

### Patch Changes

- 4da552c: `gs render --chapters vtt` now writes **only chapter-kind cues** as WebVTT chapters by default — ad-break and plain `cue` markers stay out of the chapter list (they remain in `cues.json` for machines), so the VTT pastes straight into a YouTube description without manual filtering. Override the set with `--chapters-kind <kind[,kind]>` (e.g. `--chapters-kind chapter,ad-break`). `cues.json` is unchanged — it keeps every kind. The `00:00` "Intro" anchor logic now applies to the filtered chapter set.
  - @glissade/backend-skia@0.9.1
  - @glissade/core@0.9.1
  - @glissade/interact@0.9.1
  - @glissade/lottie@0.9.1
  - @glissade/narrate@0.9.1
  - @glissade/player@0.9.1
  - @glissade/scene@0.9.1
  - @glissade/sfx@0.9.1
  - @glissade/svg@0.9.1

## 0.9.1-pre.0

### Patch Changes

- 4da552c: `gs render --chapters vtt` now writes **only chapter-kind cues** as WebVTT chapters by default — ad-break and plain `cue` markers stay out of the chapter list (they remain in `cues.json` for machines), so the VTT pastes straight into a YouTube description without manual filtering. Override the set with `--chapters-kind <kind[,kind]>` (e.g. `--chapters-kind chapter,ad-break`). `cues.json` is unchanged — it keeps every kind. The `00:00` "Intro" anchor logic now applies to the filtered chapter set.
  - @glissade/backend-skia@0.9.1-pre.0
  - @glissade/core@0.9.1-pre.0
  - @glissade/interact@0.9.1-pre.0
  - @glissade/lottie@0.9.1-pre.0
  - @glissade/narrate@0.9.1-pre.0
  - @glissade/player@0.9.1-pre.0
  - @glissade/scene@0.9.1-pre.0
  - @glissade/sfx@0.9.1-pre.0
  - @glissade/svg@0.9.1-pre.0

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
  - @glissade/player@0.9.0
  - @glissade/backend-skia@0.9.0
  - @glissade/interact@0.9.0
  - @glissade/lottie@0.9.0
  - @glissade/narrate@0.9.0
  - @glissade/sfx@0.9.0
  - @glissade/svg@0.9.0

## 0.9.0-pre.1

### Patch Changes

- Updated dependencies [f3b471b]
  - @glissade/core@0.9.0-pre.1
  - @glissade/scene@0.9.0-pre.1
  - @glissade/backend-skia@0.9.0-pre.1
  - @glissade/interact@0.9.0-pre.1
  - @glissade/lottie@0.9.0-pre.1
  - @glissade/narrate@0.9.0-pre.1
  - @glissade/player@0.9.0-pre.1
  - @glissade/sfx@0.9.0-pre.1
  - @glissade/svg@0.9.0-pre.1

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
  - @glissade/player@0.9.0-pre.0
  - @glissade/backend-skia@0.9.0-pre.0
  - @glissade/interact@0.9.0-pre.0
  - @glissade/lottie@0.9.0-pre.0
  - @glissade/narrate@0.9.0-pre.0
  - @glissade/sfx@0.9.0-pre.0
  - @glissade/svg@0.9.0-pre.0

## 0.8.1

### Patch Changes

- e338c7d: Fix `--provider kokoro` under pnpm (downstream canary findings on 0.8.1-pre.0):

  - **Resolve `kokoro-js` from the user's project, not from `@glissade/narrate`'s own location.** Under pnpm's isolated layout an optional peer isn't linked into narrate's store dir, so the bare `import('kokoro-js')` failed even when it was installed and loadable. It's now resolved via `createRequire(cwd).resolve('kokoro-js')` (falling back to this module for hoisted/global installs) and loaded through a computed `file://` import — which also keeps it out of any bundle.
  - **Surface the real error.** The `catch {}` that masked every failure as a generic "not found" now includes the actual error `code` + `message`, so resolution/load problems are diagnosable.
  - **Read the version without the non-exported subpath.** `kokoro-js` doesn't export `./package.json`; `version()` now walks up from the resolved entry instead of resolving that subpath (which threw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
  - **Docs:** package-manager-agnostic install, and a pnpm note that downstreams must allow/ignore the native build scripts (`onnxruntime-node` / `sharp` / `protobufjs`) or `pnpm install --frozen-lockfile` exits non-zero.

- 0f09b67: Add a **Kokoro** TTS provider (`--provider kokoro`) — an Apache-2.0, 82M-param neural voice that is markedly more natural than espeak/piper, fully offline on CPU, with no API key. Unlike piper there's no `pip install` or external binary: it runs **pure-Node** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js + onnxruntime), declared as an **optional peer dependency** — `npm i kokoro-js` only if you use it. The model downloads and caches on first use; pick a voice via the script's `voice` (e.g. `af_heart`) and the quant via `kokoroProvider({ dtype })` (`q8` default, `fp32` for top quality).

  Deterministic by construction: Kokoro inference uses a fixed voice/style embedding (not diffusion-sampled per call), so the same text re-synthesizes byte-identical — verified by a gated determinism test. `version()` pins the `kokoro-js` version + model + dtype, so any of those moving invalidates the per-segment cache. New exports from `@glissade/narrate/providers`: `kokoroProvider`, `floatToWav`, `KokoroDtype`.

- Updated dependencies [e338c7d]
- Updated dependencies [0f09b67]
  - @glissade/narrate@0.8.1
  - @glissade/backend-skia@0.8.1
  - @glissade/core@0.8.1
  - @glissade/interact@0.8.1
  - @glissade/lottie@0.8.1
  - @glissade/player@0.8.1
  - @glissade/scene@0.8.1
  - @glissade/sfx@0.8.1
  - @glissade/svg@0.8.1

## 0.8.1-pre.1

### Patch Changes

- e338c7d: Fix `--provider kokoro` under pnpm (downstream canary findings on 0.8.1-pre.0):

  - **Resolve `kokoro-js` from the user's project, not from `@glissade/narrate`'s own location.** Under pnpm's isolated layout an optional peer isn't linked into narrate's store dir, so the bare `import('kokoro-js')` failed even when it was installed and loadable. It's now resolved via `createRequire(cwd).resolve('kokoro-js')` (falling back to this module for hoisted/global installs) and loaded through a computed `file://` import — which also keeps it out of any bundle.
  - **Surface the real error.** The `catch {}` that masked every failure as a generic "not found" now includes the actual error `code` + `message`, so resolution/load problems are diagnosable.
  - **Read the version without the non-exported subpath.** `kokoro-js` doesn't export `./package.json`; `version()` now walks up from the resolved entry instead of resolving that subpath (which threw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
  - **Docs:** package-manager-agnostic install, and a pnpm note that downstreams must allow/ignore the native build scripts (`onnxruntime-node` / `sharp` / `protobufjs`) or `pnpm install --frozen-lockfile` exits non-zero.

- Updated dependencies [e338c7d]
  - @glissade/narrate@0.8.1-pre.1
  - @glissade/backend-skia@0.8.1-pre.1
  - @glissade/core@0.8.1-pre.1
  - @glissade/interact@0.8.1-pre.1
  - @glissade/lottie@0.8.1-pre.1
  - @glissade/player@0.8.1-pre.1
  - @glissade/scene@0.8.1-pre.1
  - @glissade/sfx@0.8.1-pre.1
  - @glissade/svg@0.8.1-pre.1

## 0.8.1-pre.0

### Patch Changes

- 0f09b67: Add a **Kokoro** TTS provider (`--provider kokoro`) — an Apache-2.0, 82M-param neural voice that is markedly more natural than espeak/piper, fully offline on CPU, with no API key. Unlike piper there's no `pip install` or external binary: it runs **pure-Node** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js + onnxruntime), declared as an **optional peer dependency** — `npm i kokoro-js` only if you use it. The model downloads and caches on first use; pick a voice via the script's `voice` (e.g. `af_heart`) and the quant via `kokoroProvider({ dtype })` (`q8` default, `fp32` for top quality).

  Deterministic by construction: Kokoro inference uses a fixed voice/style embedding (not diffusion-sampled per call), so the same text re-synthesizes byte-identical — verified by a gated determinism test. `version()` pins the `kokoro-js` version + model + dtype, so any of those moving invalidates the per-segment cache. New exports from `@glissade/narrate/providers`: `kokoroProvider`, `floatToWav`, `KokoroDtype`.

- Updated dependencies [0f09b67]
  - @glissade/narrate@0.8.1-pre.0
  - @glissade/backend-skia@0.8.1-pre.0
  - @glissade/core@0.8.1-pre.0
  - @glissade/interact@0.8.1-pre.0
  - @glissade/lottie@0.8.1-pre.0
  - @glissade/player@0.8.1-pre.0
  - @glissade/scene@0.8.1-pre.0
  - @glissade/sfx@0.8.1-pre.0
  - @glissade/svg@0.8.1-pre.0

## 0.8.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.

### Patch Changes

- dac15c9: Cue→chapters polish (downstream validation follow-ups on the 0.8 ad-break feature):

  - **Plain `cue()` now serializes.** `cue(at, name, data?)` stamps `data.kind: 'cue'` by default (a caller-supplied `kind` still wins), so a cue authored without an explicit kind now lands in `cues.json` and fires `player.onCue('cue', …)` instead of being silently dropped. The `data.kind` gate that excludes `.call()`/label markers stays intact.
  - **`--chapters vtt` shows the human title, not the kind.** The WebVTT cue text is now `data.title ?? name` (was the machine `kind`), and a `00:00` "Intro" chapter is auto-anchored when the earliest cue starts later — making the output a drop-in for a YouTube description chapter block (YouTube reads the cue text as the title and requires a 0:00 start). `cues.json` is unchanged (keeps `kind` for machines) and stays byte-deterministic.

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
  - @glissade/backend-skia@0.8.0
  - @glissade/interact@0.8.0
  - @glissade/lottie@0.8.0
  - @glissade/narrate@0.8.0
  - @glissade/sfx@0.8.0
  - @glissade/svg@0.8.0

## 0.8.0-pre.1

### Patch Changes

- dac15c9: Cue→chapters polish (downstream validation follow-ups on the 0.8 ad-break feature):

  - **Plain `cue()` now serializes.** `cue(at, name, data?)` stamps `data.kind: 'cue'` by default (a caller-supplied `kind` still wins), so a cue authored without an explicit kind now lands in `cues.json` and fires `player.onCue('cue', …)` instead of being silently dropped. The `data.kind` gate that excludes `.call()`/label markers stays intact.
  - **`--chapters vtt` shows the human title, not the kind.** The WebVTT cue text is now `data.title ?? name` (was the machine `kind`), and a `00:00` "Intro" chapter is auto-anchored when the earliest cue starts later — making the output a drop-in for a YouTube description chapter block (YouTube reads the cue text as the title and requires a 0:00 start). `cues.json` is unchanged (keeps `kind` for machines) and stays byte-deterministic.

- Updated dependencies [dac15c9]
- Updated dependencies [dac15c9]
  - @glissade/player@0.8.0-pre.1
  - @glissade/core@0.8.0-pre.1
  - @glissade/interact@0.8.0-pre.1
  - @glissade/backend-skia@0.8.0-pre.1
  - @glissade/lottie@0.8.0-pre.1
  - @glissade/narrate@0.8.0-pre.1
  - @glissade/scene@0.8.0-pre.1
  - @glissade/sfx@0.8.0-pre.1
  - @glissade/svg@0.8.0-pre.1

## 0.8.0-pre.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.

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
  - @glissade/backend-skia@0.8.0-pre.0
  - @glissade/interact@0.8.0-pre.0
  - @glissade/lottie@0.8.0-pre.0
  - @glissade/narrate@0.8.0-pre.0
  - @glissade/sfx@0.8.0-pre.0
  - @glissade/svg@0.8.0-pre.0

## 0.7.0

### Minor Changes

- 8f4fa6c: `gs render --range` is now **frame-indexed** (`--range 0..120` = inclusive frame indices), matching the spec's rule that export APIs take frames while Player APIs take seconds. Decimal/garbage ranges are rejected. New flags: `--frame N` (render a single still through the same path) and `--format png-seq` (force a PNG sequence even when `--out` looks like a video). `--workers` and `--watch` are recognized but print an honest not-yet-implemented note (parallel sharding is tracked separately). The programmatic `render({ range })` still accepts seconds for back-compat; new `frame`/`frameRange`/`format` options drive the frame-indexed path.

### Patch Changes

- 0c0a583: A/V sync offsets are now sample-accurate and identical across export paths by construction (§5.3). A new `audioOffsetSamples(at, sampleRate)` in core (`round(at * sampleRate)`) is the single source of truth: the CLI mixer derives its `adelay` from the sample grid instead of rounding to milliseconds, and the browser `OfflineAudioContext` mixer snaps clip starts (and gain-envelope times) to the same grid instead of using raw float seconds. Previously the two paths could drift sub-frame and a non-frame-aligned `at` passed through silently.
- 4317102: `gs render --frame N --out foo.png` now writes that single PNG file at the path, instead of creating a directory `foo.png/` containing `frame-0000N.png` + caption sidecars. A single frame to a `*.png` `--out` is a still; rendering into a directory still works with a directory `--out`. Reported downstream.
- 9aa42e6: Render-mode determinism guards (§5.5): `withDeterminismGuards(mode, fn)` from `@glissade/scene` patches the banned globals (`Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`) for the synchronous scope of a single `evaluate()` — throwing a `DeterminismViolationError` under `throw` mode (CLI/CI), warning-once-then-delegating under `warn` (dev), and always restoring them afterward. `gs render` now wraps every frame's `evaluate()` in `throw` mode, so a scene that reads a wall clock or unseeded random is rejected at render time instead of producing a silently nondeterministic export. This is the runtime backstop to the static `@glissade/eslint-plugin` rules.
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
  - @glissade/backend-skia@0.7.0
  - @glissade/interact@0.7.0
  - @glissade/lottie@0.7.0
  - @glissade/narrate@0.7.0
  - @glissade/player@0.7.0
  - @glissade/sfx@0.7.0
  - @glissade/svg@0.7.0

## 0.7.0-pre.0

### Minor Changes

- 8f4fa6c: `gs render --range` is now **frame-indexed** (`--range 0..120` = inclusive frame indices), matching the spec's rule that export APIs take frames while Player APIs take seconds. Decimal/garbage ranges are rejected. New flags: `--frame N` (render a single still through the same path) and `--format png-seq` (force a PNG sequence even when `--out` looks like a video). `--workers` and `--watch` are recognized but print an honest not-yet-implemented note (parallel sharding is tracked separately). The programmatic `render({ range })` still accepts seconds for back-compat; new `frame`/`frameRange`/`format` options drive the frame-indexed path.

### Patch Changes

- 0c0a583: A/V sync offsets are now sample-accurate and identical across export paths by construction (§5.3). A new `audioOffsetSamples(at, sampleRate)` in core (`round(at * sampleRate)`) is the single source of truth: the CLI mixer derives its `adelay` from the sample grid instead of rounding to milliseconds, and the browser `OfflineAudioContext` mixer snaps clip starts (and gain-envelope times) to the same grid instead of using raw float seconds. Previously the two paths could drift sub-frame and a non-frame-aligned `at` passed through silently.
- 9aa42e6: Render-mode determinism guards (§5.5): `withDeterminismGuards(mode, fn)` from `@glissade/scene` patches the banned globals (`Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`) for the synchronous scope of a single `evaluate()` — throwing a `DeterminismViolationError` under `throw` mode (CLI/CI), warning-once-then-delegating under `warn` (dev), and always restoring them afterward. `gs render` now wraps every frame's `evaluate()` in `throw` mode, so a scene that reads a wall clock or unseeded random is rejected at render time instead of producing a silently nondeterministic export. This is the runtime backstop to the static `@glissade/eslint-plugin` rules.
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
  - @glissade/backend-skia@0.7.0-pre.0
  - @glissade/interact@0.7.0-pre.0
  - @glissade/lottie@0.7.0-pre.0
  - @glissade/narrate@0.7.0-pre.0
  - @glissade/player@0.7.0-pre.0
  - @glissade/sfx@0.7.0-pre.0
  - @glissade/svg@0.7.0-pre.0

## 0.6.1

### Patch Changes

- Updated dependencies [c231e58]
  - @glissade/narrate@0.6.1
  - @glissade/backend-skia@0.6.1
  - @glissade/core@0.6.1
  - @glissade/interact@0.6.1
  - @glissade/lottie@0.6.1
  - @glissade/player@0.6.1
  - @glissade/scene@0.6.1
  - @glissade/sfx@0.6.1
  - @glissade/svg@0.6.1

## 0.6.0

### Minor Changes

- c5dbc0e: New `@glissade/svg` package: static SVG import. `importSvg(svgString)` parses an SVG document into a glissade scene — `<path d>` strings (full M/L/H/V/C/S/Q/T/A/Z command set, with arcs converted to native ellipse-arc segments), the basic shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`), `<g>` grouping, `transform` (translate/scale/rotate/matrix → node TRS), and fill/stroke/stroke-width with SVG presentation inheritance. Unsupported features (text, images, gradients, filters, masks) are dropped with warnings. Returns `{ size, root, warnings, toSceneModule() }`.

  `gs import` now accepts `.svg` alongside `.json`: it emits a scene module that defers to `importSvg` (the conversion's single source of truth), renderable by `gs render`.

### Patch Changes

- Updated dependencies [1aa2228]
- Updated dependencies [e249f0d]
- Updated dependencies [6c07c96]
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
- Updated dependencies [12c5841]
- Updated dependencies [c5dbc0e]
- Updated dependencies [977b3d5]
  - @glissade/narrate@0.6.0
  - @glissade/core@0.6.0
  - @glissade/scene@0.6.0
  - @glissade/svg@0.6.0
  - @glissade/backend-skia@0.6.0
  - @glissade/interact@0.6.0
  - @glissade/lottie@0.6.0
  - @glissade/player@0.6.0
  - @glissade/sfx@0.6.0

## 0.6.0-pre.1

### Minor Changes

- c5dbc0e: New `@glissade/svg` package: static SVG import. `importSvg(svgString)` parses an SVG document into a glissade scene — `<path d>` strings (full M/L/H/V/C/S/Q/T/A/Z command set, with arcs converted to native ellipse-arc segments), the basic shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`), `<g>` grouping, `transform` (translate/scale/rotate/matrix → node TRS), and fill/stroke/stroke-width with SVG presentation inheritance. Unsupported features (text, images, gradients, filters, masks) are dropped with warnings. Returns `{ size, root, warnings, toSceneModule() }`.

  `gs import` now accepts `.svg` alongside `.json`: it emits a scene module that defers to `importSvg` (the conversion's single source of truth), renderable by `gs render`.

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [c5dbc0e]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0-pre.1
  - @glissade/svg@0.6.0-pre.1
  - @glissade/scene@0.6.0-pre.1
  - @glissade/backend-skia@0.6.0-pre.1
  - @glissade/interact@0.6.0-pre.1
  - @glissade/lottie@0.6.0-pre.1
  - @glissade/narrate@0.6.0-pre.1
  - @glissade/player@0.6.0-pre.1
  - @glissade/sfx@0.6.0-pre.1

## 0.6.0-pre.0

### Patch Changes

- Updated dependencies [1aa2228]
- Updated dependencies [e249f0d]
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
  - @glissade/narrate@0.6.0-pre.0
  - @glissade/scene@0.6.0-pre.0
  - @glissade/backend-skia@0.6.0-pre.0
  - @glissade/interact@0.6.0-pre.0
  - @glissade/lottie@0.6.0-pre.0
  - @glissade/player@0.6.0-pre.0
  - @glissade/core@0.6.0-pre.0
  - @glissade/sfx@0.6.0-pre.0

## 0.5.0

### Minor Changes

- 27d4727: `gs prepare <scene>` — one command to materialize ALL of a scene's committed audio assets: it runs the narration prepare (if a `.narration.json` sibling exists), the sfx prepare (if a `.sfx.json` exists, anchors resolving against the narration timing), and then **imports the scene module** so any in-code sfx caches the author writes at module/timeline-build time (e.g. `renderSfxAssets` for `keystrokeClips`) are flushed too. It never calls `evaluate()` (a pure read that writes nothing); the import side-effects are the flush. A missing sibling or a failing import is a skip/warning, not an abort — so prepare is a no-op-friendly superset of `gs narrate` + `gs sfx`. After it, `gs render` is a pure read of committed files.
- 3af5f67: Piper provider + provider-independent word alignment. `piperProvider({ model })` adds local **neural** TTS (rhasspy/piper) — natural voice, offline, free, no key. The bigger change: word timing is now an alignment step decoupled from synthesis, because no real provider (espeak/openai/piper) emits word timestamps. After `synthesize()`, a segment without provider words is run through an aligner: `heuristic` (default — pure-JS syllable distribution, always available, deterministic), `vosk` (offline ASR via the optional `vosk` package — Apache-2.0, ~50 MB model, no Docker/Python/multi-GB download), or `none`. `vosk` derives timings against the audio and maps them onto the script tokens (`mapAsrToScript`, exported) so `segments[].words[i]` lines up with `wordBoxes()[i]`. Provider-supplied words always win. Set it with the script's `align` field or `gs narrate --align <id>`. Alignment runs only in the prepare step and is cached separately from audio (`wordsFrom`), so swapping aligners re-aligns the cached wav at zero synthesis cost. `synthesizeScript` gains `providerImpl`/`alignerImpl` instance overrides — the bring-your-own seam for custom providers (ElevenLabs, Azure) and aligners (whisper.cpp, MFA, …). Docs: a provider matrix and a "Word timing & alignment" section in the narration guide.
- adc00ba: `gs sfx` — the sound-effects prepare step + render auto-mix, closing the SFX zero-config loop (parity with narration/music). Write a `<scene>.sfx.json` with effect hits that anchor to a narration beat (`{ voice, anchor, offset }`, resolved against the sibling `*.narration.timing.json` so they re-flow on re-narrate) or use an absolute `at`. `gs sfx <scene>` resolves the times, renders the referenced voices once (deduped) to `<scene>.sfx-cache/`, bakes the deterministic index-seeded jitter into a committed `<scene>.sfx.timing.json`, and `gs render` auto-mixes that manifest with zero config (`--sfx off` opts out). Author-wired clips are detected and never doubled (the +6dB guard). v1 drives the procedural `sfxr` source; sample packs remain available from code via `@glissade/sfx`'s `buildSfxClips`.
- 1c53eeb: `gs sfx --verbose` echoes each resolved hit as `<time>s  <voice>` (plus gain/rate when jittered), so anchor coupling validates at a glance instead of reading the committed timing.json. `prepareSfx` now returns the resolved `clips` for programmatic use.

### Patch Changes

- 3af5f67: `gs render` now auto-mixes narration, closing the asymmetry a consumer flagged: 0.4.x auto-mixed a sibling music manifest but the narration voice still had to be hand-wired onto `timeline.audio` (the music manifest read the narration timing only to _duck_ the bed, never to add the voice). Now a sibling `<scene>.narration.timing.json` is discovered and its clips mixed automatically — scene + narration manifest → a voiced mp4, zero-config, the promise the music-parity framing implied. `--narration off` opts out. Author-wired clips are detected and never doubled (the same +6dB guard as the bed), and the browser-export path is unchanged (it mixes only `timeline.audio`, so wire `beats.clips()` there).
- Updated dependencies [763bd2f]
- Updated dependencies [2521fdc]
- Updated dependencies [ca2150f]
- Updated dependencies [e1865d2]
- Updated dependencies [363c7b7]
- Updated dependencies [1c53eeb]
- Updated dependencies [3af5f67]
- Updated dependencies [fcfb962]
- Updated dependencies [3383077]
- Updated dependencies [829b14d]
- Updated dependencies [43b326b]
- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [43b326b]
- Updated dependencies [adc7941]
- Updated dependencies [27b4b49]
- Updated dependencies [4495359]
  - @glissade/narrate@0.5.0
  - @glissade/scene@0.5.0
  - @glissade/sfx@0.5.0
  - @glissade/backend-skia@0.5.0
  - @glissade/interact@0.5.0
  - @glissade/lottie@0.5.0
  - @glissade/player@0.5.0
  - @glissade/core@0.5.0

## 0.5.0-pre.7

### Patch Changes

- Updated dependencies [763bd2f]
  - @glissade/narrate@0.5.0-pre.7
  - @glissade/backend-skia@0.5.0-pre.7
  - @glissade/core@0.5.0-pre.7
  - @glissade/interact@0.5.0-pre.7
  - @glissade/lottie@0.5.0-pre.7
  - @glissade/player@0.5.0-pre.7
  - @glissade/scene@0.5.0-pre.7
  - @glissade/sfx@0.5.0-pre.7

## 0.5.0-pre.6

### Minor Changes

- 27d4727: `gs prepare <scene>` — one command to materialize ALL of a scene's committed audio assets: it runs the narration prepare (if a `.narration.json` sibling exists), the sfx prepare (if a `.sfx.json` exists, anchors resolving against the narration timing), and then **imports the scene module** so any in-code sfx caches the author writes at module/timeline-build time (e.g. `renderSfxAssets` for `keystrokeClips`) are flushed too. It never calls `evaluate()` (a pure read that writes nothing); the import side-effects are the flush. A missing sibling or a failing import is a skip/warning, not an abort — so prepare is a no-op-friendly superset of `gs narrate` + `gs sfx`. After it, `gs render` is a pure read of committed files.

### Patch Changes

- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [adc7941]
  - @glissade/scene@0.5.0-pre.6
  - @glissade/backend-skia@0.5.0-pre.6
  - @glissade/interact@0.5.0-pre.6
  - @glissade/lottie@0.5.0-pre.6
  - @glissade/narrate@0.5.0-pre.6
  - @glissade/player@0.5.0-pre.6
  - @glissade/core@0.5.0-pre.6
  - @glissade/sfx@0.5.0-pre.6

## 0.5.0-pre.5

### Patch Changes

- Updated dependencies [2521fdc]
- Updated dependencies [4495359]
  - @glissade/narrate@0.5.0-pre.5
  - @glissade/scene@0.5.0-pre.5
  - @glissade/backend-skia@0.5.0-pre.5
  - @glissade/interact@0.5.0-pre.5
  - @glissade/lottie@0.5.0-pre.5
  - @glissade/player@0.5.0-pre.5
  - @glissade/core@0.5.0-pre.5
  - @glissade/sfx@0.5.0-pre.5

## 0.5.0-pre.4

### Minor Changes

- 1c53eeb: `gs sfx --verbose` echoes each resolved hit as `<time>s  <voice>` (plus gain/rate when jittered), so anchor coupling validates at a glance instead of reading the committed timing.json. `prepareSfx` now returns the resolved `clips` for programmatic use.

### Patch Changes

- Updated dependencies [ca2150f]
- Updated dependencies [1c53eeb]
  - @glissade/scene@0.5.0-pre.4
  - @glissade/narrate@0.5.0-pre.4
  - @glissade/backend-skia@0.5.0-pre.4
  - @glissade/interact@0.5.0-pre.4
  - @glissade/lottie@0.5.0-pre.4
  - @glissade/player@0.5.0-pre.4
  - @glissade/core@0.5.0-pre.4
  - @glissade/sfx@0.5.0-pre.4

## 0.5.0-pre.3

### Patch Changes

- Updated dependencies [e1865d2]
- Updated dependencies [43b326b]
- Updated dependencies [43b326b]
  - @glissade/scene@0.5.0-pre.3
  - @glissade/sfx@0.5.0-pre.3
  - @glissade/backend-skia@0.5.0-pre.3
  - @glissade/interact@0.5.0-pre.3
  - @glissade/lottie@0.5.0-pre.3
  - @glissade/narrate@0.5.0-pre.3
  - @glissade/player@0.5.0-pre.3
  - @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Minor Changes

- adc00ba: `gs sfx` — the sound-effects prepare step + render auto-mix, closing the SFX zero-config loop (parity with narration/music). Write a `<scene>.sfx.json` with effect hits that anchor to a narration beat (`{ voice, anchor, offset }`, resolved against the sibling `*.narration.timing.json` so they re-flow on re-narrate) or use an absolute `at`. `gs sfx <scene>` resolves the times, renders the referenced voices once (deduped) to `<scene>.sfx-cache/`, bakes the deterministic index-seeded jitter into a committed `<scene>.sfx.timing.json`, and `gs render` auto-mixes that manifest with zero config (`--sfx off` opts out). Author-wired clips are detected and never doubled (the +6dB guard). v1 drives the procedural `sfxr` source; sample packs remain available from code via `@glissade/sfx`'s `buildSfxClips`.

### Patch Changes

- Updated dependencies [363c7b7]
- Updated dependencies [3383077]
- Updated dependencies [829b14d]
- Updated dependencies [27b4b49]
  - @glissade/narrate@0.5.0-pre.2
  - @glissade/sfx@0.5.0-pre.2
  - @glissade/scene@0.5.0-pre.2
  - @glissade/backend-skia@0.5.0-pre.2
  - @glissade/interact@0.5.0-pre.2
  - @glissade/lottie@0.5.0-pre.2
  - @glissade/player@0.5.0-pre.2
  - @glissade/core@0.5.0-pre.2

## 0.5.0-pre.1

### Patch Changes

- Updated dependencies [fcfb962]
  - @glissade/narrate@0.5.0-pre.1
  - @glissade/backend-skia@0.5.0-pre.1
  - @glissade/core@0.5.0-pre.1
  - @glissade/interact@0.5.0-pre.1
  - @glissade/lottie@0.5.0-pre.1
  - @glissade/player@0.5.0-pre.1
  - @glissade/scene@0.5.0-pre.1

## 0.5.0-pre.0

### Minor Changes

- 3af5f67: Piper provider + provider-independent word alignment. `piperProvider({ model })` adds local **neural** TTS (rhasspy/piper) — natural voice, offline, free, no key. The bigger change: word timing is now an alignment step decoupled from synthesis, because no real provider (espeak/openai/piper) emits word timestamps. After `synthesize()`, a segment without provider words is run through an aligner: `heuristic` (default — pure-JS syllable distribution, always available, deterministic), `vosk` (offline ASR via the optional `vosk` package — Apache-2.0, ~50 MB model, no Docker/Python/multi-GB download), or `none`. `vosk` derives timings against the audio and maps them onto the script tokens (`mapAsrToScript`, exported) so `segments[].words[i]` lines up with `wordBoxes()[i]`. Provider-supplied words always win. Set it with the script's `align` field or `gs narrate --align <id>`. Alignment runs only in the prepare step and is cached separately from audio (`wordsFrom`), so swapping aligners re-aligns the cached wav at zero synthesis cost. `synthesizeScript` gains `providerImpl`/`alignerImpl` instance overrides — the bring-your-own seam for custom providers (ElevenLabs, Azure) and aligners (whisper.cpp, MFA, …). Docs: a provider matrix and a "Word timing & alignment" section in the narration guide.

### Patch Changes

- 3af5f67: `gs render` now auto-mixes narration, closing the asymmetry a consumer flagged: 0.4.x auto-mixed a sibling music manifest but the narration voice still had to be hand-wired onto `timeline.audio` (the music manifest read the narration timing only to _duck_ the bed, never to add the voice). Now a sibling `<scene>.narration.timing.json` is discovered and its clips mixed automatically — scene + narration manifest → a voiced mp4, zero-config, the promise the music-parity framing implied. `--narration off` opts out. Author-wired clips are detected and never doubled (the same +6dB guard as the bed), and the browser-export path is unchanged (it mixes only `timeline.audio`, so wire `beats.clips()` there).
- Updated dependencies [3af5f67]
  - @glissade/narrate@0.5.0-pre.0
  - @glissade/backend-skia@0.5.0-pre.0
  - @glissade/core@0.5.0-pre.0
  - @glissade/interact@0.5.0-pre.0
  - @glissade/lottie@0.5.0-pre.0
  - @glissade/player@0.5.0-pre.0
  - @glissade/scene@0.5.0-pre.0

## 0.4.5

### Patch Changes

- 70159ad: Adoption-report follow-ups. TokenHighlight ranges gain an `offset` target (`'<id>/<rangeId>/offset'` + .x/.y) — per-range shakes and nudges without moving sibling ranges (downstream's red-flip shake previously had to jitter the whole node). `gs render` auto-mix never double-adds the bed: when the timeline's audio already references the stem (any url spelling resolving to the same file), the bed is skipped with a note — a coherent duplicate measured +6dB downstream. Docs: em-derived padding guidance for tokenHighlight at high resolutions; gainDb override (not compose) semantics pinned.
- Updated dependencies [70159ad]
  - @glissade/scene@0.4.5
  - @glissade/backend-skia@0.4.5
  - @glissade/interact@0.4.5
  - @glissade/lottie@0.4.5
  - @glissade/narrate@0.4.5
  - @glissade/player@0.4.5
  - @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- 40f5a31: The two downstream feature requests, built from their production specs. `tokenHighlight(text, { ranges })` (scene): sub-line multi-color token highlights over wordBoxes — each range matches a token (whitespace-insensitive boundary-exact runs, or [wordIndex, wordIndex]) and carries its OWN animatable fill/opacity/progress/scale targets; ranges validate at construction and throw on copy drift at draw (rematch: true for animated text); wrap-spanning ranges produce one rect per line segment. Music manifest blessed (narrate): `*.music.timing.json` ({musicVersion, bpm, beatsPerCycle, cps, durationSec, offsetSec, stem, gainDb}) with the beat-0-equals-sample-0 invariant and cps↔bpm validation; `music(timing, at)` anchors (beat/cycle/nearestBeat/nextBeat/grid) mirror narration(); `m.clip()` composes bed gainDb (10^(dB/20) over the whole envelope) with duckEnvelope under a narration manifest. `gs render` auto-mix parity: a sibling music manifest with a stem joins the mix automatically, ducked under narration when both manifests sit next to the scene — the zero-config narrated-explainer-with-bed; `--music off` opts out.
- Updated dependencies [40f5a31]
  - @glissade/scene@0.4.4
  - @glissade/narrate@0.4.4
  - @glissade/backend-skia@0.4.4
  - @glissade/interact@0.4.4
  - @glissade/lottie@0.4.4
  - @glissade/player@0.4.4
  - @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- 2282bcb: The downstream-friction batch (driven by a consuming project's 0.3.0→0.4.2 report). `createMeasurer({ fonts })` in backend-skia + `setDefaultMeasurer()` in scene bless factory-time measurement — Text pulls and un-injected scenes fall back through the process default before the estimator, so component factories measure with the rasterizer's real metrics (scene-injected measurers still win). `springTo(endT, from, to, cfg)` in core returns the [launch, settle] key pair with the spring-duration arithmetic done — settle-ON-the-beat without hand math. `Text.wordBoxes()` trims whitespace that punctuation-gluing folds into a segment (' $' → '$'), so boxes cover exactly the ink. `AudioClip.gain` accepts keys-only envelopes (`{ keys }`); the meaningless-but-mandatory target string is gone (full Tracks still work structurally). `duckEnvelope(timing, opts)` in narrate derives the music-bed ducking gain from the narration manifest (segment windows, attack/release ramps, near-window merging) — upstreamed from downstream. `gs render` progress detects non-TTY stderr and emits sparse newline-terminated updates instead of an unbroken \r stream.
- Updated dependencies [2282bcb]
  - @glissade/scene@0.4.3
  - @glissade/backend-skia@0.4.3
  - @glissade/core@0.4.3
  - @glissade/narrate@0.4.3
  - @glissade/interact@0.4.3
  - @glissade/lottie@0.4.3
  - @glissade/player@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [53f6f9f]
  - @glissade/scene@0.4.2
  - @glissade/backend-skia@0.4.2
  - @glissade/interact@0.4.2
  - @glissade/lottie@0.4.2
  - @glissade/narrate@0.4.2
  - @glissade/player@0.4.2
  - @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [80d9ac1]
  - @glissade/scene@0.4.1
  - @glissade/interact@0.4.1
  - @glissade/backend-skia@0.4.1
  - @glissade/lottie@0.4.1
  - @glissade/narrate@0.4.1
  - @glissade/player@0.4.1
  - @glissade/core@0.4.1

## 0.4.0

### Minor Changes

- 613a00a: New package `@glissade/lottie` + `gs import` (Lottie S1): an import-only, fail-fast Lottie/bodymovin converter. Shape, null, solid, and image layers; full transform mapping (anchor sandwiches, parent chains incl. hidden parents, ip/op visibility wrappers, ease-shift onto arrival keys, hold and same-frame rewrites, arc-length-baked spatial tangents); painter-model shape denormalization to Path nodes with animated path morphing; el/rc kappa conversion (exact under animation, direction-aware winding for nonzero holes); merge-paths mode 1. Everything outside the cut rejects in ONE error enumerating every problem (`--allow-degraded` downgrades expressions and exotic merge modes to warnings). Output is a plain SceneModule + v1 Timeline — render, studio, machines, and export consume it unchanged. Byte-deterministic across processes; never mutates its input.
- cc57dfc: TTS narration + caption primitives. `@glissade/narrate` (new): narration scripts collocated with scenes, pluggable TTS providers (espeak / openai / deterministic fake) behind an explicit `gs narrate` prepare step with sha256 segment caching, narration-derived timeline anchors (`narration(timing).start('seg')`), captions as hold-key string tracks + safe-area caption nodes (16:9 and 9:16), and `.srt`/`.vtt` exporters. CLI: `gs narrate` command and `gs render --captions burn|sidecar|off` with sidecars that match the burned timing by construction. Render stays fully offline after prepare.

### Patch Changes

- Updated dependencies [056817c]
- Updated dependencies [869d406]
- Updated dependencies [613a00a]
- Updated dependencies [cc57dfc]
- Updated dependencies [3986798]
  - @glissade/scene@0.4.0
  - @glissade/lottie@0.4.0
  - @glissade/narrate@0.4.0
  - @glissade/backend-skia@0.4.0
  - @glissade/interact@0.4.0
  - @glissade/player@0.4.0
  - @glissade/core@0.4.0

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
