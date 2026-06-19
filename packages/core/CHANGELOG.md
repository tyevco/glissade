# @glissade/core

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
