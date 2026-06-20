# @glissade/scene

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
