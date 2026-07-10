/**
 * Ken Burns: the classic photo pan/zoom as a one-call, PURE track-emitting motion
 * preset. `kenBurns(node)` bakes a `<id>/scale` (the zoom) + optional `<id>/position`
 * (the pan) keyframe pair onto an EXISTING node's own transform ids and hands them
 * back as `{ tracks, end }` — you inject them with `tl.tracks([...])` (or spread into
 * a timeline's `tracks`). It creates NO node: the target is already in the scene.
 *
 * Because an Image draws CENTERED, scaling zooms about its center while position pans;
 * but kenBurns emits the SAME tracks on ANY node (Image or Rect) — it only reads/writes
 * `scale` + `position`.
 *
 * DETERMINISM (the load-bearing pin): when a `from` endpoint is DEFAULTED (a bare-number
 * zoom, or an offset pan), kenBurns reads the target's STATIC CONSTRUCTED prop value —
 * `target.scale()` / `target.position()` as the node was BUILT — never the node's animated
 * state evaluated at `at`. It does NOT evaluate the node's other tracks / the timeline at
 * emission time. So the emitted tracks are a PURE function of (the node's static props, the
 * args) and are ORDER-INDEPENDENT: emitting kenBurns before or after any other track on the
 * node yields identical tracks (same discipline as `stagger` reading static positions). If
 * you've ALSO authored a scale/position track on this node, pass an explicit `from`.
 *
 * Related: `camera()` (also on @glissade/scene/motion) does rig-level zoom/pan/parallax over
 * the WHOLE scene as a parent transform; kenBurns is the per-NODE one-liner. Tree-shakeable,
 * off the base embed.
 */

import { key, track, type EaseSpec, type Track, type Vec2 } from '@glissade/core';
import type { Node } from './node.js';

/** Thrown for a mis-called kenBurns (fail loud, never a silent no-op). */
export class KenBurnsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KenBurnsError';
  }
}

export interface KenBurnsOptions {
  /**
   * The zoom endpoints on `<id>/scale` (uniform — applied to both axes). DEFAULT `[1, 1.1]`
   * (a gentle push-in). A bare number `N` means `[staticCurrentScale, N]` — "zoom in from the
   * node's rest scale to N" (the defaulted `from` reads the STATIC constructed `scale`). A tuple
   * `[from, to]` is explicit both ends (push-in `[1, 1.1]` OR pull-out `[1.1, 1]`).
   */
  zoom?: number | [from: number, to: number];
  /**
   * The pan on `<id>/position`. DEFAULT: no pan (zoom-only is valid). `[dx, dy]` is an OFFSET
   * drift — `from` = the STATIC constructed `position`, `to` = `from + [dx, dy]`. `{ from, to }`
   * is explicit endpoints.
   */
  pan?: [dx: number, dy: number] | { from: Vec2; to: Vec2 };
  /** The shot span in seconds; the tracks run `[at, at + duration]`. DEFAULT `5`. */
  duration?: number;
  /** The easing arriving at the end pose. DEFAULT `'easeInOutSine'`. */
  ease?: EaseSpec;
  /** Start time in seconds. DEFAULT `0`. */
  at?: number;
}

export interface KenBurnsResult {
  /** The emitted `<id>/scale` (+ optional `<id>/position`) tracks — inject with `tl.tracks(...)`. */
  tracks: Track[];
  /** The shot end (`at + duration`). */
  end: number;
}

/** Resolve the zoom option into [from, to] vec2 scale endpoints. */
function resolveZoom(zoom: KenBurnsOptions['zoom'], target: Node): [Vec2, Vec2] {
  if (zoom === undefined) return [[1, 1], [1.1, 1.1]];
  if (typeof zoom === 'number') {
    // bare number → [staticCurrentScale, N]; the `from` reads the STATIC constructed scale.
    const s = target.scale();
    return [[s[0], s[1]], [zoom, zoom]];
  }
  // tuple [from, to] → uniform on both axes
  return [[zoom[0], zoom[0]], [zoom[1], zoom[1]]];
}

/** Resolve the pan option into [from, to] vec2 position endpoints, or undefined (no pan). */
function resolvePan(pan: KenBurnsOptions['pan'], target: Node): [Vec2, Vec2] | undefined {
  if (pan === undefined) return undefined;
  if (Array.isArray(pan)) {
    // offset [dx, dy] → from = STATIC constructed position, to = from + offset
    const p = target.position();
    return [[p[0], p[1]], [p[0] + pan[0], p[1] + pan[1]]];
  }
  return [pan.from, pan.to];
}

/**
 * Emit a Ken Burns pan/zoom on an EXISTING node's own `<id>/scale` + `<id>/position`.
 *
 *   const photo = new Image({ id: 'photo', assetId: 'sunset', width: 1280, height: 720 });
 *   tl.tracks(kenBurns(photo, { zoom: [1, 1.15], pan: [-40, 20], duration: 6 }).tracks);
 *
 * `target` MUST have an `id` (the track targets are `<id>/scale` / `<id>/position`). The
 * defaulted `from` reads the node's STATIC rest value; if you've also authored a
 * scale/position track on this node, pass an explicit `from`.
 */
export function kenBurns(target: Node, opts: KenBurnsOptions = {}): KenBurnsResult {
  const id = target.id;
  if (id === undefined) {
    throw new KenBurnsError(
      'kenBurns needs a target with an `id` — the emitted tracks target `<id>/scale` and `<id>/position`. ' +
        'Give the node an id (e.g. `new Image({ id: "photo", ... })`).',
    );
  }
  const at = opts.at ?? 0;
  const duration = opts.duration ?? 5;
  const ease = opts.ease ?? 'easeInOutSine';
  const end = at + duration;

  const [zoomFrom, zoomTo] = resolveZoom(opts.zoom, target);
  const tracks: Track[] = [
    track(`${id}/scale`, 'vec2', [key(at, zoomFrom), key(end, zoomTo, ease)]),
  ];

  const pan = resolvePan(opts.pan, target);
  if (pan !== undefined) {
    tracks.push(track(`${id}/position`, 'vec2', [key(at, pan[0]), key(end, pan[1], ease)]));
  }

  return { tracks, end };
}
