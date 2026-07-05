// @glissade/scene/critique — 0.60 machine-readable RENDERED diagnostics.
//
// critique(scene, timeline) is the rendered-geometric half of the diagnostic
// boundary 0.59 drew (validateScene = the static-structural half). It is a PURE
// READ of the DisplayList IR — it calls `evaluate`/`emitWithIds` but NEVER alters
// evaluate()'s behaviour or any render path, so every golden stays byte-identical.
//
// LAYERED, SHORT-CIRCUIT on static errors:
//   1. validateScene(scene, timeline) FIRST.
//   2. If any severity:'error' → SHORT-CIRCUIT: return the static errors +
//      renderedSkipped, and DO NOT run the rendered pass (an unbindable scene
//      would cascade bogus rendered geometry from one root cause).
//   3. Static clean / warnings-only → bindScene(scene, timeline) (critique MUST
//      bind before reading resolved/rendered values), then run the rendered pass.
//   4. Return a FLAT merged, CANONICALLY-SORTED diagnostics[] + renderedSkipped.
//
// The rendered pass samples a FIXED INTEGER-frame grid — frame i ∈ [0..floor(
// duration*fps)] at t = i/fps (ONE canonical division, at the timeline's own fps,
// NEVER adaptive/float times) — so the output is identical run-to-run. At each
// frame it runs emitWithIds() (byte-equal to evaluate()) and walks `commands`
// maintaining its own transform stack (the golden-tested raster2d walk), unioning
// each command's device-space bbox per node id. Span checks aggregate per node
// across the grid.
//
// This module lives on the tree-shakeable @glissade/scene/diagnostics subpath
// (never the base scene index), so the SACRED base embed pays zero bytes for it.

import { compileTimeline, parseColor, type Timeline } from '@glissade/core';
import { IDENTITY, multiply, type Mat2x3 } from './matrix.js';
import {
  type DisplayList,
  type FontSpec,
  type Paint,
  type PathSeg,
  type Resource,
} from './displayList.js';
import { emitWithIds } from './identity.js';
import { type Region } from './diff.js';
import { validateRegion } from './region.js';
import { bindScene, type Scene } from './scene.js';
import { Group, Text } from './nodes.js';
import { isEstimatingMeasurer, quantize, type TextMeasurer } from './text.js';
import {
  validateScene,
  resolveAt,
  DIAGNOSTIC_SCHEMA_VERSION,
  type SceneDiagnostic,
} from './validate.js';

// ── options + result ─────────────────────────────────────────────────────────

/**
 * 0.64 — a RESERVED region (e.g. the bottom caption band): a FILL-zone for its
 * OWNER node and a FORBIDDEN-zone for everything else. A thin wrapper over the
 * shared {@link Region} (kept pure — never a render input, only a CRITIQUE input),
 * so every golden stays byte-identical.
 *
 * `owner` is the node id ALLOWED to fill the region — it AND its whole subtree are
 * subtree-matched as exempt (a caption plus its word/line split children never
 * self-collide). A Text node that OWNS a SafeArea also gets the band's height
 * (`bounds.maxY - bounds.minY`) as its EFFECTIVE height-box for the existing
 * TEXT_OVERFLOW-height check (critique-only — no render `box.h` is ever set).
 */
export interface SafeArea {
  /** The reserved band in device px (integer bounds; the shared diff `Region`). */
  bounds: Region;
  /** The node id allowed to FILL the region (subtree-matched: the owner + its
   *  descendants are exempt from CAPTION_COLLISION). */
  owner?: string;
}

export interface CritiqueOptions {
  /**
   * frames-per-second for the sampling grid. Default: the timeline's own fps,
   * else 60 (aligning critique verdicts with what `gs render` produces). Kept an
   * override for tooling; a fixed INTEGER-frame grid is the determinism contract.
   */
  fps?: number;
  /**
   * Author-declared INTENTIONALLY off-stage node ids — the OFF_CANVAS opt-out.
   * A node is exempt from OFF_CANVAS iff its id is in this list OR ANY of its
   * ancestors' ids is (SUBTREE match): list the parked GROUP id
   * (`'sd1-drawer'`) and its whole subtree — current children AND any it later
   * gains — is suppressed, while sibling groups stay fully checked. This lets an
   * author silence the true-positive-but-intentional off-stage art (wing-parked
   * drawers, hidden placeholder cards) without muting OFF_CANVAS wholesale. A
   * PURE emission filter — determinism-neutral (it never changes the sampled
   * geometry, only which off-frame nodes are reported). Same param-seam shape as
   * a future `safeAreas`; a per-node `offstage:true` marker is a planned
   * fast-follow, not this mechanism.
   */
  offstage?: readonly string[];
  /**
   * 0.63.1 — the legibility FLOOR (px) the geometry `fontSize` auto-fix must not
   * sink below. A TEXT_OVERFLOW offers the `fontSize` geometry lever ONLY when the
   * shrink-to-fit lands ≥ this floor (else the overflow escalates instead of
   * auto-shrinking to an unreadable caption). Gates BOTH the width- and
   * height-overflow feasibility. Default 6 (mirrors `fitText({ minPx })`) — omitting
   * it is byte-identical to prior behaviour. A PURE feasibility-partition param: it
   * never touches the sampled geometry / render path, so every golden stays
   * byte-identical. Raise it for a stricter legibility bar, lower it (e.g. 1) to let
   * the fix shrink text further.
   */
  minLegiblePx?: number;
  /**
   * 0.64 — RESERVED regions (e.g. the caption band). A non-owner node whose
   * on-stage composed box intrudes one for its whole on-stage span raises
   * CAPTION_COLLISION; the band OWNER (and its subtree) FILL it and are exempt. A
   * caption OWNING a band also gets the band height as its effective height-box for
   * the TEXT_OVERFLOW-height check, and a resize (box.h/width grow) that would push
   * a non-owner into a band is infeasible. A PURE critique input — never a render
   * input (no node gets a `box.h`), so every golden stays byte-identical. Build one
   * with `captionSafeArea(size)` from @glissade/narrate.
   */
  safeAreas?: readonly SafeArea[];
}

/**
 * 0.63 — the MEANING-PRESERVATION veto class of a single fix LEVER. A `'geometry'`
 * lever changes only layout/pose/size (reflow, resize box, move, widen, restack) —
 * the loop may AUTO-apply it. A `'content'` lever changes MEANING (truncate/reword
 * a caption — verified dialog) — the loop must NEVER auto-apply it; it escalates to
 * a human. Per-LEVER (not per-diagnostic) so one diagnostic can offer BOTH: any
 * geometry lever ⇒ still auto-fixable, all-content ⇒ escalate.
 */
export type FixClass = 'geometry' | 'content';

/** One decidable way to resolve a diagnostic, tagged with its meaning-preservation
 *  {@link FixClass}. `lever` is a stable machine token (the prop to touch);
 *  `hint` is the human prose. A diagnostic carries a LIST of these in
 *  `detail.fixHints` (additive to the pinned schema — no version bump). */
export interface FixHint {
  /** The stable lever token — the prop/dimension to adjust (e.g. `'fontSize'`, `'width'`, `'position'`, `'zIndex'`, `'text'`). */
  lever: string;
  /** geometry (auto-fixable) vs content (escalate — never auto-applied). */
  fixClass: FixClass;
  /** Human-readable description of applying this lever. */
  hint: string;
}

export interface CritiqueResult {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  /** true iff any diagnostic has severity `error` (always a static error — the
   *  rendered pass emits only warnings/info). */
  hasErrors: boolean;
  /** FLAT merged, CANONICALLY-SORTED diagnostics (static + rendered). */
  diagnostics: SceneDiagnostic[];
  /** true when the rendered pass was skipped because static validation errored. */
  renderedSkipped: boolean;
  /** why the rendered pass was skipped (present iff `renderedSkipped`). */
  renderedSkipReason?: string;
  /** how many integer-frame grid samples the rendered pass took (0 if skipped). */
  sampledFrames: number;
}

// ── bbox helpers (copied from raster2d's golden-tested walk) ──────────────────

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function growBounds(b: Bounds | null, x: number, y: number): Bounds {
  if (!b) return { minX: x, minY: y, maxX: x, maxY: y };
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
  return b;
}

/** Local-space rect → device-space box under `m`, growing `into`. */
function accumulateRect(into: Bounds | null, m: Mat2x3, x0: number, y0: number, x1: number, y1: number): Bounds | null {
  let b = into;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
    b = growBounds(b, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
  }
  return b;
}

/** Control-point bounding box of a path — curves/rotated ellipses stay inside. */
function segsBounds(segs: PathSeg[]): Bounds | null {
  let b: Bounds | null = null;
  const pt = (x: number, y: number) => {
    b = growBounds(b, x, y);
  };
  for (const seg of segs) {
    switch (seg[0]) {
      case 'M':
      case 'L':
        pt(seg[1], seg[2]);
        break;
      case 'C':
        pt(seg[1], seg[2]);
        pt(seg[3], seg[4]);
        pt(seg[5], seg[6]);
        break;
      case 'Q':
        pt(seg[1], seg[2]);
        pt(seg[3], seg[4]);
        break;
      case 'E': {
        const r = Math.max(seg[3], seg[4]);
        pt(seg[1] - r, seg[2] - r);
        pt(seg[1] + r, seg[2] + r);
        break;
      }
    }
  }
  return b;
}

/** Canvas 2D font string (mirrors raster2d.fontString). */
function fontString(font: FontSpec): string {
  const style = font.style === 'italic' ? 'italic ' : '';
  const weight = font.weight !== undefined && font.weight !== 400 ? `${font.weight} ` : '';
  return `${style}${weight}${font.size}px ${font.family}`;
}

function pathResourceBounds(resources: Resource[], id: number): Bounds | null {
  const res = resources[id];
  return res && res.kind === 'path' ? segsBounds(res.segs) : null;
}

/** True when two boxes overlap the open frame [0,0,w,h] (bbox ∩ frame ≠ ∅). */
function intersectsFrame(b: Bounds, w: number, h: number): boolean {
  return b.maxX > 0 && b.minX < w && b.maxY > 0 && b.minY < h;
}

/** True when `b` is FULLY outside the frame (off one edge entirely). */
function fullyOutsideFrame(b: Bounds, w: number, h: number): boolean {
  return b.maxX <= 0 || b.minX >= w || b.maxY <= 0 || b.minY >= h;
}

/** True when `outer` fully contains `inner` (bbox containment). */
function contains(outer: Bounds, inner: Bounds): boolean {
  return outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;
}

/** True when a device-space box overlaps a reserved {@link Region} (bbox ∩ region
 *  ≠ ∅) — the SAME open-interval intersection shape as {@link intersectsFrame},
 *  deterministic run-to-run (identical recomputation; no float rounding). */
function intersectsRegion(b: Bounds, r: Region): boolean {
  return b.maxX > r.minX && b.minX < r.maxX && b.maxY > r.minY && b.minY < r.maxY;
}

// ── per-frame walk ────────────────────────────────────────────────────────────

/** A solid-opaque fill under a fully-opaque group stack — an OCCLUSION candidate. */
interface Occluder {
  bounds: Bounds;
  /** command index = painter's z-order (higher = on top). */
  order: number;
  /** emitting node id (for the fix-hint), or undefined for an unnamed node. */
  id: string | undefined;
}

/** A Text fillText run attributed to a node (for TEXT_OVERFLOW). */
interface TextRun {
  text: string;
  font: FontSpec;
}

interface FrameNode {
  bounds: Bounds;
  /** highest command index attributed to this node (its last paint). */
  maxOrder: number;
  texts: TextRun[];
}

interface FrameWalk {
  nodes: Map<string, FrameNode>;
  occluders: Occluder[];
}

/**
 * Walk one DisplayList (+ its id stream) maintaining a transform stack and a group
 * stack, unioning each command's device-space bbox per node id. Solid-opaque fills
 * under a fully-opaque group stack are recorded as occluders. COPIES the golden-
 * tested save/restore/transform/pushGroup/popGroup discipline from raster2d.
 */
function walkFrame(list: DisplayList, ids: readonly (string | undefined)[], measurer: TextMeasurer): FrameWalk {
  const nodes = new Map<string, FrameNode>();
  const occluders: Occluder[] = [];

  let mat: Mat2x3 = IDENTITY;
  const matStack: Mat2x3[] = [];
  // count of enclosing groups that are NOT fully opaque/plain (opacity<1, non-
  // source-over blend, any filter, or a matte). 0 ⇒ a solid opaque fill is a
  // genuine cover.
  let nonOpaqueGroupDepth = 0;
  const groupOpaque: boolean[] = [];

  const attribute = (id: string | undefined, box: Bounds | null, order: number): void => {
    if (id === undefined || box === null) return;
    const existing = nodes.get(id);
    if (existing) {
      existing.bounds = accumulateRect(existing.bounds, IDENTITY, box.minX, box.minY, box.maxX, box.maxY)!;
      if (order > existing.maxOrder) existing.maxOrder = order;
    } else {
      nodes.set(id, { bounds: { ...box }, maxOrder: order, texts: [] });
    }
  };

  const commands = list.commands;
  for (let ci = 0; ci < commands.length; ci++) {
    const cmd = commands[ci]!;
    const id = ids[ci];
    switch (cmd.op) {
      case 'save':
        matStack.push(mat);
        break;
      case 'restore':
        mat = matStack.pop() ?? mat;
        break;
      case 'transform':
        mat = multiply(mat, cmd.m);
        break;
      case 'clip':
        break; // clip shrinks the painted region — ignoring keeps bounds conservative
      case 'fillPath': {
        const pb = pathResourceBounds(list.resources, cmd.path);
        if (!pb) break;
        const box = accumulateRect(null, mat, pb.minX, pb.minY, pb.maxX, pb.maxY);
        attribute(id, box, ci);
        // OCCLUSION candidate: a solid opaque paint under a fully-opaque stack.
        if (box && nonOpaqueGroupDepth === 0 && isOpaqueSolid(cmd.paint)) {
          occluders.push({ bounds: box, order: ci, id });
        }
        break;
      }
      case 'strokePath': {
        const pb = pathResourceBounds(list.resources, cmd.path);
        if (!pb) break;
        const o = cmd.stroke.width * ((cmd.stroke.join ?? 'miter') === 'miter' ? 5 : 1);
        attribute(id, accumulateRect(null, mat, pb.minX - o, pb.minY - o, pb.maxX + o, pb.maxY + o), ci);
        break;
      }
      case 'fillText': {
        let width = 0;
        try {
          width = measurer.measureText(cmd.text, cmd.font).width;
        } catch {
          width = cmd.text.length * cmd.font.size * 0.6; // conservative fallback box
        }
        const align = cmd.align ?? 'left';
        const x0 = align === 'center' ? cmd.x - width / 2 : align === 'right' ? cmd.x - width : cmd.x;
        const m = cmd.font.size;
        const box = accumulateRect(null, mat, x0 - m, cmd.y - 1.5 * m, x0 + width + m, cmd.y + 0.75 * m);
        attribute(id, box, ci);
        if (id !== undefined) nodes.get(id)!.texts.push({ text: cmd.text, font: cmd.font });
        break;
      }
      case 'drawImage': {
        const { x, y, w: dw, h: dh } = cmd.dst;
        attribute(id, accumulateRect(null, mat, x, y, x + dw, y + dh), ci);
        break;
      }
      case 'pushGroup': {
        const opaque =
          cmd.opacity >= 1 && cmd.blend === 'source-over' && cmd.filters.length === 0 && cmd.matte === undefined;
        groupOpaque.push(opaque);
        if (!opaque) nonOpaqueGroupDepth++;
        break;
      }
      case 'popGroup': {
        const opaque = groupOpaque.pop();
        if (opaque === false) nonOpaqueGroupDepth--;
        break;
      }
    }
  }
  return { nodes, occluders };
}

/** Is a paint a SOLID opaque color (alpha ≥ ~0.98)? Conservative: gradient/mesh
 *  and any un-parseable color count as NOT opaque (false-negatives are fine, a
 *  false cover is not). */
function isOpaqueSolid(paint: Paint): boolean {
  if (!paint || paint.kind !== 'color') return false;
  try {
    return parseColor(paint.color).a >= 0.98;
  } catch {
    return false;
  }
}

// ── per-node aggregation across the grid ──────────────────────────────────────

interface NodeAgg {
  onStage: number;
  /** on-stage frames where the composed box is FULLY outside the frame. */
  offCanvas: number;
  /** on-stage frames where the box ∩ frame ≠ ∅ AND a single opaque occluder
   *  (painted after this node) fully contains it. */
  occluded: number;
  /** last on-stage frame index seen (for representative fix-hint geometry). */
  lastFrame: number;
  lastT: number;
  lastBounds: Bounds;
  /** occluder id/bounds at the last covered frame (for the hint). */
  occluderId: string | undefined;
  occluderBounds: Bounds | null;
  /** text runs at the last on-stage frame the node carried text. */
  lastTextFrameT: number;
  lastTexts: TextRun[];
  /** 0.64 — per-SafeArea count of on-stage frames whose box intruded that band
   *  (indexed by the `opts.safeAreas` position). A CAPTION_COLLISION fires for a
   *  non-owner whose count === onStage (intrudes its WHOLE on-stage span). */
  bandCollide: number[];
}

// ── the primitive ─────────────────────────────────────────────────────────────

/**
 * Rendered-geometric diagnostics for `(scene, timeline)`. Runs `validateScene`
 * first; short-circuits the rendered pass on any static error. Otherwise binds the
 * scene, samples a fixed integer-frame grid, and emits OFF_CANVAS / TEXT_OVERFLOW
 * / OCCLUSION where a span check fires. PURE READ — never changes evaluate() or a
 * render path; canonically-sorted (frame, then code, then node-id) output.
 */
export function critique(scene: Scene, timeline: Timeline, opts: CritiqueOptions = {}): CritiqueResult {
  const staticRes = validateScene(scene, timeline);
  const staticDiags = staticRes.diagnostics;

  if (staticRes.hasErrors) {
    return {
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      hasErrors: true,
      diagnostics: sortDiagnostics(staticDiags.slice()),
      renderedSkipped: true,
      renderedSkipReason:
        'fix static errors first — the scene can’t bind, so rendered geometry would be garbage.',
      sampledFrames: 0,
    };
  }

  // Static clean or warnings-only → bind, then run the rendered pass.
  bindScene(scene, timeline);
  const { w, h } = scene.size;
  const measurer = scene.textMeasurer;
  const estimating = isEstimatingMeasurer(measurer);
  const fps = opts.fps ?? timeline.fps ?? 60;
  // 0.63.1 — resolve the legibility floor once (default MIN_LEGIBLE_PX). Threaded
  // to BOTH textOverflowDiagnostic call sites (width + height) so a raised/lowered
  // floor gates the fontSize feasibility on both overflow axes identically.
  const minLegiblePx = opts.minLegiblePx ?? MIN_LEGIBLE_PX;
  // 0.64 — the reserved SafeArea bands (CAPTION_COLLISION + the owned-band
  // effective-box + the resize-feasibility bound). Empty ⇒ byte-identical behaviour.
  // 0.65 — every band's Region is INGESTED through the SHARED validateRegion (the
  // SAME boundary centerOn's `clear` uses): float bounds quantize to integers, a
  // negative-extent / non-finite band fails loud. So a hand-built Region and a
  // captionSafeArea(size) Region reach the collision check byte-identically.
  const safeAreas: readonly SafeArea[] = (opts.safeAreas ?? []).map((sa) => ({
    ...sa,
    bounds: validateRegion(sa.bounds, 'critique safeAreas'),
  }));
  const duration = compileTimeline(timeline).duration;
  const lastFrame = Math.max(0, Math.floor(duration * fps));

  const agg = new Map<string, NodeAgg>();
  const ensure = (id: string): NodeAgg => {
    let a = agg.get(id);
    if (!a) {
      a = {
        onStage: 0,
        offCanvas: 0,
        occluded: 0,
        lastFrame: -1,
        lastT: 0,
        lastBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        occluderId: undefined,
        occluderBounds: null,
        lastTextFrameT: 0,
        lastTexts: [],
        bandCollide: safeAreas.map(() => 0),
      };
      agg.set(id, a);
    }
    return a;
  };

  let sampledFrames = 0;
  for (let i = 0; i <= lastFrame; i++) {
    const t = i / fps;
    const { displayList, ids } = emitWithIds(scene, timeline, t);
    const frame = walkFrame(displayList, ids, measurer);
    sampledFrames++;

    for (const [id, fn] of frame.nodes) {
      const a = ensure(id);
      a.onStage++;
      a.lastFrame = i;
      a.lastT = t;
      a.lastBounds = fn.bounds;
      if (fn.texts.length > 0) {
        a.lastTextFrameT = t;
        a.lastTexts = fn.texts;
      }
      if (fullyOutsideFrame(fn.bounds, w, h)) a.offCanvas++;
      // 0.64 CAPTION_COLLISION accumulation: count on-stage frames whose box
      // intrudes each reserved band (integer-region intersection; deterministic).
      for (let si = 0; si < safeAreas.length; si++) {
        if (intersectsRegion(fn.bounds, safeAreas[si]!.bounds)) a.bandCollide[si]!++;
      }
      // OCCLUSION: on-frame AND fully covered by a single opaque occluder above it.
      if (intersectsFrame(fn.bounds, w, h)) {
        let cover: Occluder | undefined;
        for (const occ of frame.occluders) {
          if (occ.order > fn.maxOrder && contains(occ.bounds, fn.bounds)) {
            cover = occ;
            break;
          }
        }
        if (cover) {
          a.occluded++;
          a.occluderId = cover.id;
          a.occluderBounds = cover.bounds;
        }
      }
    }
  }

  const rendered: SceneDiagnostic[] = [];

  // OFF_CANVAS — a node off-frame its WHOLE on-stage life. Report only the
  // TOPMOST off-canvas node in a chain (a whole group moved off ⇒ one diagnostic,
  // not one per child).
  // Author-declared off-stage subtree (FIX #3a): a node is exempt from OFF_CANVAS
  // iff its id — or any ancestor's id — is in `offstage` (SUBTREE match), so a
  // parked group id suppresses its whole subtree.
  const offstageSet = new Set<string>(opts.offstage ?? []);
  const isOffstage = (id: string): boolean =>
    offstageSet.size > 0 && (offstageSet.has(id) || hasFlaggedAncestor(scene, id, offstageSet));

  const offCanvasIds = new Set<string>();
  for (const [id, a] of agg) {
    if (a.onStage > 0 && a.offCanvas === a.onStage && !isOffstage(id)) offCanvasIds.add(id);
  }
  const reportedOffCanvas = new Set<string>();
  for (const id of offCanvasIds) {
    if (hasFlaggedAncestor(scene, id, offCanvasIds)) continue;
    reportedOffCanvas.add(id);
    const a = agg.get(id)!;
    rendered.push(offCanvasDiagnostic(scene, id, a, w, h));
  }

  // TEXT_OVERFLOW — measured glyph ink exceeds a Text node's OWN box, at its
  // resting (last text-bearing) frame. Checked on BOTH axes (each fires only where
  // an explicit box on that axis EXISTS to overflow): WIDTH vs the wrap box
  // (`${id}/width`), HEIGHT vs the box height (`box.h`). Respects MEASURER_FALLBACK.
  for (const [id, a] of agg) {
    if (a.lastTexts.length === 0) continue;
    const node = scene.nodes.get(id);
    if (!(node instanceof Text)) continue;

    // WIDTH: widest measured line ink vs the wrap box. width<=0 = no wrap box.
    const width = numberAt(scene, `${id}/width`, a.lastTextFrameT);
    if (width !== undefined && width > 0) {
      let widest = 0;
      for (const run of a.lastTexts) {
        let mw = 0;
        try {
          mw = measurer.measureText(run.text, run.font).width;
        } catch {
          mw = 0;
        }
        if (mw > widest) widest = mw;
      }
      const over = widest - width;
      const wFontSize = a.lastTexts[0]!.font.size;
      if (over > 0.5)
        rendered.push(
          textOverflowDiagnostic(id, 'width', widest, width, over, estimating, wFontSize, w, h, minLegiblePx, {
            fixedBand: false,
            bounds: a.lastBounds,
            safeAreas,
            scene,
          }),
        );
    }

    // HEIGHT: the wrapped-block height vs an explicit `box.h`. The block height is
    // the DRAWN line grid — quantize(fontSize·lineHeight) · drawnLineCount — which
    // mirrors Text.intrinsicSize; each fillText run is one drawn line, so the run
    // count is the line count. Catches a caption/card whose wrapped text is TALLER
    // than its box (fits horizontally, clipped vertically). Auto-height text (no
    // `box.h`) has no vertical box, so it can't overflow one — no fire.
    // 0.64 (a): a caption OWNING a SafeArea has NO explicit `box.h`, so today the
    // height check never fired. Feed the OWNED band height as the EFFECTIVE
    // height-box — CRITIQUE-ONLY: we DO NOT set a render `box.h` on the node (that
    // would change rendered bytes), so every golden stays byte-identical. The band
    // is a FIXED reserved region, so its resize lever is dropped (`fixedBand`):
    // a too-tall caption shrinks-to-fit if ≥ minLegiblePx, else escalates content.
    let effH = node.box?.h;
    let fixedBand = false;
    if (effH === undefined) {
      const owned = safeAreas.find((sa) => sa.owner === id);
      if (owned) {
        effH = owned.bounds.maxY - owned.bounds.minY;
        fixedBand = true;
      }
    }
    if (effH !== undefined && effH > 0) {
      const fontSize = a.lastTexts[0]!.font.size;
      const blockH = quantize(fontSize * node.lineHeight) * a.lastTexts.length;
      const overH = blockH - effH;
      if (overH > 0.5)
        rendered.push(
          textOverflowDiagnostic(id, 'height', blockH, effH, overH, estimating, fontSize, w, h, minLegiblePx, {
            fixedBand,
            bounds: a.lastBounds,
            safeAreas,
            scene,
          }),
        );
    }
  }

  // OCCLUSION — a NON-container node, on-frame + fully covered by opaque
  // occluder(s) its WHOLE on-stage span. Mutually exclusive with OFF_CANVAS.
  for (const [id, a] of agg) {
    if (a.onStage === 0 || a.occluded !== a.onStage) continue;
    if (reportedOffCanvas.has(id) || offCanvasIds.has(id)) continue;
    const node = scene.nodes.get(id);
    if (!node || node instanceof Group) continue; // report leaf content, not containers
    rendered.push(occlusionDiagnostic(scene, id, a));
  }

  // CAPTION_COLLISION — a NON-OWNER node intruding a reserved SafeArea band for its
  // WHOLE on-stage span (the persistent-intruder discipline OFF_CANVAS/OCCLUSION
  // use). The band OWNER — and its subtree (a caption + its word/line split
  // children) — FILL the band, so they are subtree-matched exempt (no
  // self-collision). Integer-region intersection ⇒ deterministic (no flicker).
  for (const [id, a] of agg) {
    if (a.onStage === 0) continue;
    for (let si = 0; si < safeAreas.length; si++) {
      const sa = safeAreas[si]!;
      if (a.bandCollide[si] !== a.onStage) continue; // intrudes every on-stage frame
      if (isOwnedBy(scene, id, sa.owner)) continue; // owner + subtree fill the band
      rendered.push(captionCollisionDiagnostic(scene, id, a, sa));
    }
  }

  const diagnostics = sortDiagnostics([...staticDiags, ...rendered]);
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    hasErrors: false,
    diagnostics,
    renderedSkipped: false,
    sampledFrames,
  };
}

// ── diagnostic builders + fix-hints ───────────────────────────────────────────

function offCanvasDiagnostic(scene: Scene, id: string, a: NodeAgg, w: number, h: number): SceneDiagnostic {
  const b = a.lastBounds;
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  // dominant off-edge + magnitude (device px past the frame edge).
  let dir = 'off-frame';
  let need = '';
  const pos = vec2At(scene, `${id}/position`, a.lastT);
  const posStr = pos ? ` position [${round(pos[0])}, ${round(pos[1])}]` : '';
  if (b.maxX <= 0) {
    dir = `off the LEFT by ${round(-b.maxX)}px`;
    need = `; a center-anchored box needs x ≥ ~${round(bw / 2)} to sit on-frame`;
  } else if (b.minX >= w) {
    dir = `off the RIGHT by ${round(b.minX - w)}px`;
    need = `; a center-anchored box needs x ≤ ~${round(w - bw / 2)} to sit on-frame`;
  } else if (b.maxY <= 0) {
    dir = `off the TOP by ${round(-b.maxY)}px`;
    need = `; a center-anchored box needs y ≥ ~${round(bh / 2)} to sit on-frame`;
  } else if (b.minY >= h) {
    dir = `off the BOTTOM by ${round(b.minY - h)}px`;
    need = `; a center-anchored box needs y ≤ ~${round(h - bh / 2)} to sit on-frame`;
  }
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'OFF_CANVAS',
    severity: 'warning',
    source: 'critique',
    node: id,
    message:
      `node '${id}' renders fully outside the ${w}×${h} frame (bbox x:[${round(b.minX)},${round(b.maxX)}] ` +
      `y:[${round(b.minY)},${round(b.maxY)}], ${dir}) for its whole on-stage lifetime.${posStr}. ` +
      `Adjust its position/anchor to bring the box on-frame${need}.`,
    detail: {
      frame: a.lastFrame,
      bounds: { minX: round(b.minX), minY: round(b.minY), maxX: round(b.maxX), maxY: round(b.maxY) },
      size: { w, h },
      // 0.63 per-lever fix classes — moving the box on-frame is pure GEOMETRY, so
      // OFF_CANVAS is always auto-fixable (the loop adjusts position/anchor).
      fixHints: [
        { lever: 'position', fixClass: 'geometry', hint: 'move the node (position/anchor) so its box sits on-frame' },
      ] satisfies FixHint[],
    },
  };
}

/** The legibility floor a geometry `fontSize` fix must not sink below. Mirrors
 *  `fitText({ minPx })`'s default (type.ts) — the framework already refuses to
 *  size text below this, so a critique fix that would is INFEASIBLE, not a fix.
 *  Shrinking to fit is meaning-preserving ONLY while it stays legible. */
const MIN_LEGIBLE_PX = 6;

/** The feasibility-bounded fix levers for a TEXT_OVERFLOW. A geometry lever is
 *  included only when it can stay in-bounds (see {@link textOverflowDiagnostic});
 *  the content lever is always offered but never auto-applied. Built as a typed
 *  `FixHint[]` via `push` (not a spread of bare object literals) so `fixClass`
 *  stays narrowed to `FixClass` under `tsc --noEmit`. */
function buildTextOverflowHints(
  dimension: 'width' | 'height',
  measured: number,
  fontFeasible: boolean,
  resizeFeasible: boolean,
): FixHint[] {
  const hints: FixHint[] = [];
  if (fontFeasible) {
    hints.push({
      lever: 'fontSize',
      fixClass: 'geometry',
      hint:
        dimension === 'width' ? 'reduce fontSize until the line fits' : 'reduce fontSize so the wrapped block fits',
    });
  }
  if (resizeFeasible) {
    hints.push(
      dimension === 'width'
        ? { lever: 'width', fixClass: 'geometry', hint: `widen the wrap box to width ≥ ${round(measured)}` }
        : { lever: 'box.h', fixClass: 'geometry', hint: `increase the box height to ≥ ${round(measured)}` },
    );
  }
  hints.push({
    lever: 'text',
    fixClass: 'content',
    hint: 'shorten the text (changes meaning — escalate, never auto-apply)',
  });
  return hints;
}

/**
 * 0.64 — the resize-lever feasibility context. The resize (width / box.h GROW) lever
 * is dropped when growing the box to `measured` would leave the canvas (0.63.1) OR —
 * NEW — push into a SafeArea the node does NOT own, OR the "box" is a FIXED reserved
 * band (a caption's owned band, which cannot be grown). `bounds` is the node's device
 * box the grow extends from.
 */
interface ResizeContext {
  fixedBand: boolean;
  bounds: Bounds;
  safeAreas: readonly SafeArea[];
  scene: Scene;
}

function textOverflowDiagnostic(
  id: string,
  dimension: 'width' | 'height',
  measured: number,
  threshold: number,
  over: number,
  estimating: boolean,
  fontSize: number,
  canvasW: number,
  canvasH: number,
  minLegiblePx: number,
  resize: ResizeContext,
): SceneDiagnostic {
  // 0.63 — FEASIBILITY-BOUND the geometry levers (ai-training's content-seat catch:
  // an unbounded geometry fix converges to a readable-STRING-but-unreadable-CAPTION
  // — "clean" yet unshippable). A geometry lever is offered ONLY if it can stay
  // in-bounds: `fontSize` shrink must land ≥ MIN_LEGIBLE_PX; the resize lever
  // (width / box.h) must fit on-canvas. When BOTH are infeasible, only the content
  // `text` lever remains → the diagnostic is not geometry-fixable → assess()
  // ESCALATES it (the meaning-boundary one level deeper: the string is preserved,
  // but the loop refuses to auto-produce an unshippable result). Estimated metrics
  // are too coarse to drop a lever on, so bounding applies only to REAL measurement.
  const fitFontPx = measured > 0 ? fontSize * (threshold / measured) : fontSize;
  const fontFeasible = estimating || fitFontPx >= minLegiblePx;
  // 0.64 — resize feasibility now composes 0.63.1's canvas bound with the SafeArea
  // bound: a resize is infeasible if the box is a FIXED reserved band (can't grow),
  // if the grown box leaves the canvas, OR if the grown box would push into a
  // SafeArea the node does NOT own (the deferred safeArea resize-feasibility).
  const resizeFeasible = resizeLeverFeasible(id, dimension, measured, canvasW, canvasH, estimating, resize);
  const geometryExhausted = !fontFeasible && !resizeFeasible;

  // The fix-hint names the RIGHT lever per axis: a width overflow reaches for
  // width/fitText, a height overflow for the box height / shorter text.
  const base =
    dimension === 'width'
      ? `text of node '${id}' overflows its box WIDTH by ${round(over)}px ` +
        `(needs ${round(measured)}px, box width ${round(threshold)}px). ` +
        (geometryExhausted
          ? `No in-bounds geometry fix (fontSize would drop below ${minLegiblePx}px, and a box wide enough runs off-canvas) — shortening the text is a human decision.`
          : `Reduce fontSize, widen width, or wrap it with fitText({ maxW: ${round(threshold)} }).`)
      : `text of node '${id}' overflows its box HEIGHT by ${round(over)}px ` +
        `(wrapped block ${round(measured)}px tall, box height ${round(threshold)}px). ` +
        (geometryExhausted
          ? `No in-bounds geometry fix (fontSize would drop below ${minLegiblePx}px, and a box tall enough runs off-canvas) — shortening the text is a human decision.`
          : `Reduce fontSize, increase the box height, or shorten the text.`);
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'TEXT_OVERFLOW',
    // MEASURER_FALLBACK: the DL geometry came from the estimating measurer, so
    // don't assert a HARD overflow on estimated metrics — downgrade to info.
    severity: estimating ? 'info' : 'warning',
    source: 'critique',
    node: id,
    message: estimating
      ? `${base} (metrics ESTIMATED — no real text measurer injected; verify with the real backend measurer.)`
      : base,
    detail: {
      dimension,
      measured: round(measured),
      threshold: round(threshold),
      overflowPx: round(over),
      estimated: estimating,
      // 0.63 per-lever fix classes — up to TWO geometry levers (so TEXT_OVERFLOW
      // stays auto-fixable) PLUS one content lever ('shorten', never auto-applied:
      // a caption is verified dialog). The loop always prefers a geometry lever —
      // BUT a geometry lever is offered only while it stays IN-BOUNDS (fontSize ≥
      // MIN_LEGIBLE_PX, resize on-canvas). When both are infeasible only the
      // content lever remains → assess() escalates (human owns it). Estimated
      // metrics keep both geometry levers (too coarse to drop one on).
      fixHints: buildTextOverflowHints(dimension, measured, fontFeasible, resizeFeasible),
    },
  };
}

function occlusionDiagnostic(scene: Scene, id: string, a: NodeAgg): SceneDiagnostic {
  const occ = a.occluderId !== undefined ? `node '${a.occluderId}'` : 'an opaque layer painted above it';
  const pos = vec2At(scene, `${id}/position`, a.lastT);
  const posStr = pos ? ` (position [${round(pos[0])}, ${round(pos[1])}])` : '';
  const lever = a.occluderId !== undefined
    ? `raise '${id}' above '${a.occluderId}' (higher zIndex / paint order) OR move it outside '${a.occluderId}'’s bounds`
    : 'raise its zIndex above the covering layer OR move it out from under the cover';
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'OCCLUSION',
    severity: 'warning',
    source: 'critique',
    node: id,
    message:
      `node '${id}'${posStr} is fully covered by ${occ} (0 visible px) for its whole on-stage lifetime. ${lever}.`,
    detail: {
      frame: a.lastFrame,
      // 0.63 per-lever fix classes — restacking / moving out from under the cover
      // is pure GEOMETRY, so OCCLUSION is always auto-fixable.
      fixHints: [
        { lever: 'zIndex', fixClass: 'geometry', hint: 'raise its zIndex / paint order above the covering layer' },
        { lever: 'position', fixClass: 'geometry', hint: 'move it out from under the covering layer’s bounds' },
      ] satisfies FixHint[],
      ...(a.occluderId !== undefined ? { occluder: a.occluderId } : {}),
      ...(a.occluderBounds
        ? {
            occluderBounds: {
              minX: round(a.occluderBounds.minX),
              minY: round(a.occluderBounds.minY),
              maxX: round(a.occluderBounds.maxX),
              maxY: round(a.occluderBounds.maxY),
            },
          }
        : {}),
    },
  };
}

/**
 * 0.64 — is the resize (width / box.h grow) lever FEASIBLE? Composes 0.63.1's
 * canvas bound with the SafeArea bound. Estimated metrics keep it (too coarse to
 * drop a lever on). A FIXED reserved band (a caption's owned effective-box) cannot
 * be grown → infeasible. Otherwise the grow must both fit the canvas AND not push
 * into a SafeArea the node does not own.
 */
function resizeLeverFeasible(
  id: string,
  dimension: 'width' | 'height',
  measured: number,
  canvasW: number,
  canvasH: number,
  estimating: boolean,
  resize: ResizeContext,
): boolean {
  if (estimating) return true;
  if (resize.fixedBand) return false;
  if (measured > (dimension === 'width' ? canvasW : canvasH)) return false;
  const grown: Bounds =
    dimension === 'width'
      ? { ...resize.bounds, maxX: resize.bounds.minX + measured }
      : { ...resize.bounds, maxY: resize.bounds.minY + measured };
  for (const sa of resize.safeAreas) {
    if (isOwnedBy(resize.scene, id, sa.owner)) continue; // growing into one's OWN band is fine
    if (intersectsRegion(grown, sa.bounds)) return false; // grow would intrude a non-owned band
  }
  return true;
}

/** 0.64 CAPTION_COLLISION builder — a non-owner node persistently intruding a
 *  reserved band. The fix is pure GEOMETRY (move it above the band / out of the
 *  region), so it is auto-fixable (MVP: always offer the position lever). */
function captionCollisionDiagnostic(scene: Scene, id: string, a: NodeAgg, sa: SafeArea): SceneDiagnostic {
  const b = a.lastBounds;
  const r = sa.bounds;
  const band = sa.owner !== undefined ? `the reserved '${sa.owner}' band` : 'a reserved safe area';
  const pos = vec2At(scene, `${id}/position`, a.lastT);
  const posStr = pos ? ` (position [${round(pos[0])}, ${round(pos[1])}])` : '';
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'CAPTION_COLLISION',
    severity: 'warning',
    source: 'critique',
    node: id,
    message:
      `node '${id}'${posStr} intrudes ${band} (region x:[${r.minX},${r.maxX}] y:[${r.minY},${r.maxY}]): its box ` +
      `(x:[${round(b.minX)},${round(b.maxX)}] y:[${round(b.minY)},${round(b.maxY)}]) overlaps the reserved zone for its ` +
      `whole on-stage lifetime. Move it above the band top (y < ${r.minY}) or out of the reserved region.`,
    detail: {
      frame: a.lastFrame,
      bounds: { minX: round(b.minX), minY: round(b.minY), maxX: round(b.maxX), maxY: round(b.maxY) },
      region: { minX: r.minX, minY: r.minY, maxX: r.maxX, maxY: r.maxY },
      ...(sa.owner !== undefined ? { owner: sa.owner } : {}),
      // 0.64 per-lever fix class — moving the node out of the reserved band is pure
      // GEOMETRY, so CAPTION_COLLISION is always auto-fixable.
      fixHints: [
        {
          lever: 'position',
          fixClass: 'geometry',
          hint: 'move the node above the band top / out of the reserved region',
        },
      ] satisfies FixHint[],
    },
  };
}

// ── small utilities ────────────────────────────────────────────────────────────

/** 0.64 — is `id` the OWNER of a band, or in the owner's SUBTREE? (id === owner OR
 *  any ancestor's id === owner). Reuses the offstage subtree-ancestor helper so the
 *  owner + its descendants are exempt from CAPTION_COLLISION (no self-collision). */
function isOwnedBy(scene: Scene, id: string, owner: string | undefined): boolean {
  if (owner === undefined) return false;
  if (id === owner) return true;
  return hasFlaggedAncestor(scene, id, new Set([owner]));
}

/** Walk `id`'s ided ancestor chain; true if any ancestor is in `flagged`. */
function hasFlaggedAncestor(scene: Scene, id: string, flagged: ReadonlySet<string>): boolean {
  const node = scene.nodes.get(id);
  let p = node?.parent ?? null;
  while (p) {
    if (p.id !== undefined && flagged.has(p.id)) return true;
    p = p.parent;
  }
  return false;
}

function numberAt(scene: Scene, target: string, t: number): number | undefined {
  const v = resolveAt(scene, target, t);
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function vec2At(scene: Scene, target: string, t: number): [number, number] | undefined {
  const v = resolveAt(scene, target, t);
  return Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number'
    ? [v[0], v[1]]
    : undefined;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * CANONICAL SORT — by frame (detail.frame, undefined last), then code, then
 * node-id. An unordered diagnostic array is golden-unstable; this is the HARD emit
 * requirement (assert sort-invariance: shuffle-then-sort ≡ emitted order). Stable
 * for equal keys (the static-then-rendered concat order is deterministic).
 */
export function sortDiagnostics(diags: SceneDiagnostic[]): SceneDiagnostic[] {
  const frameOf = (d: SceneDiagnostic): number => {
    const f = (d.detail as { frame?: unknown } | undefined)?.frame;
    return typeof f === 'number' ? f : Number.POSITIVE_INFINITY;
  };
  return diags
    .map((d, i) => [d, i] as const)
    .sort((A, B) => {
      const [a, ai] = A;
      const [b, bi] = B;
      const fa = frameOf(a);
      const fb = frameOf(b);
      if (fa !== fb) return fa - fb;
      if (a.code !== b.code) return a.code < b.code ? -1 : 1;
      const na = a.node ?? '';
      const nb = b.node ?? '';
      if (na !== nb) return na < nb ? -1 : 1;
      const ta = a.track ?? '';
      const tb = b.track ?? '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return ai - bi; // stable for fully-equal keys (identical diagnostics)
    })
    .map(([d]) => d);
}
