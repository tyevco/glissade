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
 * (constant topology). OUT (warned + dropped): Text, Image/Video, gradient/mesh
 * paint (solid only), non-center anchors, group opacity compositing (Lottie
 * parenting never inherits opacity). Animated primitive geometry (width/radius
 * tracks) is SAMPLED, not channel-mapped.
 */

import {
  parseColor,
  sampleTrack,
  type Key,
  type PathContour,
  type PathValue,
  type Timeline,
  type Track,
  type Vec2,
} from '@glissade/core';
import { Circle, Group, Node, Path, Rect, type SceneModule } from '@glissade/scene';
import { ellipseContour, rectContour } from './pathvalue.js';
import { contourToShData, pathValueToShData } from './emitGeometry.js';
import { emitKeys, isDirectlyInvertible, toFrames } from './emitKeyframes.js';
import { sampleToLottieKeys } from './sampleFallback.js';
import type {
  LottieDocument,
  LottieKeyframe,
  LottieLayer,
  LottieProp,
  LottieShapeItem,
  LottieSplitPosition,
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
}

type NodeTracks = ReadonlyMap<string, Track>;
const EMPTY_TRACKS: NodeTracks = new Map();

type ShapeNode = Rect | Circle | Path;

/** Convert a SceneModule to a Lottie document. Pure over (scene, timeline). */
export function exportLottie(mod: SceneModule, opts: ExportOptions): LottieDocument {
  const scene = mod.createScene();
  const fr = opts.fps ?? mod.timeline.fps ?? 60;
  const warn = opts.onWarn ?? ((m: string) => console.warn(`gs export: ${m}`));

  // Group tracks by their resolved node id — the LONGEST registered-node-id
  // prefix owns the target (both node ids like `card/3` and prop paths like
  // `money/fill` carry slashes), mirroring scene.resolveTarget.
  const byNode = new Map<string, Map<string, Track>>();
  for (const tr of mod.timeline.tracks) {
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
  const ctx: Ctx = { fr, ip: 0, op, warn, layers: [], ind: 0 };
  walkChildren(ctx, scene.root.children, undefined, byNode);

  return {
    v: BODYMOVIN_VERSION,
    fr,
    ip: 0,
    op,
    w: opts.width,
    h: opts.height,
    nm: 'glissade export',
    layers: ctx.layers,
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
function walkChildren(ctx: Ctx, children: readonly Node[], parentInd: number | undefined, byNode: Map<string, Map<string, Track>>): void {
  for (let i = children.length - 1; i >= 0; i--) {
    const node = children[i]!;
    const kind = classify(node);
    if (kind === 'drop') {
      ctx.warn(`${describe(node)} is not exportable (MVP: Group / Rect / Circle / Path) — dropped`);
      continue;
    }
    const myInd = ++ctx.ind;
    const tracks = (node.id !== undefined ? byNode.get(node.id) : undefined) ?? EMPTY_TRACKS;
    ctx.layers.push(
      kind === 'group'
        ? buildNullLayer(ctx, node, myInd, parentInd, tracks)
        : buildShapeLayer(ctx, node as ShapeNode, kind, myInd, parentInd, tracks),
    );
    if (node instanceof Group) walkChildren(ctx, node.children, myInd, byNode);
  }
}

function classify(node: Node): 'group' | 'rect' | 'circle' | 'path' | 'drop' {
  if (node instanceof Rect) return 'rect';
  if (node instanceof Circle) return 'circle';
  if (node instanceof Path) return 'path';
  if (node instanceof Group) return 'group';
  return 'drop';
}

const describe = (node: Node): string => `${node.describeType}${node.id !== undefined ? ` '${node.id}'` : ''}`;

// --- transforms ---

function buildTransform(ctx: Ctx, node: Node, tracks: NodeTracks): LottieTransform {
  if (node.hasAnchor && (node.anchor[0] !== 0.5 || node.anchor[1] !== 0.5)) {
    ctx.warn(`${describe(node)}: a non-center anchor is not exported (MVP centers geometry) — placement may shift`);
  }
  return {
    a: { a: 0, k: [0, 0] }, // glissade shapes draw centered; anchor stays at origin
    p: positionProp(ctx, tracks, node.position()),
    s: vecProp(ctx, tracks, 'scale', node.scale(), (v) => [v[0] * 100, v[1] * 100]),
    r: scalarProp(ctx, tracks, 'rotation', node.rotation(), (v) => v), // rotation is degrees both sides (identity)
    o: scalarProp(ctx, tracks, 'opacity', node.opacity(), (v) => v * 100),
  };
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
  return out;
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
  if (node.opacity() !== 1 || tracks.has('opacity')) {
    ctx.warn(`${describe(node)}: group opacity is exported on the null layer, but Lottie parenting does not composite it over children`);
  }
  return {
    ty: 3,
    nm: node.id ?? `group${ind}`,
    ind,
    ip: ctx.ip,
    op: ctx.op,
    ks: buildTransform(ctx, node, tracks),
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
    ks: buildTransform(ctx, node, tracks),
    shapes,
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
