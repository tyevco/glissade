/**
 * The ONE shared join→extent rule for a stroke's geometric overhang beyond the
 * path outline. BOTH the camera bounds path (`camera.ts` `worldBoxOf`/`clear`) and
 * critique's stroke AABB (`critique.ts` `strokePath`) call this SAME function, so a
 * "cleared" node's visible extent and critique's collision box CANNOT drift by
 * construction — they are the same computation, not two that happen to agree.
 *
 * The rule maps `{ width, join?, cap? }` to the px the stroke adds on each side:
 *   - `join` round/bevel, OR any `cap` present (round/square) → `width/2`
 *     (a smooth outline / an end-capped line never spikes past half the width).
 *   - `join` miter (the default) on genuine sharp corners → the miter spike
 *     reaches `miterLimit(default 10) × width/2` = `5 × width`.
 *
 * A rounded rect / circle emits `join:'round'` (no sharp corners — see `nodes.ts`),
 * so this rule gives it `width/2`; a sharp rect keeps the miter default → `5×width`.
 */

import { type StrokeStyle } from './displayList.js';

/** SVG/canvas default miter limit — the spike ratio a miter join reaches before
 *  it bevels. Extent = `miterLimit × width/2`. */
export const DEFAULT_MITER_LIMIT = 10;

/**
 * The geometric extent (px) a stroke adds beyond its path outline on each side.
 * 0 for a non-positive width. The single source of truth both bounds consumers use.
 */
export function strokeExtent(stroke: Pick<StrokeStyle, 'width' | 'join' | 'cap' | 'miterLimit'>): number {
  const w = stroke.width;
  if (!(w > 0)) return 0;
  const half = w / 2;
  const join = stroke.join ?? 'miter';
  // A round/bevel join — or ANY cap (round/square) — never spikes past half the
  // stroke width, so the outline extends exactly width/2.
  if (join === 'round' || join === 'bevel' || stroke.cap !== undefined) return half;
  // A miter join on genuine sharp corners: the spike reaches miterLimit × width/2.
  const miterLimit = stroke.miterLimit ?? DEFAULT_MITER_LIMIT;
  return miterLimit * half;
}
