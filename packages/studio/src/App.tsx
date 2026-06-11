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
  normalizeEditedKeys,
  type CompiledTimeline,
  type SidecarDoc,
  type Track,
} from '@glissade/core';
import { type Scene, type SceneModule } from '@glissade/scene';
import { mount, type Mounted } from '@glissade/player';
import goldenShapes from '../../examples/src/scenes/golden-shapes.js';
import goldenBounce from '../../examples/src/scenes/golden-bounce.js';
import spinners from '../../examples/src/scenes/showcase/spinners.js';
import loaders from '../../examples/src/scenes/showcase/loaders.js';
import dashboard from '../../examples/src/scenes/showcase/dashboard.js';
import transitions from '../../examples/src/scenes/showcase/transitions.js';
import micro from '../../examples/src/scenes/showcase/micro.js';
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
};

const sidecarUrl = (path: string) => `/__glissade/sidecar?scene=${encodeURIComponent(path)}`;

export function App() {
  const [sceneName, setSceneName] = useState('shapes');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
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

  /** Move a key: copy the (merged) track into the sidecar with the new t. */
  const editKey = useCallback(
    (target: string, keyIndex: number, newT: number) => {
      const sourceTrack = compiled.tracks.get(target);
      if (!sourceTrack) return;
      const current = sidecar ?? emptySidecar();
      undoStack.current.push(JSON.parse(JSON.stringify(current)) as SidecarDoc);
      // normalize: sorts, and re-pins spring-eased keys whose t is intrinsic
      // (dragging a spring key snaps back; dragging its predecessor carries it)
      const keys = normalizeEditedKeys(
        sourceTrack.keys.map((k, i) => (i === keyIndex ? { ...k, t: newT } : k)),
      );
      const tracks: Track[] = [
        ...current.tracks.filter((t) => t.target !== target),
        { target, type: sourceTrack.type, keys },
      ];
      const next: SidecarDoc = { ...current, tracks };
      setSidecar(next);
      persist(next);
    },
    [compiled, sidecar, persist],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev === undefined) return;
    const restored = prev.tracks.length === 0 && !prev.labels ? null : prev;
    setSidecar(restored);
    persist(restored ?? emptySidecar());
  }, [persist]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

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
          <Inspector scene={session.scene} selected={selectedNode} onSelect={setSelectedNode} />
        )}
      </div>
      <div className="timeline">
        {session && (
          <TimelinePanel compiled={compiled} player={session.mounted.player} onEditKey={editKey} />
        )}
      </div>
    </div>
  );
}
