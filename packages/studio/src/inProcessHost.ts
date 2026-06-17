/**
 * The in-process StudioHost (DESIGN.md §6.4): the studio's direct implementation
 * of the editor protocol. Every method is structured-clone-safe (plain JSON in /
 * out) so the SAME interface runs over postMessage/WebSocket later. Edits route
 * through `applyPatch` (the atomic §6.3 TimelinePatch engine) and return the
 * inverse transaction for the undo stack; reads (`getSceneTree`/`getTimeline`)
 * deep-derive plain data — never live Node/Signal refs.
 */

import { mergeSidecarDetailed, type SidecarDoc, type Timeline, type Track } from '@glissade/core';
import {
  applyPatches,
  isEditableNodeId,
  type BaselineLookup,
  type MergedTimeline,
  type NodeDescriptor,
  type PatchResult,
  type PropDescriptor,
  type SignalPath,
  type StudioEvent,
  type StudioHost,
  type TimelinePatch,
  type Unsubscribe,
} from '@glissade/core/studio-host';
import type { Scene } from '@glissade/scene';

export interface InProcessHostInit {
  scene: Scene;
  /** the code-baseline Timeline (un-merged) this scene compiles from. */
  codeTimeline: Timeline;
  /** the persisted editor sidecar (null = none yet). */
  sidecar?: SidecarDoc | null;
}

/** The host plus the few extras App needs to bridge it to React state. */
export interface InProcessHost extends StudioHost {
  /** the current sidecar doc (clone-safe) — for persistence + re-merge. */
  getDoc(): SidecarDoc | null;
  /** replace the sidecar (e.g. after loading a scene or an undo not routed through applyPatch). */
  loadSidecar(doc: SidecarDoc | null): void;
}

export function createInProcessHost(init: InProcessHostInit): InProcessHost {
  const { scene, codeTimeline } = init;
  let doc: SidecarDoc | null = init.sidecar ?? null;

  const listeners: Record<StudioEvent, Set<(...a: unknown[]) => void>> = {
    'tree-changed': new Set(),
    'doc-patched': new Set(),
    'playhead-moved': new Set(),
  };
  const emit = (ev: StudioEvent, ...args: unknown[]): void => {
    for (const cb of listeners[ev]) cb(...args);
  };

  // seed a first edit on a code-only track from the code baseline (records baseHash)
  const baseline: BaselineLookup = (_timelineId, target) => {
    const t = codeTimeline.tracks.find((tr) => tr.target === target);
    return t ? { type: t.type, keys: t.keys } : null;
  };

  const merged = (): MergedTimeline => {
    const { timeline, orphans } = mergeSidecarDetailed(codeTimeline, doc);
    return { ...timeline, orphans };
  };

  return {
    getSceneTree(): NodeDescriptor[] {
      // group the merged tracks by node id so each descriptor lists its
      // animated props + editability (minimal schema, §6.4 — the richer Inspector
      // schema lands with DJ0/QGRNHaLZ)
      const byNode = new Map<string, Track[]>();
      for (const t of merged().tracks) {
        const slash = t.target.indexOf('/');
        if (slash < 0) continue;
        const id = t.target.slice(0, slash);
        (byNode.get(id) ?? byNode.set(id, []).get(id)!).push(t);
      }
      const out: NodeDescriptor[] = [];
      for (const [id, node] of scene.nodes) {
        const props: PropDescriptor[] = (byNode.get(id) ?? []).map((t) => ({
          name: t.target.slice(id.length + 1),
          type: t.type,
          editable: isEditableNodeId(id) && t.editable === true,
        }));
        out.push({ id, type: node.constructor.name, props });
      }
      return out;
    },

    getTimeline: merged,

    subscribeSignal(path: SignalPath, cb: (v: unknown) => void): Unsubscribe {
      // resolve the target to validate the path; the prop's value is a pure
      // function of the playhead, so bridge the playhead as the reactive trigger
      // (per-prop value resolution lands with the richer Inspector).
      if (!scene.resolveTarget(path)) return () => {};
      return scene.playhead.subscribe(() => cb(scene.playhead.peek()));
    },

    applyPatch(patches: TimelinePatch[]): PatchResult {
      const r = applyPatches(doc ?? { sidecarVersion: 2, timelines: { main: { tracks: {} } } }, patches, baseline);
      if (r.ok) {
        doc = r.doc;
        emit('doc-patched');
      }
      return r;
    },

    setPlayhead(t: number): void {
      scene.playhead.set(t);
      emit('playhead-moved', t);
    },

    on(ev: StudioEvent, cb: (...args: unknown[]) => void): Unsubscribe {
      listeners[ev].add(cb);
      return () => listeners[ev].delete(cb);
    },

    getDoc(): SidecarDoc | null {
      return doc;
    },

    loadSidecar(next: SidecarDoc | null): void {
      doc = next;
      emit('doc-patched');
    },
  };
}
