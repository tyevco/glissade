/**
 * Export button + options popover (§5.1/§6): runs the worker-wrapped export
 * so scrubbing stays live while encoding, streams progress, downloads the
 * result. Presets come from glissade.project.json (§6.2).
 */

import { useRef, useState } from 'react';
import { type Timeline } from '@glissade/core';
import { requestWorkerExport, type WorkerExportHandle } from '@glissade/export-web';
import type { ProjectDoc } from '@glissade/vite-plugin';

type Format = 'auto' | 'mp4' | 'webm';

export function ExportPanel({
  sceneKey,
  sceneName,
  timeline,
  project,
}: {
  /** The scene-module glob key — identical in App and the worker. */
  sceneKey: string;
  sceneName: string;
  /** The sidecar-merged document: export what you see. */
  timeline: Timeline;
  project: ProjectDoc | null;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>('auto');
  const [fps, setFps] = useState(() => String(timeline.fps ?? 60));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<WorkerExportHandle | null>(null);

  const presets = project?.renderPresets ?? {};

  const start = async () => {
    setError(null);
    setProgress(0);
    const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
    const fpsNum = parseFloat(fps);
    handle.current = requestWorkerExport(worker, {
      sceneKey,
      timeline,
      options: {
        ...(Number.isFinite(fpsNum) && fpsNum > 0 ? { fps: fpsNum } : {}),
        format,
      },
      onProgress: (frame, total) => setProgress(frame / total),
    });
    try {
      const result = await handle.current.result;
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sceneName}.${result.format}`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    } finally {
      worker.terminate();
      handle.current = null;
    }
  };

  const cancel = () => {
    handle.current?.cancel();
    handle.current = null;
    setProgress(null);
  };

  return (
    <div className="export-panel">
      <button className="export-btn" onClick={() => setOpen(!open)}>
        Export
      </button>
      {open && (
        <div className="export-popover">
          {Object.keys(presets).length > 0 && (
            <label>
              preset
              <select
                defaultValue=""
                onChange={(e) => {
                  const p = presets[e.target.value];
                  if (!p) return;
                  if (p.fps) setFps(String(p.fps));
                  if (p.out) setFormat(p.out.endsWith('.webm') ? 'webm' : p.out.endsWith('.mp4') ? 'mp4' : 'auto');
                }}
              >
                <option value="">—</option>
                {Object.keys(presets).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            format
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
              <option value="auto">auto</option>
              <option value="mp4">mp4</option>
              <option value="webm">webm</option>
            </select>
          </label>
          <label>
            fps
            <input value={fps} onChange={(e) => setFps(e.target.value)} style={{ width: 48 }} />
          </label>
          {progress === null ? (
            <button className="export-btn" onClick={() => void start()}>
              Render
            </button>
          ) : (
            <>
              <progress value={progress} max={1} />
              <span>{Math.round(progress * 100)}%</span>
              <button onClick={cancel}>cancel</button>
            </>
          )}
          {error && <span className="export-error">{error}</span>}
        </div>
      )}
    </div>
  );
}
