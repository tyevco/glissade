/**
 * `Camera` (0.55) — a cinematic camera rig for cuts, push-ins, pans, rolls, and
 * parallax over a layered scene. It is a `Group` subclass whose `emit` applies the
 * INVERSE camera pose as a parent transform on its layers, so the WHOLE world moves
 * under a fixed screen while every node stays NODE-LOCAL (its anchor lives in its
 * own localMatrix) — the "camera transforms the world, nodes stay node-local"
 * composition contract, no double-apply with the 0.53 anchor by construction.
 *
 * Pose (all keyframeable track targets — `cam/center(.x/.y)`, `cam/zoom`,
 * `cam/roll`):
 *   - `center` — the focal / pan target in RELATIVE viewport coords ([0.5,0.5] =
 *     screen center), NEVER px (responsive landscape↔portrait). Resolved to world
 *     px at emit against `ctx.size`.
 *   - `zoom`   — scale about the focal point (push-in when animated up).
 *   - `roll`   — camera rotation in degrees.
 *   - `shake`  — an optional whole-frame {@link ShakeSpec} folded into the pose.
 *
 * The per-layer transform is
 *   T(screenCenter) · scale(zoom) · rotate(roll) · T(−effectiveCenter)
 * where a layer's `effectiveCenter` scales the PAN by its `depth` — far layers
 * (depth<1) translate less (v1 parallax is pan-only; DoF-from-depth is deferred).
 *
 * CAPTION-PIN is STRUCTURAL, not a flag: captions belong as SIBLINGS of the Camera
 * (outside the rig), so the camera transform never touches them — a lower-third
 * stays pinned by construction. See golden-camera for the pattern.
 *
 * Lives on `@glissade/scene/motion` (off the base embed).
 */

import { computed, signal, vec2Signal, type BindableSignal, type ReadonlySignal, type Vec2, type Vec2Signal } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { applyToPoint, fromTRS, multiply, type Mat2x3 } from './matrix.js';
import { type BindablePropTarget, type EvalContext, type NodeProps, type PropInit, Node } from './node.js';
import { Group } from './nodes.js';
import { fallbackMeasurer, type TextMeasurer } from './text.js';
import { validateRegion } from './region.js';
import { type Region } from './diff.js';
import { shakeMatrix, shakeOffset, type ShakeSpec } from './shake.js';
import { strokeExtent } from './strokeBounds.js';

/** Thrown for a mis-built or off-safe-area camera (fail loud, never a silent no-op). */
export class CameraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CameraError';
  }
}

/**
 * One depth layer of a camera rig. `depth` lives on the WRAPPER (not a per-Node
 * prop, so the base Node/golden contract is untouched): 1 = the focal plane
 * (default), <1 = farther (parallax: pans less), >1 = nearer (pans more).
 */
export interface CameraLayer {
  content: Node;
  depth?: number;
}

export interface CameraProps extends NodeProps {
  /** Focal / pan target in RELATIVE viewport coords ([0.5,0.5]=center); default center. */
  center?: PropInit<Vec2>;
  /** Scale about the focal point; default 1. */
  zoom?: PropInit<number>;
  /** Camera roll in degrees; default 0. */
  roll?: PropInit<number>;
  /** Optional whole-frame shake folded into the pose. */
  shake?: ShakeSpec;
  /**
   * 0.65 — NODE-FRAMING: center the focal point on the node with this id (its
   * WORLD center in px), resolved at emit through `ctx.resolveNode`. When set, the
   * relative `center` is ignored — the camera tracks the node wherever it moves.
   * The world focal is fed DIRECTLY to the pose (no px→rel→px round-trip), and the
   * resolved focal point is readable inspection-only via `resolveAt(scene,
   * '<camId>/resolvedCenter', t)`.
   */
  centerOn?: string;
  /**
   * 0.65 — with `centerOn`, nudge the focal point (vertically) so the target
   * node's BOUNDS clear this reserved {@link Region} (e.g. a caption band). The
   * signed minimal push that removes the overlap; direction is DERIVED (toward the
   * larger free region, ties → up), integer-stable. Fails loud if the node is
   * taller than the clearable area. Ingested through the SAME `validateRegion`
   * boundary critique's `safeAreas` uses — a hand-built Region ≡ a
   * `captionSafeArea(size)` Region.
   */
  clear?: Region;
}

/**
 * The per-layer inverse-camera-pose matrix (pure — the render math, exported for
 * unit tests). Maps WORLD → SCREEN as
 *   T(screenCenter) · scale(zoom) · rotate(roll) · T(−effectiveCenter)
 * where `effectiveCenter = screenCenter + (focalPx − screenCenter)·depth` scales
 * the PAN by the layer's depth (far layers, depth<1, pan less). `centerRel` is the
 * RELATIVE focal point ([0.5,0.5]=screen center); `roll` is degrees.
 */
export function cameraLayerMatrix(
  size: { w: number; h: number },
  centerRel: Vec2,
  zoom: number,
  roll: number,
  depth: number,
): Mat2x3 {
  // B-mode: the RELATIVE focal is resolved to WORLD px by ONE canonical division
  // (× size), then handed to the px-native core. centerOn skips this entirely and
  // feeds its world focal to {@link cameraLayerMatrixPx} directly.
  return cameraLayerMatrixPx(size, [centerRel[0] * size.w, centerRel[1] * size.h], zoom, roll, depth);
}

/**
 * The px-native per-layer pose (the canonical core {@link cameraLayerMatrix} calls
 * through). `focalPx` is the ABSOLUTE world-px focal point — the relative-center
 * path multiplies by `size` to reach it, while `centerOn` supplies the node's
 * WORLD center directly (no px→rel→px round-trip, so no double-division drift). The
 * size-derived focal is NEVER written back into the trackable `center` Vec2Signal.
 */
export function cameraLayerMatrixPx(
  size: { w: number; h: number },
  focalPx: Vec2,
  zoom: number,
  roll: number,
  depth: number,
): Mat2x3 {
  const pw = size.w / 2;
  const ph = size.h / 2;
  const ecx = pw + (focalPx[0] - pw) * depth;
  const ecy = ph + (focalPx[1] - ph) * depth;
  const scaleRoll = fromTRS([0, 0], roll, [zoom, zoom]); // uniform scale ⇒ commutes with rotate
  const toScreen: Mat2x3 = [1, 0, 0, 1, pw, ph];
  const fromCenter: Mat2x3 = [1, 0, 0, 1, -ecx, -ecy];
  return multiply(toScreen, multiply(scaleRoll, fromCenter));
}

/** A node's world-space axis-aligned box + its world center, sampled from the
 *  node's LIVE `worldMatrix()` and its measured intrinsic box (quantized at
 *  MEASURE_QUANTUM_PX by `intrinsicSize`). Pure + re-entrant (the Echo/orient
 *  discipline): it reads signals only, never mutating the target's own render. A
 *  Group (no intrinsic box) collapses to its world origin. ONE call feeds the pose,
 *  the clear offset, AND the inspection resolvedCenter — never re-sampled. */
interface WorldBox {
  center: Vec2;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function worldBoxOf(node: Node, measurer: TextMeasurer): WorldBox {
  const wm = node.worldMatrix();
  const size = node.intrinsicSize(measurer);
  if (size === null) {
    const c = applyToPoint(wm, [0, 0]);
    return { center: c, minX: c[0], minY: c[1], maxX: c[0], maxY: c[1] };
  }
  const off = node.drawOffset(measurer);
  // VISUAL bounds, not content: expand the content box by the node's stroke
  // overhang via the SHARED join→extent rule (strokeExtent) — the SAME rule
  // critique's collision box uses, fed the SAME {width, join} the DL carries. So
  // `clear` lifts the node's VISIBLE extent (content + stroke), not just its content
  // box: a stroked node clears by strokeWidth/2 MORE than an unstroked one, and a
  // cleared stroked node leaves no residual stroke overhang in the band.
  // The node's stroke {width, join} feed the SHARED strokeExtent rule (the SAME rule
  // critique's collision box uses, fed the SAME join the DL carries via strokeJoin).
  // Read structurally (Shape's accessors aren't on the base Node type) so the base
  // embed carries no camera-only seam; the extent math lives here, off-base (/motion).
  const sh = node as { stroke?(): unknown; strokeWidth?(): number; strokeJoin?(): 'miter' | 'round' | 'bevel' | undefined };
  const sw = sh.strokeWidth?.() ?? 0;
  let ext = 0;
  if (sw > 0 && sh.stroke?.()) {
    const join = sh.strokeJoin?.();
    ext = strokeExtent(join !== undefined ? { width: sw, join } : { width: sw });
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const corners: Vec2[] = [
    [off.x - ext, off.y - ext],
    [off.x + size.w + ext, off.y - ext],
    [off.x - ext, off.y + size.h + ext],
    [off.x + size.w + ext, off.y + size.h + ext],
  ];
  for (const corner of corners) {
    const p = applyToPoint(wm, corner);
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  // affine preserves midpoints, so the box center is the transform of the local
  // box center (== the AABB midpoint for a rotated rect too).
  const center = applyToPoint(wm, [off.x + size.w / 2, off.y + size.h / 2]);
  return { center, minX, minY, maxX, maxY };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function initVec2(sig: Vec2Signal, init: PropInit<Vec2> | undefined): void {
  if (typeof init === 'function') sig.bindSource(init);
  else if (init !== undefined) sig.set(init);
}
function initNum(sig: BindableSignal<number>, init: PropInit<number> | undefined): void {
  if (typeof init === 'function') sig.bindSource(init);
  else if (init !== undefined) sig.set(init);
}

export class Camera extends Group {
  override get describeType(): string {
    return 'Camera';
  }
  /** Focal / pan target, RELATIVE viewport coords. Track `cam/center(.x/.y)`. */
  readonly center: Vec2Signal;
  /** Scale about the focal point. Track `cam/zoom`. */
  readonly zoom: BindableSignal<number>;
  /** Camera roll, degrees. Track `cam/roll`. */
  readonly roll: BindableSignal<number>;
  /** Resolved layers (content + depth), parallel to `children`. */
  readonly layers: readonly Required<CameraLayer>[];
  readonly #shake: ShakeSpec | undefined;

  /** 0.65 — the node id the focal point tracks (world-space), or undefined. */
  readonly centerOn: string | undefined;
  /** 0.65 — the validated (integer, positive-extent) clear Region, or undefined. */
  readonly #clear: Region | undefined;
  // Context captured at emit so the inspection `resolvedCenter` computed can resolve
  // the target node standalone (both scene-CONSTANT — same across every frame of a
  // scene; the TIME-varying worldMatrix is read live in the computed, keeping it a
  // pure function of time). Mirrors the `measurerSource` injection precedent.
  #resolveNode: ((id: string) => Node | undefined) | undefined;
  #emitSize: { readonly w: number; readonly h: number } | undefined;
  /**
   * 0.65 — INSPECTION-ONLY resolved focal point (world px, INCLUDING the clear
   * nudge) — the SINGLE computed sample the render actually uses. Read it via
   * `resolveAt(scene, '<camId>/resolvedCenter', t)`. DERIVED / read-only: it is not
   * author-settable (binding/setting it fails loud). Present only when `centerOn`
   * is set, so a plain camera registers no new target and stays byte-identical.
   */
  readonly resolvedCenter: ReadonlySignal<Vec2> | undefined;

  /** The whole-frame shake spec, if any — read by exporters (render-only, so it is
   *  warned + not baked into Lottie keyframes). */
  get shakeSpec(): ShakeSpec | undefined {
    return this.#shake;
  }

  constructor(layers: CameraLayer[], props: CameraProps = {}) {
    if (!Array.isArray(layers) || layers.length === 0) {
      throw new CameraError('camera(layers, props?): needs at least one layer — pass [{ content }] (a node per depth plane).');
    }
    const resolved = layers.map((l, i) => {
      if (l == null || !(l.content instanceof Node)) {
        throw new CameraError(`camera(): layer ${i} has no \`content\` Node — each layer is { content: Node, depth?: number }.`);
      }
      const depth = l.depth ?? 1;
      if (!Number.isFinite(depth) || depth < 0) {
        throw new CameraError(`camera(): layer ${i} has an invalid depth ${String(l.depth)} — depth must be a finite number >= 0 (1 = focal plane, <1 = far).`);
      }
      return { content: l.content, depth };
    });
    super({ ...props, children: resolved.map((l) => l.content) });
    this.layers = resolved;
    this.center = vec2Signal([0.5, 0.5]);
    this.zoom = signal(1);
    this.roll = signal(0);
    initVec2(this.center, props.center);
    initNum(this.zoom, props.zoom);
    initNum(this.roll, props.roll);
    this.registerTarget('center', this.center, 'vec2');
    this.registerTarget('center.x', this.center.x, 'number');
    this.registerTarget('center.y', this.center.y, 'number');
    this.registerTarget('zoom', this.zoom, 'number');
    this.registerTarget('roll', this.roll, 'number');
    this.#shake = props.shake;

    // 0.65 node-framing. The clear Region is validated ONCE at construction through
    // the SHARED boundary (float → integer, negative-extent → throw).
    this.centerOn = props.centerOn;
    this.#clear = props.clear !== undefined ? validateRegion(props.clear, 'camera clear') : undefined;
    if (this.centerOn !== undefined) {
      // ONE computed sample: world center + clear nudge. The pose reads it during
      // draw (so the render literally uses this value), the clear folds INTO it, and
      // resolveAt reads the SAME computed — they cannot disagree (a pure function of
      // the playhead via the target's live worldMatrix).
      const focal = computed<Vec2>(() => this.#resolveFocalPx(), {
        equals: (a, b) => a[0] === b[0] && a[1] === b[1],
      });
      this.resolvedCenter = focal;
      // Register it so resolveAt/instanceProps find it, but make it DERIVED /
      // read-only: setting or binding it fails loud (it is a function of centerOn,
      // not an author track). isBound stays false; `derived` marks it in
      // instanceProps.
      const target = focal as unknown as BindablePropTarget & {
        bindSource: (fn: () => unknown) => void;
        unbindSource: () => void;
        isBound: boolean;
        derived: boolean;
      };
      target.bindSource = () => {
        throw new CameraError(
          `resolvedCenter is derived from centerOn('${String(this.centerOn)}'); set cam/center or add a relative offset instead — it is inspection-only (read it via resolveAt), never a track target.`,
        );
      };
      target.unbindSource = () => {};
      Object.defineProperty(target, 'isBound', { value: false, configurable: true });
      target.derived = true;
      this.registerTarget('resolvedCenter', target, 'vec2');
    }
  }

  /**
   * Resolve the WORLD-px focal point for `centerOn` (+ the clear nudge). Called by
   * the `resolvedCenter` computed — so it runs ONCE per playhead and its result
   * feeds the pose, the clear, AND resolveAt. Fails loud when the target can't be
   * resolved. Reads the target's LIVE worldMatrix (pure, re-entrant).
   */
  #resolveFocalPx(): Vec2 {
    const id = this.centerOn!;
    const resolve = this.#resolveNode;
    if (resolve === undefined) {
      throw new CameraError(
        `camera centerOn('${id}'): ctx.resolveNode is absent — evaluate(scene, timeline, t) injects it from the scene node map; a bare hand-built ctx cannot resolve a node by id.`,
      );
    }
    const node = resolve(id);
    if (node === undefined) {
      throw new CameraError(`camera centerOn: no node with id '${id}' — check the id or that the node is in the scene`);
    }
    const measurer = this.measurerSource?.() ?? fallbackMeasurer();
    const box = worldBoxOf(node, measurer);
    if (this.#clear === undefined) return box.center;
    return this.#applyClear(id, box);
  }

  /**
   * Nudge the focal (vertically) so the target's SCREEN bounds clear the reserved
   * region. Direction is DERIVED — the signed MINIMAL push that removes the overlap
   * (tie → toward the larger free region, ties → up), integer-stable at zoom 1.
   * Fails loud when the node is taller than either free area.
   */
  #applyClear(id: string, box: WorldBox): Vec2 {
    const region = this.#clear!;
    const size = this.#emitSize;
    if (size === undefined) {
      throw new CameraError(`camera centerOn('${id}') clear: needs the scene viewport (ctx.size) to place the reserved region.`);
    }
    const zoom = this.zoom();
    const cy = size.h / 2;
    // With focal = box.center, the node's world center maps to screen center; its
    // screen y = cy + zoom·(worldY − centerY). Screen bounds of the node:
    const nodeMinY = cy + zoom * (box.minY - box.center[1]);
    const nodeMaxY = cy + zoom * (box.maxY - box.center[1]);
    const nodeH = nodeMaxY - nodeMinY;
    const rMinY = region.minY;
    const rMaxY = region.maxY;
    // already clear (open-interval, matching critique's intersectsRegion)
    if (nodeMaxY <= rMinY || nodeMinY >= rMaxY) return box.center;
    // free areas outside the band, on screen
    const freeAbove = rMinY - 0;
    const freeBelow = size.h - rMaxY;
    const fitsAbove = nodeH <= freeAbove;
    const fitsBelow = nodeH <= freeBelow;
    if (!fitsAbove && !fitsBelow) {
      throw new CameraError(
        `camera centerOn('${id}') clear: node bounds (${round2(nodeH)}px tall) exceed the clearable area ` +
          `(above ${round2(freeAbove)}px, below ${round2(freeBelow)}px); widen the safe area or scale the node.`,
      );
    }
    // minimal push to clear each way (screen px, both ≥ 0)
    const pushUp = nodeMaxY - rMinY; // move node UP by this so its bottom = band top
    const pushDown = rMaxY - nodeMinY; // move node DOWN so its top = band bottom
    let up: boolean;
    if (fitsAbove && !fitsBelow) up = true;
    else if (fitsBelow && !fitsAbove) up = false;
    else if (pushUp < pushDown) up = true;
    else if (pushDown < pushUp) up = false;
    else up = freeAbove >= freeBelow; // canonical tie-break: larger free region, ties → up
    const pushScreen = up ? -pushUp : pushDown; // screen displacement (down = +)
    // moving the focal by Δ shifts the node's screen y by −zoom·Δ; solve for Δ.
    const dFocalY = -pushScreen / zoom;
    return [box.center[0], box.center[1] + dFocalY];
  }

  protected override draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const size = ctx.size;
    if (size === undefined) {
      throw new CameraError('Camera needs the scene viewport — evaluate(scene, timeline, t) supplies ctx.size; a bare hand-built ctx must set { size }.');
    }
    // capture scene-constant context so resolvedCenter (the inspection computed) can
    // resolve the target node standalone (see the fields' doc).
    this.#emitSize = size;
    let focalPx: Vec2;
    if (this.centerOn !== undefined) {
      // NODE-FRAMING (B-mode): the world focal is the ONE computed sample — fed to
      // the pose DIRECTLY (no px→rel→px round-trip), never into the trackable center.
      if (ctx.resolveNode === undefined) {
        throw new CameraError(
          `camera centerOn('${this.centerOn}'): ctx.resolveNode is absent (bare ctx) — evaluate(scene, timeline, t) injects it from the scene node map.`,
        );
      }
      this.#resolveNode = ctx.resolveNode;
      focalPx = this.resolvedCenter!();
      if (!Number.isFinite(focalPx[0]) || !Number.isFinite(focalPx[1])) {
        throw new CameraError(`camera centerOn('${this.centerOn}'): focal resolved to a non-finite point [${String(focalPx[0])}, ${String(focalPx[1])}].`);
      }
    } else {
      const [cx, cy] = this.center();
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
        throw new CameraError(`Camera center resolved to a non-finite value [${String(cx)}, ${String(cy)}] — center is RELATIVE viewport coords (e.g. [0.5,0.5]); check the bound source/track.`);
      }
      // Fail loud when the focal point leaves the safe area (the viewport in relative
      // coords): looking off-canvas is a bug, not a silent no-op.
      if (cx < 0 || cx > 1 || cy < 0 || cy > 1) {
        throw new CameraError(`Camera center [${cx}, ${cy}] is outside the safe area [0,1]² — center is RELATIVE viewport coords; keep the pan target on-screen.`);
      }
      // ONE canonical division to world px (byte-identical to the prior centerRel path).
      focalPx = [cx * size.w, cy * size.h];
    }
    const zoom = this.zoom();
    const roll = this.roll();
    const shake = this.#shake ? shakeOffset(this.#shake, ctx.time) : { dx: 0, dy: 0, dr: 0 };
    const hasShake = shake.dx !== 0 || shake.dy !== 0 || shake.dr !== 0;
    const shakeM = hasShake ? shakeMatrix([size.w / 2, size.h / 2], shake.dx, shake.dy, shake.dr) : undefined;

    for (const layer of this.layers) {
      const pose = cameraLayerMatrixPx(size, focalPx, zoom, roll, layer.depth);
      const m = shakeM ? multiply(shakeM, pose) : pose;
      out.push({ op: 'save' });
      out.push({ op: 'transform', m });
      layer.content.emit(out, ctx);
      out.push({ op: 'restore' });
    }
  }
}

/**
 * Build a {@link Camera} rig (lowercase FACTORY — no `new`): `camera(layers, props?)`.
 * `layers` are depth planes (`{ content, depth? }`); animate `cam/center(.x/.y)`,
 * `cam/zoom`, `cam/roll` with tracks for push-ins, pans, and rolls.
 *
 * `children: [camera([{ content: bg, depth: 0.3 }, { content: fg }], { id: 'cam' }), caption]`
 * — `caption` is a SIBLING (outside the rig), so it stays pinned while the camera moves.
 */
export function camera(layers: CameraLayer[], props: CameraProps = {}): Camera {
  return new Camera(layers, props);
}
