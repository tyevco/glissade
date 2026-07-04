/**
 * @glissade/lottie EXPORT (Track → Lottie): a SceneModule → a `LottieDocument`,
 * the shipped importer (`convert.ts`) read backwards. Every mapping here is the
 * exact inverse of an import step, so a mappable scene round-trips through
 * `importLottie` faithfully (see test/roundtrip.test.ts).
 *
 * INPUT is the SceneModule (`{ createScene, timeline }`), NOT a flattened
 * DisplayList: Lottie is an ANIMATED, HIERARCHICAL format, so the node TREE +
 * the Timeline are the correct source. The walk emits one Lottie layer per node
 * (Group → a null/ty:3 transform parent; Rect/Circle/Path → a ty:4 shape layer),
 * parents children via `ind`/`parent`, and turns each `<id>/<prop>` track into an
 * animated Lottie channel (no track → a static `{a:0,k}` sampled at t=0).
 *
 * EASE FIDELITY: cubicBezier + hold + linear eases invert EXACTLY (emitKeyframes).
 * Named eases, springs, and expr formulas can't be one Lottie bezier — those are
 * baked to dense linear keys by sampling on the frame grid (sampleFallback), the
 * same discipline the importer uses for misaligned parametric geometry.
 *
 * SCOPE (MVP — mirror the importer's audit discipline: warn + drop, never
 * silent). IN: Group hierarchy, Rect/Circle/Path with a SOLID fill or a
 * LINEAR/RADIAL gradient `fill: paint` (→ Lottie `gf`; +optional stroke),
 * transform channels (position / position.x/.y split, opacity, scale,
 * rotation → identity degrees), animated `fill` color OR animated `fill: paint`
 * gradient (keyed g/s/e when directly invertible, else sampled), animated `d` path
 * (constant topology), and TEXT (ty:5): a Text node → a text layer with a font
 * reference (fonts.list) + a text-document keyframe stream (static = one doc;
 * animated text/fill/fontSize → doc keyframes sampled on the frame grid, held).
 *
 * GROUP OPACITY (baked into descendants): Lottie null-parent parenting inherits
 * the transform MATRIX only, never opacity, so a `Group{opacity<1}` (or an
 * animated `opacity` track) is composited by MULTIPLYING its opacity into every
 * LEAF descendant's `ks.o` (static → a product; animated → the product sampled on
 * the frame grid + decimated, the sampleComponentVec discipline) while the group
 * null keeps its p/r/s and carries `o:{a:0,k:100}`. This is EXACT when a group's
 * translucent descendants DON'T overlap (or the group is near-0/near-1 — the
 * reported leak-through case: a group fading to ~0 hides its children since
 * 0×anything≈0). LIMIT (warned, never silent): OVERLAPPING translucent siblings
 * double-composite — glissade composites the subtree as a unit then applies the
 * group alpha once, whereas per-child baking stacks the alphas (0.5 over 0.5 ≈
 * 0.75, not the correct single 0.5). Same limitation the importer documents at
 * convert.ts:470-475. A correct-for-overlap precomp (ty:0 + assets) is a later phase.
 *
 * OUT (warned + dropped): Image/Video, MESH paint (`gf` covers linear/radial only —
 * mesh has no Lottie ramp), gradient STROKE (`gs` — Path.stroke is a color string,
 * not a Paint), non-center anchors, text typewriter `reveal`/`revealFraction`, variable-font axes
 * (`fontAxes`/`fontVariationSettings` — no Lottie doc field), `box` valign
 * (baseline-approximated) and wrap `width` (the player self-reflows), TokenHighlight.
 * Animated primitive geometry (width/radius tracks) is SAMPLED, not channel-mapped.
 */

import {
  compileTimeline,
  parseColor,
  sampleTrack,
  type ColorStop,
  type Key,
  type MeshPaint,
  type Paint,
  type PathContour,
  type PathValue,
  type Timeline,
  type Track,
  type Vec2,
} from '@glissade/core';
import { breakLines, Circle, Group, meshRasterSize, Node, Path, rasterizeMesh, Rect, Text, type FontSpec, type Mat2x3, type SceneModule, type TextMeasurer } from '@glissade/scene';
// 0.55 Camera rig: the pose (zoom/center/roll) lives in a custom draw transform,
// not the node's p/s/r signals — so the exporter must be camera-aware and sample
// the per-layer inverse pose into the Lottie null-parent hierarchy (else the whole
// camera move vanishes silently on export). `cameraLayerMatrix` is the SAME pure
// pose math Camera.draw uses, so export and render agree by construction.
import { Camera, cameraLayerMatrix, shakenSpec } from '@glissade/scene/motion';
// 0.58 render↔export parity: the render path honors `interpolation: 'smooth'|'gaussian'`
// on a gradient Paint via the pure oklab stop densifier (scene raster2d), but the Lottie
// `gf` ramp used to flatten it to a hard linear ramp. Reuse the SAME densifier here so the
// exported ramp matches the on-screen bloom (a 64-stop piecewise-linear oklab approximation).
import { densifyStops, GRADIENT_RAMP_STEPS } from '@glissade/scene/gradient';
import { ellipseContour, rectContour } from './pathvalue.js';
import { contourToShData, pathValueToShData } from './emitGeometry.js';
import { emitKeys, isDirectlyInvertible, toFrames } from './emitKeyframes.js';
import { anchorSampledSpan, decimateLinearKeys, sampleToLottieKeys } from './sampleFallback.js';
import type {
  LottieAsset,
  LottieDocument,
  LottieFont,
  LottieGradient,
  LottieKeyframe,
  LottieLayer,
  LottieProp,
  LottieShapeItem,
  LottieSplitPosition,
  LottieTextData,
  LottieTextDocKeyframe,
  LottieTextDocument,
  LottieTransform,
} from './types.js';

export interface ExportOptions {
  width: number;
  height: number;
  /** Frame rate; default the timeline's fps, else 60 (the golden FPS). */
  fps?: number;
  /** Sink for scope-out / degrade warnings; default `console.warn`. */
  onWarn?: (message: string) => void;
  /**
   * Real text measurer (a backend's — e.g. the Skia measurer). When present, a
   * width-wrapped Text node has its wrapped lines BAKED into the Lottie text
   * document `t` (joined by '\n') so the round-trip reproduces glissade's line
   * breaks — the importer copies `t` verbatim and drops the wrap `width`, so
   * without the bake wrapped text collapses onto one line. Absent, the raw
   * string passes through unchanged (the estimating measurer's wrap points
   * wouldn't match a faithful render, so we don't bake with it).
   */
  measurer?: TextMeasurer;
  /**
   * PNG encoder threaded from the CLI (like `measurer`) so a MESH fill can be
   * rasterized (the pure `rasterizeMesh` kernel) and embedded as a ty:2 image
   * layer — Lottie has no mesh primitive. `@glissade/lottie` stays DOM/Node-free,
   * so it can't encode PNG itself. Returns BASE64 (no `data:` prefix; the exporter
   * prepends `data:image/png;base64,`). ABSENT (pure-JS callers/tests) → a mesh
   * fill keeps the historical warn-drop, so non-CLI exports are unchanged.
   */
  encodePng?: (rgba: Uint8ClampedArray, w: number, h: number) => string;
}

interface Ctx {
  fr: number;
  ip: number;
  op: number;
  /** Document viewport (opts.width/height) — the Camera pose samples against it. */
  w: number;
  h: number;
  warn: (m: string) => void;
  layers: LottieLayer[];
  ind: number;
  /** Font references de-duped by fName across every Text node (pure/deterministic). */
  fonts: Map<string, LottieFont>;
  /** Real measurer for baking width-wrapped Text into the doc `t`; undefined = raw passthrough. */
  measurer: TextMeasurer | undefined;
  /** PNG encoder for the mesh raster fallback; undefined = mesh fills warn-drop (as before). */
  encodePng: ((rgba: Uint8ClampedArray, w: number, h: number) => string) | undefined;
  /**
   * Image assets accumulated by the walk (mesh rasters). Attached to the document
   * ONLY when non-empty — like `fonts`, so a non-mesh export stays byte-identical.
   */
  assets: LottieAsset[];
}

type NodeTracks = ReadonlyMap<string, Track>;
const EMPTY_TRACKS: NodeTracks = new Map();

type ShapeNode = Rect | Circle | Path;

/**
 * Accumulated ancestor-group opacity threaded down the walk so a leaf can bake
 * `leaf_opacity × Π(ancestor group opacity)` into its `ks.o`. `factor` is the
 * static product of ancestor groups WITHOUT an opacity track; `tracks` are the
 * ancestor opacity TRACKS (sampled per-frame when anything is animated). The
 * root walk starts from identity so an opacity-1 / track-free scene is
 * byte-identical to before this feature.
 */
interface OpacityAccum {
  factor: number;
  tracks: readonly Track<number>[];
}
const IDENTITY_OPACITY: OpacityAccum = { factor: 1, tracks: [] };

/** Convert a SceneModule to a Lottie document. Pure over (scene, timeline). */
export function exportLottie(mod: SceneModule, opts: ExportOptions): LottieDocument {
  const scene = mod.createScene();
  // Inject the real measurer so any node-level geometry pull (and the width-wrap
  // bake below) measures with the rasterizer that will draw — else the internal
  // scene falls back to the estimating measurer (§3.6).
  if (opts.measurer) scene.setTextMeasurer(opts.measurer);
  const fr = opts.fps ?? mod.timeline.fps ?? 60;
  const warn = opts.onWarn ?? ((m: string) => console.warn(`gs export: ${m}`));

  // COALESCE same-target tracks the SAME way the runtime does before grouping:
  // `compileTimeline` merges multiple `track()` calls on one `<id>/<prop>` into a
  // single effective Track (later insertion wins on overlap — timeline.ts coalesce,
  // the exact rule evaluate() uses). Iterating the RAW `mod.timeline.tracks` here
  // would last-write-WIN via `m.set(prop, …)`, silently dropping every track but
  // the last on a channel (e.g. a fade-IN track lost to a fade-OUT track on the
  // same opacity), so the export diverged from the rendered scene. One track per
  // target now, so `m.set` can never drop a channel.
  const compiled = compileTimeline(mod.timeline);

  // Group tracks by their resolved node id — the LONGEST registered-node-id
  // prefix owns the target (both node ids like `card/3` and prop paths like
  // `money/fill` carry slashes), mirroring scene.resolveTarget.
  const byNode = new Map<string, Map<string, Track>>();
  for (const tr of compiled.tracks.values()) {
    const resolved = resolveTrackNode(scene.nodes, tr.target);
    if (resolved === undefined) {
      warn(`track '${tr.target}' targets no node in the scene — dropped`);
      continue;
    }
    const [nodeId, prop] = resolved;
    let m = byNode.get(nodeId);
    if (m === undefined) {
      m = new Map();
      byNode.set(nodeId, m);
    }
    m.set(prop, tr);
  }

  const op = computeOp(mod.timeline, fr);
  const ctx: Ctx = { fr, ip: 0, op, w: opts.width, h: opts.height, warn, layers: [], ind: 0, fonts: new Map(), measurer: opts.measurer, encodePng: opts.encodePng, assets: [] };
  walkChildren(ctx, scene.root.children, undefined, byNode, IDENTITY_OPACITY);

  // fonts.list is built by the walk (insertion order = deterministic first-seen)
  // and attached only when a Text node referenced a font — a text-free export is
  // byte-identical to before this feature.
  const fonts = [...ctx.fonts.values()];
  return {
    v: BODYMOVIN_VERSION,
    fr,
    ip: 0,
    op,
    w: opts.width,
    h: opts.height,
    nm: 'glissade export',
    layers: ctx.layers,
    // Mesh rasters accumulate into ctx.assets during the walk; attached only when
    // non-empty (mirroring the fonts conditional) so a non-mesh export is byte-identical.
    ...(ctx.assets.length > 0 ? { assets: ctx.assets } : {}),
    ...(fonts.length > 0 ? { fonts: { list: fonts } } : {}),
  };
}

/**
 * bodymovin schema version stamped on every export. Strict lottie-web / dotLottie
 * validators reject a document without a top-level `v`; 5.7.x is a widely-supported
 * modern version and the shape this exporter emits is a subset of it.
 */
const BODYMOVIN_VERSION = '5.7.0';

/** Resolve a track target to `[nodeId, propPath]` by the longest registered-id prefix. */
function resolveTrackNode(nodes: ReadonlyMap<string, Node>, target: string): [string, string] | undefined {
  for (let slash = target.lastIndexOf('/'); slash > 0; slash = target.lastIndexOf('/', slash - 1)) {
    const id = target.slice(0, slash);
    if (nodes.has(id)) return [id, target.slice(slash + 1)];
  }
  return undefined;
}

/** Document out-point: the timeline duration, else the max key time (≥ 1 frame). */
function computeOp(tl: Timeline, fr: number): number {
  if (tl.duration !== undefined) return Math.max(1, Math.round(tl.duration * fr));
  let maxT = 0;
  for (const tr of tl.tracks) {
    const last = tr.keys[tr.keys.length - 1];
    if (last) maxT = Math.max(maxT, last.t);
  }
  return Math.max(1, Math.round(maxT * fr));
}

/**
 * Emit a sibling list in REVERSE array order so the array-LAST (top-painted)
 * node gets the SMALLER `ind` — the importer reconstructs paint order from
 * `zIndex = -ind`, so a descending ind per sibling group preserves it.
 */
function walkChildren(
  ctx: Ctx,
  children: readonly Node[],
  parentInd: number | undefined,
  byNode: Map<string, Map<string, Track>>,
  opacity: OpacityAccum,
): void {
  for (let i = children.length - 1; i >= 0; i--) {
    const node = children[i]!;
    // 0.55 standalone shake(): a render-only jitter (wraps emit, not a track) — warn
    // ONCE per shaken node, never a silent drop (matches the camera-shake warn).
    if (shakenSpec(node) !== undefined) {
      ctx.warn(
        `${describe(node)}: shake() jitter is render-only — NOT exported to Lottie (it is a closed-form jitter, not a keyframe track)`,
      );
    }
    const kind = classify(node);
    if (kind === 'drop') {
      ctx.warn(`${describe(node)} is not exportable (MVP: Group / Rect / Circle / Path / Text) — dropped`);
      continue;
    }
    const myInd = ++ctx.ind;
    const tracks = (node.id !== undefined ? byNode.get(node.id) : undefined) ?? EMPTY_TRACKS;
    // 0.55 Camera: a Group whose POSE (zoom/center/roll) rides a custom draw
    // transform, not p/s/r — so emit the camera's OWN transform on this null, then
    // a depth-adjusted pose sub-null per layer with the layer's content parented to
    // it (parallax). Skip the generic Group recurse (buildCameraLayers walks it).
    if (node instanceof Camera) {
      ctx.layers.push(buildNullLayer(ctx, node, myInd, parentInd, tracks));
      buildCameraLayers(ctx, node, myInd, byNode, childOpacity(node, tracks, opacity));
      continue;
    }
    ctx.layers.push(
      kind === 'group'
        ? buildNullLayer(ctx, node, myInd, parentInd, tracks)
        : kind === 'text'
          ? buildTextLayer(ctx, node as Text, myInd, parentInd, tracks, opacity)
          : buildShapeLayer(ctx, node as ShapeNode, kind, myInd, parentInd, tracks, opacity),
    );
    if (node instanceof Group) walkChildren(ctx, node.children, myInd, byNode, childOpacity(node, tracks, opacity));
  }
}

/**
 * The opacity accumulator for a group's children: a group WITH an opacity track
 * contributes that track (sampled per-frame); one WITHOUT multiplies its static
 * opacity into `factor`. The group's own opacity is thus pushed down onto its
 * descendants (the null layer itself carries `o:100`).
 */
function childOpacity(group: Group, tracks: NodeTracks, parent: OpacityAccum): OpacityAccum {
  const track = tracks.get('opacity') as Track<number> | undefined;
  if (track) return { factor: parent.factor, tracks: [...parent.tracks, track] };
  return { factor: parent.factor * group.opacity(), tracks: parent.tracks };
}

/** Count exportable LEAF (non-group, non-drop) descendants — the overlap-warn heuristic. */
function countLeafDescendants(group: Group): number {
  let n = 0;
  for (const child of group.children) {
    if (child instanceof Group) n += countLeafDescendants(child);
    else if (classify(child) !== 'drop') n += 1;
  }
  return n;
}

function classify(node: Node): 'group' | 'rect' | 'circle' | 'path' | 'text' | 'drop' {
  if (node instanceof Rect) return 'rect';
  if (node instanceof Circle) return 'circle';
  if (node instanceof Path) return 'path';
  if (node instanceof Text) return 'text';
  if (node instanceof Group) return 'group';
  return 'drop';
}

const describe = (node: Node): string => `${node.describeType}${node.id !== undefined ? ` '${node.id}'` : ''}`;

// --- transforms ---

/**
 * The Lottie anchor point (`ks.a`) honoring a node's explicit anchor. Lottie draws
 * a layer at `(content − a) + p`; glissade's on-screen box top-left is `P − (ax·w,
 * ay·h)`, so emitting `a = drawOffset + anchor·size` (= −anchorShift, node.ts) makes
 * the two agree AND makes the anchor the rotation/scale pivot, exactly as the scene.
 *
 * NO-OP for every currently-correct export: an unset/legacy anchor → [0,0]; a group
 * (no intrinsic box) → [0,0]; a CENTER anchor → drawOffset + 0.5·size = [0,0]. So
 * `ks.a` moves off the origin ONLY for an explicitly non-center-anchored SIZED node.
 * `drawOffset`/`intrinsicSize` are used (not a raw −w/2) so Text baseline / Path
 * author-bounds origins stay correct. The measurer is resolved as anchorShift does
 * (ctx's, else the node's injected source); absent it, the safe no-op [0,0].
 */
function anchorPoint(ctx: Ctx, node: Node): [number, number] {
  if (!node.hasAnchor) return [0, 0];
  const m = ctx.measurer ?? node.measurerSource?.();
  if (!m) return [0, 0];
  const size = node.intrinsicSize(m);
  if (!size) return [0, 0]; // groups / boxless nodes stay at the origin
  const d = node.drawOffset(m);
  const [ax, ay] = node.anchor;
  return [d.x + ax * size.w, d.y + ay * size.h];
}

function buildTransform(ctx: Ctx, node: Node, tracks: NodeTracks, o: LottieProp): LottieTransform {
  return {
    a: { a: 0, k: anchorPoint(ctx, node) }, // honors an explicit anchor; [0,0] for center/legacy/groups
    p: positionProp(ctx, tracks, node.position()),
    s: vecProp(ctx, tracks, 'scale', node.scale(), (v) => [v[0] * 100, v[1] * 100]),
    r: scalarProp(ctx, tracks, 'rotation', node.rotation(), (v) => v), // rotation is degrees both sides (identity)
    o, // opacity is baked by the caller (leaf: leaf×ancestors; group null: forced 100)
  };
}

/**
 * A leaf's `ks.o`, folding in the group opacity accumulated from its ancestors.
 * With NO ancestor contribution (identity accumulator) this is byte-identical to
 * the pre-feature `scalarProp` path — the exact cubicBezier/hold inversion is
 * preserved. A static-only accumulator multiplies into a single `{a:0,k}`.
 * Anything animated (a leaf `opacity` track and/or an ancestor track) samples
 * the product `leaf_opacity(t) × Π ancestor_opacity(t)` on the union frame span
 * and decimates — the identical discipline sampleComponentVec uses.
 */
function combineOpacity(ctx: Ctx, node: Node, tracks: NodeTracks, accum: OpacityAccum): LottieProp {
  const leafTrack = tracks.get('opacity') as Track<number> | undefined;
  const leafStatic = node.opacity();
  // No ancestor opacity → identical to the pre-feature path (exact ease inversion).
  if (accum.factor === 1 && accum.tracks.length === 0) {
    return scalarProp(ctx, tracks, 'opacity', leafStatic, (v) => v * 100);
  }
  // Static leaf under a static-only accumulator → a single multiplied key.
  if (leafTrack === undefined && accum.tracks.length === 0) {
    return { a: 0, k: leafStatic * accum.factor * 100 };
  }
  // Animated: sample the opacity product on the union frame grid, then decimate.
  // The sampled span starts at the earliest involved key — so a group fade-in
  // whose first key sits AFTER ip has a leading dormant window that isn't sampled;
  // anchorSampledSpan pins the true base there so a fading-in element stays HIDDEN
  // (o=0) before the fade instead of ghosting at its first sample (held backward).
  const span = leafTrack ? [leafTrack, ...accum.tracks] : [...accum.tracks];
  const [f0, f1] = frameSpan(ctx, span);
  const sampleAt = (frame: number): number[] => {
    const t = frame / ctx.fr;
    let product = (leafTrack ? sampleTrack(leafTrack, t) : leafStatic) * accum.factor;
    for (const at of accum.tracks) product *= sampleTrack(at, t);
    return [product * 100];
  };
  const out: LottieKeyframe[] = [];
  for (let f = f0; f <= f1; f++) {
    const frame: LottieKeyframe = { t: f, s: sampleAt(f) };
    if (f < f1) {
      frame.o = { x: 0, y: 0 };
      frame.i = { x: 1, y: 1 };
    }
    out.push(frame);
  }
  return { a: 1, k: anchorSampledSpan(decimateLinearKeys(out), f0, f1, ctx.ip, ctx.op, sampleAt) };
}

function scalarProp(ctx: Ctx, tracks: NodeTracks, prop: string, staticVal: number, map: (v: number) => number): LottieProp {
  const tr = tracks.get(prop) as Track<number> | undefined;
  if (tr) return { a: 1, k: scalarKeys(ctx, tr, map) };
  return { a: 0, k: map(staticVal) };
}

function scalarKeys(ctx: Ctx, tr: Track<number>, map: (v: number) => number): LottieKeyframe[] {
  const toS = (v: number): number[] => [map(v)];
  return isDirectlyInvertible(tr.keys, tr.expr)
    ? emitKeys(tr.keys, ctx.fr, toS)
    : sampleToLottieKeys(tr, ctx.fr, ctx.ip, ctx.op, toS);
}

function vecProp(ctx: Ctx, tracks: NodeTracks, prop: string, staticVal: Vec2, map: (v: Vec2) => [number, number]): LottieProp {
  const whole = tracks.get(prop) as Track<Vec2> | undefined;
  if (whole) {
    const keys = isDirectlyInvertible(whole.keys, whole.expr)
      ? emitKeys(whole.keys, ctx.fr, map)
      : sampleToLottieKeys(whole, ctx.fr, ctx.ip, ctx.op, map);
    return { a: 1, k: keys };
  }
  const xt = tracks.get(`${prop}.x`) as Track<number> | undefined;
  const yt = tracks.get(`${prop}.y`) as Track<number> | undefined;
  if (xt || yt) {
    // Lottie scale has no split form; sample the combined components densely.
    ctx.warn(`per-axis '${prop}' animation is sampled at ${ctx.fr} fps into a combined channel`);
    return { a: 1, k: sampleComponentVec(ctx, xt, yt, staticVal, map) };
  }
  return { a: 0, k: map(staticVal) };
}

/** Position supports Lottie's native split form (`{s:true,x,y}`) for exactness. */
function positionProp(ctx: Ctx, tracks: NodeTracks, staticPos: Vec2): LottieProp | LottieSplitPosition {
  const whole = tracks.get('position') as Track<Vec2> | undefined;
  if (whole) {
    const toS = (v: Vec2): number[] => [v[0], v[1]];
    const keys = isDirectlyInvertible(whole.keys, whole.expr)
      ? emitKeys(whole.keys, ctx.fr, toS)
      : sampleToLottieKeys(whole, ctx.fr, ctx.ip, ctx.op, toS);
    return { a: 1, k: keys };
  }
  const xt = tracks.get('position.x') as Track<number> | undefined;
  const yt = tracks.get('position.y') as Track<number> | undefined;
  if (xt || yt) {
    return {
      s: true,
      x: xt ? { a: 1, k: scalarKeys(ctx, xt, (v) => v) } : { a: 0, k: staticPos[0] },
      y: yt ? { a: 1, k: scalarKeys(ctx, yt, (v) => v) } : { a: 0, k: staticPos[1] },
    };
  }
  return { a: 0, k: [staticPos[0], staticPos[1]] };
}

function sampleComponentVec(
  ctx: Ctx,
  xt: Track<number> | undefined,
  yt: Track<number> | undefined,
  staticVal: Vec2,
  map: (v: Vec2) => [number, number],
): LottieKeyframe[] {
  const [f0, f1] = frameSpan(ctx, [xt, yt]);
  const sampleAt = (frame: number): number[] => {
    const t = frame / ctx.fr;
    const x = xt ? sampleTrack(xt, t) : staticVal[0];
    const y = yt ? sampleTrack(yt, t) : staticVal[1];
    return map([x, y]);
  };
  const out: LottieKeyframe[] = [];
  for (let f = f0; f <= f1; f++) {
    const frame: LottieKeyframe = { t: f, s: sampleAt(f) };
    if (f < f1) {
      frame.o = { x: 0, y: 0 };
      frame.i = { x: 1, y: 1 };
    }
    out.push(frame);
  }
  // This combined per-axis fallback is dense-sampled just like sampleToLottieKeys,
  // so it MUST decimate too — otherwise a per-axis `scale` animation (Lottie has
  // no split-scale form) keeps one key per frame on a channel linear playback
  // could reproduce from a handful (the dominant real-episode bloat: 12 scale
  // channels × 11.5k keys). Flat numeric payloads, so RDP applies. Anchor the
  // boundaries too (same discipline) so a per-axis channel starting mid-timeline
  // holds its base value across the uncovered run instead of holding the first
  // sample backward.
  return anchorSampledSpan(decimateLinearKeys(out), f0, f1, ctx.ip, ctx.op, sampleAt);
}

/** Union frame span of a set of tracks (their first→last key), else [ip, op]. */
function frameSpan(ctx: Ctx, tracks: (Track | undefined)[]): [number, number] {
  const bounds: number[] = [];
  for (const tr of tracks) {
    if (tr && tr.keys.length > 0) {
      bounds.push(toFrames(tr.keys[0]!.t, ctx.fr), toFrames(tr.keys[tr.keys.length - 1]!.t, ctx.fr));
    }
  }
  return bounds.length > 0 ? [Math.min(...bounds), Math.max(...bounds)] : [ctx.ip, ctx.op];
}

// --- layers ---

function buildNullLayer(ctx: Ctx, node: Node, ind: number, parentInd: number | undefined, tracks: NodeTracks): LottieLayer {
  // The group's opacity is baked into its leaf descendants (see combineOpacity /
  // childOpacity); the null layer keeps only p/r/s, so its own opacity is forced
  // to 100. The warn fires ONLY for the honest limit — a translucent group with
  // ≥2 leaf descendants that COULD overlap (baking then double-composites the
  // overlap). Exact (silent) for a single leaf or an opaque group.
  const translucent = node.opacity() !== 1 || tracks.has('opacity');
  if (translucent && node instanceof Group && countLeafDescendants(node) >= 2) {
    ctx.warn(
      `${describe(node)}: group opacity is baked into descendant leaves; OVERLAPPING translucent descendants may double-composite (exact when they don't overlap)`,
    );
  }
  return {
    ty: 3,
    nm: node.id ?? `group${ind}`,
    ind,
    ip: ctx.ip,
    op: ctx.op,
    ks: buildTransform(ctx, node, tracks, { a: 0, k: 100 }),
    ...(parentInd !== undefined ? { parent: parentInd } : {}),
  };
}

// --- camera (0.55) ---

/**
 * Decompose a per-layer inverse-camera-pose 2x3 into Lottie ks channels. The pose
 * is `T(screenCenter)·scale(zoom)·rotate(roll)·T(−effectiveCenter)` — an affine
 * with UNIFORM scale + rotation + translation, i.e. exactly `fromTRS(p, r, [s,s])`
 * — so it inverts to `p = [e,f]`, `s = |(a,b)|`, `r = atan2(b,a)` (the anchor stays
 * [0,0], the camera looks at the world, not a boxed node).
 */
function decomposePose(m: Mat2x3): { p: [number, number]; s: [number, number]; r: number } {
  const scale = Math.hypot(m[0], m[1]);
  const r = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  return { p: [m[4], m[5]], s: [scale * 100, scale * 100], r };
}

/** Static camera ks: one constant matrix → constant p/s/r (no keyframes). */
function buildStaticCameraKs(m: Mat2x3): LottieTransform {
  const d = decomposePose(m);
  return {
    a: { a: 0, k: [0, 0] },
    p: { a: 0, k: d.p },
    s: { a: 0, k: d.s },
    r: { a: 0, k: d.r },
    o: { a: 0, k: 100 },
  };
}

/** Dense-sample one decomposed channel across [f0,f1], then decimate + anchor —
 *  the identical discipline sampleComponentVec / combineOpacity use. */
function sampleChannel(ctx: Ctx, f0: number, f1: number, sampleAt: (frame: number) => number[]): LottieKeyframe[] {
  const out: LottieKeyframe[] = [];
  for (let f = f0; f <= f1; f++) {
    const frame: LottieKeyframe = { t: f, s: sampleAt(f) };
    if (f < f1) {
      frame.o = { x: 0, y: 0 };
      frame.i = { x: 1, y: 1 };
    }
    out.push(frame);
  }
  return anchorSampledSpan(decimateLinearKeys(out), f0, f1, ctx.ip, ctx.op, sampleAt);
}

/** Animated camera ks: sample the pose per-frame across the cam-track span and
 *  decompose into p / s / r keyframe channels (a static [0,0] anchor, o 100). */
function buildAnimatedCameraKs(
  ctx: Ctx,
  poseAt: (t: number) => Mat2x3,
  camTracks: (Track | undefined)[],
): LottieTransform {
  const [f0, f1] = frameSpan(ctx, camTracks);
  const at = (frame: number): { p: [number, number]; s: [number, number]; r: number } =>
    decomposePose(poseAt(frame / ctx.fr));
  return {
    a: { a: 0, k: [0, 0] },
    p: { a: 1, k: sampleChannel(ctx, f0, f1, (f) => at(f).p) },
    s: { a: 1, k: sampleChannel(ctx, f0, f1, (f) => at(f).s) },
    r: { a: 1, k: sampleChannel(ctx, f0, f1, (f) => [at(f).r]) },
    o: { a: 0, k: 100 },
  };
}

/**
 * Emit the Camera's depth layers as pose sub-nulls under the camera null. Each
 * layer gets its own `cameraLayerMatrix` (depth-scaled pan = parallax) sampled at
 * the export frame grid — STATIC (no cam/* tracks) → constant ks; ANIMATED → ks
 * keyframes. The layer's content parents to its sub-null, so the pose composes onto
 * every descendant exactly as Camera.draw applies it at render. A whole-frame shake
 * is render-only (a closed-form jitter, not a track) → an honest warn, never a
 * silent drop.
 */
function buildCameraLayers(
  ctx: Ctx,
  cam: Camera,
  camInd: number,
  byNode: Map<string, Map<string, Track>>,
  opacity: OpacityAccum,
): void {
  const camTracks = (cam.id !== undefined ? byNode.get(cam.id) : undefined) ?? EMPTY_TRACKS;
  const zoomTr = camTracks.get('zoom') as Track<number> | undefined;
  const rollTr = camTracks.get('roll') as Track<number> | undefined;
  const centerTr = camTracks.get('center') as Track<Vec2> | undefined;
  const centerXTr = camTracks.get('center.x') as Track<number> | undefined;
  const centerYTr = camTracks.get('center.y') as Track<number> | undefined;
  const poseTracks: (Track | undefined)[] = [zoomTr, rollTr, centerTr, centerXTr, centerYTr];
  const animated = poseTracks.some((t) => t !== undefined);
  const size = { w: ctx.w, h: ctx.h };

  if (cam.shakeSpec) {
    ctx.warn(
      `${describe(cam)}: whole-frame camera shake is render-only — NOT exported to Lottie (it is a closed-form jitter, not a keyframe track)`,
    );
  }

  const zoomAt = (t: number): number => (zoomTr ? sampleTrack(zoomTr, t) : cam.zoom());
  const rollAt = (t: number): number => (rollTr ? sampleTrack(rollTr, t) : cam.roll());
  const centerAt = (t: number): Vec2 => {
    const base = cam.center();
    let cx = base[0];
    let cy = base[1];
    if (centerTr) {
      const v = sampleTrack(centerTr, t);
      cx = v[0];
      cy = v[1];
    }
    if (centerXTr) cx = sampleTrack(centerXTr, t);
    if (centerYTr) cy = sampleTrack(centerYTr, t);
    return [cx, cy];
  };

  // Reverse array order so the array-LAST (foreground) layer gets the SMALLER ind
  // (top paint) — the same sibling discipline walkChildren uses.
  for (let i = cam.layers.length - 1; i >= 0; i--) {
    const layer = cam.layers[i]!;
    const subInd = ++ctx.ind;
    const poseAt = (t: number): Mat2x3 => cameraLayerMatrix(size, centerAt(t), zoomAt(t), rollAt(t), layer.depth);
    const ks = animated ? buildAnimatedCameraKs(ctx, poseAt, poseTracks) : buildStaticCameraKs(poseAt(0));
    ctx.layers.push({
      ty: 3,
      nm: `${cam.id ?? 'cam'}-layer${i}`,
      ind: subInd,
      ip: ctx.ip,
      op: ctx.op,
      ks,
      parent: camInd,
    });
    walkChildren(ctx, [layer.content], subInd, byNode, opacity);
  }
}

function buildShapeLayer(
  ctx: Ctx,
  node: ShapeNode,
  kind: 'rect' | 'circle' | 'path',
  ind: number,
  parentInd: number | undefined,
  tracks: NodeTracks,
  opacity: OpacityAccum,
): LottieLayer {
  const shapes: LottieShapeItem[] = [buildGeometry(ctx, node, kind, tracks)];
  // stroke BEFORE fill in the array so the importer paints stroke ON TOP —
  // matching Shape.draw (fill then stroke). See the importer's reverse-slot emit.
  const stroke = buildStroke(ctx, node, tracks);
  if (stroke) shapes.push(stroke);
  // `ind` is threaded so a MESH fill can emit a SIBLING ty:2 image layer parented
  // to THIS shape layer (a mesh has no `fl`/`gf` item — the raster replaces the fill).
  const fill = buildFill(ctx, node, tracks, ind);
  if (fill) shapes.push(fill);
  return {
    ty: 4,
    nm: node.id ?? `shape${ind}`,
    ind,
    ip: ctx.ip,
    op: ctx.op,
    ks: buildTransform(ctx, node, tracks, combineOpacity(ctx, node, tracks, opacity)),
    shapes,
    ...(parentInd !== undefined ? { parent: parentInd } : {}),
  };
}

// --- text ---

/** Human weight-class names (400 = Regular), the OTF/bodymovin `fStyle` convention. */
const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

/** `fStyle` from weight + italic — e.g. 700 + italic → 'Bold Italic', 400 → 'Regular'. */
function fontStyleName(weight: number, italic: boolean): string {
  const name = WEIGHT_NAMES[weight] ?? String(weight);
  if (name === 'Regular') return italic ? 'Italic' : 'Regular';
  return italic ? `${name} Italic` : name;
}

/**
 * Register (family, weight, style) once, returning the stable `fName` the text
 * document references. De-dupe is keyed on the derived fName, so two Text nodes
 * sharing a face share one `fonts.list` entry (pure + insertion-ordered). Fonts
 * are referenced by name only — never embedded; the player supplies the face
 * (the §3.6 registry papercut).
 */
function registerFont(ctx: Ctx, node: Text): string {
  const italic = node.fontStyle === 'italic';
  const fStyle = fontStyleName(node.fontWeight, italic);
  const fName = `${node.fontFamily}-${fStyle.replace(/ /g, '')}`;
  if (!ctx.fonts.has(fName)) {
    ctx.fonts.set(fName, { fName, fFamily: node.fontFamily, fStyle, fWeight: String(node.fontWeight) });
  }
  return fName;
}

/** Justification: glissade align → the Lottie/bodymovin `j` (0 left, 1 right, 2 center). */
function alignToJustification(align: 'left' | 'center' | 'right'): number {
  return align === 'left' ? 0 : align === 'right' ? 1 : 2;
}

/**
 * The FontSpec at `t` for the wrap measurement, mirroring `Text.fontSpec()` but
 * with the SAMPLED size so animated `fontSize` re-wraps per frame. Weight, style,
 * static variable-font axes, and letter-spacing all feed `measureText` (they move
 * wrap points), so they must be present to match the reference render's breaks.
 */
function wrapFontSpec(node: Text, size: number): FontSpec {
  return {
    family: node.fontFamily,
    size,
    weight: node.fontWeight,
    ...(node.fontStyle === 'italic' ? { style: 'italic' as const } : {}),
    ...(node.fontVariationSettings !== undefined ? { fontVariationSettings: node.fontVariationSettings } : {}),
    ...(node.letterSpacing !== undefined ? { letterSpacing: node.letterSpacing } : {}),
  };
}

/** The text document at time `t`, sampling the animatable text/fill/fontSize props. */
function textDocAt(ctx: Ctx, node: Text, fName: string, tracks: NodeTracks, t: number): LottieTextDocument {
  const rawText = sampleStr(tracks, 'text', node.text(), t);
  const fill = sampleColor(tracks, 'fill', node.fill(), t);
  const size = sampleNum(tracks, 'fontSize', node.fontSize(), t);
  // WIDTH-WRAP BAKE: the importer copies `t` verbatim and drops the wrap `width`,
  // so a width-wrapped Text would round-trip collapsed onto one line. With a real
  // measurer, materialize glissade's own line breaks into `t` (join '\n' — the
  // same path explicit-'\n' text round-trips through, re-split by breakLines on
  // import). Sample-time bake so ANIMATED text/fontSize/width re-wrap per frame.
  // Gated on `width > 0` AND a measurer, so non-wrapped Text and the no-measurer
  // path stay byte-identical to the pre-feature raw passthrough.
  const width = sampleNum(tracks, 'width', node.width(), t);
  const text =
    width > 0 && ctx.measurer !== undefined
      ? breakLines(rawText, wrapFontSpec(node, size), width, ctx.measurer).join('\n')
      : rawText;
  const doc: LottieTextDocument = {
    t: text,
    f: fName,
    s: size,
    fc: colorToLottie(fill),
    j: alignToJustification(node.align),
    // omit `tr`/`lh` at their glissade defaults so a default Text emits a minimal,
    // deterministic document (mirrors fontSpec()'s byte-identity omissions).
    ...(node.letterSpacing !== undefined ? { tr: node.letterSpacing } : {}),
    ...(node.lineHeight !== 1.25 ? { lh: size * node.lineHeight } : {}),
  };
  return doc;
}

const sampleStr = (tracks: NodeTracks, prop: string, staticVal: string, t: number): string => {
  const tr = tracks.get(prop) as Track<string> | undefined;
  return tr ? sampleTrack(tr, t) : staticVal;
};
const sampleNum = (tracks: NodeTracks, prop: string, staticVal: number, t: number): number => {
  const tr = tracks.get(prop) as Track<number> | undefined;
  return tr ? sampleTrack(tr, t) : staticVal;
};
const sampleColor = (tracks: NodeTracks, prop: string, staticVal: string, t: number): string => {
  const tr = tracks.get(prop) as Track<string> | undefined;
  return tr && tr.type === 'color' ? sampleTrack(tr, t) : staticVal;
};

/**
 * The text-document keyframe stream. STATIC (no text/fill/fontSize track) = one
 * document at t=0. ANIMATED = one document per frame across the animated span,
 * SAMPLED and held (a Lottie text document switches discretely — smooth fill/size
 * animation degrades to a per-frame step, the honest MVP limit). Consecutive
 * identical documents collapse to their first frame so a constant prop stays lean.
 */
function buildTextDocKeyframes(ctx: Ctx, node: Text, fName: string, tracks: NodeTracks): LottieTextDocKeyframe[] {
  const docProps = ['text', 'fill', 'fontSize'];
  // An animated wrap `width` re-wraps the baked `t` per frame, so it also drives
  // the per-frame stream — but ONLY when a measurer is baking (else the raw docs
  // are identical every frame and the static path stays byte-identical).
  const wrapAnimated = ctx.measurer !== undefined && tracks.has('width');
  const streamProps = wrapAnimated ? [...docProps, 'width'] : docProps;
  if (!streamProps.some((p) => tracks.has(p))) {
    return [{ t: ctx.ip, s: textDocAt(ctx, node, fName, tracks, ctx.ip / ctx.fr) }];
  }
  // Warn about the stepped-document degrade only for smooth props (text/fill/
  // fontSize); a width-only rewrap is EXACT per frame, so it needs no warning.
  if (docProps.some((p) => tracks.has(p))) {
    ctx.warn(`${describe(node)}: animated text/fill/fontSize is sampled at ${ctx.fr} fps into stepped text documents (not smoothly interpolated)`);
  }
  const [f0, f1] = frameSpan(ctx, streamProps.map((p) => tracks.get(p)));
  const keys: LottieTextDocKeyframe[] = [];
  let prev: string | undefined;
  for (let f = f0; f <= f1; f++) {
    const s = textDocAt(ctx, node, fName, tracks, f / ctx.fr);
    const sig = JSON.stringify(s);
    if (sig === prev) continue; // hold: a document persists until it changes
    keys.push({ t: f, s });
    prev = sig;
  }
  return keys;
}

/** Warn (never silent) on the text features this MVP cannot represent, then drop them. */
function warnTextUnsupported(ctx: Ctx, node: Text, tracks: NodeTracks): void {
  if (tracks.has('reveal') || Number.isFinite(node.reveal())) {
    ctx.warn(`${describe(node)}: typewriter 'reveal' is not exported (Lottie range selectors are a later phase) — dropped, full text shown`);
  }
  if (tracks.has('revealFraction') || !Number.isNaN(node.revealFraction())) {
    ctx.warn(`${describe(node)}: 'revealFraction' is not exported — dropped, full text shown`);
  }
  if (tracks.has('fontAxes') || Object.keys(node.fontAxes()).length > 0 || node.fontVariationSettings !== undefined) {
    ctx.warn(`${describe(node)}: variable-font axes (fontAxes/fontVariationSettings) have no Lottie text-document field — dropped`);
  }
  if (node.box !== undefined) {
    ctx.warn(`${describe(node)}: box valign is approximated as baseline-anchored (no Lottie ink-box anchor) — vertical placement may shift`);
  }
  // With a real measurer the wrap is BAKED into the doc `t` (faithful) — no warn.
  // Without one, the raw string passes through and the player self-reflows (the
  // wrapping may diverge from glissade's), which is the honest degrade to warn on.
  if (ctx.measurer === undefined && (tracks.has('width') || node.width() > 0)) {
    ctx.warn(`${describe(node)}: wrap 'width' relies on the player's own line reflow — wrapping may diverge from glissade's`);
  }
}

function buildTextLayer(ctx: Ctx, node: Text, ind: number, parentInd: number | undefined, tracks: NodeTracks, opacity: OpacityAccum): LottieLayer {
  const fName = registerFont(ctx, node);
  warnTextUnsupported(ctx, node, tracks);
  const t: LottieTextData = { d: { k: buildTextDocKeyframes(ctx, node, fName, tracks) }, a: [] };
  return {
    ty: 5,
    nm: node.id ?? `text${ind}`,
    ind,
    ip: ctx.ip,
    op: ctx.op,
    ks: buildTransform(ctx, node, tracks, combineOpacity(ctx, node, tracks, opacity)),
    t,
    ...(parentInd !== undefined ? { parent: parentInd } : {}),
  };
}

// --- geometry ---

function buildGeometry(ctx: Ctx, node: ShapeNode, kind: 'rect' | 'circle' | 'path', tracks: NodeTracks): LottieShapeItem {
  if (kind === 'path') return buildPathGeometry(ctx, node as Path, tracks);
  const paramNames = kind === 'rect' ? ['width', 'height', 'cornerRadius'] : ['radius'];
  const contourAt = (t: number): PathContour => {
    if (kind === 'rect') {
      const r = node as Rect;
      return rectContour(
        [0, 0],
        [paramAt(tracks, 'width', r.width(), t), paramAt(tracks, 'height', r.height(), t)],
        paramAt(tracks, 'cornerRadius', r.cornerRadius(), t),
      );
    }
    const c = node as Circle;
    const rad = paramAt(tracks, 'radius', c.radius(), t);
    return ellipseContour([0, 0], [rad * 2, rad * 2]);
  };
  if (!paramNames.some((p) => tracks.has(p))) {
    return { ty: 'sh', ks: { a: 0, k: [contourToShData(contourAt(0))] } };
  }
  ctx.warn(`${describe(node)}: animated primitive geometry is sampled at ${ctx.fr} fps (not channel-mapped)`);
  const [f0, f1] = frameSpan(ctx, paramNames.map((p) => tracks.get(p)));
  const keys: LottieKeyframe[] = [];
  for (let f = f0; f <= f1; f++) {
    const frame: LottieKeyframe = { t: f, s: [contourToShData(contourAt(f / ctx.fr))] };
    if (f < f1) {
      frame.o = { x: 0, y: 0 };
      frame.i = { x: 1, y: 1 };
    }
    keys.push(frame);
  }
  return { ty: 'sh', ks: { a: 1, k: keys } };
}

function paramAt(tracks: NodeTracks, prop: string, staticVal: number, t: number): number {
  const tr = tracks.get(prop) as Track<number> | undefined;
  return tr ? sampleTrack(tr, t) : staticVal;
}

function buildPathGeometry(ctx: Ctx, node: Path, tracks: NodeTracks): LottieShapeItem {
  const tr = tracks.get('d') as Track<PathValue> | undefined;
  if (tr) {
    const keys = isDirectlyInvertible(tr.keys, tr.expr)
      ? emitKeys(tr.keys, ctx.fr, pathValueToShData)
      : sampleToLottieKeys(tr, ctx.fr, ctx.ip, ctx.op, pathValueToShData);
    return { ty: 'sh', ks: { a: 1, k: keys } };
  }
  return { ty: 'sh', ks: { a: 0, k: pathValueToShData(node.data()) } };
}

// --- paint ---

function colorToLottie(css: string): number[] {
  const { r, g, b, a } = parseColor(css);
  const base = [r / 255, g / 255, b / 255];
  return a >= 1 ? base : [...base, a];
}

function colorKeys(ctx: Ctx, tr: Track<string>): LottieKeyframe[] {
  return isDirectlyInvertible(tr.keys, tr.expr)
    ? emitKeys(tr.keys, ctx.fr, colorToLottie)
    : sampleToLottieKeys(tr, ctx.fr, ctx.ip, ctx.op, colorToLottie);
}

function buildFill(ctx: Ctx, node: ShapeNode, tracks: NodeTracks, ind: number): LottieShapeItem | undefined {
  const tr = tracks.get('fill') as Track<unknown> | undefined;
  if (tr) {
    if (tr.type === 'color') {
      return { ty: 'fl', c: { a: 1, k: colorKeys(ctx, tr as Track<string>) }, o: { a: 0, k: 100 } };
    }
    if (tr.type === 'paint') {
      return buildAnimatedGradientFill(ctx, node, tr as Track<Paint>, ind);
    }
    ctx.warn(`${describe(node)}: animated '${tr.type}' fill is not exported — dropped`);
    return undefined;
  }
  const fill = node.fill();
  if (typeof fill === 'string') {
    if (fill === '') return undefined;
    return { ty: 'fl', c: { a: 0, k: colorToLottie(fill) }, o: { a: 0, k: 100 } };
  }
  // A static Paint object: solid color sugar, a linear/radial gradient, or mesh.
  if (fill.kind === 'color') return { ty: 'fl', c: { a: 0, k: colorToLottie(fill.color) }, o: { a: 0, k: 100 } };
  if (fill.kind === 'mesh') {
    // With a PNG encoder threaded, rasterize the mesh → ty:2 image layer (the raster
    // fallback). Absent one (pure-JS callers) keep the historical warn-drop.
    if (ctx.encodePng) {
      emitMeshRaster(ctx, node, fill, ind);
      return undefined; // the image LAYER replaces the fill; no `fl` item
    }
    ctx.warn(`${describe(node)}: a mesh fill has no Lottie gradient ramp (MVP: solid / linear / radial) — dropped`);
    return undefined;
  }
  const stops = exportStops(fill);
  warnGradientInterpolation(ctx, node, fill, stops);
  return gradientFillItem(fill, localBounds(node), stops);
}

/**
 * Rasterize a STATIC (or first-key-flattened) mesh Paint to a PNG and emit it as a
 * ty:2 image LAYER parented to the shape layer (`shapeInd`). The raster's placement
 * mirrors raster2d.fillMesh's blit rect EXACTLY: the buffer covers the fill's
 * `localBounds`, so expressing the image in SHAPE-LOCAL coordinates (anchor [0,0],
 * position = bounds top-left, scale = bounds/raster) lets the shape layer's own
 * transform (position/rotation/scale/anchor) carry it to screen — the importer
 * re-parents the image under the shape's transform group, aligning it with the
 * (now fill-less) geometry. Gated on `ctx.encodePng` by the caller. Deterministic:
 * `rasterizeMesh` is pure, the Skia PNG encode is byte-stable, base64 is total.
 */
function emitMeshRaster(ctx: Ctx, node: ShapeNode, mesh: MeshPaint, shapeInd: number): void {
  const b = localBounds(node);
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  if (bw <= 0 || bh <= 0) {
    ctx.warn(`${describe(node)}: a mesh fill has empty local bounds — dropped`);
    return;
  }
  const { w: rw, h: rh } = meshRasterSize(bw, bh);
  const rgba = rasterizeMesh(mesh, rw, rh);
  const b64 = ctx.encodePng!(rgba, rw, rh);
  const id = `mesh_${ctx.assets.length}`;
  ctx.assets.push({ id, w: rw, h: rh, u: '', p: `data:image/png;base64,${b64}`, e: 1 });
  const layerInd = ++ctx.ind;
  ctx.layers.push({
    ty: 2,
    nm: `${node.id ?? `mesh${shapeInd}`}_raster`,
    refId: id,
    ind: layerInd,
    ip: ctx.ip,
    op: ctx.op,
    ks: {
      a: { a: 0, k: [0, 0] },
      p: { a: 0, k: [b.minX, b.minY] }, // top-left of the fill bounds, shape-local
      s: { a: 0, k: [(bw / rw) * 100, (bh / rh) * 100] }, // upscale the downscaled raster to the fill
      r: { a: 0, k: 0 },
      o: { a: 0, k: 100 },
    },
    parent: shapeInd,
  });
}

// --- gradient paint (fill: linear | radial → Lottie gf) ---

/** Local-space bounds of a shape's fill path — the gradient-geometry default source
 * (matches raster2d.resolveFill: linear ⇒ vertical bounds sweep, radial ⇒ centre +
 * half-diagonal). Rect/Circle draw centred at the origin; a Path bounds its anchors. */
function localBounds(node: ShapeNode): FillBounds {
  if (node instanceof Rect) {
    const w = node.width() / 2;
    const h = node.height() / 2;
    return { minX: -w, minY: -h, maxX: w, maxY: h };
  }
  if (node instanceof Circle) {
    const r = node.radius();
    return { minX: -r, minY: -r, maxX: r, maxY: r };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of node.data()) {
    for (const [x, y] of contour.v) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

interface FillBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type Gradient = Extract<Paint, { kind: 'linear' | 'radial' }>;

/** gf start point (Lottie `s`) from a gradient's geometry, defaulting to bounds
 * exactly as raster2d.resolveFill does (linear: [centre-x, minY]; radial: centre). */
function gradientStart(g: Gradient, b: FillBounds): [number, number] {
  const cx = (b.minX + b.maxX) / 2;
  if (g.kind === 'linear') return g.from ? [g.from[0], g.from[1]] : [cx, b.minY];
  const cy = (b.minY + b.maxY) / 2;
  return g.center ? [g.center[0], g.center[1]] : [cx, cy];
}

/** gf end point (Lottie `e`): linear ⇒ `to`; radial ⇒ centre + [radius, 0], so the
 * Lottie radial extent (|s→e|) equals the glissade radius (half-diagonal default). */
function gradientEnd(g: Gradient, b: FillBounds): [number, number] {
  if (g.kind === 'linear') {
    const cx = (b.minX + b.maxX) / 2;
    return g.to ? [g.to[0], g.to[1]] : [cx, b.maxY];
  }
  const [cx, cy] = gradientStart(g, b);
  const radius = g.radius !== undefined ? g.radius : Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2;
  return [cx + radius, cy];
}

/** Flatten stops into the Lottie `g.k` array: `[offset,r,g,b, …]` (0–1 floats),
 * then `[offset,a, …]` alpha stops appended iff any stop is translucent. */
function gradientStopArray(stops: ColorStop[]): number[] {
  const colors: number[] = [];
  const alphas: number[] = [];
  let anyAlpha = false;
  for (const s of stops) {
    const { r, g, b, a } = parseColor(s.color);
    colors.push(s.offset, r / 255, g / 255, b / 255);
    alphas.push(s.offset, a);
    if (a < 1) anyAlpha = true;
  }
  return anyAlpha ? [...colors, ...alphas] : colors;
}

/**
 * Densify a gradient's stops for export exactly as the render path does: `smooth`/
 * `gaussian` → a GRADIENT_RAMP_STEPS-stop oklab ramp; `linear`/undefined → the input
 * unchanged (byte-identical). Pure + deterministic (no RNG), so export stays reproducible.
 */
function exportStops(g: Gradient): ColorStop[] {
  return g.interpolation ? densifyStops(g.stops, g.interpolation) : g.stops;
}

/**
 * NEVER-SILENT guard for a non-linear gradient. The `gf` has no smooth/gaussian mode, so
 * we honor it by densifying the ramp into a GRADIENT_RAMP_STEPS-stop oklab approximation
 * (see exportStops) — the same ramp the render path uses, round-tripping at perceptual
 * parity (SSIM ~1.0). When densification APPLIES, the mode is faithfully honored, so we
 * stay SILENT — a warn there would be spurious noise firing on a mode we actually respected
 * (a stale warn is its own never-silent-adjacent bug). We warn ONLY on the genuine fallback:
 * a degenerate gradient (<2 stops or a non-positive offset span) the densifier can't resample,
 * which really does emit a hard linear ramp — that divergence must not be silent.
 */
function warnGradientInterpolation(ctx: Ctx, node: ShapeNode, g: Gradient, resolved: ColorStop[]): void {
  const mode = g.interpolation;
  if (mode === undefined || mode === 'linear') return;
  if (resolved.length > g.stops.length) return; // densified → mode honored at perceptual parity → no warn
  ctx.warn(
    `${describe(node)}: '${mode}' gradient interpolation could not be densified ` +
      `(needs ≥2 stops over a positive offset span) — emitted as a hard linear ramp; mid-stop banding may differ`,
  );
}

/** A static linear/radial gradient → a `gf` shape item (geometry from `bounds`). Stops are
 *  already resolved (densified for smooth/gaussian) by the caller. */
function gradientFillItem(g: Gradient, bounds: FillBounds, stops: ColorStop[]): LottieShapeItem {
  const gk: LottieGradient = { p: stops.length, k: { a: 0, k: gradientStopArray(stops) } };
  const s = gradientStart(g, bounds);
  const e = gradientEnd(g, bounds);
  if (g.kind === 'radial') {
    return { ty: 'gf', t: 2, s: { a: 0, k: s }, e: { a: 0, k: e }, g: gk, h: { a: 0, k: 0 }, a: { a: 0, k: 0 }, o: { a: 0, k: 100 } };
  }
  return { ty: 'gf', t: 1, s: { a: 0, k: s }, e: { a: 0, k: e }, g: gk, o: { a: 0, k: 100 } };
}

/**
 * An animated `fill: paint` track → a `gf` with keyframed s/e/g channels. The
 * gradient KIND (linear/radial) is fixed to the first key's kind (Lottie can't
 * animate `t`); mesh/color first keys warn-drop. Directly-invertible tracks keep
 * their eases via emitKeys; anything else (named ease / spring / expr) samples on
 * the frame grid. A key whose kind/stop-count differs from the first would snap
 * under paintType anyway, so its geometry/ramp is read as best-effort.
 */
function buildAnimatedGradientFill(ctx: Ctx, node: ShapeNode, tr: Track<Paint>, ind: number): LottieShapeItem | undefined {
  const first = tr.keys[0]!.value;
  if (first.kind === 'mesh') {
    // MVP: flatten the animation to the FIRST key's mesh → one static raster (a
    // per-frame PNG sequence is out of scope). Precedent: the wrap / gradient-interp
    // sampling degrades. Absent an encoder, keep the historical warn-drop.
    if (ctx.encodePng) {
      ctx.warn(`${describe(node)}: mesh animation is flattened to a static raster (first key) — motion dropped`);
      emitMeshRaster(ctx, node, first, ind);
      return undefined;
    }
    ctx.warn(`${describe(node)}: an animated mesh fill has no Lottie gradient ramp — dropped`);
    return undefined;
  }
  if (first.kind === 'color') {
    ctx.warn(`${describe(node)}: an animated color-only paint fill is not exported (use a 'color' track) — dropped`);
    return undefined;
  }
  const kind = first.kind;
  const bounds = localBounds(node);
  const asGradient = (p: Paint): Gradient =>
    p.kind === 'linear' || p.kind === 'radial' ? p : ({ kind, stops: [{ offset: 0, color: '#000000' }] } as Gradient);
  const firstStops = exportStops(first);
  warnGradientInterpolation(ctx, node, first, firstStops);
  const p = firstStops.length;

  const sMap = (v: Paint): number[] => gradientStart(asGradient(v), bounds);
  const eMap = (v: Paint): number[] => gradientEnd(asGradient(v), bounds);
  const gMap = (v: Paint): number[] => gradientStopArray(exportStops(asGradient(v)));

  let sK: LottieKeyframe[];
  let eK: LottieKeyframe[];
  let gK: LottieKeyframe[];
  if (isDirectlyInvertible(tr.keys, tr.expr)) {
    sK = emitKeys(tr.keys, ctx.fr, sMap);
    eK = emitKeys(tr.keys, ctx.fr, eMap);
    gK = emitKeys(tr.keys, ctx.fr, gMap);
  } else {
    ctx.warn(`${describe(node)}: animated gradient fill is sampled at ${ctx.fr} fps (non-invertible ease)`);
    sK = sampleToLottieKeys(tr, ctx.fr, ctx.ip, ctx.op, sMap);
    eK = sampleToLottieKeys(tr, ctx.fr, ctx.ip, ctx.op, eMap);
    gK = sampleToLottieKeys(tr, ctx.fr, ctx.ip, ctx.op, gMap);
  }
  const g: LottieGradient = { p, k: { a: 1, k: gK } };
  if (kind === 'radial') {
    return { ty: 'gf', t: 2, s: { a: 1, k: sK }, e: { a: 1, k: eK }, g, h: { a: 0, k: 0 }, a: { a: 0, k: 0 }, o: { a: 0, k: 100 } };
  }
  return { ty: 'gf', t: 1, s: { a: 1, k: sK }, e: { a: 1, k: eK }, g, o: { a: 0, k: 100 } };
}

function buildStroke(ctx: Ctx, node: ShapeNode, tracks: NodeTracks): LottieShapeItem | undefined {
  const colorTr = tracks.get('stroke') as Track<string> | undefined;
  const widthTr = tracks.get('strokeWidth') as Track<number> | undefined;
  const staticStroke = node.stroke();
  const staticWidth = node.strokeWidth();
  const hasColor = colorTr !== undefined || staticStroke !== '';
  const hasWidth = widthTr !== undefined || staticWidth > 0;
  if (!hasColor || !hasWidth) return undefined;
  const c: LottieProp = colorTr ? { a: 1, k: colorKeys(ctx, colorTr) } : { a: 0, k: colorToLottie(staticStroke) };
  const w: LottieProp = widthTr ? { a: 1, k: scalarKeys(ctx, widthTr, (v) => v) } : { a: 0, k: staticWidth };
  return { ty: 'st', c, o: { a: 0, k: 100 }, w };
}
