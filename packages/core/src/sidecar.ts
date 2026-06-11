/**
 * The editor sidecar (DESIGN.md §6.2): code declares scene structure and
 * programmatic tracks; the studio owns keyframe data persisted as a sidecar
 * document next to the scene module, merged at track granularity. Versioned
 * independently of the API (§7.4) — breaking it orphans users' files.
 */

import { spring as springFactory } from './spring.js';
import { type Timeline } from './timeline.js';
import { type Key, type Track } from './track.js';

export interface SidecarDoc {
  sidecarVersion: 1;
  /** Editor-owned tracks, replacing same-target code tracks wholesale. */
  tracks: Track[];
  /** Editor-owned labels; merged over code labels by name. */
  labels?: Record<string, number>;
}

export class SidecarVersionError extends Error {
  constructor(version: unknown) {
    super(`unsupported sidecar version ${String(version)}; this build reads sidecarVersion 1`);
    this.name = 'SidecarVersionError';
  }
}

export function emptySidecar(): SidecarDoc {
  return { sidecarVersion: 1, tracks: [] };
}

/**
 * Editor-edit normalization (§2.7 invariant): a spring-eased key's t is
 * intrinsic — prev.t + spring.duration(cfg) — so after any retime, sort and
 * re-pin spring keys to their predecessors. Dragging a spring key itself
 * therefore snaps back; retiming its predecessor carries it along. Returns a
 * new array; coincident keys keep the later entry.
 */
export function normalizeEditedKeys(keys: Key[]): Key[] {
  const out = keys
    .map((k) => ({ ...k }))
    .sort((a, b) => a.t - b.t);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < out.length; i++) {
      const ease = out[i]!.ease;
      if (ease && typeof ease === 'object' && ease.kind === 'spring') {
        out[i]!.t = out[i - 1]!.t + springFactory.duration(ease);
      }
    }
    out.sort((a, b) => a.t - b.t);
  }
  const deduped: Key[] = [];
  for (const k of out) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(last.t - k.t) < 1e-9) deduped[deduped.length - 1] = k;
    else deduped.push(k);
  }
  return deduped;
}

/**
 * Merge rules (§6.2, schema-drift resolution):
 * - a sidecar track whose target exists in code REPLACES that track's keys
 *   (the editor owns it; `editable` is preserved on the result);
 * - a sidecar track with no code counterpart is ADDED (editor-created track);
 * - sidecar tracks targeting nothing the scene can bind fail later at
 *   bindTimeline with UnboundTargetError — surfaced, never silently dropped;
 * - code tracks without sidecar counterparts pass through untouched.
 * The input documents are not mutated.
 */
export function mergeSidecar(code: Timeline, sidecar: SidecarDoc | null | undefined): Timeline {
  if (!sidecar) return code;
  if (sidecar.sidecarVersion !== 1) throw new SidecarVersionError(sidecar.sidecarVersion);
  const overlay = new Map(sidecar.tracks.map((t) => [t.target, t]));
  const tracks: Track[] = code.tracks.map((t) => {
    const replacement = overlay.get(t.target);
    if (!replacement) return t;
    overlay.delete(t.target);
    return { ...t, keys: replacement.keys.map((k) => ({ ...k })), editable: true };
  });
  for (const added of overlay.values()) {
    tracks.push({ ...added, keys: added.keys.map((k) => ({ ...k })), editable: true });
  }
  const merged: Timeline = { ...code, tracks };
  if (sidecar.labels && Object.keys(sidecar.labels).length > 0) {
    merged.labels = { ...code.labels, ...sidecar.labels };
  }
  return merged;
}
