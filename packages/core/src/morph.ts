/**
 * Shared-element box-FLIP morph (0.13 build-time sugar). `morph()` takes two
 * caller-supplied `Box` literals (a FROM rect and a TO rect, both with the Rect
 * CENTER convention for x,y) and a map of target nodes, and compiles a FLIP
 * (First-Last-Invert-Play) position+scale tween on ONE shared element plus an
 * optional opacity cross-fade between the from/to nodes.
 *
 * It is PURE CORE: the FLIP delta is plain arithmetic over the two boxes — no
 * Yoga, no worldMatrix, no signal evaluation, no scene query (a scene-side
 * `worldBoxOf(node)` convenience is a deferred 0.14 fast-follow). The emission
 * delegates to the validated `clip()` path (one track-emission codepath), so the
 * output is BYTE-INDISTINGUISHABLE from hand-authored `track(...)` — same
 * determinism contract as `clip`/`stagger`/`springTo`.
 */

import { key } from './track.js';
import { clip, type ClipChannel, type ClipResult } from './clip.js';
import { TARGET_PATH, type TargetCarrier, type TweenTarget } from './targetRef.js';
import type { Vec2 } from './valueTypes.js';
import type { EaseSpec } from './easing.js';

/** An axis-aligned box. `x`,`y` are the box CENTER (the Rect `position` convention). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The shared-element contract: `morphNode` is the ONE element that travels (its
 * `position`+`scale` are FLIPped); `fromNode`/`toNode` (both optional) cross-fade
 * their `opacity`. The explicit map IS the "shared morphId" — there is no scene
 * query, the caller names the three roles.
 */
export interface MorphTargets {
  morphNode: TweenTarget;
  fromNode?: TweenTarget;
  toNode?: TweenTarget;
}

export interface MorphOpts {
  /** Wall-clock start second of the morph. */
  at: number;
  /** Total morph length in seconds (> 0). */
  duration: number;
  /** Arriving ease of position/scale and the cross-fade (default linear). */
  ease?: EaseSpec;
  /**
   * The scale BASIS: `[base.w, base.h]` is the size at which `morphNode` renders
   * at scale [1,1]. Defaults to `to` (the TO box), so the end scale is [1,1] when
   * `morphNode` is authored at the document's size. `fromScale = from/base`,
   * `toScale = to/base`.
   */
  base?: { w: number; h: number };
  /**
   * Cross-fade split in [0,1] (default 0.5): `fromNode` fades out over
   * `duration*crossfade`; `toNode` fades in starting at `duration*(1-crossfade)`.
   */
  crossfade?: number;
  /** v1 default `'transform'` (position+scale FLIP). `'size'` reserved/deferred. */
  metric?: 'transform';
}

export interface MorphResult {
  tracks: ClipResult['tracks'];
  /** Wall-clock end second (`at + duration`). */
  end: number;
}

export class MorphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MorphError';
  }
}

function assertFiniteBox(label: 'from' | 'to', b: Box): void {
  for (const [k, v] of [
    ['x', b.x],
    ['y', b.y],
    ['w', b.w],
    ['h', b.h],
  ] as const) {
    if (!Number.isFinite(v)) {
      throw new MorphError(`morph ${label}.${k} must be finite (got ${v})`);
    }
  }
  if (!(b.w > 0) || !(b.h > 0)) {
    throw new MorphError(
      `morph ${label} must have w>0 and h>0 (got w=${b.w}, h=${b.h}); a zero/negative box yields a NaN/Infinity scale`,
    );
  }
}

/**
 * Resolve a node-level `TweenTarget` and append a prop suffix, producing the
 * `'<nodeId>/<prop>'` string the clip map form resolves (which re-runs the
 * structural/anonymous-id rejection via resolveTweenTarget). A string target is
 * a bare node id; a property-signal carrier exposes its node via TARGET_PATH.
 *
 * The node id may itself carry slashes (an each() clone like 'card/3'); DO NOT
 * re-split it on the FIRST slash — APPEND the prop and trust the caller. The
 * scene's longest-registered-prefix resolver disambiguates node id vs prop path
 * at bind time, so 'card/3' targets the clone, not the wrapping 'card' Group.
 */
function nodeTarget(target: TweenTarget, prop: string): string {
  const id = typeof target === 'string' ? target : (target as TargetCarrier)[TARGET_PATH];
  if (typeof id !== 'string' || id.length === 0) {
    // mirror clip/builder: let resolveTweenTarget throw the canonical message
    return `${String(id)}/${prop}`;
  }
  // a STRING target is a bare node id (slash-bearing or not) — append directly.
  // a property-signal carrier path is already '<nodeId>/<prop>'; reduce to its
  // node id (everything before the FINAL slash), then re-suffix.
  const nodeId = typeof target === 'string' ? id : id.slice(0, Math.max(0, id.lastIndexOf('/')));
  return `${nodeId}/${prop}`;
}

/**
 * Compile a shared-element box-FLIP morph into hand-authored-equivalent tracks.
 *
 *   morph({ x: 80, y: 200, w: 120, h: 36 }, { x: 320, y: 200, w: 480, h: 280 },
 *     { morphNode: 'morphFx', fromNode: 'chip', toNode: 'document' },
 *     { at: 0.5, duration: 1.2 })
 *
 * Emits (via the clip path):
 *   morphNode/position : vec2  [at]→from-center,         [at+dur]→to-center
 *   morphNode/scale    : vec2  [at]→from/base,           [at+dur]→to/base
 *   fromNode/opacity   : number[at]→1,                   [at+dur*crossfade]→0
 *   toNode/opacity     : number[at+dur*(1-crossfade)]→0, [at+dur]→1
 */
export function morph(from: Box, to: Box, targets: MorphTargets, opts: MorphOpts): MorphResult {
  const { at, duration } = opts;
  const ease = opts.ease;
  const crossfade = opts.crossfade ?? 0.5;
  const metric = opts.metric ?? 'transform';

  if (metric !== 'transform') {
    throw new MorphError(`morph metric '${metric}' is not supported in v1 (only 'transform')`);
  }
  assertFiniteBox('from', from);
  assertFiniteBox('to', to);
  if (!(duration > 0)) throw new MorphError(`morph duration must be > 0 (got ${duration})`);
  if (!(crossfade >= 0 && crossfade <= 1)) {
    throw new MorphError(`morph crossfade must be in [0,1] (got ${crossfade})`);
  }

  const base = opts.base ?? { w: to.w, h: to.h };
  assertFiniteBox('to', { x: 0, y: 0, w: base.w, h: base.h }); // guard a degenerate explicit base

  // FLIP: Invert to the FROM box's transform, Play to the TO box's. Scale is
  // relative to `base` (the size at which morphNode renders at [1,1]).
  const fromScale: Vec2 = [from.w / base.w, from.h / base.h];
  const toScale: Vec2 = [to.w / base.w, to.h / base.h];
  const fromCenter: Vec2 = [from.x, from.y];
  const toCenter: Vec2 = [to.x, to.y];

  // Build the channels with RELATIVE-time keys (t from 0); `at` is the apply offset.
  const channels: Record<string, ClipChannel> = {
    position: {
      path: 'position',
      type: 'vec2',
      keys: [key(0, fromCenter), key(duration, toCenter, ease)],
    },
    scale: {
      path: 'scale',
      type: 'vec2',
      keys: [key(0, fromScale), key(duration, toScale, ease)],
    },
  };
  const targetMap: Record<string, TweenTarget> = {
    position: nodeTarget(targets.morphNode, 'position'),
    scale: nodeTarget(targets.morphNode, 'scale'),
  };

  // A fade with a zero span (crossfade 0 collapses the OUT, crossfade 1 the IN)
  // would author two keys at one t — validateTrack rejects that. The cross-fade
  // simply degenerates at the endpoints, so skip the zero-span channel.
  if (targets.fromNode !== undefined && duration * crossfade > 0) {
    channels['fromOpacity'] = {
      path: 'opacity',
      type: 'number',
      keys: [key(0, 1), key(duration * crossfade, 0, ease)],
    };
    targetMap['fromOpacity'] = nodeTarget(targets.fromNode, 'opacity');
  }
  if (targets.toNode !== undefined && duration * (1 - crossfade) < duration) {
    channels['toOpacity'] = {
      path: 'opacity',
      type: 'number',
      keys: [key(duration * (1 - crossfade), 0), key(duration, 1, ease)],
    };
    targetMap['toOpacity'] = nodeTarget(targets.toNode, 'opacity');
  }

  const { tracks } = clip({ channels }).apply(targetMap, at);
  return { tracks, end: at + duration };
}
