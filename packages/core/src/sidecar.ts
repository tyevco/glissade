/**
 * The editor sidecar (DESIGN.md §6.2): code declares scene structure and
 * programmatic tracks; the studio owns keyframe data persisted next to the
 * scene module and merged at track granularity. Versioned independently of the
 * API (§7.4) — breaking it orphans users' files, so v1 documents migrate.
 *
 * v2 namespaces edits by timeline id ('main' for the linear timeline; v2
 * machines add more), keys tracks by canonical target, records the code
 * baseline hash for drift detection, parks drifted tracks as `orphans`, and
 * gives keys stable `k<N>` ids.
 */

import { emitDevWarning } from './devWarning.js';
import { spring as springFactory } from './spring.js';
import { isEditableNodeId, targetNodeId } from './targetRef.js';
import { type Timeline } from './timeline.js';
import { type Key, type Track, TrackValidationError } from './track.js';
import { type ValueTypeId } from './valueTypes.js';

export type OrphanReason = 'node-missing' | 'prop-missing' | 'type-changed';

export interface SidecarTrackEntry {
  /** value type, so an editor-created track binds without a code baseline. */
  type: ValueTypeId;
  /** hash of the code baseline this track branched from; null = editor-created. */
  baseHash: string | null;
  keys: Key[];
}

export interface SidecarOrphan {
  type: ValueTypeId;
  keys: Key[];
  reason: OrphanReason;
}

export interface SidecarTimelineEntry {
  /** editor-owned tracks, keyed by canonical target. */
  tracks: Record<string, SidecarTrackEntry>;
  /** editor-created labels. */
  labels?: Record<string, number>;
  /** tracks parked off the merge because their target drifted (§6.2 rule 3). */
  orphans?: Record<string, SidecarOrphan>;
}

export interface SidecarDoc {
  sidecarVersion: 2;
  /** edits namespaced by timeline id; the linear timeline is 'main'. */
  timelines: Record<string, SidecarTimelineEntry>;
}

/** The flat v1 shape, accepted on load and migrated forward. */
export interface SidecarDocV1 {
  sidecarVersion: 1;
  tracks: Track[];
  labels?: Record<string, number>;
}

const MAIN = 'main';

// (isEditableNodeId — the node half of the editability rule — lives in
// targetRef.ts, the addressing module, shared by the builder/scene/host.)

export class SidecarVersionError extends Error {
  constructor(version: unknown) {
    super(`unsupported sidecar version ${String(version)}; this build reads sidecarVersion 1 or 2`);
    this.name = 'SidecarVersionError';
  }
}

export function emptySidecar(): SidecarDoc {
  return { sidecarVersion: 2, timelines: { [MAIN]: { tracks: {} } } };
}

/** Lift a v1 (or already-v2) document to the v2 shape. Throws on unknown versions. */
export function migrateSidecar(doc: SidecarDoc | SidecarDocV1 | null | undefined): SidecarDoc | null {
  if (!doc) return null;
  if (doc.sidecarVersion === 2) return doc;
  if (doc.sidecarVersion === 1) {
    const tracks: Record<string, SidecarTrackEntry> = {};
    for (const t of doc.tracks) tracks[t.target] = { type: t.type, baseHash: null, keys: t.keys };
    const main: SidecarTimelineEntry = { tracks };
    if (doc.labels) main.labels = doc.labels;
    return { sidecarVersion: 2, timelines: { [MAIN]: main } };
  }
  throw new SidecarVersionError((doc as { sidecarVersion: unknown }).sidecarVersion);
}

/** Stable hash of a code track's keys — the baseline an editor branch records. */
export function hashKeys(keys: readonly Key[]): string {
  const s = JSON.stringify(keys.map((k) => [k.t, k.value, k.ease ?? null, k.interp ?? null]));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Assign stable monotonic `k<N>` ids to keys lacking one; existing ids preserved. */
export function assignKeyIds(keys: readonly Key[]): Key[] {
  let max = -1;
  for (const k of keys) {
    const m = k.id ? /^k(\d+)$/.exec(k.id) : null;
    if (m) max = Math.max(max, Number(m[1]));
  }
  return keys.map((k) => (k.id ? { ...k } : { ...k, id: `k${++max}` }));
}

/**
 * Set one editable track's keys in the sidecar (§6.2) — the studio write path.
 * `codeBaselineKeys` is the code track this branches from (null = editor-created
 * with no baseline). Keys get stable `k<N>` ids. Returns a new document.
 */
export function setSidecarTrack(
  doc: SidecarDoc,
  timelineId: string,
  target: string,
  type: ValueTypeId,
  keys: Key[],
  codeBaselineKeys: readonly Key[] | null,
): SidecarDoc {
  // only an explicit-id node may host an editor track (§6.4/§6.5) — gate this
  // write path so a structural/un-id'd target can't persist a track that then
  // crashes evaluate() (mirrors the builder + patch-engine guards)
  if (!isEditableNodeId(targetNodeId(target))) {
    throw new TrackValidationError(
      target,
      "structural/un-id'd nodes cannot host editor tracks (§6.5) — only nodes with an explicit id",
    );
  }
  const tl = doc.timelines[timelineId] ?? { tracks: {} };
  const entry: SidecarTrackEntry = {
    type,
    baseHash: codeBaselineKeys ? hashKeys(codeBaselineKeys) : null,
    keys: assignKeyIds(keys),
  };
  return {
    ...doc,
    timelines: { ...doc.timelines, [timelineId]: { ...tl, tracks: { ...tl.tracks, [target]: entry } } },
  };
}

/**
 * Remove one editor-owned track from the sidecar (§6.2 rule 7 write-back): the
 * "extract edits to code" affordance deletes the sidecar entry after copying its
 * `key(...)` source to the clipboard. Source is never mutated — the user pastes
 * the generated calls themselves. A missing entry is a no-op (returns the input
 * unchanged); the document is never mutated in place.
 */
export function deleteSidecarTrack(doc: SidecarDoc, timelineId: string, target: string): SidecarDoc {
  const tl = doc.timelines[timelineId];
  if (!tl || !(target in tl.tracks)) return doc;
  const { [target]: _removed, ...rest } = tl.tracks;
  return {
    ...doc,
    timelines: { ...doc.timelines, [timelineId]: { ...tl, tracks: rest } },
  };
}

/**
 * Re-resolve `derived:true` leading keys against the merged track (§2.6): a
 * derived from-key duplicates the preceding key's held value, so an upstream
 * edit must flow into it or the segment pops at its start. Build-time derived
 * keys are already correct; this fixes the ones an edit moved beneath.
 */
function reresolveDerived(keys: Key[]): Key[] {
  if (!keys.some((k) => k.derived)) return keys;
  return keys.map((k, i) => (k.derived && i > 0 ? { ...k, value: keys[i - 1]!.value } : k));
}

export interface MergeResult {
  timeline: Timeline;
  /** targets whose code baseline changed beneath the editor's keys (§6.2 rule 2). */
  drift: string[];
  /** sidecar tracks parked off the merge (§6.2 rule 3). */
  orphans: Record<string, SidecarOrphan>;
}

/**
 * Merge with the full §6.2 report: the bindable Timeline, the list of targets
 * whose code baseline drifted, and the orphaned tracks (type-changed, or whose
 * code track vanished). Orphans are NEVER merged, so a drifted edit can't make
 * the whole overlay fail to bind — the good edits survive. Inputs unmutated.
 */
export function mergeSidecarDetailed(
  code: Timeline,
  sidecar: SidecarDoc | SidecarDocV1 | null | undefined,
): MergeResult {
  const doc = migrateSidecar(sidecar);
  if (!doc) return { timeline: code, drift: [], orphans: {} };
  const main = doc.timelines[MAIN] ?? { tracks: {} };
  const overlay = new Map(Object.entries(main.tracks));
  const drift: string[] = [];
  const orphans: Record<string, SidecarOrphan> = { ...(main.orphans ?? {}) };

  const tracks: Track[] = code.tracks.map((t) => {
    const entry = overlay.get(t.target);
    if (!entry) return t;
    overlay.delete(t.target);
    if (entry.type !== t.type) {
      orphans[t.target] = { type: entry.type, keys: entry.keys, reason: 'type-changed' };
      return t; // keep the code track; the stale editor entry is parked
    }
    if (entry.baseHash !== null && entry.baseHash !== hashKeys(t.keys)) drift.push(t.target);
    return { ...t, keys: reresolveDerived(entry.keys.map((k) => ({ ...k }))), editable: true };
  });

  for (const [target, entry] of overlay) {
    if (entry.baseHash !== null) {
      // it once branched from a code track that's now gone → orphan (the studio refines node vs prop)
      orphans[target] = { type: entry.type, keys: entry.keys, reason: 'prop-missing' };
    } else {
      // editor-created track for a prop code never animated → add it
      tracks.push({ target, type: entry.type, keys: reresolveDerived(entry.keys.map((k) => ({ ...k }))), editable: true });
    }
  }

  const merged: Timeline = { ...code, tracks };
  if (main.labels && Object.keys(main.labels).length > 0) {
    const codeLabels = code.labels ?? {};
    const shadowed = Object.keys(main.labels).filter((n) => n in codeLabels);
    if (shadowed.length) {
      emitDevWarning(`sidecar label(s) ${shadowed.join(', ')} collide with code labels; code wins (§6.2)`);
    }
    merged.labels = { ...main.labels, ...codeLabels };
  }
  if (drift.length) {
    emitDevWarning(`sidecar: code baseline changed beneath edits on ${drift.join(', ')} (§6.2)`);
  }
  return { timeline: merged, drift, orphans };
}

/** Merge the sidecar overlay onto the code baseline → a bindable Timeline (§6.2). */
export function mergeSidecar(code: Timeline, sidecar: SidecarDoc | SidecarDocV1 | null | undefined): Timeline {
  return mergeSidecarDetailed(code, sidecar).timeline;
}

/**
 * Editor-edit normalization (§2.7 invariant): a spring-eased key's t is
 * intrinsic — prev.t + spring.duration(cfg) — so after any retime, sort and
 * re-pin spring keys to their predecessors. Dragging a spring key itself
 * therefore snaps back; retiming its predecessor carries it along. Returns a
 * new array. Colliding keys are NUDGED apart (+1ms), never deleted — an editor
 * must not silently destroy keyframe data on an exact-t collision.
 */
export function normalizeEditedKeys(keys: Key[]): Key[] {
  const out = keys.map((k) => ({ ...k })).sort((a, b) => a.t - b.t);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < out.length; i++) {
      const ease = out[i]!.ease;
      if (ease && typeof ease === 'object' && ease.kind === 'spring') {
        out[i]!.t = out[i - 1]!.t + springFactory.duration(ease);
      }
    }
    out.sort((a, b) => a.t - b.t);
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.t <= out[i - 1]!.t) out[i]!.t = out[i - 1]!.t + 0.001;
  }
  return out;
}
