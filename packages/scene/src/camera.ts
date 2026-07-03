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

import { signal, vec2Signal, type BindableSignal, type Vec2, type Vec2Signal } from '@glissade/core';
import { type DisplayListBuilder } from './displayList.js';
import { fromTRS, multiply, type Mat2x3 } from './matrix.js';
import { type EvalContext, type NodeProps, type PropInit, Node } from './node.js';
import { Group } from './nodes.js';
import { shakeMatrix, shakeOffset, type ShakeSpec } from './shake.js';

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
  const pw = size.w / 2;
  const ph = size.h / 2;
  const focalX = centerRel[0] * size.w;
  const focalY = centerRel[1] * size.h;
  const ecx = pw + (focalX - pw) * depth;
  const ecy = ph + (focalY - ph) * depth;
  const scaleRoll = fromTRS([0, 0], roll, [zoom, zoom]); // uniform scale ⇒ commutes with rotate
  const toScreen: Mat2x3 = [1, 0, 0, 1, pw, ph];
  const fromCenter: Mat2x3 = [1, 0, 0, 1, -ecx, -ecy];
  return multiply(toScreen, multiply(scaleRoll, fromCenter));
}

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
  }

  protected override draw(out: DisplayListBuilder, ctx: EvalContext): void {
    const size = ctx.size;
    if (size === undefined) {
      throw new CameraError('Camera needs the scene viewport — evaluate(scene, timeline, t) supplies ctx.size; a bare hand-built ctx must set { size }.');
    }
    const [cx, cy] = this.center();
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      throw new CameraError(`Camera center resolved to a non-finite value [${String(cx)}, ${String(cy)}] — center is RELATIVE viewport coords (e.g. [0.5,0.5]); check the bound source/track.`);
    }
    // Fail loud when the focal point leaves the safe area (the viewport in relative
    // coords): looking off-canvas is a bug, not a silent no-op.
    if (cx < 0 || cx > 1 || cy < 0 || cy > 1) {
      throw new CameraError(`Camera center [${cx}, ${cy}] is outside the safe area [0,1]² — center is RELATIVE viewport coords; keep the pan target on-screen.`);
    }
    const zoom = this.zoom();
    const roll = this.roll();
    const centerRel: Vec2 = [cx, cy];
    const shake = this.#shake ? shakeOffset(this.#shake, ctx.time) : { dx: 0, dy: 0, dr: 0 };
    const hasShake = shake.dx !== 0 || shake.dy !== 0 || shake.dr !== 0;
    const shakeM = hasShake ? shakeMatrix([size.w / 2, size.h / 2], shake.dx, shake.dy, shake.dr) : undefined;

    for (const layer of this.layers) {
      const pose = cameraLayerMatrix(size, centerRel, zoom, roll, layer.depth);
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
