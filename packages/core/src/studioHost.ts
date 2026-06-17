/**
 * The editor protocol (DESIGN.md §6.4): the studio talks to the runtime ONLY
 * through this host interface. Every method is structured-clone-safe by design
 * (plain JSON in/out, no live Node/Signal refs), so the same interface runs
 * in-process today and over postMessage/WebSocket later. This is a separate
 * entry point — `@glissade/core/studio-host` — so tree-shaking keeps every byte
 * of editor support out of the embed bundle.
 */

import { type Timeline } from './timeline.js';
import { type ValueTypeId } from './valueTypes.js';
import { type SidecarOrphan } from './sidecar.js';
import { type PatchResult, type TimelinePatch } from './timelinePatch.js';

/** The merged code+sidecar view plus the tracks parked off the merge (§6.2 rule 3). */
export type MergedTimeline = Timeline & {
  orphans: Record<string, SidecarOrphan>;
};

/** `${nodeId}/${propPath}` — the §2.2 canonical track grammar. */
export type SignalPath = string;
export type Unsubscribe = () => void;

export interface PropDescriptor {
  name: string;
  type: ValueTypeId;
  /** editable IFF the node has an explicit id AND a merged/editor-created track exists (§6.4 sub-decision). */
  editable: boolean;
}

export interface NodeDescriptor {
  id: string;
  /** the node kind (Group/Rect/Text/…). */
  type: string;
  props: PropDescriptor[];
}

export type StudioEvent = 'tree-changed' | 'doc-patched' | 'playhead-moved';

export interface StudioHost {
  /** ids, types, prop schemas + editability — deep plain data, clone-safe. */
  getSceneTree(): NodeDescriptor[];
  /** merged code+sidecar timeline + orphans (§6.2). */
  getTimeline(): MergedTimeline;
  /** bridge a node/prop signal to a callback; returns an unsubscribe. */
  subscribeSignal(path: SignalPath, cb: (v: unknown) => void): Unsubscribe;
  /** apply an edit transaction — validated + atomic; returns the inverse for undo. */
  applyPatch(patches: TimelinePatch[]): PatchResult;
  setPlayhead(t: number): void;
  on(ev: StudioEvent, cb: (...args: unknown[]) => void): Unsubscribe;
}

// the single editable-host rule lives in the addressing module (embed-safe),
// shared by the builder guard, the scene, and this host
export { isEditableNodeId, targetNodeId } from './targetRef.js';

// the patch engine ships in this same editor-only entry (kept out of the embed `.` bundle)
export {
  applyPatch,
  applyPatches,
  type BaselineLookup,
  type NewKey,
  type PatchErr,
  type PatchOk,
  type PatchResult,
  type TimelinePatch,
  type TrackBaseline,
} from './timelinePatch.js';
