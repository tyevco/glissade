/**
 * The editor sidecar (DESIGN.md §6.2): code declares scene structure and
 * programmatic tracks; the studio owns keyframe data persisted as a sidecar
 * document next to the scene module, merged at track granularity. Versioned
 * independently of the API (§7.4) — breaking it orphans users' files.
 */

import { type Timeline } from './timeline.js';
import { type Track } from './track.js';

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
