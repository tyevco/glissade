/**
 * Motion along a path: sample a point (and tangent) at an arc-length position on
 * a PathValue, and drive a node along it over time. The Path node draws/morphs
 * geometry; this is the companion that makes another node — a cursor, a dot, an
 * arrow — *travel* that geometry.
 *
 * Sampling is arc-length parameterized (constant speed), so progress 0→1 moves
 * evenly instead of bunching at the control points. Pure and deterministic: the
 * table is built once from a static PathValue and `atProgress` is a pure
 * function of progress, so evaluate() stays pure and goldens are byte-stable.
 */

import { signal, type BindableSignal, type PathValue, type Vec2 } from '@glissade/core';
import { Node, type NodeProps, type PropInit } from './node.js';
import { Path } from './nodes.js';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/** PathValue contours → cubic segments, same v/in/out math as Path.pathSegs. */
function toCubics(path: PathValue): [Vec2, Vec2, Vec2, Vec2][] {
  const out: [Vec2, Vec2, Vec2, Vec2][] = [];
  for (const ct of path) {
    const n = ct.v.length;
    for (let i = 0; i < n - 1; i++) {
      out.push([
        ct.v[i]!,
        [ct.v[i]![0] + ct.out[i]![0], ct.v[i]![1] + ct.out[i]![1]],
        [ct.v[i + 1]![0] + ct.in[i + 1]![0], ct.v[i + 1]![1] + ct.in[i + 1]![1]],
        ct.v[i + 1]!,
      ]);
    }
    if (ct.closed && n > 1) {
      out.push([
        ct.v[n - 1]!,
        [ct.v[n - 1]![0] + ct.out[n - 1]![0], ct.v[n - 1]![1] + ct.out[n - 1]![1]],
        [ct.v[0]![0] + ct.in[0]![0], ct.v[0]![1] + ct.in[0]![1]],
        ct.v[0]!,
      ]);
    }
  }
  return out;
}

/** An arc-length-parameterized sampler over a path. */
export interface PathSampler {
  /** total arc length */
  readonly length: number;
  /** point at arc-length s (clamped to [0, length]) */
  at(s: number): Vec2;
  /** unit tangent at arc-length s (forward direction of travel) */
  tangentAt(s: number): Vec2;
  /** point at normalized progress u in [0, 1] */
  atProgress(u: number): Vec2;
  /** unit tangent at normalized progress u in [0, 1] */
  tangentAtProgress(u: number): Vec2;
}

/**
 * Build a reusable arc-length sampler. Densely samples each cubic into a
 * cumulative-length polyline (samplesPerSegment, default 32) so `at`/`tangent`
 * are simple span lerps — smooth enough for motion, no per-call bezier solve.
 */
export function motionPath(path: PathValue, opts: { samplesPerSegment?: number } = {}): PathSampler {
  const steps = Math.max(1, Math.floor(opts.samplesPerSegment ?? 32));
  const cubics = toCubics(path);

  const pts: Vec2[] = [];
  const cum: number[] = []; // cumulative arc length at each point
  if (cubics.length > 0) {
    let prev = cubicPoint(...cubics[0]!, 0);
    pts.push(prev);
    cum.push(0);
    let acc = 0;
    for (const cub of cubics) {
      for (let k = 1; k <= steps; k++) {
        const p = cubicPoint(...cub, k / steps);
        acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        pts.push(p);
        cum.push(acc);
        prev = p;
      }
    }
  } else {
    // no segments (a single vertex, or empty) — sit at that vertex
    const first = path[0]?.v[0];
    pts.push(first ? [first[0], first[1]] : [0, 0]);
    cum.push(0);
  }
  const total = cum[cum.length - 1]!;

  // the span [i, i+1] whose cumulative length brackets s, plus the local fraction
  const locate = (s: number): { i: number; f: number } => {
    if (total <= 0 || s <= 0) return { i: 0, f: 0 };
    if (s >= total) return { i: pts.length - 2, f: 1 };
    // linear scan is fine (tables are small); bump to binary search if needed
    let i = 0;
    while (i < cum.length - 1 && cum[i + 1]! < s) i++;
    const span = cum[i + 1]! - cum[i]!;
    return { i, f: span > 0 ? (s - cum[i]!) / span : 0 };
  };

  const at = (s: number): Vec2 => {
    if (pts.length === 1) return [pts[0]![0], pts[0]![1]];
    const { i, f } = locate(s);
    const a = pts[i]!;
    const b = pts[i + 1]!;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const tangentAt = (s: number): Vec2 => {
    if (pts.length === 1) return [1, 0];
    const { i } = locate(s);
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    return len > 0 ? [dx / len, dy / len] : [1, 0];
  };

  return {
    length: total,
    at,
    tangentAt,
    atProgress: (u) => at(clamp01(u) * total),
    tangentAtProgress: (u) => tangentAt(clamp01(u) * total),
  };
}

/** Total arc length of a path. */
export function pathLength(path: PathValue): number {
  return motionPath(path).length;
}

/** Point at arc-length s along a path (clamped to [0, length]). */
export function pointAtLength(path: PathValue, s: number): Vec2 {
  return motionPath(path).at(s);
}

export interface FollowPathProps extends NodeProps {
  /** the node to move along the path; its position (and rotation, if orient) is owned by this */
  target: Node;
  path: PathValue;
  /** 0→1 position along the path's arc length; default 1 (the end). Track `<id>/progress`. */
  progress?: PropInit<number>;
  /** rotate the target to the path tangent — a cursor that points where it heads; default false */
  orient?: boolean;
  /** degrees added to the orient angle (e.g. if the sprite points up at rest) */
  orientOffset?: number;
  samplesPerSegment?: number;
}

/**
 * A companion node that drives `target` along `path` as `progress` animates.
 * Owns the target's `position` (and `rotation` when `orient`) via pull-based
 * binding, so there's no eval-order side effect. Add it to the scene (its
 * `progress` is the animatable target); it draws nothing itself.
 */
export class FollowPath extends Node {
  readonly target: Node;
  readonly progress: BindableSignal<number>;

  constructor(props: FollowPathProps) {
    super(props);
    this.target = props.target;
    this.progress = signal(1);
    if (typeof props.progress === 'function') this.progress.bindSource(props.progress);
    else if (props.progress !== undefined) this.progress.set(props.progress);
    this.registerTarget('progress', this.progress);

    const sampler = motionPath(
      props.path,
      props.samplesPerSegment !== undefined ? { samplesPerSegment: props.samplesPerSegment } : {},
    );
    props.target.position.bindSource(() => sampler.atProgress(this.progress()));
    if (props.orient) {
      const offset = props.orientOffset ?? 0;
      props.target.rotation.bindSource(() => {
        const t = sampler.tangentAtProgress(this.progress());
        return (Math.atan2(t[1], t[0]) * 180) / Math.PI + offset;
      });
    }
  }

  protected draw(): void {
    // a driver, not a drawable — the target paints itself wherever we put it
  }
}

/** `children: [route, cursor, followPath(cursor, route, { orient: true })]` — cursor traces the route. */
export function followPath(
  target: Node,
  path: PathValue | Path,
  props: Omit<FollowPathProps, 'target' | 'path'> = {},
): FollowPath {
  const pv = path instanceof Path ? path.data() : path;
  return new FollowPath({ ...props, target, path: pv });
}
