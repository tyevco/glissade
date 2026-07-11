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

import { compileTimeline, evaluateAt, parseColor, type Timeline } from '@glissade/core';
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
import { strokeExtent } from './strokeBounds.js';
import { bindScene, type Scene } from './scene.js';
import { Group, Text } from './nodes.js';
import { type Node } from './node.js';
// TYPE-ONLY import — erases at runtime, so the Layout value (and its ./layout Yoga
// loader) never lands on the diagnostics bundle. Cut-3 LAYOUT_OVERFLOW detects a
// Layout node by its pinned `describeType === 'Layout'` marker (minification-safe),
// then reads it through this structural type.
import { type Layout } from './layoutCtors.js';
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

/**
 * 0.77 — a keep-WITHIN box: node `node`'s rendered composed box must stay INSIDE
 * `within`. The INVERSE of a {@link SafeArea} (keep-OUT band) and a first-class named
 * type paralleling it. `node` is a node id (resolved the same way `SafeArea.owner` is);
 * `within` is the shared integer {@link Region} (ingested through validateRegion —
 * quantize-or-fail-loud — so a hand-built box and a describe().types Region reach the
 * OUT_OF_BOUNDS check byte-identically). A PURE critique input — never a render input,
 * so every golden stays byte-identical.
 */
export interface ContainBound {
  /** The node id whose composed box must stay inside {@link within}. */
  node: string;
  /** The keep-within box in device px (integer bounds; the shared diff {@link Region}). */
  within: Region;
}

/**
 * Cut 2 — an author-declared alignment GROUP: a set of sibling node ids whose
 * rendered boxes are EXPECTED to align (share a cross-axis center) and be evenly
 * spaced along a main axis. The EXPLICIT-declaration form (auto-inference of groups
 * is deferred): the author lists the ids they intend to read as a row/column, and
 * critique() checks MISALIGNED / UNEVEN_SPACING against the members' INTEGER device
 * boxes at the group's SETTLED frame. A PURE critique input — never a render input,
 * so every golden stays byte-identical.
 */
export interface AlignGroup {
  /** Optional label used in the diagnostic message + `detail.group` (else the
   *  member id list is used). */
  id?: string;
  /** The node ids whose boxes should align / be evenly spaced (>= 2). Every id must
   *  resolve to a node in the scene (fail-loud on a typo). */
  members: string[];
  /** The main axis. Omitted ⇒ INFERRED from the members' geometry at the settled
   *  frame (the axis with the larger spread of box centers; a tie prefers 'row'). */
  axis?: 'row' | 'column';
}

/**
 * 0.77 — thrown when a critique() input cannot be resolved, the fail-loud twin of
 * validateRegion's {@link RegionError} on a malformed box. `containBounds` fails loud
 * when its `node` id does NOT resolve to a node with its own rendered box — a typo'd
 * id (matches nothing) or a container Group (no own box) — rather than silently
 * guarding nothing. A declared keep-within box that silently no-ops is the
 * confident-wrong-by-omission the critique suite exists to prevent: an author who ADDED
 * a guard would be worse off than one who knew they had none. (The box half already
 * fails loud via validateRegion; the node half now matches.) instanceof-catchable so a
 * no-build author can `catch (e) { if (e instanceof glissade.CritiqueError) … }`.
 */
export class CritiqueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CritiqueError';
  }
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
  /**
   * 0.77 — keep-WITHIN boxes: the INVERSE of {@link safeAreas} (keep-OUT bands). Each
   * entry declares that node `node`'s rendered composed box must stay INSIDE `within`.
   * A node whose device box is NOT fully inside its declared box for its WHOLE on-stage
   * span raises OUT_OF_BOUNDS (the persistent-drift discipline OFF_CANVAS/CAPTION_COLLISION
   * use — a transient overshoot during animation does not fire). Only nodes with a
   * declared box participate (no cost for others). Each `within` is ingested through the
   * SHARED validateRegion (integer-quantize + fail-loud on a bad region), so a hand-built
   * box and a describe().types Region reach the check byte-identically. A PURE critique
   * input — never a render input, so every golden stays byte-identical.
   */
  containBounds?: readonly ContainBound[];
  /**
   * Cut 2 — EXPLICIT sibling-alignment groups (MISALIGNED + UNEVEN_SPACING). Each
   * group lists >= 2 member node ids (fail-loud on an unknown id) whose rendered
   * boxes are read at the group's SETTLED frame (the max grid frame where every
   * member is present AND at rest — its integer bbox equals the next frame's, so
   * entrance/exit/rotation transients are excluded). A member group that never
   * simultaneously settles fails loud. Empty ⇒ byte-identical behaviour (no group is
   * checked). Auto-inference of groups is deferred — declare the group explicitly.
   */
  alignGroups?: readonly AlignGroup[];
  /**
   * Cut 2 — the cross-axis alignment slack (integer px, default 2). A group whose
   * members' cross-axis centers span MORE than this raises MISALIGNED. Must be a
   * finite integer >= 0 (fail-loud otherwise, mirroring validateRegion's integer
   * discipline).
   */
  alignTolerance?: number;
  /**
   * Cut 2 — the inter-member spacing slack (integer px, default 2). A group whose
   * main-axis gaps span MORE than this raises UNEVEN_SPACING. Must be a finite
   * integer >= 0 (fail-loud otherwise).
   */
  gapTolerance?: number;
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
        // SHARED join→extent rule (the SAME strokeExtent camera's clear/worldBoxOf
        // uses): a round/bevel join or capped stroke overhangs width/2; a miter
        // (sharp) join reaches miterLimit×width/2. A rounded stroke now carries
        // join:'round' (honest DL emit), so it inflates by width/2, not the 5×width
        // miter spike — the two bounds consumers can't disagree by construction.
        const o = strokeExtent(cmd.stroke);
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

/** Cut 2 — an INTEGER-quantized device bbox (the geometry the alignment checks read;
 *  no float ever reaches a compare). */
interface IntBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Cut 2 — per alignment-group MEMBER tracking across the sample grid: the frames it
 *  was on-stage (`presence`) and its integer bbox at each (`bbox`). Keyed by node id
 *  so a member shared by two groups is tracked once. */
interface MemberTrack {
  presence: Set<number>;
  bbox: Map<number, IntBox>;
}

// ── Cut 3: composed (group→children) box + Layout-slot geometry ────────────────

/** The bbox tracked for a `containBounds` member across the grid, read from its
 *  COMPOSED box (own box ∪ every drawn descendant's box). A leaf's composed box is
 *  just its own box (byte-identical to the pre-Cut-3 leaf path); a container Group
 *  resolves to the union of its rendered descendants. */
interface ContainAgg {
  onStage: number;
  /** on-stage frames the composed box was NOT fully inside the keep-within box. */
  outOfBounds: number;
  lastFrame: number;
  lastT: number;
  lastBounds: Bounds;
}

/** Cut 3 — the id set that RESOLVES a member: the id itself plus every IDED
 *  descendant (a pure scene-tree walk over `.children`). A leaf resolves to `{id}`;
 *  a container Group resolves to itself + all its drawn descendants, so its effective
 *  box is the union of their rendered boxes. */
function collectResolveSet(scene: Scene, id: string): Set<string> {
  const out = new Set<string>([id]);
  const walk = (n: Node): void => {
    const kids = (n as unknown as { children?: Node[] }).children;
    if (!Array.isArray(kids)) return;
    for (const c of kids) {
      if (c.id !== undefined) out.add(c.id);
      walk(c);
    }
  };
  const node = scene.nodes.get(id);
  if (node) walk(node);
  return out;
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
  // 0.77 — the keep-WITHIN boxes (OUT_OF_BOUNDS). Each `within` is INGESTED through the
  // SAME shared validateRegion the safeAreas use (float bounds quantize to integers, a
  // negative-extent / non-finite box fails loud), then keyed by node id for O(1) lookup
  // in the sample loop. Empty ⇒ byte-identical behaviour (no node participates).
  const containBoxes = new Map<string, Region>();
  for (const entry of opts.containBounds ?? []) {
    // Fail loud on an unknown/typo'd id BEFORE the sample loop (fast, symmetric with the
    // box fail-loud below): an id that resolves to nothing would silently guard nothing —
    // the confident-wrong-by-omission a keep-within guard must never become. (A container
    // Group IS indexed here — it just renders no own box — so it slips past this check and
    // is caught fail-loud after the loop, where onStage===0 proves it produced no box.)
    if (!scene.nodes.has(entry.node)) {
      throw new CritiqueError(
        `critique containBounds: unknown node id '${entry.node}' — it must match a node id in the scene (check for a typo). A keep-within box on an id that resolves to nothing silently guards nothing.`,
      );
    }
    containBoxes.set(entry.node, validateRegion(entry.within, 'critique containBounds'));
  }
  // Cut 2 — the alignment groups (MISALIGNED + UNEVEN_SPACING). FAIL LOUD BEFORE the
  // sample loop (fast, symmetric with the containBounds ingest): every member id must
  // resolve (a typo silently checks nothing) and a group needs >= 2 members. Then a
  // per-member track (presence Set + integer-quantized bbox per on-stage frame) is
  // primed so the sample loop records it. The settled-frame selection + the actual
  // checks run AFTER the loop. Empty ⇒ byte-identical behaviour (no member tracked).
  const alignTolerance = validateTolerance(opts.alignTolerance, 'alignTolerance');
  const gapTolerance = validateTolerance(opts.gapTolerance, 'gapTolerance');
  const memberTracks = new Map<string, MemberTrack>();
  for (const g of opts.alignGroups ?? []) {
    for (const id of g.members) {
      if (!scene.nodes.has(id)) {
        throw new CritiqueError(
          `critique alignGroups: unknown node id '${id}' — it must match a node id in the scene (check for a typo). An alignment-group member that resolves to nothing can't be checked.`,
        );
      }
    }
    if (g.members.length < 2) {
      throw new CritiqueError(
        `critique alignGroups: group ${groupLabel(g)} needs at least 2 members to check alignment (got ${g.members.length}).`,
      );
    }
    for (const id of g.members) {
      if (!memberTracks.has(id)) memberTracks.set(id, { presence: new Set<number>(), bbox: new Map<number, IntBox>() });
    }
  }
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

  // Cut 3 — the COMPOSED-box resolution (group→children). Each containBounds node and
  // alignGroups member resolves to its id + every ided descendant, so a container Group
  // participates as the UNION of its rendered descendants' boxes (a leaf resolves to just
  // itself → byte-identical to the pre-Cut-3 leaf path). Precomputed once (a pure scene
  // walk); the sample loop unions the present boxes per frame.
  const resolveSets = new Map<string, Set<string>>();
  for (const id of new Set<string>([...containBoxes.keys(), ...memberTracks.keys()]))
    resolveSets.set(id, collectResolveSet(scene, id));
  const containAgg = new Map<string, ContainAgg>();

  // Cut 3 — LAYOUT_OVERFLOW runs AUTOMATICALLY over every ided Layout node (no opt-in).
  // Detect a Layout by its pinned `describeType` marker (minification-safe; avoids a
  // runtime import of the ./layout Yoga entry). Its worldMatrix() maps a computed flex
  // slot into the child's device-ink space at the settled frame.
  const layoutIds = new Set<string>();
  for (const [id, node] of scene.nodes) if (node.describeType === 'Layout') layoutIds.add(id);
  let lastWalk: FrameWalk | undefined;
  let lastWalkT = 0;

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

    // Cut 3 — COMPOSED-box accumulation for containBounds + alignGroups members. A
    // member's effective box this frame = the union of its own + drawn-descendant boxes
    // (null ⇒ not present). Routing BOTH leaf and Group members through this one path
    // keeps a leaf byte-identical (its resolve set is just itself) while a container
    // Group now resolves to its rendered children — retiring Cut-2's leaf-only workaround.
    for (const [id, set] of resolveSets) {
      let box: Bounds | null = null;
      for (const x of set) {
        const fn = frame.nodes.get(x);
        if (fn) box = accumulateRect(box, IDENTITY, fn.bounds.minX, fn.bounds.minY, fn.bounds.maxX, fn.bounds.maxY);
      }
      if (box === null) continue; // no own box and no drawn descendant this frame
      const within = containBoxes.get(id);
      if (within !== undefined) {
        let ca = containAgg.get(id);
        if (!ca) {
          ca = { onStage: 0, outOfBounds: 0, lastFrame: -1, lastT: 0, lastBounds: box };
          containAgg.set(id, ca);
        }
        ca.onStage++;
        ca.lastFrame = i;
        ca.lastT = t;
        ca.lastBounds = box;
        if (!contains(within, box)) ca.outOfBounds++;
      }
      const mt = memberTracks.get(id);
      if (mt) {
        mt.presence.add(i);
        mt.bbox.set(i, {
          minX: Math.round(box.minX),
          minY: Math.round(box.minY),
          maxX: Math.round(box.maxX),
          maxY: Math.round(box.maxY),
        });
      }
    }

    // Cut 3 - keep the LAST frame's walk (child ink) for the settled LAYOUT_OVERFLOW
    // check after the loop.
    lastWalk = frame;
    lastWalkT = t;
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

  // OUT_OF_BOUNDS — the INVERSE of CAPTION_COLLISION: a node with a declared keep-WITHIN
  // box whose composed box is NOT fully inside that box for its WHOLE on-stage span (the
  // persistent-drift discipline OFF_CANVAS/CAPTION_COLLISION use — a transient overshoot
  // during animation does not fire). An overshoot threshold (>0.5px, mirroring
  // TEXT_OVERFLOW) drops sub-pixel noise from the last-frame geometry.
  for (const [id, within] of containBoxes) {
    const a = containAgg.get(id);
    if (!a || a.onStage === 0) {
      // A KNOWN node (ingest verified it exists) whose COMPOSED box was empty every frame
      // → it drew nothing AND has no drawn descendant (a truly-empty container Group, or a
      // fill-less / hidden node). Cut 3 lets a Group resolve to its composed-children box,
      // so this now fires ONLY for the genuinely-boxless case. Fail loud rather than
      // silently guard nothing — matching the ingest unknown-id throw + the box fail-loud.
      throw new CritiqueError(
        `critique containBounds: node '${id}' produced no rendered box — it and its descendants drew nothing (an empty Group or a hidden/fill-less node). Give it a drawn child, or declare a leaf id that carries the box.`,
      );
    }
    if (a.outOfBounds !== a.onStage) continue; // drifted out its WHOLE on-stage life
    if (maxOvershoot(a.lastBounds, within) <= 0.5) continue; // sub-pixel noise guard
    rendered.push(outOfBoundsDiagnostic(scene, id, a, within));
  }

  // MISALIGNED + UNEVEN_SPACING — EXPLICIT alignment groups. For each group, select
  // the SETTLED frame (fail loud if none), read the members' integer boxes there, and
  // emit the two sibling diagnostics where the cross-axis center spread / gap spread
  // exceeds tolerance. The settled-frame selection is a pure integer adjacent-frame
  // compare (the HOLD, not a transient) — deterministic run-to-run.
  for (const g of opts.alignGroups ?? []) {
    // A member whose COMPOSED box was empty every frame (empty presence) — it AND any
    // descendants drew nothing (a truly-empty container Group, or a fill-less / hidden
    // node) — can't be measured for alignment. Cut 3 resolves a container Group to its
    // drawn children, so this fires ONLY for the genuinely-boxless case; a Group WITH
    // drawn children is measured via that composed box. Fail loud naming the REAL cause,
    // BEFORE the settle check (which would otherwise misdiagnose a fully-static no-box
    // member as "never at rest" and send the author down a timing rabbit hole).
    for (const id of g.members) {
      if (memberTracks.get(id)!.presence.size === 0) {
        throw new CritiqueError(
          `critique alignGroups: member '${id}' produced no rendered box — it and its descendants drew nothing (an empty Group or a hidden/fill-less node). Give it a drawn child, or declare a leaf id that carries the box.`,
        );
      }
    }
    const settled = settledFrame(g, memberTracks, lastFrame);
    if (settled < 0) {
      throw new CritiqueError(
        `critique alignGroups: group ${groupLabel(g)} has no settled frame — its members each render but are never simultaneously present and at rest, so alignment can't be checked. Ensure the group holds still (no member moving) on at least one sampled frame.`,
      );
    }
    for (const d of alignGroupDiagnostics(g, memberTracks, settled, alignTolerance, gapTolerance)) rendered.push(d);
  }

  // LAYOUT_OVERFLOW - a Layout child whose rendered ink exceeds its computed flex slot at
  // the SETTLED (last sampled) frame. Runs automatically - no declaration; the slot IS the
  // author's declared intent, mapped to device via the Layout's captured world matrix (the
  // space the child ink lives in). The >0.5px threshold drops sub-pixel noise; a pure read.
  if (lastWalk !== undefined) {
    const est = { estimate: true } as const;
    for (const layoutId of layoutIds) {
      const layout = scene.nodes.get(layoutId) as Layout;
      // world matrix + slots + size + flowable child ids at the settled frame's time.
      // worldMatrix() is the CTM the Layout's draw() composed its child boxes under.
      // evaluateAt resolves an ANIMATED Layout at t; {estimate:true} matches
      // #computeUncached's per-child opt-in (the memoized compute the render used).
      const probe = evaluateAt(scene.playhead, lastWalkT, () => ({
        m: layout.worldMatrix(),
        boxes: layout.computedBoxes(measurer, est),
        size: layout.computedSize(measurer, est),
        ids: layout.children.filter((c) => c.intrinsicSize(measurer, est) !== null).map((c) => c.id),
      }));
      const ox = -probe.size.w / 2; // container center-origin (draw() places boxes from -size/2)
      const oy = -probe.size.h / 2;
      probe.boxes.forEach((b, ci) => {
        const childId = probe.ids[ci];
        const ink = childId !== undefined ? lastWalk!.nodes.get(childId) : undefined;
        if (childId === undefined || ink === undefined) return; // unnamed / didn't draw
        // slot rect in the Layout's LOCAL space (M maps it to device), as draw() composes it.
        const slot = accumulateRect(null, probe.m, ox + b.x, oy + b.y, ox + b.x + b.w, oy + b.y + b.h)!;
        const over = maxOvershoot(ink.bounds, slot);
        if (over > 0.5) rendered.push(layoutOverflowDiagnostic(layoutId, childId, lastFrame, ink.bounds, slot, over));
      });
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
      bounds: intBox(b),
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
            occluderBounds: intBox(a.occluderBounds),
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
      bounds: intBox(b),
      region: { ...r },
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

/** 0.77 — the deepest edge-exit (device px) of `b` OUT of keep-within box `r`: the
 *  max over the four edges of how far the box pokes past that edge (0 when fully
 *  inside). Deterministic (identical recompute; the OUT_OF_BOUNDS overshoot threshold
 *  reads it against >0.5 to drop sub-pixel noise). */
function maxOvershoot(b: Bounds, r: Region): number {
  return Math.max(r.minX - b.minX, b.maxX - r.maxX, r.minY - b.minY, b.maxY - r.maxY, 0);
}

/** 0.77 OUT_OF_BOUNDS builder — a node that drifted OUT of its declared keep-within box
 *  its whole on-stage span (the inverse of CAPTION_COLLISION). The fix is pure GEOMETRY —
 *  move it back in (`position`) or shrink it to fit (`scale`/`fontSize`) — so it is always
 *  auto-fixable. Names the edge(s) it exits + by how many device px. */
function outOfBoundsDiagnostic(
  scene: Scene,
  id: string,
  a: { lastBounds: Bounds; lastFrame: number; lastT: number },
  r: Region,
): SceneDiagnostic {
  const b = a.lastBounds;
  // Dominant exit edge + magnitude (device px past that edge) — the OFF_CANVAS style.
  const edges: readonly [string, number][] = [
    ['LEFT', r.minX - b.minX],
    ['RIGHT', b.maxX - r.maxX],
    ['TOP', r.minY - b.minY],
    ['BOTTOM', b.maxY - r.maxY],
  ];
  let dir = 'its box';
  let overshoot = 0;
  for (const [edge, over] of edges) {
    if (over > overshoot) {
      overshoot = over;
      dir = `${edge} by ${round(over)}px`;
    }
  }
  overshoot = round(overshoot);
  const pos = vec2At(scene, `${id}/position`, a.lastT);
  const posStr = pos ? ` (position [${round(pos[0])}, ${round(pos[1])}])` : '';
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'OUT_OF_BOUNDS',
    severity: 'warning',
    source: 'critique',
    node: id,
    message:
      `node '${id}'${posStr} drifts OUTSIDE its keep-within box (region x:[${r.minX},${r.maxX}] ` +
      `y:[${r.minY},${r.maxY}]): its box (x:[${round(b.minX)},${round(b.maxX)}] y:[${round(b.minY)},${round(b.maxY)}]) ` +
      `exits ${dir} for its whole on-stage lifetime. Move it back inside the box or shrink it to fit.`,
    detail: {
      frame: a.lastFrame,
      bounds: intBox(b),
      region: { ...r },
      overshoot,
      // 0.77 per-lever fix classes — both bringing the node back in (position) and
      // shrinking it to fit (scale / fontSize) are pure GEOMETRY, so OUT_OF_BOUNDS is
      // always auto-fixable.
      fixHints: [
        { lever: 'position', fixClass: 'geometry', hint: 'move the node back inside the keep-within box' },
        { lever: 'scale', fixClass: 'geometry', hint: 'shrink the node (scale) to fit the box' },
        { lever: 'fontSize', fixClass: 'geometry', hint: 'reduce fontSize (Text) to fit the box' },
      ] satisfies FixHint[],
    },
  };
}

// ── Cut 3: Layout slot overflow (LAYOUT_OVERFLOW) ────────────────────────────────

function layoutOverflowDiagnostic(
  layoutId: string,
  childId: string,
  frame: number,
  ink: Bounds,
  slot: Bounds,
  overRaw: number,
): SceneDiagnostic {
  const over = round(overRaw);
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'LAYOUT_OVERFLOW',
    severity: 'warning',
    source: 'critique',
    node: childId,
    message:
      `Layout '${layoutId}' child '${childId}' overflows its slot by ${round(over)}px. Shrink it, or grow the slot.`,
    detail: {
      frame,
      node: childId,
      layout: layoutId,
      ink: intBox(ink),
      slot: intBox(slot),
      overflow: over,
      // both levers are pure GEOMETRY -> LAYOUT_OVERFLOW is always auto-fixable.
      fixHints: [
        { lever: 'size', fixClass: 'geometry', hint: 'shrink the child to its slot' },
        { lever: 'padding', fixClass: 'geometry', hint: 'grow the slot (padding/gap/size)' },
      ] satisfies FixHint[],
    },
  };
}

// ── Cut 2: alignment groups (MISALIGNED + UNEVEN_SPACING) ────────────────────────

/** Validate an optional integer-px tolerance (default 2). Mirrors validateRegion's
 *  integer discipline: a float / negative / non-finite value fails loud. */
function validateTolerance(v: number | undefined, name: string): number {
  if (v === undefined) return 2;
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
    throw new CritiqueError(
      `critique alignGroups: ${name} must be a finite integer >= 0 px (got ${JSON.stringify(v)}).`,
    );
  }
  return v;
}

/** A group's label for messages / `detail.group`: its `id`, else its member list. */
function groupLabel(g: AlignGroup): string {
  return g.id !== undefined ? `'${g.id}'` : `[${g.members.join(', ')}]`;
}

/**
 * THE load-bearing determinism piece. `settledFrame` = the MAXIMUM grid frame f in
 * [0, lastFrame] such that EVERY member is PRESENT at f AND SETTLED at f, where
 * SETTLED = its integer bbox[f] equals bbox[f+1] (the four ints deep-equal), with
 * bbox[lastFrame+1] clamped to bbox[lastFrame] (a member static at the end is settled
 * at lastFrame). A member absent at f or f+1 is not settled at f. A PURE integer
 * adjacent-frame compare — it selects the HOLD (entrance-stagger / exit-whoosh /
 * rotation-settle all MOVE the integer bbox → excluded). Returns -1 if none exists.
 */
function settledFrame(g: AlignGroup, tracks: Map<string, MemberTrack>, lastFrame: number): number {
  const boxAt = (id: string, f: number): IntBox | undefined => {
    const ff = f > lastFrame ? lastFrame : f; // clamp bbox[lastFrame+1] := bbox[lastFrame]
    return tracks.get(id)!.bbox.get(ff);
  };
  const presentAt = (id: string, f: number): boolean => {
    const ff = f > lastFrame ? lastFrame : f; // presence[lastFrame+1] := presence[lastFrame]
    return tracks.get(id)!.presence.has(ff);
  };
  const settledAt = (id: string, f: number): boolean => {
    if (!presentAt(id, f) || !presentAt(id, f + 1)) return false;
    const b0 = boxAt(id, f);
    const b1 = boxAt(id, f + 1);
    if (!b0 || !b1) return false;
    return b0.minX === b1.minX && b0.minY === b1.minY && b0.maxX === b1.maxX && b0.maxY === b1.maxY;
  };
  for (let f = lastFrame; f >= 0; f--) {
    if (g.members.every((id) => settledAt(id, f))) return f;
  }
  return -1;
}

/** The MEDIAN of a list of integers. Odd count → the middle; EVEN count → the
 *  LOWER-median (the lower of the two middle values) — chosen for a deterministic
 *  integer reference that is an actual member value. */
function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2]! : s[n / 2 - 1]!;
}

/**
 * The MISALIGNED + UNEVEN_SPACING diagnostics for one group at its settled frame.
 * Reads each member's integer box, infers the axis when omitted (larger center
 * spread; tie → 'row'), and emits where the cross-axis center spread exceeds
 * `alignTol` / the main-axis gap spread exceeds `gapTol`. Deterministic integer reads;
 * offender by max deviation from the median, tie-broken by node id.
 */
function alignGroupDiagnostics(
  g: AlignGroup,
  tracks: Map<string, MemberTrack>,
  frame: number,
  alignTol: number,
  gapTol: number,
): SceneDiagnostic[] {
  const out: SceneDiagnostic[] = [];
  const label = groupLabel(g);
  const boxes = g.members.map((id) => ({ id, b: tracks.get(id)!.bbox.get(frame)! }));
  const cx = (b: IntBox): number => Math.round((b.minX + b.maxX) / 2);
  const cy = (b: IntBox): number => Math.round((b.minY + b.maxY) / 2);

  // axis — declared, else inferred from the larger center spread (tie → 'row').
  let axis: 'row' | 'column';
  if (g.axis !== undefined) {
    axis = g.axis;
  } else {
    const xs = boxes.map((m) => cx(m.b));
    const ys = boxes.map((m) => cy(m.b));
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadY = Math.max(...ys) - Math.min(...ys);
    axis = spreadX >= spreadY ? 'row' : 'column';
  }

  // MISALIGNED — MODE-AWARE: members are "aligned" if they share ANY of the three
  // cross-axis references {start edge, center, end edge} (row ⇒ minY/cy/maxY, column
  // ⇒ minX/cx/maxX). Fire only when ALL THREE spreads exceed alignTol — i.e. the row is
  // genuinely scattered, sharing NO common edge or center. This passes center-aligned
  // AND top-/bottom-aligned different-sized members (real UI aligns button↔chip on any
  // of the three); center-only would false-fire the top/bottom-aligned case. All-integer
  // device-px, deterministic. The REPORTED reference = the MIN-spread one; on a spread
  // tie prefer center, then start edge, then end edge (canonical precedence).
  const crossRefs: { mode: 'center' | 'start' | 'end'; at: (b: IntBox) => number }[] = [
    { mode: 'center', at: (b) => (axis === 'row' ? cy(b) : cx(b)) },
    { mode: 'start', at: (b) => (axis === 'row' ? b.minY : b.minX) },
    { mode: 'end', at: (b) => (axis === 'row' ? b.maxY : b.maxX) },
  ];
  let best!: { mode: 'center' | 'start' | 'end'; vals: { id: string; c: number }[]; spread: number };
  for (const r of crossRefs) {
    const vals = boxes.map((m) => ({ id: m.id, c: r.at(m.b) }));
    const arr = vals.map((v) => v.c);
    const spread = Math.max(...arr) - Math.min(...arr);
    // strict `<` keeps the earliest (center-preferred) reference on a spread tie.
    if (best === undefined || spread < best.spread) best = { mode: r.mode, vals, spread };
  }
  if (best.spread > alignTol) {
    const refCenter = median(best.vals.map((v) => v.c));
    let off = best.vals[0]!;
    for (const c of best.vals) {
      const d = Math.abs(c.c - refCenter);
      const bd = Math.abs(off.c - refCenter);
      if (d > bd || (d === bd && c.id < off.id)) off = c;
    }
    out.push(misalignedDiagnostic(label, axis, off.id, Math.abs(off.c - refCenter), refCenter, best.spread, alignTol, frame, best.mode));
  }

  // UNEVEN_SPACING — inter-member gaps along the main axis. Sort by (main start, id).
  const mainStart = (b: IntBox): number => (axis === 'row' ? b.minX : b.minY);
  const mainEnd = (b: IntBox): number => (axis === 'row' ? b.maxX : b.maxY);
  const sorted = [...boxes].sort((A, B) => {
    const sa = mainStart(A.b);
    const sb = mainStart(B.b);
    if (sa !== sb) return sa - sb;
    return A.id < B.id ? -1 : A.id > B.id ? 1 : 0;
  });
  const gaps: { gap: number; before: string; after: string }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push({ gap: mainStart(sorted[i + 1]!.b) - mainEnd(sorted[i]!.b), before: sorted[i]!.id, after: sorted[i + 1]!.id });
  }
  if (gaps.length >= 1) {
    const gapVals = gaps.map((gg) => gg.gap);
    const refGap = median(gapVals);
    const spreadG = Math.max(...gapVals) - Math.min(...gapVals);
    if (spreadG > gapTol) {
      let offGap = gaps[0]!;
      for (const gg of gaps) {
        const d = Math.abs(gg.gap - refGap);
        const bd = Math.abs(offGap.gap - refGap);
        if (d > bd || (d === bd && gg.after < offGap.after)) offGap = gg;
      }
      out.push(unevenSpacingDiagnostic(label, axis, offGap, refGap, spreadG, gapTol, frame));
    }
  }
  return out;
}

/** Cut 2 MISALIGNED builder — a group's members share NO common cross-axis reference
 *  (not their start edge, center, OR end edge). The fix is pure GEOMETRY (nudge the
 *  offender to the reference the group MOST-nearly shares — the min-spread one). */
function misalignedDiagnostic(
  label: string,
  axis: 'row' | 'column',
  offender: string,
  off: number,
  reference: number,
  spread: number,
  tolerance: number,
  frame: number,
  mode: 'center' | 'start' | 'end',
): SceneDiagnostic {
  const crossAxisProp = axis === 'row' ? 'y' : 'x';
  // the human name of the reference the group most-nearly shares (row: top/center/bottom;
  // column: left/center/right) — the alignment the author most likely intended.
  const refName =
    mode === 'center'
      ? axis === 'row'
        ? 'vertical center'
        : 'horizontal center'
      : axis === 'row'
        ? mode === 'start'
          ? 'top edge'
          : 'bottom edge'
        : mode === 'start'
          ? 'left edge'
          : 'right edge';
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'MISALIGNED',
    severity: 'warning',
    source: 'critique',
    node: offender,
    message:
      `align group ${label}: member '${offender}' is ${round(off)}px off the ${axis}'s alignment ` +
      `(spread ${round(spread)}px > tolerance ${tolerance}px; nearest shared reference: ${refName}). Nudge it to the ` +
      `group's shared ${refName} (${crossAxisProp}=${round(reference)}) so the ${axis} lines up.`,
    detail: {
      frame,
      axis,
      group: label,
      offender,
      // the cross-axis reference the group most-nearly shares (min-spread of the three).
      alignMode: mode,
      reference: round(reference),
      spread: round(spread),
      tolerance,
      // moving the offender to the shared reference is pure GEOMETRY, so MISALIGNED is
      // always auto-fixable.
      fixHints: [
        {
          lever: 'position',
          fixClass: 'geometry',
          hint: `move '${offender}' to the group's shared ${refName} (${crossAxisProp}=${round(reference)})`,
        },
      ] satisfies FixHint[],
    },
  };
}

/** Cut 2 UNEVEN_SPACING builder — a group's inter-member gaps are unequal. The fix is
 *  pure GEOMETRY (re-space the offender / even the group's gaps). */
function unevenSpacingDiagnostic(
  label: string,
  axis: 'row' | 'column',
  offGap: { gap: number; before: string; after: string },
  reference: number,
  spread: number,
  tolerance: number,
  frame: number,
): SceneDiagnostic {
  const along = axis === 'row' ? 'horizontal' : 'vertical';
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    code: 'UNEVEN_SPACING',
    severity: 'warning',
    source: 'critique',
    node: offGap.after,
    message:
      `align group ${label}: the gap before member '${offGap.after}' is ${round(offGap.gap)}px vs the group's ` +
      `typical ${round(reference)}px (spread ${round(spread)}px > tolerance ${tolerance}px) along the ${along} ${axis}. ` +
      `Even out the spacing between '${offGap.before}' and '${offGap.after}'.`,
    detail: {
      frame,
      axis,
      group: label,
      offender: offGap.after,
      reference: round(reference),
      spread: round(spread),
      tolerance,
      gap: round(offGap.gap),
      pair: [offGap.before, offGap.after],
      // re-spacing the offender (or evening the whole group) is pure GEOMETRY, so
      // UNEVEN_SPACING is always auto-fixable. A `gap` lever is offered alongside.
      fixHints: [
        {
          lever: 'position',
          fixClass: 'geometry',
          hint: `move '${offGap.after}' so its gap matches the group's ${round(reference)}px spacing`,
        },
        {
          lever: 'gap',
          fixClass: 'geometry',
          hint: `even out the group's spacing to ~${round(reference)}px between members`,
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

function intBox(b: Bounds): Region {
  return { minX: round(b.minX), minY: round(b.minY), maxX: round(b.maxX), maxY: round(b.maxY) };
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
