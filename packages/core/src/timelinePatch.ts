/**
 * TimelinePatch (DESIGN.md §6.3): the serializable, atomic edit primitive the
 * studio applies to the sidecar overlay. Forward patches are **fine-grained and
 * address keys by stable `k<N>` id** (so an edit survives a retime/reorder —
 * `tx.moveKey('title/opacity', 'k2', { t: 1.25 })`). The INVERSE of a
 * transaction is a per-touched-track snapshot restore (a **verbatim**
 * `setTrackKeys` of the exact pre-state, or `removeTrack` if it didn't exist).
 * It round-trips byte-for-byte even when the pre-state was un-normalized: the
 * inverse sets `verbatim: true` so it replays the snapshot AS-IS, bypassing the
 * `normalizeEditedKeys` re-pin/collision-nudge (§2.7) that would otherwise
 * re-derive — not restore — the prior keys. (The forward editor path still
 * normalizes.)
 *
 * Every variant is plain JSON (no functions/classes) so the whole protocol is
 * structured-clone-safe (§6.4) for a future postMessage/WebSocket host.
 */

import { type EaseSpec } from './easing.js';
import {
  assignKeyIds,
  hashKeys,
  normalizeEditedKeys,
  type SidecarDoc,
  type SidecarTimelineEntry,
  type SidecarTrackEntry,
} from './sidecar.js';
import { isEditableNodeId, targetNodeId } from './targetRef.js';
import { type Key } from './track.js';
import { type ValueTypeId } from './valueTypes.js';

/** A new key's data (no id — one is assigned on apply). */
export interface NewKey {
  t: number;
  value: unknown;
  ease?: EaseSpec;
  interp?: 'default' | 'hold';
}

export type TimelinePatch =
  | { op: 'setTrackKeys'; timelineId: string; target: string; type: ValueTypeId; keys: Key[]; baseHash?: string | null; verbatim?: boolean }
  | { op: 'removeTrack'; timelineId: string; target: string; prune?: boolean }
  | { op: 'addKey'; timelineId: string; target: string; key: NewKey }
  | { op: 'removeKey'; timelineId: string; target: string; id: string }
  | { op: 'moveKey'; timelineId: string; target: string; id: string; t: number }
  | { op: 'setKeyValue'; timelineId: string; target: string; id: string; value: unknown }
  | { op: 'setKeyEase'; timelineId: string; target: string; id: string; ease?: EaseSpec; interp?: 'default' | 'hold' }
  | { op: 'setLabel'; timelineId: string; name: string; t: number }
  | { op: 'removeLabel'; timelineId: string; name: string };
// (label ops carry timelineId — 'main' for the linear timeline)

export interface PatchOk {
  ok: true;
  doc: SidecarDoc;
  /** inverse transaction — apply to undo (restores each touched track/label). */
  inverse: TimelinePatch[];
}
export interface PatchErr {
  ok: false;
  error: string;
}
export type PatchResult = PatchOk | PatchErr;

/** The code-baseline track for a target, so a first edit on a code-only track seeds + records its baseHash. */
export interface TrackBaseline {
  type: ValueTypeId;
  keys: readonly Key[];
}
export type BaselineLookup = (timelineId: string, target: string) => TrackBaseline | null;

/** Unambiguous composite map key (no control-char separators). */
function refKey(timelineId: string, name: string): string {
  return JSON.stringify([timelineId, name]);
}
function parseRefKey(k: string): [string, string] {
  return JSON.parse(k) as [string, string];
}

function getTimeline(doc: SidecarDoc, id: string): SidecarTimelineEntry {
  return doc.timelines[id] ?? { tracks: {} };
}

/** The current sidecar entry for a target, seeding from the code baseline (with ids) if absent. */
function resolveEntry(doc: SidecarDoc, p: { timelineId: string; target: string }, baseline?: BaselineLookup): SidecarTrackEntry | null {
  const existing = doc.timelines[p.timelineId]?.tracks[p.target];
  if (existing) return existing;
  const base = baseline?.(p.timelineId, p.target) ?? null;
  if (!base) return null;
  return { type: base.type, baseHash: hashKeys(base.keys), keys: assignKeyIds(base.keys.map((k) => ({ ...k }))) };
}

function putEntry(doc: SidecarDoc, timelineId: string, target: string, entry: SidecarTrackEntry): SidecarDoc {
  const tl = getTimeline(doc, timelineId);
  return { ...doc, timelines: { ...doc.timelines, [timelineId]: { ...tl, tracks: { ...tl.tracks, [target]: entry } } } };
}

function removeEntry(doc: SidecarDoc, timelineId: string, target: string, prune = false): SidecarDoc {
  const tl = doc.timelines[timelineId];
  if (!tl?.tracks[target]) return doc;
  const tracks = { ...tl.tracks };
  delete tracks[target];
  // prune the timeline only when `prune` is set — the inverse sets it for a
  // timeline the transaction CREATED, so undo restores {timelines:{}} exactly
  // instead of an empty {tracks:{}} shell (an empty timeline is merge-equivalent
  // to absent, but a wrong-direction prune would corrupt a legit empty timeline)
  const labels = tl.labels;
  if (prune && Object.keys(tracks).length === 0 && (!labels || Object.keys(labels).length === 0)) {
    const timelines = { ...doc.timelines };
    delete timelines[timelineId];
    return { ...doc, timelines };
  }
  return { ...doc, timelines: { ...doc.timelines, [timelineId]: { ...tl, tracks } } };
}

/**
 * Apply a key-list edit. `verbatim` restores keys EXACTLY as given (the inverse
 * path — it is replaying a prior valid state, so re-normalizing would re-pin
 * springs / re-nudge collisions and break byte-exact undo). The forward editor
 * path normalizes (§2.7 spring re-pin + collision nudge) and (re)assigns ids.
 */
function withKeys(entry: SidecarTrackEntry, keys: Key[], verbatim = false): SidecarTrackEntry {
  return { ...entry, keys: verbatim ? keys.map((k) => ({ ...k })) : assignKeyIds(normalizeEditedKeys(keys)) };
}

/**
 * Apply a batch of patches **atomically**: validate-and-build against a working
 * copy; on the FIRST invalid patch, return `{ ok: false }` with the original
 * doc untouched (immutable updates never mutate the input). On success, return
 * the new doc plus the inverse transaction (one snapshot-restore per touched
 * track/label). `baseline` seeds a first edit on a code-only track.
 */
export function applyPatches(doc: SidecarDoc, patches: readonly TimelinePatch[], baseline?: BaselineLookup): PatchResult {
  let work = doc;
  const trackSnap = new Map<string, SidecarTrackEntry | null>(); // pre-transaction entry per touched track
  const labelSnap = new Map<string, number | undefined>(); // pre-transaction label value per touched name
  const tlExisted = new Map<string, boolean>(); // did each touched timeline exist pre-transaction?

  const snapTrack = (timelineId: string, target: string): void => {
    if (!tlExisted.has(timelineId)) tlExisted.set(timelineId, work.timelines[timelineId] !== undefined);
    const k = refKey(timelineId, target);
    if (!trackSnap.has(k)) trackSnap.set(k, work.timelines[timelineId]?.tracks[target] ?? null);
  };
  const snapLabel = (timelineId: string, name: string): void => {
    const k = refKey(timelineId, name);
    if (!labelSnap.has(k)) labelSnap.set(k, work.timelines[timelineId]?.labels?.[name]);
  };

  for (const p of patches) {
    switch (p.op) {
      case 'setTrackKeys': {
        // only an explicit-id node may host an editor track (§6.4/§6.5) — gate the
        // write surface, not just the builder. `verbatim` (inverse restore) is
        // exempt: it replays a prior state that already passed this gate.
        if (!p.verbatim && !isEditableNodeId(targetNodeId(p.target))) {
          return { ok: false, error: `setTrackKeys: '${p.target}' is not an editable host (structural/un-id'd nodes cannot host tracks, §6.5)` };
        }
        snapTrack(p.timelineId, p.target);
        const prev = work.timelines[p.timelineId]?.tracks[p.target];
        const entry: SidecarTrackEntry = withKeys(
          { type: p.type, baseHash: p.baseHash !== undefined ? p.baseHash : (prev?.baseHash ?? null), keys: [] },
          p.keys.map((k) => ({ ...k })),
          p.verbatim,
        );
        work = putEntry(work, p.timelineId, p.target, entry);
        break;
      }
      case 'removeTrack': {
        if (!work.timelines[p.timelineId]?.tracks[p.target]) return { ok: false, error: `removeTrack: no sidecar track '${p.target}'` };
        snapTrack(p.timelineId, p.target);
        work = removeEntry(work, p.timelineId, p.target, p.prune);
        break;
      }
      case 'addKey': {
        if (!isEditableNodeId(targetNodeId(p.target))) {
          return { ok: false, error: `addKey: '${p.target}' is not an editable host (structural/un-id'd nodes cannot host tracks, §6.5)` };
        }
        const entry = resolveEntry(work, p, baseline);
        if (!entry) return { ok: false, error: `addKey: unknown track '${p.target}' (no sidecar entry and no code baseline)` };
        snapTrack(p.timelineId, p.target);
        const k: Key = {
          t: p.key.t,
          value: p.key.value,
          ...(p.key.ease !== undefined ? { ease: p.key.ease } : {}),
          ...(p.key.interp !== undefined ? { interp: p.key.interp } : {}),
        };
        work = putEntry(work, p.timelineId, p.target, withKeys(entry, [...entry.keys, k]));
        break;
      }
      case 'removeKey':
      case 'moveKey':
      case 'setKeyValue':
      case 'setKeyEase': {
        const entry = resolveEntry(work, p, baseline);
        if (!entry) return { ok: false, error: `${p.op}: unknown track '${p.target}'` };
        if (!entry.keys.some((k) => k.id === p.id)) return { ok: false, error: `${p.op}: no key '${p.id}' in '${p.target}'` };
        snapTrack(p.timelineId, p.target);
        const next: Key[] =
          p.op === 'removeKey'
            ? entry.keys.filter((k) => k.id !== p.id)
            : entry.keys.map((k) => {
                if (k.id !== p.id) return k;
                if (p.op === 'moveKey') return { ...k, t: Math.max(0, p.t) };
                if (p.op === 'setKeyValue') return { ...k, value: p.value };
                // setKeyEase: ease/interp present in the patch are set; absent clears
                const u = { ...k } as Key;
                if (p.ease !== undefined) u.ease = p.ease;
                else delete u.ease;
                if (p.interp !== undefined) u.interp = p.interp;
                else delete u.interp;
                return u;
              });
        work = putEntry(work, p.timelineId, p.target, withKeys(entry, next));
        break;
      }
      case 'setLabel': {
        snapLabel(p.timelineId, p.name);
        const tl = getTimeline(work, p.timelineId);
        work = { ...work, timelines: { ...work.timelines, [p.timelineId]: { ...tl, labels: { ...(tl.labels ?? {}), [p.name]: p.t } } } };
        break;
      }
      case 'removeLabel': {
        snapLabel(p.timelineId, p.name);
        const tl = work.timelines[p.timelineId];
        if (tl?.labels && p.name in tl.labels) {
          const labels = { ...tl.labels };
          delete labels[p.name];
          work = { ...work, timelines: { ...work.timelines, [p.timelineId]: { ...tl, labels } } };
        }
        break;
      }
    }
  }

  // build the inverse: restore each touched track/label to its pre-transaction state
  const inverse: TimelinePatch[] = [];
  for (const [k, snap] of trackSnap) {
    const [timelineId, target] = parseRefKey(k);
    // a track that didn't exist before → undo removes it; prune the timeline too
    // iff the transaction also created that timeline (so undo restores it exactly)
    if (snap === null) {
      inverse.push(
        tlExisted.get(timelineId) === false
          ? { op: 'removeTrack', timelineId, target, prune: true }
          : { op: 'removeTrack', timelineId, target },
      );
    }
    // verbatim: restore the exact pre-state keys (incl. their ids), bypassing
    // normalize — undo must replay the prior state, not re-derive it
    else inverse.push({ op: 'setTrackKeys', timelineId, target, type: snap.type, keys: snap.keys.map((x) => ({ ...x })), baseHash: snap.baseHash, verbatim: true });
  }
  for (const [k, value] of labelSnap) {
    const [timelineId, name] = parseRefKey(k);
    inverse.push(value === undefined ? { op: 'removeLabel', timelineId, name } : { op: 'setLabel', timelineId, name, t: value });
  }

  return { ok: true, doc: work, inverse };
}

/** Apply a single patch (convenience over `applyPatches`). */
export function applyPatch(doc: SidecarDoc, patch: TimelinePatch, baseline?: BaselineLookup): PatchResult {
  return applyPatches(doc, [patch], baseline);
}
