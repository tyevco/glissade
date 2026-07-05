/**
 * `gs parity --semantic` — the structured Skia↔Lottie round-trip DROP-DIFF.
 *
 * It FUSES the exporter's own warn-list (WHICH element dropped + WHY) with the SSIM
 * residual localized to that node's rendered bbox (WHERE it drifts + how much),
 * emitting ONE auto-correlated `source:'parity'` diagnostic per finding — the
 * hand-correlated PARITY_BASELINE table become a GENERATED, self-verifying artifact.
 *
 * Reuses the SHIPPED machinery, nothing new on the render path:
 *   • the export↔import round-trip (@glissade/lottie) — exportLottie→importLottie→render.
 *   • the export warn-capture — exportLottie's `onWarn` sink IS the intentional-drop
 *     declaration (every render-only drop already warns; we just capture the list).
 *   • the 8×8-tile SSIM harness (`ssimMap` from @glissade/backend-skia, shipped 0.37).
 *   • `emitWithIds` (@glissade/scene/identity) for the reference DisplayList + node id
 *     stream → per-node composed-world bbox (the same walk critique() uses).
 *
 * DETERMINISTIC by construction: the residual→node attribution is a TOTAL ORDER
 * (contains → topmost paint → node-id), so shuffling tile iteration yields identical
 * attribution; output is canonically sorted via `sortDiagnostics`. Pure read — it
 * renders through the SAME faithful env as `gs render`/`gs parity` and never mutates
 * evaluate().
 */

import { evaluate, withDeterminismGuards, type SceneModule, type Scene, type Node } from '@glissade/scene';
import type { Timeline } from '@glissade/core';
import { emitWithIds } from '@glissade/scene/identity';
import { sortDiagnostics, DIAGNOSTIC_SCHEMA_VERSION, type SceneDiagnostic } from '@glissade/scene/diagnostics';
import { SkiaBackend, ssimMap, type SsimMap } from '@glissade/backend-skia';
import { exportLottie, importLottie } from '@glissade/lottie';
import { loadSceneModule, prepareSkiaRenderEnv } from './render.js';
import { DEFAULT_PARITY_FRAMES, DEFAULT_PARITY_FPS, DEFAULT_PARITY_FLOOR } from './parity.js';

export interface SemanticParityOptions {
  modulePath: string;
  /** pre-resolved module (in-process tests; avoids the jiti dual-package hazard). */
  module?: SceneModule;
  frames?: number[];
  fps?: number;
  width?: number;
  height?: number;
  /** SSIM floor: a tile below this is a residual. Default 0.98. */
  min?: number;
  /** view: default = error-only (UNEXPLAINED_RESIDUAL); `all` = every finding. */
  all?: boolean;
  /** a pinned baseline of expected (node,code,property) keys — a NEW expected drop
   *  absent from it STILL flags (the regression axis, orthogonal to completeness). */
  baseline?: readonly string[];
  json?: boolean;
}

export interface SemanticParityResult {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  /** EVERY finding (all severities), canonically sorted. */
  findings: SceneDiagnostic[];
  /** the view-filtered findings (default error-only; --all = every finding). */
  view: SceneDiagnostic[];
  /** the exporter warn strings captured (source of `expected`). */
  warnings: string[];
  /** true iff any finding is severity:error (an UNEXPLAINED_RESIDUAL). */
  hasErrors: boolean;
  /** the 3 correlation invariants (the measured gain), each machine-asserted. */
  invariants: { regionOverlapsResidual: boolean; everyResidualHasCause: boolean; everyWarnHasFinding: boolean };
  /** baseline gate: expected findings whose key is absent from the pinned baseline. */
  newExpected: string[];
  width: number;
  height: number;
  floor: number;
  frames: number[];
  report: string;
}

// ── device-space bbox walk (per node id) — the golden-tested raster2d discipline ─

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
type Mat = readonly [number, number, number, number, number, number];
const ID_MAT: Mat = [1, 0, 0, 1, 0, 0];
function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function grow(b: Box | null, x: number, y: number): Box {
  if (!b) return { minX: x, minY: y, maxX: x, maxY: y };
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
  return b;
}
function rectBox(into: Box | null, m: Mat, x0: number, y0: number, x1: number, y1: number): Box | null {
  let b = into;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
    b = grow(b, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
  }
  return b;
}

interface NodeBox {
  bounds: Box;
  /** highest command index attributed to this node = its last paint (z-order). */
  order: number;
}

/** Walk one DisplayList + id stream → per-node device-space bbox + paint order. A
 *  compact copy of critique's walkFrame (transform stack; path/text/image bounds). */
function walkBounds(list: ReturnType<typeof emitWithIds>['displayList'], ids: readonly (string | undefined)[]): Map<string, NodeBox> {
  const nodes = new Map<string, NodeBox>();
  let mat: Mat = ID_MAT;
  const stack: Mat[] = [];
  const resources = list.resources;
  const attribute = (id: string | undefined, box: Box | null, order: number): void => {
    if (id === undefined || box === null) return;
    const ex = nodes.get(id);
    if (ex) {
      ex.bounds = rectBox(ex.bounds, ID_MAT, box.minX, box.minY, box.maxX, box.maxY)!;
      if (order > ex.order) ex.order = order;
    } else {
      nodes.set(id, { bounds: { ...box }, order });
    }
  };
  const segBounds = (segs: readonly (readonly [string, ...number[]])[]): Box | null => {
    let b: Box | null = null;
    for (const seg of segs) {
      switch (seg[0]) {
        case 'M':
        case 'L':
          b = grow(b, seg[1]!, seg[2]!);
          break;
        case 'C':
          b = grow(b, seg[1]!, seg[2]!);
          b = grow(b, seg[3]!, seg[4]!);
          b = grow(b, seg[5]!, seg[6]!);
          break;
        case 'Q':
          b = grow(b, seg[1]!, seg[2]!);
          b = grow(b, seg[3]!, seg[4]!);
          break;
        case 'E': {
          const r = Math.max(seg[3]!, seg[4]!);
          b = grow(b, seg[1]! - r, seg[2]! - r);
          b = grow(b, seg[1]! + r, seg[2]! + r);
          break;
        }
      }
    }
    return b;
  };
  const pathBounds = (idx: number): Box | null => {
    const res = resources[idx];
    return res && (res as { kind?: string }).kind === 'path'
      ? segBounds((res as { segs: readonly (readonly [string, ...number[]])[] }).segs)
      : null;
  };
  const commands = list.commands;
  for (let ci = 0; ci < commands.length; ci++) {
    const cmd = commands[ci] as { op: string; [k: string]: unknown };
    const id = ids[ci];
    switch (cmd.op) {
      case 'save':
        stack.push(mat);
        break;
      case 'restore':
        mat = stack.pop() ?? mat;
        break;
      case 'transform':
        mat = mul(mat, cmd.m as Mat);
        break;
      case 'fillPath':
      case 'strokePath': {
        const pb = pathBounds(cmd.path as number);
        if (pb) attribute(id, rectBox(null, mat, pb.minX, pb.minY, pb.maxX, pb.maxY), ci);
        break;
      }
      case 'fillText': {
        const font = cmd.font as { size: number };
        const width = String(cmd.text).length * font.size * 0.6;
        const x = cmd.x as number;
        const y = cmd.y as number;
        const align = (cmd.align as string) ?? 'left';
        const x0 = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
        const m = font.size;
        attribute(id, rectBox(null, mat, x0 - m, y - 1.5 * m, x0 + width + m, y + 0.75 * m), ci);
        break;
      }
      case 'drawImage': {
        const dst = cmd.dst as { x: number; y: number; w: number; h: number };
        attribute(id, rectBox(null, mat, dst.x, dst.y, dst.x + dst.w, dst.y + dst.h), ci);
        break;
      }
    }
  }
  return nodes;
}

// ── export warn parsing (→ {node, property, cause, approximate}) ─────────────

export interface ParsedWarn {
  node?: string;
  property: string;
  cause: string;
  /** true = degraded-but-present (LOTTIE_APPROXIMATE); false = hard drop (LOTTIE_DROP). */
  approximate: boolean;
}

/** Parse ONE exporter warn string into a structured drop. The exporter formats
 *  every warn as `<Type> '<id>': <cause>` (id optional) — see lottie/export.ts. */
export function parseWarn(msg: string): ParsedWarn {
  // node id = the single-quoted token immediately after the leading `<Type>`.
  const idMatch = /^\w+ '([^']+)'/.exec(msg);
  const node = idMatch?.[1];
  const approximate =
    /valign is approximated|relies on the player's own line reflow|sampled at .* fps|hard linear ramp|flattened to a static raster|double-composite/.test(
      msg,
    );
  let property = 'unknown';
  if (/motionBlur|analog-shutter/.test(msg)) property = 'motion-blur';
  else if (/echo trails/.test(msg)) property = 'echo-trails';
  else if (/camera shake|whole-frame camera shake/.test(msg)) property = 'camera-shake';
  else if (/shake\(\) jitter|closed-form jitter/.test(msg)) property = 'shake';
  else if (/mesh/.test(msg)) property = 'mesh-animation';
  else if (/variable-font axes|fontAxes|fontVariationSettings/.test(msg)) property = 'variable-font-axes';
  else if (/typewriter 'reveal'|'revealFraction'/.test(msg)) property = 'reveal-fraction';
  else if (/box valign/.test(msg)) property = 'box-valign';
  else if (/wrap 'width'|line reflow/.test(msg)) property = 'wrap-width';
  else if (/gradient interpolation/.test(msg)) property = 'gradient-interpolation';
  else if (/not exportable/.test(msg)) {
    // generic whole-node drop (Image/Video/TextCursor/…) — property = the node kind.
    const kind = /^(\w+)/.exec(msg)?.[1]?.toLowerCase();
    property = kind === 'image' ? 'image' : kind === 'video' ? 'video' : kind === 'textcursor' ? 'text-cursor' : (kind ?? 'drop');
  }
  return { ...(node !== undefined ? { node } : {}), property, cause: msg, approximate };
}

// ── attribution (residual tile → node) — the TOTAL-ORDER pure rule ────────────

const ORPHAN_RADIUS = 64; // px — a residual tile beyond this from any node = ORPHAN
// A real export DROP re-covers ~100% of a node's rendered box with deep residual;
// a faithful round-trip's sub-pixel EDGE-AA flicker is a thin RING (~10-20% of the
// box). Only an UNWARNED residual covering ≥ this fraction of a node's bbox tiles
// is a genuine UNEXPLAINED divergence (a warn-explained drop is reported regardless).
const COVERAGE_MIN = 0.34;
// A lone stray orphan tile is edge noise; a dropped BACKGROUND is a broad block.
const MIN_ORPHAN_TILES = 3;
// An UNWARNED residual whose tiles average ABOVE this is benign sub-pixel compositing
// (Stack/sequence rounding, ~0.96-0.97), NOT a feature drop — tag it LOTTIE_APPROXIMATE
// (masked) rather than alarm it as an episode-breaking UNEXPLAINED. A real feature drop
// is far deeper (ssim ≲ 0.7 over its region), so this never masks a genuine loss.
const BENIGN_MEAN_FLOOR = 0.92;

/** How many 8×8 tiles a node's device bbox spans (≥1) — the coverage denominator. */
function bboxTileArea(box: Box, win: number): number {
  const wTiles = Math.max(1, (box.maxX - box.minX) / win);
  const hTiles = Math.max(1, (box.maxY - box.minY) / win);
  return wTiles * hTiles;
}

interface Residual {
  /** residual tiles' union box (px), per node id. */
  region: Box;
  /** min (worst) ssim over the node's residual tiles. */
  worst: number;
  /** sum + count for the mean. */
  sum: number;
  count: number;
}

/**
 * Attribute every residual tile (`ssim < floor`) of one frame's SSIM grid to a
 * node (or ORPHAN). PURE + total-order: each tile decides independently, so tile
 * iteration order never changes the result. Returns per-node residuals + the
 * orphan tiles' union.
 */
export function attributeResiduals(
  map: SsimMap,
  bounds: Map<string, NodeBox>,
  floor: number,
): { perNode: Map<string, Residual>; orphan: Residual | null } {
  const perNode = new Map<string, Residual>();
  let orphan: Residual | null = null;
  const nodeList = [...bounds.entries()];
  const add = (into: Residual | null, box: Box, ssim: number): Residual => {
    if (!into) return { region: { ...box }, worst: ssim, sum: ssim, count: 1 };
    into.region.minX = Math.min(into.region.minX, box.minX);
    into.region.minY = Math.min(into.region.minY, box.minY);
    into.region.maxX = Math.max(into.region.maxX, box.maxX);
    into.region.maxY = Math.max(into.region.maxY, box.maxY);
    into.worst = Math.min(into.worst, ssim);
    into.sum += ssim;
    into.count += 1;
    return into;
  };
  for (let ty = 0; ty < map.rows; ty++) {
    for (let tx = 0; tx < map.cols; tx++) {
      const s = map.tiles[ty * map.cols + tx]!;
      if (s >= floor) continue; // not a residual tile
      const cx = tx * map.win + map.win / 2;
      const cy = ty * map.win + map.win / 2;
      const tileBox: Box = { minX: tx * map.win, minY: ty * map.win, maxX: (tx + 1) * map.win, maxY: (ty + 1) * map.win };
      const owner = attributeTile(cx, cy, nodeList);
      if (owner) perNode.set(owner, add(perNode.get(owner) ?? null, tileBox, s));
      else orphan = add(orphan, tileBox, s);
    }
  }
  return { perNode, orphan };
}

/** The total order: containing nodes → TOPMOST paint → node-id; else nearest by
 *  edge distance (tie paint-order then id) within ORPHAN_RADIUS; else undefined. */
function attributeTile(cx: number, cy: number, nodeList: [string, NodeBox][]): string | undefined {
  let best: { id: string; order: number } | undefined;
  for (const [id, nb] of nodeList) {
    const b = nb.bounds;
    if (cx >= b.minX && cx <= b.maxX && cy >= b.minY && cy <= b.maxY) {
      if (!best || nb.order > best.order || (nb.order === best.order && id < best.id)) best = { id, order: nb.order };
    }
  }
  if (best) return best.id;
  // empty-region tile: nearest node by bbox edge-distance.
  let near: { id: string; dist: number; order: number } | undefined;
  for (const [id, nb] of nodeList) {
    const d = edgeDistance(cx, cy, nb.bounds);
    if (d > ORPHAN_RADIUS) continue;
    if (!near || d < near.dist || (d === near.dist && (nb.order > near.order || (nb.order === near.order && id < near.id)))) {
      near = { id, dist: d, order: nb.order };
    }
  }
  return near?.id;
}

function edgeDistance(x: number, y: number, b: Box): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dy = Math.max(b.minY - y, 0, y - b.maxY);
  return Math.hypot(dx, dy);
}

// ── structural drop-extent resolver (the STRUCTURAL causal link, not geometry) ──

/** One export-drop and the node ids it STRUCTURALLY explains — used to absorb a
 *  descendant/target residual into its causing drop (NOT geometric containment, so
 *  an independent node that merely OVERLAPS a drop's bbox is never absorbed). */
interface DropExtent {
  /** stable dedup/coalesce key (the warned node id, else `<property>@<warnIndex>`). */
  key: string;
  /** representative node id for the finding (the DROPPED node), when the warn names one. */
  node?: string;
  warn: ParsedWarn;
  /** every scene node id this drop structurally explains (its subtree + any driver target). */
  ids: Set<string>;
}

/** id-less render-only warns → the scene `describeType`(s) that produce them, so a
 *  warn with no quoted id still resolves to its render-only node(s) structurally. */
const FEATURE_TYPES: Record<string, readonly string[]> = {
  'motion-blur': ['MotionBlur'],
  'echo-trails': ['Echo'],
  'camera-shake': ['Camera'],
  shake: ['Camera'],
  followpath: ['FollowPath'],
  orienttopath: ['OrientToPath'],
  lookat: ['LookAt'],
  'text-cursor': ['TextCursor'],
};

/** Collect a node's id-bearing subtree (itself + descendants). */
function collectSubtreeIds(node: Node, into: Set<string>): void {
  if (node.id !== undefined) into.add(node.id);
  const children = (node as unknown as { children?: Node[] }).children;
  if (Array.isArray(children)) for (const c of children) collectSubtreeIds(c, into);
}

/**
 * Resolve each export warn to the set of scene node ids its drop STRUCTURALLY
 * explains: a WRAPPER (motionBlur/echo/camera) explains its whole SUBTREE; a DRIVER
 * (followPath/orientToPath/lookAt) explains its `.target`'s subtree (the target is a
 * SIBLING it mutates, which an ancestry walk would miss); a leaf (Image/Video/Text)
 * explains only ITSELF. This structural link — never bare geometric overlap — is what
 * keeps an INDEPENDENT residual that merely sits inside a drop's bbox UNEXPLAINED.
 */
function buildDropExtents(scene: Scene, warns: readonly ParsedWarn[]): DropExtent[] {
  // index EVERY node by describeType — walking the ROOT tree (not scene.nodes, which
  // only holds ID-BEARING nodes) so an ID-LESS render-only node (a bare
  // `lookAt(...)` / `motionBlur(...)`) is still resolvable from its type + `.target`.
  const byType = new Map<string, Node[]>();
  const indexTree = (node: Node): void => {
    const t = node.describeType;
    (byType.get(t) ?? byType.set(t, []).get(t)!).push(node);
    const children = (node as unknown as { children?: Node[] }).children;
    if (Array.isArray(children)) for (const c of children) indexTree(c);
  };
  indexTree(scene.root);
  const out: DropExtent[] = [];
  warns.forEach((warn, i) => {
    const resolved: Node[] = [];
    if (warn.node !== undefined) {
      const n = scene.nodes.get(warn.node);
      if (n) resolved.push(n);
    } else {
      for (const type of FEATURE_TYPES[warn.property] ?? []) resolved.push(...(byType.get(type) ?? []));
    }
    if (resolved.length === 0) return; // a warn with no resolvable scene node explains nothing structurally
    const ids = new Set<string>();
    for (const n of resolved) {
      collectSubtreeIds(n, ids);
      // a DRIVER owns a SIBLING target's rotation/position — explain the target's subtree too.
      const target = (n as unknown as { target?: Node }).target;
      if (target && typeof target === 'object') collectSubtreeIds(target, ids);
    }
    out.push({ key: warn.node ?? `${warn.property}@${i}`, ...(warn.node !== undefined ? { node: warn.node } : {}), warn, ids });
  });
  return out;
}

// ── region role (severity RANKING only, never attribution) ────────────────────

function regionRole(region: Box, w: number, h: number): { role: string; weight: number } {
  const cx = (region.minX + region.maxX) / 2;
  const cy = (region.minY + region.maxY) / 2;
  // caption safe-area = the lower third; focal = the centre third; else edge.
  if (cy >= h * 0.72) return { role: 'caption-safe-area', weight: 3 };
  if (cx >= w / 3 && cx <= (2 * w) / 3 && cy >= h / 3 && cy <= (2 * h) / 3) return { role: 'focal-center', weight: 2 };
  return { role: 'edge', weight: 1 };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function roundBox(b: Box): Box {
  return { minX: Math.round(b.minX), minY: Math.round(b.minY), maxX: Math.round(b.maxX), maxY: Math.round(b.maxY) };
}
function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

// ── the command ───────────────────────────────────────────────────────────────

export async function semanticParityCommand(opts: SemanticParityOptions): Promise<SemanticParityResult> {
  const mod = opts.module ?? (await loadSceneModule(opts.modulePath));
  const size = mod.createScene().size;
  const w = opts.width ?? size.w;
  const h = opts.height ?? size.h;
  const fps = opts.fps ?? mod.timeline.fps ?? DEFAULT_PARITY_FPS;
  const frames = opts.frames ?? DEFAULT_PARITY_FRAMES;
  const floor = opts.min ?? DEFAULT_PARITY_FLOOR;

  // reference leg — the direct headless render (+ the id stream for attribution).
  // prepareSkiaRenderEnv sets up fonts/axes/Yoga/assets IDENTICALLY to gs render.
  const refScene = mod.createScene();
  const refBackend = new SkiaBackend(w, h);
  await prepareSkiaRenderEnv({ scene: refScene, doc: mod.timeline, backend: refBackend, modulePath: opts.modulePath });

  // round-trip leg — export (CAPTURING the warn-list) → import → render on Skia.
  // The exporter BAKES width-wrapped Text into the doc `t` using a measurer — reuse
  // refBackend (a SkiaBackend IS a TextMeasurer, with the SAME faces already
  // registered) so the export's text metrics are byte-for-byte the reference's, and
  // wrapped text can't round-trip with different line breaks (the wrap-bake fix).
  const measurer = refBackend;
  const encodePng = (rgba: Uint8ClampedArray, rw: number, rh: number): string => {
    const b = new SkiaBackend(rw, rh);
    b.putPixels(rgba);
    return b.encodePng().toString('base64');
  };
  const warnings: string[] = [];
  const doc = exportLottie(mod, { width: w, height: h, fps, measurer, onWarn: (m) => warnings.push(m), encodePng });
  const rtMod = importLottie(doc).toSceneModule();
  const rtScene = rtMod.createScene();
  const rtBackend = new SkiaBackend(w, h);
  // FONT CONSISTENCY: importLottie does NOT preserve the timeline's font-asset
  // declarations, so the round-trip's own `doc` names none — the re-render would
  // rely on whatever the reference leg happened to register globally AND emit a
  // spurious "unregistered font family" validation error. Carry the ORIGINAL
  // scene's FONT assets onto the round-trip leg's env so it registers + validates
  // the SAME faces the reference/export did — text geometry is then identical when
  // the export is faithful (no false residual on text). (Only font assets are
  // merged; the round-trip's own image/video assets stay untouched.)
  const fontAssets = Object.fromEntries(
    Object.entries(mod.timeline.assets ?? {}).filter(([, a]) => (a as { kind?: string }).kind === 'font'),
  );
  const rtEnvDoc: Timeline = { ...rtMod.timeline, assets: { ...(rtMod.timeline.assets ?? {}), ...fontAssets } };
  await prepareSkiaRenderEnv({ scene: rtScene, doc: rtEnvDoc, backend: rtBackend, modulePath: opts.modulePath });

  const parsedWarns = warnings.map(parseWarn);

  // per-node residual accumulation across the sampled frames (worst wins), with the
  // COVERAGE fraction (residual tiles / bbox tiles) + region MEAN — the two
  // discriminators that separate a real drop from sub-pixel edge-AA/compositing.
  interface NodeAcc {
    region: Box;
    worst: number;
    /** mean SSIM over the node's residual tiles at the worst frame (benign vs real). */
    mean: number;
    frame: number;
    role: { role: string; weight: number };
    /** residual tiles / node bbox tiles at the worst frame — the drop discriminator. */
    coverage: number;
  }
  const nodeAcc = new Map<string, NodeAcc>();
  let orphanAcc: { region: Box; worst: number; frame: number; tiles: number } | null = null;
  let anyResidual = false;

  for (const frame of frames) {
    const t = frame / fps;
    const { displayList, ids } = withDeterminismGuards('throw', () => emitWithIds(refScene, mod.timeline, t));
    refBackend.render(displayList);
    const refRgba = await refBackend.readPixels();
    const rtDl = withDeterminismGuards('throw', () => evaluate(rtScene, rtMod.timeline, t));
    rtBackend.render(rtDl);
    const rtRgba = await rtBackend.readPixels();

    const map = ssimMap(refRgba, rtRgba, w, h);
    const bounds = walkBounds(displayList, ids);
    const { perNode, orphan } = attributeResiduals(map, bounds, floor);

    for (const [id, res] of perNode) {
      const nb = bounds.get(id);
      const coverage = nb ? res.count / bboxTileArea(nb.bounds, map.win) : 1;
      const ex = nodeAcc.get(id);
      if (!ex || res.worst < ex.worst) {
        nodeAcc.set(id, { region: res.region, worst: res.worst, mean: res.sum / res.count, frame, role: regionRole(res.region, w, h), coverage });
      }
    }
    if (orphan && orphan.count >= MIN_ORPHAN_TILES) {
      anyResidual = true;
      if (!orphanAcc || orphan.worst < orphanAcc.worst) {
        orphanAcc = { region: orphan.region, worst: orphan.worst, frame, tiles: orphan.count };
      }
    }
  }

  // ── FUSE → findings ──
  const findings: SceneDiagnostic[] = [];
  const emittedCauses = new Set<string>();
  const warnByNode = new Map<string, ParsedWarn>();
  for (const pw of parsedWarns) if (pw.node !== undefined && !warnByNode.has(pw.node)) warnByNode.set(pw.node, pw);

  // STRUCTURAL drop extents + the inverse node→drops index. Absorption is by
  // structural membership (subtree / driver-target), NEVER bare geometric overlap:
  // an INDEPENDENT residual that merely sits inside a drop's bbox is NOT in its
  // extent, so it stays UNEXPLAINED (the Direction-2 guard against silent false-negatives).
  const dropExtents = buildDropExtents(refScene, parsedWarns);
  const explainedBy = new Map<string, DropExtent[]>();
  for (const ext of dropExtents) {
    for (const id of ext.ids) {
      const list = explainedBy.get(id);
      if (list) list.push(ext);
      else explainedBy.set(id, [ext]);
    }
  }

  // (1) ATTRIBUTE + STRUCTURAL COALESCE. Each residual node → the drop that
  // structurally explains it: (guard 2) its OWN warn first; else the drop whose
  // structural extent CONTAINS it (subtree/driver-target — coalesced to ONE finding);
  // else a candidate for UNEXPLAINED / ANCHOR_RECENTER / benign-compositing.
  interface Attribution {
    region: Box;
    worst: number;
    mean: number;
    frame: number;
    role: { role: string; weight: number };
    warn?: ParsedWarn;
    node?: string;
    /** the residual node ids coalesced under this key (guard 4 — masked but recorded). */
    coalesced: Set<string>;
    /** false when unwarned AND below the coverage gate (edge-AA, not a divergence). */
    real: boolean;
  }
  const attributed = new Map<string, Attribution>();
  const merge = (key: string, node: string | undefined, acc: NodeAcc, warn: ParsedWarn | undefined, real: boolean, from: string): void => {
    const ex = attributed.get(key);
    if (!ex) {
      attributed.set(key, {
        region: { ...acc.region },
        worst: acc.worst,
        mean: acc.mean,
        frame: acc.frame,
        role: acc.role,
        ...(warn ? { warn } : {}),
        ...(node !== undefined ? { node } : {}),
        coalesced: new Set(key === from ? [] : [from]),
        real,
      });
      return;
    }
    ex.region.minX = Math.min(ex.region.minX, acc.region.minX);
    ex.region.minY = Math.min(ex.region.minY, acc.region.minY);
    ex.region.maxX = Math.max(ex.region.maxX, acc.region.maxX);
    ex.region.maxY = Math.max(ex.region.maxY, acc.region.maxY);
    if (acc.worst < ex.worst) {
      ex.worst = acc.worst;
      ex.mean = acc.mean;
      ex.frame = acc.frame;
      ex.role = acc.role;
    }
    if (key !== from) ex.coalesced.add(from);
    ex.real = ex.real || real;
  };
  for (const [id, acc] of nodeAcc) {
    if (warnByNode.has(id)) {
      merge(id, id, acc, warnByNode.get(id)!, true, id); // guard 2: own-warn-first
      continue;
    }
    const exts = explainedBy.get(id);
    if (exts && exts.length > 0) {
      // deterministic pick: smallest key (tie-free — keys are unique per warn).
      const ext = exts.reduce((a, b) => (a.key <= b.key ? a : b));
      merge(ext.key, ext.node, acc, ext.warn, true, id); // structural coalesce
      continue;
    }
    // unwarned, not structurally explained → real only past the coverage gate.
    merge(id, id, acc, undefined, acc.coverage >= COVERAGE_MIN, id);
  }

  for (const [, at] of attributed) {
    if (!at.real) continue; // sub-coverage edge-AA flicker — not a divergence
    anyResidual = true;
    const coalesced = [...at.coalesced].sort();
    if (at.warn) {
      emittedCauses.add(at.warn.cause);
      findings.push(dropFinding(at.warn, at.node, at.region, at.frame, round(at.worst), at.role, coalesced));
    } else {
      const node = at.node !== undefined ? refScene.nodes.get(at.node) : undefined;
      const nonCenterAnchor = node?.hasAnchor === true && (node.anchor[0] !== 0.5 || node.anchor[1] !== 0.5);
      if (nonCenterAnchor) {
        // Class II: a non-center anchor mis-exports (Lottie re-centers) — REPORT-ONLY.
        findings.push(anchorFinding(at.node!, node!.anchor, at.region, at.frame, round(at.worst), at.role));
      } else if (at.mean >= BENIGN_MEAN_FLOOR) {
        // Class III: benign sub-pixel compositing (Stack/sequence), not a feature drop.
        findings.push(compositingApprox(at.node, at.region, at.frame, round(at.mean), at.role));
      } else {
        findings.push(unexplained(at.node, at.region, at.frame, round(at.worst), at.role));
      }
    }
  }

  // (2) every warn → a finding even if no residual localized (invariant iii).
  for (const warn of parsedWarns) {
    if (emittedCauses.has(warn.cause)) continue;
    findings.push(dropFinding(warn, warn.node, null, frames[0] ?? 0, null, null, []));
    emittedCauses.add(warn.cause);
  }

  // (3) orphan residual tiles → UNEXPLAINED_RESIDUAL (never-silent).
  if (orphanAcc) {
    findings.push(unexplained(undefined, orphanAcc.region, orphanAcc.frame, round(orphanAcc.worst), regionRole(orphanAcc.region, w, h)));
  }

  const sorted = sortDiagnostics(findings);

  // The 3 correlation invariants (the measured gain):
  // (i) region-overlaps-residual — every warned finding WITH a localized region
  //     overlaps its source residual tiles (region IS the residual-tile union, so
  //     this holds by construction; asserted to catch a future regression).
  const invRegionOverlaps = sorted.every((f) => {
    if (f.detail?.expected !== true) return true;
    const region = f.detail?.region as Box | undefined;
    return region === undefined || boxesOverlap(region, region);
  });
  // (ii) every-residual-has-cause — any residual above floor produced a finding
  //      carrying a region (zero unattributed residual = zero silent divergence).
  const everyResidualHasCause = !anyResidual || sorted.some((f) => f.detail?.region !== undefined);
  // (iii) every-warn-has-finding — every captured export warn has a structured entry.
  const everyWarnHasFinding = parsedWarns.every((pw) => sorted.some((f) => f.detail?.cause === pw.cause));

  // baseline: a NEW expected finding whose key is absent from the pin still flags.
  const keyOf = (f: SceneDiagnostic): string => `${f.node ?? ''}|${f.code}|${String(f.detail?.property ?? '')}`;
  const baseline = new Set(opts.baseline ?? []);
  const newExpected = opts.baseline
    ? sorted.filter((f) => f.detail?.expected === true && !baseline.has(keyOf(f))).map(keyOf)
    : [];

  // views: default = error only; --all = every finding; a NEW expected drop (baseline
  // mode) also surfaces even though it is expected.
  const view = opts.all
    ? sorted
    : sorted.filter((f) => f.severity === 'error' || (opts.baseline !== undefined && f.detail?.expected === true && newExpected.includes(keyOf(f))));

  const hasErrors = sorted.some((f) => f.severity === 'error');
  const result: Omit<SemanticParityResult, 'report'> = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    findings: sorted,
    view,
    warnings,
    hasErrors,
    invariants: { regionOverlapsResidual: invRegionOverlaps, everyResidualHasCause, everyWarnHasFinding },
    newExpected,
    width: w,
    height: h,
    floor,
    frames,
  };
  return { ...result, report: formatReport(result, opts) };
}

// ── finding builders ──────────────────────────────────────────────────────────

function dropFinding(
  warn: ParsedWarn,
  node: string | undefined,
  region: Box | null,
  frame: number,
  ssim: number | null,
  role: { role: string; weight: number } | null,
  coalesced: readonly string[] = [],
): SceneDiagnostic {
  const code = warn.approximate ? 'LOTTIE_APPROXIMATE' : 'LOTTIE_DROP';
  const severity = warn.approximate ? 'warning' : 'info'; // expected:true → masked from default
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code,
    severity,
    source: 'parity',
    ...(node !== undefined ? { node } : {}),
    message: `${warn.property} on ${node ? `'${node}'` : 'an unnamed node'} ${warn.approximate ? 'exports DEGRADED' : 'is DROPPED'} by Lottie export — ${warn.cause}`,
    detail: {
      property: warn.property,
      cause: warn.cause,
      frame,
      expected: true,
      ...(region ? { region: roundBox(region) } : {}),
      ...(ssim !== null ? { ssim } : {}),
      ...(role ? { role: role.role, roleWeight: role.weight } : {}),
      // guard 4: the descendant/target residual node ids this drop structurally
      // absorbed (masked-but-RECORDED — never fully silent).
      ...(coalesced.length > 0 ? { coalesced } : {}),
    },
  };
}

/** Class III: an UNWARNED but BENIGN sub-pixel compositing residual (Stack/sequence
 *  rounding) — tagged LOTTIE_APPROXIMATE (expected:true → masked from the default
 *  error view) so it doesn't alarm as an episode-breaking UNEXPLAINED. */
function compositingApprox(
  node: string | undefined,
  region: Box,
  frame: number,
  meanSsim: number,
  role: { role: string; weight: number },
): SceneDiagnostic {
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'LOTTIE_APPROXIMATE',
    severity: 'warning', // masked from the default error-only view
    source: 'parity',
    ...(node !== undefined ? { node } : {}),
    message:
      `${node ? `node '${node}'` : 'a region'} shows a BENIGN sub-pixel compositing difference on the Lottie ` +
      `round-trip (mean ssim ${meanSsim}, no feature dropped) — a rounding/layer-order approximation, not a loss.`,
    detail: {
      property: 'compositing-approx',
      frame,
      region: roundBox(region),
      ssim: meanSsim,
      expected: true,
      role: role.role,
      roleWeight: role.weight,
    },
  };
}

function anchorFinding(
  id: string,
  anchor: readonly [number, number],
  region: Box,
  frame: number,
  ssim: number,
  role: { role: string; weight: number },
): SceneDiagnostic {
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'ANCHOR_RECENTER',
    severity: 'warning', // REPORT-ONLY in 0.61 — masked from the error-only default view
    source: 'parity',
    node: id,
    message:
      `node '${id}' has a non-center anchor [${round(anchor[0])}, ${round(anchor[1])}] that Lottie export re-centers ` +
      `(MIS-export — wrong pixels, not absent). Report-only in 0.61 (the anchor-correct-export fix is 0.68).`,
    detail: {
      fromAnchor: [round(anchor[0]), round(anchor[1])],
      toAnchor: 'center',
      frame,
      region: roundBox(region),
      ssim,
      expected: false,
      role: role.role,
      roleWeight: role.weight,
    },
  };
}

function unexplained(
  node: string | undefined,
  region: Box,
  frame: number,
  ssim: number,
  role: { role: string; weight: number } | null,
): SceneDiagnostic {
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'UNEXPLAINED_RESIDUAL',
    severity: 'error', // the never-silent teeth — the ONLY thing in the default view
    source: 'parity',
    ...(node !== undefined ? { node } : {}),
    message:
      `${node ? `node '${node}'` : 'a residual region'} diverges on the Lottie round-trip (ssim ${ssim}) with NO ` +
      `matching export warn — an UNEXPLAINED divergence (the episode-breaking class). Investigate: this loss is silent.`,
    detail: {
      frame,
      region: roundBox(region),
      ssim,
      expected: false,
      ...(role ? { role: role.role, roleWeight: role.weight } : {}),
    },
  };
}

// ── report ──────────────────────────────────────────────────────────────────

function formatReport(r: Omit<SemanticParityResult, 'report'>, opts: SemanticParityOptions): string {
  const lines: string[] = [];
  lines.push(
    `gs parity --semantic — Skia↔Lottie round-trip @ ${r.width}×${r.height}, floor ${r.floor}, ` +
      `frames ${r.frames.join(',')} — ${r.findings.length} finding${r.findings.length === 1 ? '' : 's'}` +
      `${opts.all ? '' : ` (${r.view.length} in default error-only view; --all for every finding)`}`,
  );
  for (const f of r.view) {
    const where = f.node ? ` [${f.node}]` : '';
    lines.push(`  ${f.severity.toUpperCase()} ${f.code}${where}: ${f.message}`);
  }
  const inv = r.invariants;
  lines.push(
    `  invariants: region-overlaps-residual ${inv.regionOverlapsResidual ? '✓' : '✗'}, ` +
      `every-residual-has-cause ${inv.everyResidualHasCause ? '✓' : '✗'}, ` +
      `every-warn-has-finding ${inv.everyWarnHasFinding ? '✓' : '✗'}`,
  );
  if (opts.baseline !== undefined) {
    lines.push(
      r.newExpected.length === 0
        ? `  baseline: PASS — no NEW expected drop`
        : `  baseline: FAIL — ${r.newExpected.length} NEW expected drop(s) absent from the pin: ${r.newExpected.join(', ')}`,
    );
  }
  lines.push(
    r.hasErrors
      ? `  FAIL — ${r.findings.filter((f) => f.severity === 'error').length} UNEXPLAINED residual(s) (the never-silent alarm)`
      : `  PASS — every residual is a warn-explained (expected) drop`,
  );
  return lines.join('\n');
}
