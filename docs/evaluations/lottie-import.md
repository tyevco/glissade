# Lottie import: scoping evaluation (v2 interop)

> Scoping document for tarot card `GAcEJkEMZm2i` ("Lottie interop (v2)"), per DESIGN.md §7.5.
> Verdict up front: **an import-only MVP is feasible and the path value type is its one hard
> engine prerequisite.** Both formats are keyframe documents; the mapping is mostly schema work
> plus two engine additions (a `path` ValueType + a `Path` node) and a handful of importer
> structuring rules. Export is out of scope for this evaluation.

Real-world corpus used throughout (8 files, `/tmp/lottie-samples/`, sourced from lottiefiles /
the bodymovin repo / lottie docs): `gatin`, `adrock`, `bodymovin`, `happy2016`, `navidad`,
`docs_bezier_expression`, `docs_image_animated`, `docs_text`. Feature inventory was extracted
mechanically; counts cited below come from that scan.

---

## 1. The MVP cut line

The MVP is a one-way importer: `.json` (Lottie/bodymovin) → a generated glissade scene module +
a v1 Timeline document. **Policy: fail fast.** Any feature outside the cut aborts the import
with an error naming the layer/shape and the unsupported feature. A `--allow-degraded` flag
downgrades a defined subset of those errors to warnings (skipping the feature) for users who
want "most of the file" — but degradations are never silent.

### Supported in the MVP

| Lottie feature | glissade mapping |
| --- | --- |
| Layer types: shape (ty:4), null (ty:3), solid (ty:1), image (ty:2) | `Group` / `Rect` / `Image` nodes; nulls are transform-only Groups |
| Transforms `p`/`s`/`r`/`o`, incl. split position `{s:true,x,y}` | Tracks targeting registered base-Node signals (`packages/scene/src/node.ts:121-129`); scale ÷100, opacity ÷100, rotation degrees pass through unchanged (`fromTRS`, `packages/scene/src/matrix.ts:31-37`, is degrees, Y-down clockwise — identical convention, no coordinate flip) |
| Anchor point `a`, static **and** animated | Two-node sandwich: outer Group carries p/r/s, inner Group at `[-ax,-ay]` holds content; animated anchor = inner-Group position track with negated values (exact — negation commutes with lerp) |
| Keyframe eases (`o`/`i` bezier pairs), incl. overshoot | `{kind:'cubicBezier'}` EaseSpec shifted one key forward onto the arrival key (`Key.ease`, `packages/core/src/track.ts:22`); `easing.ts:210` is exactly Lottie's solver and y is unclamped, so overshoot is lossless |
| Per-dimension scale eases (differing `o.x[d]`) | Split to `scale.x`/`scale.y` number tracks (already first-class) |
| Hold keys `h:1`; same-frame keyframe pairs | `interp:'hold'` on the following key (identical semantics, `track.ts:226`); same-`t` pairs rewritten as hold (validateTrack rejects equal `t`, `track.ts:56`) |
| Spatial bezier tangents `ti`/`to` on position keys | **Import-time arc-length baking** to dense keys at doc fps (see §2.3) — present in 6/8 samples (41–254 keys each), so this is table stakes, not optional |
| Layer parenting (`parent`) | Group nesting; opacity placed on a content sibling, never the shared transform Group, because `pushGroup` opacity composites over the subtree (`node.ts:179`) while Lottie parenting never inherits opacity |
| Layer `ip`/`op`/`st` | Wrapper Group with hold 0/1 opacity keys (`emit()` culls at opacity ≤ 0, `node.ts:172-173`); frame→seconds via ÷`fr` |
| Shape layers: `sh`, `fl`, `st`, `gr`, `tr` | New `Path extends Shape` node + denormalization of the painter model: one Path per (style × preceding geometry), in style order (child-array order is paint order). The dominant exporter shape `[sh, fl|st, tr]` (every group in gatin) collapses to a single Path |
| Parametric ellipse `el`, rect `rc` | Converted to bezier `PathValue` at import; animated size/position converts per-key (exact for `el`: the kappa form is linear in size, so lerp commutes with conversion) |
| **Animated path morphing** (`sh.ks` a:1) | `Track<PathValue>` via the new `path` value type — see §2 |
| Merge paths `mm` mode 1 (merge) | Contour concatenation into one multi-contour PathValue (all 11 `mm`s in bodymovin are mode 1) |
| Colors | Lottie float [0–1] arrays → hex strings (`parseColor`, `color.ts:14-15`) |

### Rejected with a clear error (MVP)

| Feature | Error class | Notes / future stage |
| --- | --- | --- |
| Precomps (ty:0), incl. `w`/`h` clip and `sr` stretch | `unsupported-layer-type` | Stage 2 |
| Masks (`masksProperties`) and mattes (`tt`/`td`) | `unsupported-masking` | Stages 2–3 |
| Time remap `tm` | `unsupported-time-remap` | Stage 3 |
| Text layers (ty:5) | `unsupported-layer-type` | Possible v2.x mapping to glissade Text; AE text animators likely never |
| Expressions (any property `x` string) | `unsupported-expression` | Charter: no generators/expressions. Degradable to warn-and-strip, but stripped expressions often change motion |
| Merge paths modes 2–5 (add/subtract/intersect/exclude) | `unsupported-shape-modifier` | Needs path booleans; no plan |
| Trim paths `tm` (shape), repeater `rp`, round corners `rd`, polystar `sr`, gradients `gf`/`gs` | `unsupported-shape-item` | The denormalizer preserves per-group geometry lists so trim/merge can attach later |
| Skew `sk`/`sa` (layer or group transform) | `unsupported-transform` | No skew term in `fromTRS`; zero uses across all 8 samples — deferrable |
| Layer effects `ef`, layer styles, 3D layers (`ddd`), camera | `unsupported-feature` | No plan (effects partially map to FilterSpec someday) |
| Even-odd fills `fl.r:2` | `unsupported-fill-rule` | Absent from all samples (old exporters omit `r`); cheap to add (`rule` field on fillPath mirroring clip, `displayList.ts:138-139`) when first seen |
| Negative `sr` (reverse stretch) | `unsupported-time-remap` | `flatten()` rejects timeScale ≤ 0 (`timeline.ts:144`); only representable via Stage-3 warp baking |

### Importer output format (an MVP decision, not an engine gap)

Scenes are code; only the Timeline is a document. The MVP **emits a generated TypeScript scene
module** (Groups/Paths with stable ids) plus the Timeline JSON, rather than inventing a
scene-JSON schema + hydrator. Codegen keeps the imported result first-class in the studio
(inspectable, sidecar-editable) and defers the scene-document question to its own card.

---

## 2. Prerequisite assessment: the path value type

**Is it required for the MVP? Yes — unconditionally.** Every shape-layer sample animates at
least one `sh.ks`, and static paths still need a value to put in the `Path` node's signal.
It is also the same type animated mask paths (Stage 2) keyframe, so it is built once.

**Is the §2.2 Flubber-style topology fallback required? No.** Lottie guarantees vertex counts
match across keyframes of one animated path, and lottie-web morphs by linear per-vertex
interpolation of `v`/`i`/`o` — identical to the lerp below — so imported morphs are
pixel-faithful without any normalization. The fallback (de Casteljau subdivision to a common
count, start-vertex rotation, open↔closed promotion, a memoized per-key-pair prep cache since
`ValueType.lerp` is stateless) matters only for glissade-native `.to()` morphs between
arbitrary paths and ships later without affecting import fidelity.

### Minimal shape

```ts
// Canonical document value: Lottie's own representation, generalized to contours.
type PathContour = { closed: boolean; v: Vec2[]; in: Vec2[]; out: Vec2[] }; // relative tangents
type PathValue = PathContour[];

registerValueType({
  id: 'path',
  lerp: pairwiseVec2LerpOf_v_in_out, // plus closed/contour-count match check
  equals: deepEquals,
  extrapolates: false,               // DESIGN.md §2.7: springs clamp w/ dev warning (track.ts:230 already generic)
  // no add/sub/scale → velocityAt returns null (lerp-only, like color)
  defaultHandoff: 'blend-from-frozen',
});
```

Plain JSON — serializes in the Timeline with no new hooks. Plus:

- **`Path extends Shape`** in `packages/scene/src/nodes.ts` (~60 lines): a `data` signal holding
  `PathValue`, registered as the `<id>/d` track target; `pathSegs()` emits
  `['M', v[0]]`, per-segment `['C', v[n]+out[n], v[n+1]+in[n+1], v[n+1]]`, `['Z']` if closed.
  The IR is already ready (`'C'` seg, `displayList.ts:19`; `fillPath`/`strokePath`, `:139-140`)
  — **zero backend work**.
- **`inferValueType` escape**: `valueTypes.ts:105-120` cannot sniff `PathValue`; the importer
  sets `type:'path'` explicitly on tracks, and builder surfaces get a PathValue sniff (or an
  explicit-type arg) so native authoring doesn't throw `ValueTypeInferenceError`.
- **Validation note**: `validateTrack` checks only key ordering, so malformed path key values
  pass silently today — worth a per-type value-shape validation hook, but not MVP-blocking.

**Path node vs direct-to-IR import: build the Path node.** Direct-to-IR (baked DisplayList
streams) has no landing spot — no `AssetRef` kind for baked clips (`timeline.ts:19-22`),
backends consume per-frame DisplayLists from `Node.emit()` — and it forfeits everything the
charter centers on: studio editability, v2 state machines driving signals, retargeting,
sidecar merges. It is also the more expensive build. It remains only a future perf escape
hatch for pathological files (bodymovin.json: 298 shape layers, ~8.2k keys), and even there
`bake()` over a Path-node scene is the charter-aligned answer.

---

## 3. Staged implementation plan

### Stage 0 — engine prerequisites (moderate; ~1 card)
1. `path` ValueType + `PathValue` shape (§2) with lerp/equals tests, spring-clamp test.
2. `Path` node + `d` target registration + pathSegs emission; golden test (static + morphing).
3. Decide & implement fill-rule plumbing only if a sample demands it (none does today).

### Stage 1 — MVP importer (large; the cut line of §1)
1. `@glissade/lottie` package (Node-side; CLI `gs import foo.json`): parser, validator,
   fail-fast feature audit pass (so users get *all* errors at once, not one per run).
2. Transform/opacity mapping incl. anchor sandwich, parent/opacity splitting, ip/op wrappers,
   ease shifting, hold/same-frame rewriting, frame→seconds.
3. Spatial `ti`/`to` arc-length baking (tolerance flag; default dense-at-doc-fps). Lottie maps
   temporal ease onto **distance along the curve**, not bezier parameter — naive parameter-space
   lerp diverges mid-segment, so baking must integrate arc length.
4. Shape-layer denormalizer (painter model → one Path per style×geometry; duplicate shared
   animated `data` tracks per node), `el`/`rc` conversion, `mm` mode-1 contour merge.
5. Scene-module codegen + Timeline emission; acceptance: **gatin.json** renders frame-accurate
   against lottie-web reference frames (SSIM harness, mirroring the browser↔Skia suite);
   `docs_image_animated.json` exact.
6. Per-backend regression test: eased opacity can overshoot [0,1] mid-segment (number type
   extrapolates); clamp at draw time.

### Stage 2 — precomps + masks, clean subset (large)
1. Precomp → importer-side instanced clone (namespaced node ids — node ids are globally unique,
   `scene.ts:38`; compile flattens to global target strings, `timeline.ts:155`) + `ChildEntry
   {mode:'sync', at: st/fr, timeScale: 1/sr}` — the rebase math (`timeline.ts:123-125`) matches
   Lottie's `(compFrame − st)/sr` exactly. `AssetRef kind:'timeline'` reuse is an optimization,
   not a document feature.
2. Group `clipRect`/`clipPath` props emitting the existing-but-unused `{op:'clip'}` IR
   (`displayList.ts:138`; both backends already execute it) for precomp `w`/`h` bounds.
3. Masks, clean subset: mode `a` (multi-subpath nonzero union), sequential `i` clips, single
   `inv` via even-odd + canvas rect; animated mask paths = `path` tracks targeting `clipPath`
   (free from Stage 0). Reject `s`/`f`/`n` modes (navidad has them), opacity < 100, expansion ≠ 0.
4. Acceptance: **bodymovin.json** imports (2 shape-trim warnings under `--allow-degraded`);
   **adrock**/**happy2016** import degraded (intersect merge-paths warned and skipped).

### Stage 3 — mattes + time remap (large)
1. Alpha/inverted-alpha mattes (tt:1/2): widen `BlendMode` with `destination-in`/`destination-out`
   (`displayList.ts:30-36`; raster2d pipes blend straight to `globalCompositeOperation`,
   `raster2d.ts:278`), a `MatteGroup` orchestrating matte source as a nested pushGroup and
   suppressing it from normal paint (legacy `td:1`), slotted into the `requiresGroup` seam
   (`node.ts:166-183`). Luma mattes (tt:3/4) stay rejected (no luminance→alpha FilterSpec).
2. Animated `tm`: `ChildEntry.timeWarp?: Key<number>[]` (parent seconds → child seconds,
   mutually exclusive with `timeScale`), baked at flatten time by resampling child tracks
   through the warp (the `bake()` pattern) — a bezier warp composed with bezier eases is not
   representable as a Key list, so baking is correct, and loops/freezes/reverses/negative-`sr`
   fall out for free. Lottie `tm` values are already seconds.
3. Mask opacity < 100 and subtract mode reuse the matte-compositing path (grayscale layer +
   destination-in) rather than clip.
4. Acceptance: **navidad.json** (23 precomps, 169 animated masks, 10 alpha/inverted mattes,
   6 animated tm) renders correctly modulo its 50 expressions (warned). Perf note: pushGroup
   layers are full-canvas offscreens (`raster2d.ts:254`) — navidad-scale comps will stress the
   layer pool; bounds-aware layers are a follow-up.

### Later / never
- Flubber-style topology normalization for native `.to()` path morphs (separate card; needs a
  memoized normalization seam the registry lacks).
- First-class `anchor` Vec2Signal on Node + skew terms in `fromTRS` (collapses the sandwich,
  halves imported node counts; unlocks `sk`/`sa`).
- `rgbLinear` color ValueType for tween-exact imported color tracks (see §4).
- Trim paths / repeaters / round corners; gradients; text layers; expressions (never — charter).

---

## 4. Fidelity caveats (what will never round-trip)

1. **Color tweens**: glissade lerps color in OKLab; Lottie lerps linear per-channel RGB.
   Endpoints match, mid-tween differs visibly on saturated pairs. Fix available (register
   `rgbLinear` used only by imported tracks) but not in the MVP — accept and document.
2. **Spatial position curves are baked**, not kept as curves: dense keys within tolerance.
   Re-exporting or hand-editing baked tracks is noisy; an editor sees many keys, not a curve.
3. **Structure is synthesized, not mirrored**: anchor sandwiches (2× nodes per layer), ip/op
   opacity wrappers, painter-model denormalization (duplicated path tracks per style), and
   parent/opacity sibling splits mean the glissade scene's shape ≠ the Lottie layer list. A
   future "layer bounds" concept in the studio won't see ip/op as such.
4. **Expressions are stripped** (warn). Files whose motion lives in expressions
   (docs_bezier_expression) import as static or wrong.
5. **Merge paths intersect/subtract/exclude** (adrock ×38, happy2016 ×10): skipped under
   `--allow-degraded`, visibly wrong — no path booleans planned.
6. **Mask expansion `x` ≠ 0**: no raster morphology primitive in either backend — warn, treat
   as 0. Mask modes lighten/darken: no compositing analog short of per-mask matte layers.
7. **Luma mattes**: rejected until a color-matrix/luma FilterSpec exists.
8. **Skew**: rejected (unrepresentable in `fromTRS`).
9. **Opacity overshoot** mid-ease is clamped at draw time (Lottie clamps too, but the clamp
   lives in our backends, not the document — a re-export would carry the overshoot).
10. **Time-warped children are baked dense** — same re-export noise as (2).

## 5. Sample coverage by stage

| Sample | Blocking features | MVP (S1) | S2 | S3 |
| --- | --- | :-: | :-: | :-: |
| gatin | none | **full** | full | full |
| docs_image_animated | none | **full** | full | full |
| bodymovin | precomps, masks, trim ×2, mm:1 | reject | **~full** (trim warned) | ~full |
| adrock | mask, precomp, mm:4 ×38 | reject | degraded | degraded |
| happy2016 | masks, mm:1+4, animated tm | reject | degraded | **degraded** (mm:4 only) |
| navidad | precomps, mattes, masks (s/f/n too), tm ×6, expr ×50 | reject | reject | **~full** (expr warned) |
| docs_text | text layer | reject | reject | reject |
| docs_bezier_expression | expression-driven | reject | reject | reject |

**MVP cut: 2/8 files (25%) import at full fidelity.** With Stage 2: 3/8 at ~full fidelity +
2 degraded (5/8 produce output). With Stage 3: **4/8 at ~full fidelity, 6/8 produce output**;
the remaining 2 are rejected on charter grounds (expressions) or scope grounds (text layers).
Weighted by keyframes, Stage 3 covers ~95% of the corpus's ~11.7k keys. The honest headline:
real-world Lottie leans hard on precomps, masks, and shape modifiers — the MVP proves the
mapping and the path type, but Stages 2–3 are where the corpus actually unlocks.
