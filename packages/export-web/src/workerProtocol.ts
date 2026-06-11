/**
 * Worker export protocol (DESIGN.md §3.4/§5.1: export always runs in a Worker
 * so the main thread stays interactive). The worker re-creates the scene from
 * a host-provided registry key and evaluates + encodes there; the main side
 * premixes audio (OfflineAudioContext is Window-only) and transfers raw PCM.
 * Host apps own the Worker file (bundlers handle `new Worker(new URL(...))`):
 * the worker body is one call to serveExportRequest, the main side one call
 * to requestWorkerExport.
 */

import { compileTimeline, type Timeline } from '@glissade/core';
import { type Scene } from '@glissade/scene';
import {
  exportVideo,
  premixTimelineAudio,
  type PremixedAudio,
  type WebExportOptions,
  type WebExportResult,
} from './index.js';

export interface ExportWorkerRequest {
  /** Registry key the worker's loadScene resolves (e.g. a module glob key). */
  sceneKey: string;
  /** The document to render — e.g. the studio's sidecar-merged timeline. */
  timeline: Timeline;
  options?: Omit<WebExportOptions, 'onProgress' | 'premixedAudio'>;
  /** Premixed on the main thread; channels arrive transferred. */
  premixedAudio?: PremixedAudio;
}

export type ExportWorkerResponse =
  | { kind: 'progress'; frame: number; total: number }
  | {
      kind: 'done';
      buffer: ArrayBuffer;
      format: 'mp4' | 'webm';
      videoCodec: string;
      audioCodec: string | null;
      frames: number;
    }
  | { kind: 'error'; message: string };

/** The entire worker body: resolve the scene, export, stream progress, transfer the result. */
export async function serveExportRequest(
  req: ExportWorkerRequest,
  loadScene: (key: string) => Promise<Scene>,
  post: (msg: ExportWorkerResponse, transfer?: Transferable[]) => void,
): Promise<void> {
  try {
    const scene = await loadScene(req.sceneKey);
    // flexbox scenes need the wasm engine in THIS worker (§3.2)
    const hasLayout = [...scene.nodes.values()].some(
      (n) => (n.constructor as { isLayoutNode?: boolean }).isLayoutNode === true,
    );
    if (hasLayout) {
      const { loadYogaLayoutEngine } = await import('@glissade/scene/layout');
      await loadYogaLayoutEngine();
    }
    const result = await exportVideo(scene, req.timeline, {
      ...req.options,
      ...(req.premixedAudio ? { premixedAudio: req.premixedAudio } : {}),
      onProgress: (frame, total) => post({ kind: 'progress', frame, total }),
    });
    const buffer = await result.blob.arrayBuffer();
    post(
      {
        kind: 'done',
        buffer,
        format: result.format,
        videoCodec: result.videoCodec,
        audioCodec: result.audioCodec,
        frames: result.frames,
      },
      [buffer],
    );
  } catch (err) {
    post({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

export interface WorkerExportHandle {
  result: Promise<WebExportResult>;
  /** Terminates the worker; the result promise rejects. */
  cancel(): void;
}

/** Main-thread side: premix audio if the document carries any, post, collect. */
export function requestWorkerExport(
  worker: Worker,
  args: {
    sceneKey: string;
    timeline: Timeline;
    options?: ExportWorkerRequest['options'];
    onProgress?: (frame: number, total: number) => void;
  },
): WorkerExportHandle {
  let cancelled = false;
  let rejectResult: ((e: Error) => void) | null = null;
  const result = (async (): Promise<WebExportResult> => {
    const compiled = compileTimeline(args.timeline);
    const transfer: Transferable[] = [];
    let premixedAudio: PremixedAudio | undefined;
    if (compiled.audio.length > 0) {
      premixedAudio = await premixTimelineAudio(compiled.audio, compiled.duration);
      for (const ch of premixedAudio.channelData) transfer.push(ch.buffer);
    }
    return await new Promise<WebExportResult>((resolve, reject) => {
      rejectResult = reject;
      if (cancelled) {
        reject(new Error('export cancelled'));
        return;
      }
      worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
        const msg = e.data;
        if (msg.kind === 'progress') args.onProgress?.(msg.frame, msg.total);
        else if (msg.kind === 'done') {
          resolve({
            blob: new Blob([msg.buffer], { type: msg.format === 'mp4' ? 'video/mp4' : 'video/webm' }),
            format: msg.format,
            videoCodec: msg.videoCodec as WebExportResult['videoCodec'],
            audioCodec: msg.audioCodec as WebExportResult['audioCodec'],
            frames: msg.frames,
          });
        } else reject(new Error(msg.message));
      };
      worker.onerror = (e) => reject(new Error(e.message || 'export worker crashed'));
      const req: ExportWorkerRequest = {
        sceneKey: args.sceneKey,
        timeline: args.timeline,
        ...(args.options ? { options: args.options } : {}),
        ...(premixedAudio ? { premixedAudio } : {}),
      };
      worker.postMessage(req, transfer);
    });
  })();
  return {
    result,
    cancel: () => {
      cancelled = true;
      worker.terminate();
      rejectResult?.(new Error('export cancelled'));
    },
  };
}
