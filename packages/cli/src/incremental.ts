/**
 * Dirty-beat incremental (0.41): render ONLY the frames whose per-frame content
 * key actually changed, and splice the rest — verbatim, byte-identical — from a
 * lossless FFV1 intermediate retained beside the prior output.
 *
 * The pain it kills: an edit that shifts timing (move one beat) changes every
 * DOWNSTREAM frame's DisplayList, so every whole-frame cache key misses AND the
 * rolled-up remux digest flips — a 35-min episode re-renders in full even though
 * the visible change is three seconds long. The per-frame key VECTOR (persisted
 * in the manifest, {@link RenderManifest.frameKeys}) lets us diff old→new and
 * re-render exactly the changed runs.
 *
 * Determinism (the north star): FFV1 is intra-only and lossless, so a kept
 * segment decodes to byte-identical pixels and the single final encode over the
 * spliced stream is byte-for-byte a full cold render. The perf optimization does
 * NOT touch the determinism contract — the frame key is the same proof the frame
 * cache and the golden corpus trust. This module is PURE planning; the ffmpeg
 * splice execution (EXPORT-gated) consumes the plan.
 */

import { changedFrameRanges, type FrameRange, type RenderManifest } from './renderManifest.js';

/** One contiguous stretch of the output timeline: reuse it from the intermediate, or re-render it. */
export interface SpliceSegment {
  /** 0-based frame index within the render range, inclusive. */
  readonly start: number;
  readonly end: number;
  /** `keep` = extract verbatim from the retained FFV1 intermediate; `render` = re-render these frames. */
  readonly kind: 'keep' | 'render';
}

/**
 * The complement-and-interleave: given the total frame count and the CHANGED
 * ranges (from {@link changedFrameRanges}), produce the ordered, gap-free segment
 * list covering `[0, total-1]` — changed runs become `render`, everything between
 * them becomes `keep`. Adjacent same-kind segments never occur (changed ranges are
 * already coalesced and disjoint), so the list alternates.
 */
export function spliceSegments(total: number, changed: readonly FrameRange[]): SpliceSegment[] {
  const segs: SpliceSegment[] = [];
  let cursor = 0;
  for (const r of changed) {
    if (r.start > cursor) segs.push({ start: cursor, end: r.start - 1, kind: 'keep' });
    segs.push({ start: r.start, end: r.end, kind: 'render' });
    cursor = r.end + 1;
  }
  if (cursor < total) segs.push({ start: cursor, end: total - 1, kind: 'keep' });
  return segs;
}

/** The strategy a re-render should take, decided purely from the prior manifest + this render's keys. */
export type IncrementalPlan =
  /** No prior key vector, frame count changed, or intermediate missing → render everything. */
  | { readonly kind: 'full' }
  /** Nothing changed → the video is byte-identical; reuse it (audio-only remux handles the rest). */
  | { readonly kind: 'unchanged' }
  /** Some frames changed → re-render only those, splice the kept runs from the intermediate. */
  | {
      readonly kind: 'splice';
      readonly changed: readonly FrameRange[];
      readonly segments: readonly SpliceSegment[];
      /** frames actually re-rendered vs. total — for the progress line + the "was it worth it" log. */
      readonly renderFrames: number;
      readonly totalFrames: number;
    };

/**
 * Decide the incremental strategy. Pure: the caller supplies the prior manifest,
 * this render's ordered keys, and whether the retained FFV1 intermediate exists.
 * Encode-parameter changes (codec/container/fps/range) force `full` — a kept
 * segment is only byte-faithful if the surrounding encode is identical.
 */
export function planIncremental(
  prev: RenderManifest | undefined,
  nowKeys: readonly string[],
  intermediateExists: boolean,
  encode: { container: string; videoCodec: string; fps: number; firstFrame: number; frames: number },
): IncrementalPlan {
  if (
    prev === undefined ||
    !intermediateExists ||
    prev.container !== encode.container ||
    prev.videoCodec !== encode.videoCodec ||
    prev.fps !== encode.fps ||
    prev.firstFrame !== encode.firstFrame ||
    prev.frames !== encode.frames
  ) {
    return { kind: 'full' };
  }
  const changed = changedFrameRanges(prev.frameKeys, nowKeys);
  if (changed === null) return { kind: 'full' }; // no prior vector / count mismatch
  if (changed.length === 0) return { kind: 'unchanged' };
  const renderFrames = changed.reduce((n, r) => n + (r.end - r.start + 1), 0);
  return {
    kind: 'splice',
    changed,
    segments: spliceSegments(nowKeys.length, changed),
    renderFrames,
    totalFrames: nowKeys.length,
  };
}
