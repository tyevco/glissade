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
 * silent). IN: Group hierarchy, Rect/Circle/Path with a SOLID fill (+ optional
 * stroke), transform channels (position / position.x/.y split, opacity, scale,
 * rotation → identity degrees), animated `fill` color, animated `d` path
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
 * OUT (warned + dropped): Image/Video, gradient/mesh paint (solid only),
 * non-center anchors, text typewriter `reveal`/`revealFraction`, variable-font axes
 * (`fontAxes`/`fontVariationSettings` — no Lottie doc field), `box` valign
 * (baseline-approximated) and wrap `width` (the player self-reflows), TokenHighlight.
 * Animated primitive geometry (width/radius tracks) is SAMPLED, not channel-mapped.
 */

import {
  compileTimeline,
  parseColor,
  sampleTrack,
  type Key,
  type PathContour,
  type PathValue,
  type Timeline,
  type Track,
  type Vec2,
} from '@glissade/core';
import { Circle, Group, Node, Path, Rect, Text, type SceneModule } from '@glissade/scene';
import { ellipseContour, rectContour } from './pathvalue.js';
import { contourToShData, pathValueToShData } from './emitGeometry.js';
import { emitKeys, isDirectlyInvertible, toFrames } from './emitKeyframes.js';
import { decimateLinearKeys, sampleToLottieKeys } from './sampleFallback.js';
import type {
  LottieDocument,
  LottieFont,
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
}

interface Ctx {
  fr: number;
  ip: number;
  op: number;
  warn: (m: string) => void;
  layers: LottieLayer[];
  ind: number;
  /** Font references de-duped by fName across every Text node (pure/deterministic). */
  fonts: Map<string, LottieFont>;
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
  const ctx: Ctx = { fr, ip: 0, op, warn, layers: [], ind: 0, fonts: new Map() };
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
    const kind = classify(node);
    if (kind === 'drop') {
      ctx.warn(`${describe(node)} is not exportable (MVP: Group / Rect / Circle / Path / Text) — dropped`);
      continue;
    }
    const myInd = ++ctx.ind;
    const tracks = (node.id !== undefined ? byNode.get(node.id) : undefined) ?? EMPTY_TRACKS;
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

function buildTransform(ctx: Ctx, node: Node, tracks: NodeTracks, o: LottieProp): LottieTransform {
  if (node.hasAnchor && (node.anchor[0] !== 0.5 || node.anchor[1] !== 0.5)) {
    ctx.warn(`${describe(node)}: a non-center anchor is not exported (MVP centers geometry) — placement may shift`);
  }
  return {
    a: { a: 0, k: [0, 0] }, // glissade shapes draw centered; anchor stays at origin
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
  const span = leafTrack ? [leafTrack, ...accum.tracks] : [...accum.tracks];
  const [f0, f1] = frameSpan(ctx, span);
  const out: LottieKeyframe[] = [];
  for (let f = f0; f <= f1; f++) {
    const t = f / ctx.fr;
    let product = (leafTrack ? sampleTrack(leafTrack, t) : leafStatic) * accum.factor;
    for (const at of accum.tracks) product *= sampleTrack(at, t);
    const frame: LottieKeyframe = { t: f, s: [product * 100] };
    if (f < f1) {
      frame.o = { x: 0, y: 0 };
      frame.i = { x: 1, y: 1 };
    }
    out.push(frame);
  }
  return { a: 1, k: decimateLinearKeys(out) };
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
  const out: LottieKeyframe[] = [];
  for (let f = f0; f <= f1; f++) {
    const t = f / ctx.fr;
    const x = xt ? sampleTrack(xt, t) : staticVal[0];
    const y = yt ? sampleTrack(yt, t) : staticVal[1];
    const frame: LottieKeyframe = { t: f, s: map([x, y]) };
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
  // channels × 11.5k keys). Flat numeric payloads, so RDP applies.
  return decimateLinearKeys(out);
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
  const fill = buildFill(ctx, node, tracks);
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

/** The text document at time `t`, sampling the animatable text/fill/fontSize props. */
function textDocAt(node: Text, fName: string, tracks: NodeTracks, t: number): LottieTextDocument {
  const text = sampleStr(tracks, 'text', node.text(), t);
  const fill = sampleColor(tracks, 'fill', node.fill(), t);
  const size = sampleNum(tracks, 'fontSize', node.fontSize(), t);
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
  if (!docProps.some((p) => tracks.has(p))) {
    return [{ t: ctx.ip, s: textDocAt(node, fName, tracks, ctx.ip / ctx.fr) }];
  }
  ctx.warn(`${describe(node)}: animated text/fill/fontSize is sampled at ${ctx.fr} fps into stepped text documents (not smoothly interpolated)`);
  const [f0, f1] = frameSpan(ctx, docProps.map((p) => tracks.get(p)));
  const keys: LottieTextDocKeyframe[] = [];
  let prev: string | undefined;
  for (let f = f0; f <= f1; f++) {
    const s = textDocAt(node, fName, tracks, f / ctx.fr);
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
  if (tracks.has('width') || node.width() > 0) {
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

function buildFill(ctx: Ctx, node: ShapeNode, tracks: NodeTracks): LottieShapeItem | undefined {
  const tr = tracks.get('fill') as Track<unknown> | undefined;
  if (tr) {
    if (tr.type !== 'color') {
      ctx.warn(`${describe(node)}: animated '${tr.type}' fill (gradient/mesh) is not exported — dropped`);
      return undefined;
    }
    return { ty: 'fl', c: { a: 1, k: colorKeys(ctx, tr as Track<string>) }, o: { a: 0, k: 100 } };
  }
  const fill = node.fill();
  if (typeof fill !== 'string') {
    ctx.warn(`${describe(node)}: a gradient/mesh fill is not exported (MVP: solid color) — dropped`);
    return undefined;
  }
  if (fill === '') return undefined;
  return { ty: 'fl', c: { a: 0, k: colorToLottie(fill) }, o: { a: 0, k: 100 } };
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
