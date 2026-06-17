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
  hashKeys,
  isEditableNodeId,
  mergeSidecar,
  migrateSidecar,
  sampleTrack,
  setSidecarTrack,
  type CompiledTimeline,
  type EaseSpec,
  type Key,
  type SidecarDoc,
  type Track,
} from '@glissade/core';
import { type TimelinePatch } from '@glissade/core/studio-host';
import { createInProcessHost, type InProcessHost } from './inProcessHost.js';
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
// import type ONLY: the plugin's runtime imports vite itself, which must
// never reach the browser bundle (a value-form import drags it into dep-opt)
import type { ProjectDoc } from '@glissade/vite-plugin';
import { ExportPanel } from './ExportPanel.js';
import { Transport } from './Transport.js';
import { TimelinePanel } from './TimelinePanel.js';
import { Inspector } from './Inspector.js';
import { previewSource, trackSource } from './codegen.js';

/**
 * Scene auto-discovery (§6.1): glob the project's scene modules — anything
 * default-exporting a SceneModule appears in the picker without editing this
 * file. Names drop the 'golden-' prefix; collisions keep the full basename.
 */
const discovered = import.meta.glob('../../examples/src/scenes/**/*.ts', { eager: true }) as Record<
  string,
  { default?: Partial<SceneModule> }
>;
const corpus: Record<string, { mod: SceneModule; path: string; globKey: string }> = {};
for (const [globPath, m] of Object.entries(discovered).sort(([a], [b]) => a.localeCompare(b))) {
  const mod = m.default;
  if (typeof mod?.createScene !== 'function' || mod.timeline === undefined) continue;
  const base = globPath.split('/').pop()!.replace(/\.tsx?$/, '');
  const short = base.replace(/^golden-/, '');
  const name = short in corpus ? base : short;
  corpus[name] = { mod: mod as SceneModule, path: globPath.replace(/^(\.\.\/)+/, 'packages/'), globKey: globPath };
}

const sidecarUrl = (path: string) => `/__glissade/sidecar?scene=${encodeURIComponent(path)}`;

export function App() {
  const [sceneName, setSceneName] = useState(() => ('shapes' in corpus ? 'shapes' : Object.keys(corpus)[0]!));
  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<KeyRef | null>(null);
  const [sidecar, setSidecar] = useState<SidecarDoc | null>(null);
  // Session-transient preview overlay (§6.2 rule 4): non-editable props can be
  // previewed live, but this NEVER persists (no POST) and is cleared on scene
  // change or on any committed edit. It layers on top of the persisted sidecar
  // for the bound timeline only.
  const [preview, setPreview] = useState<SidecarDoc | null>(null);
  const [sidecarLoaded, setSidecarLoaded] = useState(false);
  // undo = inverse-patch lists over the document only (§6.3), NOT doc snapshots
  const undoStack = useRef<TimelinePatch[][]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<{ scene: Scene; mounted: Mounted; host: InProcessHost } | null>(null);
  const lastTime = useRef(0);

  const entry = corpus[sceneName]!;
  // an invalid sidecar must degrade to the code baseline with a visible
  // warning (§6.2: surfaced, never a crash and never silently dropped)
  // `compiled` (editability gating, timeline panel, write paths) reflects the
  // PERSISTED document only. `merged` (what the player binds) additionally
  // layers the session-transient preview overlay so the viewport shows it live
  // without it ever reaching the sidecar/compiled state.
  const { merged, compiled, sidecarError } = useMemo((): {
    merged: ReturnType<typeof mergeSidecar>;
    compiled: CompiledTimeline;
    sidecarError: string | null;
  } => {
    const candidate = mergeSidecar(entry.mod.timeline, sidecar);
    try {
      const compiledDoc = compileTimeline(candidate);
      const withPreview = preview ? mergeSidecar(candidate, preview) : candidate;
      return { merged: withPreview, compiled: compiledDoc, sidecarError: null };
    } catch (e) {
      return {
        merged: entry.mod.timeline,
        compiled: compileTimeline(entry.mod.timeline),
        sidecarError: e instanceof Error ? e.message : String(e),
      };
    }
  }, [entry, sidecar, preview]);

  // glissade.project.json (§6.2): shared markers (+ render presets for the export UI)
  useEffect(() => {
    void fetch('/__glissade/project')
      .then((r) => r.json())
      .then((doc: ProjectDoc | null) => setProject(doc))
      .catch(() => setProject(null));
  }, []);

  const markers = useMemo(
    () => [...compiled.markers, ...(project?.markers ?? [])].sort((a, b) => a.t - b.t),
    [compiled, project],
  );

  // load the persisted sidecar when the scene changes
  useEffect(() => {
    setSidecarLoaded(false);
    setSidecar(null);
    setPreview(null); // transient preview never crosses a scene change (§6.2 rule 4)
    setSelectedKey(null);
    undoStack.current = [];
    void fetch(sidecarUrl(entry.path))
      .then((r) => r.json())
      .then((doc: SidecarDoc | null) => {
        setSidecar(migrateSidecar(doc)); // v1 files lift forward to v2 on load
        setSidecarLoaded(true);
      });
  }, [entry]);

  // (re)mount on scene/document change, preserving the playhead position
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sidecarLoaded) return;
    const scene = entry.mod.createScene();
    const mounted = mount(scene, merged, canvas, { loop: true });
    // the studio talks to the runtime through the host (§6.4): edits route
    // through host.applyPatch; it owns the current sidecar over the code baseline
    const host = createInProcessHost({ scene, codeTimeline: entry.mod.timeline, sidecar });
    mounted.player.seek(Math.min(lastTime.current, mounted.player.duration));
    const stopTracking = scene.playhead.subscribe(() => {
      lastTime.current = scene.playhead.peek();
    });
    setSession({ scene, mounted, host });
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
    (target: string, keys: Key[] | null, reselectT?: number, snapshot = true) => {
      const sourceTrack = compiled.tracks.get(target);
      if (!keys || !sourceTrack || !session) return;
      // every edit is a TimelinePatch transaction (§6.3). The edit ops in
      // edits.ts produce a normalized key array; commit it as a whole-track set,
      // carrying the code baseHash so drift surfaces if code changes beneath (§6.2).
      const codeBaseline = entry.mod.timeline.tracks.find((t) => t.target === target)?.keys ?? null;
      const patch: TimelinePatch = {
        op: 'setTrackKeys',
        timelineId: 'main',
        target,
        type: sourceTrack.type,
        keys,
        baseHash: codeBaseline ? hashKeys(codeBaseline) : null,
      };
      const result = session.host.applyPatch([patch]);
      if (!result.ok) return;
      // drags push their inverse once at the first move (one drag = one undo);
      // streaming moves reuse it — the snapshot-restore inverse holds pre-drag state
      if (snapshot) undoStack.current.push(result.inverse);
      setSidecar(result.doc);
      setPreview(null); // a committed edit clears any live preview (§6.2 rule 4)
      persist(result.doc);
      if (reselectT !== undefined && keys.length > 0) {
        setSelectedKey({ target, t: keys[closestIndex(keys, reselectT)]!.t });
      }
    },
    [compiled, session, persist, entry],
  );

  const trackOf = useCallback((target: string) => compiled.tracks.get(target), [compiled]);

  /** Drag retiming (identity by closest-t — the §6.2 lesson from a vanished key). */
  const editKey = useCallback(
    (target: string, fromT: number, newT: number, first = true) => {
      const tr = trackOf(target);
      if (tr) writeKeys(target, retimeKeyAt(tr, fromT, newT), newT, first);
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

  /**
   * The locked editability rule (§6.2 sub-decision): editable IFF the target's
   * node has an explicit id (isEditableNodeId) AND a merged/editor-created track
   * exists with `editable: true`. `compiled.tracks` reflects the persisted
   * document, so a transient preview never flips a prop to editable.
   */
  const editableOf = useCallback(
    (target: string) => {
      const nodeId = target.slice(0, target.indexOf('/'));
      return isEditableNodeId(nodeId) && compiled.tracks.get(target)?.editable === true;
    },
    [compiled],
  );

  /**
   * Session-transient preview write for a non-editable prop (§6.2 rule 4):
   * overlays a key at the playhead onto the bound timeline so the viewport
   * updates live — but writes ONLY to `preview` state, never the sidecar/POST.
   * Cleared on scene change or any committed edit.
   */
  const previewValue = useCallback(
    (target: string, raw: string) => {
      const tr = trackOf(target);
      if (!tr || !session) return;
      const value = parseValue(tr.type, raw);
      if (value === null) return;
      const t = session.scene.playhead.peek();
      const base = preview ?? emptySidecar();
      // baseline keys null ⇒ an editor-created overlay track (no merge-conflict class)
      setPreview(setSidecarTrack(base, 'main', target, tr.type, upsertKeyAt(tr, t, value), null));
    },
    [trackOf, session, preview],
  );

  /** Copy a non-editable prop's current value as `key(...)` source — clipboard only (§6.2 rule 4). */
  const copyAsCode = useCallback(
    (target: string) => {
      const tr = trackOf(target);
      if (!tr || !session) return;
      const t = session.scene.playhead.peek();
      void navigator.clipboard?.writeText(previewSource(target, t, sampleTrack(tr, t)));
    },
    [trackOf, session],
  );

  /**
   * Extract an editable track's keys to the clipboard as `track(...)` source,
   * then remove the sidecar entry (§6.2 rule 7) — clipboard-only write-back, the
   * source is never mutated. Snapshots for undo, then persists the deletion.
   */
  const extractEdits = useCallback(
    (target: string) => {
      const tr = compiled.tracks.get(target);
      if (!tr || !session) return;
      void navigator.clipboard?.writeText(trackSource(tr as Track));
      // remove the sidecar entry through the host (atomic, undoable) — the
      // clipboard holds the code; the source is never mutated (§6.2 rule 7)
      const result = session.host.applyPatch([{ op: 'removeTrack', timelineId: 'main', target }]);
      if (!result.ok) return;
      undoStack.current.push(result.inverse);
      const main = result.doc.timelines['main'];
      const empty = !main || (Object.keys(main.tracks).length === 0 && !main.labels);
      const restored = empty ? null : result.doc;
      setSidecar(restored);
      setPreview(null);
      persist(restored ?? emptySidecar());
    },
    [compiled, session, persist],
  );

  const undo = useCallback(() => {
    const inverse = undoStack.current.pop();
    if (!inverse || !session) return;
    const result = session.host.applyPatch(inverse);
    if (!result.ok) return;
    const main = result.doc.timelines['main'];
    const empty = !main || (Object.keys(main.tracks).length === 0 && !main.labels);
    const restored = empty ? null : result.doc;
    setSidecar(restored);
    // selection is EXCLUDED from undo (§6.3): the inverse restores the track
    // (keys + their stable ids), so a key selected before the edit stays valid —
    // do NOT clear it.
    persist(restored ?? emptySidecar());
  }, [session, persist]);

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
        <ExportPanel sceneKey={entry.globKey} sceneName={sceneName} timeline={merged} project={project} />
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
            editableOf={editableOf}
            onEditValue={setValueAtPlayhead}
            onPreviewValue={previewValue}
            onCopyAsCode={copyAsCode}
            onExtractEdits={extractEdits}
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
            markers={markers}
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
