// @glissade/scene — the SHARED Region-ingest validator (0.65).
//
// ONE canonical validation at ONE boundary. Both critique/assess's `safeAreas`
// and centerOn's `clear` ingest an author-supplied {@link Region} through this
// single function, so a hand-built Region and a `captionSafeArea(size)` Region
// are BYTE-INTERCHANGEABLE downstream — the SAME validated (integer, positive-
// extent) Region reaches the critique diagnostic AND the camera pose, never
// quantized-for-one / raw-for-the-other.
//
// Discipline (matching captionSafeArea's own Math.round on the resolved px):
//   • non-integer bounds are QUANTIZED to integers (Math.round) — a float Region
//     becomes the canonical integer Region a well-behaved agent would have built;
//   • a NEGATIVE-EXTENT region (maxX < minX or maxY < minY) or a non-finite bound
//     FAILS LOUD with a name-the-fix message.
// `describe().types.Region` signals `integer` bounds (the belt); this validator is
// the suspenders. Pure — no render/determinism impact.

import { type Region } from './diff.js';

/** Thrown on a mis-built ingest Region (float is quantized; negative-extent /
 *  non-finite fails loud). Names the fix (build from describe().types or
 *  captionSafeArea(size)). */
export class RegionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegionError';
  }
}

const REGION_KEYS = ['minX', 'minY', 'maxX', 'maxY'] as const;

const FIX = 'Region bounds must be integers; build from describe().types or captionSafeArea(size).';

/**
 * Validate + canonicalize an author-supplied {@link Region}: quantize each bound
 * to an integer (Math.round) and fail loud on a non-finite bound or a negative
 * extent. Returns a fresh integer Region — the ONE value both consumers use.
 * `where` labels the ingest site in the error (e.g. `'critique safeAreas'`).
 */
export function validateRegion(r: Region, where: string): Region {
  if (r === null || typeof r !== 'object') {
    throw new RegionError(`${where}: Region must be an object { minX, minY, maxX, maxY } (got ${JSON.stringify(r)}). ${FIX}`);
  }
  const q = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  for (const k of REGION_KEYS) {
    const v = (r as unknown as Record<string, unknown>)[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new RegionError(`${where}: Region.${k} must be a finite number (got ${JSON.stringify(v)}). ${FIX}`);
    }
    q[k] = Math.round(v);
  }
  if (q.maxX < q.minX || q.maxY < q.minY) {
    throw new RegionError(
      `${where}: Region has negative extent — x:[${q.minX},${q.maxX}] y:[${q.minY},${q.maxY}] (maxX<minX or maxY<minY). ${FIX}`,
    );
  }
  return q;
}
