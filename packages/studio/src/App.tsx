/**
 * Studio (DESIGN.md §6): slice 2 adds editing — the studio owns keyframe data
 * persisted as a per-scene sidecar (`<module>.edits.json`, §6.2) merged at
 * track granularity over the code baseline. Edits survive code edits + HMR:
 * the sidecar lives on disk, the baseline in code, and the merge re-runs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  compileTimeline,
  emptySidecar,
  mergeSidecar,
  type CompiledTimeline,
  type EaseSpec,
  type Key,
  type SidecarDoc,
  type Track,
} from '@glissade/core';
import {
  addKeyAt,
  closestIndex,
  deleteKeyAt,
  parseValue,
  retimeKeyAt,
  setEaseAt,
  setValueAt,
  upsertKeyAt,
  type KeyRef,
} from './edits.js';
import { KeyEditor } from './KeyEditor.js';
import { type Scene, type SceneModule } from '@glissade/scene';
import { mount, type Mounted } from '@glissade/player';
import goldenShapes from '../../examples/src/scenes/golden-shapes.js';
import goldenBounce from '../../examples/src/scenes/golden-bounce.js';
import spinners from '../../examples/src/scenes/showcase/spinners.js';
import loaders from '../../examples/src/scenes/showcase/loaders.js';
import dashboard from '../../examples/src/scenes/showcase/dashboard.js';
import transitions from '../../examples/src/scenes/showcase/transitions.js';
import micro from '../../examples/src/scenes/showcase/micro.js';
import typography from '../../examples/src/scenes/golden-typography.js';
import layoutScene from '../../examples/src/scenes/golden-layout.js';
import flexboard from '../../examples/src/scenes/showcase/flexboard.js';
import { Transport } from './Transport.js';
import { TimelinePanel } from './TimelinePanel.js';
import { Inspector } from './Inspector.js';

const SCENES = 'packages/examples/src/scenes';
const corpus: Record<string, { mod: SceneModule; path: string }> = {
  shapes: { mod: goldenShapes, path: `${SCENES}/golden-shapes.ts` },
  bounce: { mod: goldenBounce, path: `${SCENES}/golden-bounce.ts` },
  spinners: { mod: spinners, path: `${SCENES}/showcase/spinners.ts` },
  loaders: { mod: loaders, path: `${SCENES}/showcase/loaders.ts` },
  dashboard: { mod: dashboard, path: `${SCENES}/showcase/dashboard.ts` },
  transitions: { mod: transitions, path: `${SCENES}/showcase/transitions.ts` },
  micro: { mod: micro, path: `${SCENES}/showcase/micro.ts` },
  typography: { mod: typography, path: `${SCENES}/golden-typography.ts` },
  layout: { mod: layoutScene, path: `${SCENES}/golden-layout.ts` },
  flexboard: { mod: flexboard, path: `${SCENES}/showcase/flexboard.ts` },
};

const sidecarUrl = (path: string) => `/__glissade/sidecar?scene=${encodeURIComponent(path)}`;

export function App() {
  const [sceneName, setSceneName] = useState('shapes');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<KeyRef | null>(null);
  const [sidecar, setSidecar] = useState<SidecarDoc | null>(null);
  const [sidecarLoaded, setSidecarLoaded] = useState(false);
  const undoStack = useRef<SidecarDoc[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<{ scene: Scene; mounted: Mounted } | null>(null);
  const lastTime = useRef(0);

  const entry = corpus[sceneName]!;
  // an invalid sidecar must degrade to the code baseline with a visible
  // warning (§6.2: surfaced, never a crash and never silently dropped)
  const { merged, compiled, sidecarError } = useMemo((): {
    merged: ReturnType<typeof mergeSidecar>;
    compiled: CompiledTimeline;
    sidecarError: string | null;
  } => {
    const candidate = mergeSidecar(entry.mod.timeline, sidecar);
    try {
      return { merged: candidate, compiled: compileTimeline(candidate), sidecarError: null };
    } catch (e) {
      return {
        merged: entry.mod.timeline,
        compiled: compileTimeline(entry.mod.timeline),
        sidecarError: e instanceof Error ? e.message : String(e),
      };
    }
  }, [entry, sidecar]);

  // load the persisted sidecar when the scene changes
  useEffect(() => {
    setSidecarLoaded(false);
    setSidecar(null);
    setSelectedKey(null);
    undoStack.current = [];
    void fetch(sidecarUrl(entry.path))
      .then((r) => r.json())
      .then((doc: SidecarDoc | null) => {
        setSidecar(doc);
        setSidecarLoaded(true);
      });
  }, [entry]);

  // (re)mount on scene/document change, preserving the playhead position
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sidecarLoaded) return;
    const scene = entry.mod.createScene();
    const mounted = mount(scene, merged, canvas, { loop: true });
    mounted.player.seek(Math.min(lastTime.current, mounted.player.duration));
    const stopTracking = scene.playhead.subscribe(() => {
      lastTime.current = scene.playhead.peek();
    });
    setSession({ scene, mounted });
    return () => {
      stopTracking();
      mounted.dispose();
      setSession(null);
    };
  }, [entry, merged, sidecarLoaded]);

  // debounced persistence
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (doc: SidecarDoc) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        void fetch(sidecarUrl(entry.path), { method: 'POST', body: JSON.stringify(doc) });
      }, 300);
    },
    [entry],
  );

  /**
   * Every edit is "replace one track's keys in the sidecar" (§6.2): the ops
   * in edits.ts return normalized key arrays; this commits them with an undo
   * snapshot and re-selects the edited key by its post-normalize t.
   */
  const writeKeys = useCallback(
    (target: string, keys: Key[] | null, reselectT?: number) => {
      const sourceTrack = compiled.tracks.get(target);
      if (!keys || !sourceTrack) return;
      const current = sidecar ?? emptySidecar();
      undoStack.current.push(JSON.parse(JSON.stringify(current)) as SidecarDoc);
      const tracks: Track[] = [
        ...current.tracks.filter((t) => t.target !== target),
        { target, type: sourceTrack.type, keys },
      ];
      const next: SidecarDoc = { ...current, tracks };
      setSidecar(next);
      persist(next);
      if (reselectT !== undefined && keys.length > 0) {
        setSelectedKey({ target, t: keys[closestIndex(keys, reselectT)]!.t });
      }
    },
    [compiled, sidecar, persist],
  );

  const trackOf = useCallback((target: string) => compiled.tracks.get(target), [compiled]);

  /** Drag retiming (identity by closest-t — the §6.2 lesson from a vanished key). */
  const editKey = useCallback(
    (target: string, fromT: number, newT: number) => {
      const tr = trackOf(target);
      if (tr) writeKeys(target, retimeKeyAt(tr, fromT, newT), newT);
    },
    [trackOf, writeKeys],
  );

  const addKey = useCallback(
    (target: string, t: number) => {
      const tr = trackOf(target);
      if (tr) writeKeys(target, addKeyAt(tr, t), t);
    },
    [trackOf, writeKeys],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedKey) return;
    const tr = trackOf(selectedKey.target);
    if (!tr) return;
    writeKeys(selectedKey.target, deleteKeyAt(tr, selectedKey.t));
    setSelectedKey(null);
  }, [selectedKey, trackOf, writeKeys]);

  /** Inspector write-at-playhead: update the key under the cursor or insert one. */
  const setValueAtPlayhead = useCallback(
    (target: string, raw: string) => {
      const tr = trackOf(target);
      if (!tr || !session) return;
      const value = parseValue(tr.type, raw);
      if (value === null) return;
      const t = session.scene.playhead.peek();
      writeKeys(target, upsertKeyAt(tr, t, value), t);
    },
    [trackOf, session, writeKeys],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev === undefined) return;
    const restored = prev.tracks.length === 0 && !prev.labels ? null : prev;
    setSidecar(restored);
    setSelectedKey(null); // the snapshot may not contain the selected key
    persist(restored ?? emptySidecar());
  }, [persist]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, deleteSelected]);

  const selectedTrack = selectedKey ? trackOf(selectedKey.target) : undefined;

  return (
    <div className="studio">
      <div className="viewport">
        <select
          className="scene-picker"
          value={sceneName}
          onChange={(e) => setSceneName(e.target.value)}
        >
          {Object.keys(corpus).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <canvas ref={canvasRef} width={640} height={360} />
      </div>
      {session && <Transport player={session.mounted.player} />}
      {sidecarError && (
        <div
          style={{
            position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
            background: '#5b2330', color: '#ffd7dd', padding: '6px 14px',
            borderRadius: 8, zIndex: 10, maxWidth: '70vw', fontSize: 12,
          }}
        >
          sidecar rejected — showing the code baseline: {sidecarError}
        </div>
      )}
      <div className="inspector">
        {session && (
          <Inspector
            scene={session.scene}
            selected={selectedNode}
            onSelect={setSelectedNode}
            hasTrack={(target) => compiled.tracks.has(target)}
            onEditValue={setValueAtPlayhead}
          />
        )}
      </div>
      <div className="timeline">
        {selectedKey && selectedTrack && (
          <KeyEditor
            track={selectedTrack}
            selected={selectedKey}
            onRetime={(raw) => {
              const t = parseFloat(raw);
              if (Number.isFinite(t)) editKey(selectedKey.target, selectedKey.t, t);
            }}
            onValue={(raw) => {
              const value = parseValue(selectedTrack.type, raw);
              if (value !== null) writeKeys(selectedKey.target, setValueAt(selectedTrack, selectedKey.t, value), selectedKey.t);
            }}
            onEase={(ease: EaseSpec | undefined, hold?: boolean) =>
              writeKeys(selectedKey.target, setEaseAt(selectedTrack, selectedKey.t, ease, hold), selectedKey.t)
            }
            onDelete={deleteSelected}
          />
        )}
        {session && (
          <TimelinePanel
            compiled={compiled}
            player={session.mounted.player}
            onEditKey={editKey}
            onAddKey={addKey}
            selected={selectedKey}
            onSelectKey={setSelectedKey}
          />
        )}
      </div>
    </div>
  );
}
