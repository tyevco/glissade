/**
 * Browser harness for @glissade/export-web: drives exportVideo() for the
 * EXPORT=1 test suite and offers a manual download button.
 */

import { exportVideo, type WebExportResult } from '@glissade/export-web';
import { type SceneModule } from '@glissade/scene';
import goldenShapes from './scenes/golden-shapes.js';
import withAudio from './scenes/with-audio.js';

const corpus: Record<string, SceneModule> = {
  shapes: goldenShapes,
  audio: withAudio,
};

async function run(name: string): Promise<WebExportResult> {
  const mod = corpus[name];
  if (!mod) throw new Error(`unknown export scene '${name}'`);
  return exportVideo(mod.createScene(), mod.timeline, { fps: 30 });
}

declare global {
  interface Window {
    __exportVideo(name: string): Promise<{
      bytesBase64: string;
      format: string;
      videoCodec: string;
      audioCodec: string | null;
      frames: number;
      ms: number;
    }>;
    __exportReady: boolean;
  }
}

window.__exportVideo = async (name) => {
  const started = performance.now();
  const result = await run(name);
  const ms = performance.now() - started;
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return {
    bytesBase64: btoa(bin),
    format: result.format,
    videoCodec: result.videoCodec,
    audioCodec: result.audioCodec,
    frames: result.frames,
    ms,
  };
};
// M4 browser path: export a scene embedding a video asset, and verify
// backward/random scrub through the MediabunnyVideoFrameSource directly.
declare global {
  interface Window {
    __exportWithVideo(url: string, sourceFps: number): ReturnType<Window['__exportVideo']>;
    __scrubVideo(url: string): Promise<{ backward: boolean; forward: boolean }>;
  }
}

window.__exportWithVideo = async (url, sourceFps) => {
  const { timeline } = await import('@glissade/core');
  const { createScene, Rect, Video } = await import('@glissade/scene');
  const scene = createScene({
    size: { w: 640, h: 360 },
    children: [
      new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#220033' }),
      new Video({ id: 'tv', assetId: 'clip', at: 0.25, sourceFps, width: 320, height: 180, position: [320, 180] }),
    ],
  });
  const doc = timeline({ duration: 2, fps: 30, assets: { clip: { kind: 'video', url } } });
  const started = performance.now();
  const result = await exportVideo(scene, doc, { fps: 30 });
  const ms = performance.now() - started;
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return {
    bytesBase64: btoa(bin),
    format: result.format,
    videoCodec: result.videoCodec,
    audioCodec: result.audioCodec,
    frames: result.frames,
    ms,
  };
};

window.__scrubVideo = async (url) => {
  const { MediabunnyVideoFrameSource } = await import('@glissade/export-web');
  const source = await MediabunnyVideoFrameSource.open(url);
  // forward then BACKWARD random access — O(GOP) keyframe seek, must succeed
  await source.warm(2.0, 2.0);
  const late = source.getFrameSync(2.0);
  await source.warm(0.4, 0.4);
  const early = source.getFrameSync(0.4);
  source.close();
  return { forward: late instanceof Object, backward: early instanceof Object };
};

window.__exportReady = true;

document.querySelector('#go')?.addEventListener('click', () => {
  void run('audio').then((result) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(result.blob);
    a.download = `glissade-demo.${result.format}`;
    a.click();
  });
});

// Worker path (§5.1): same scenes through new Worker + the export protocol,
// with a main-thread responsiveness meter — the whole point of the worker.
declare global {
  interface Window {
    __exportVideoWorker(name: string): Promise<{
      bytesBase64: string;
      format: string;
      videoCodec: string;
      audioCodec: string | null;
      frames: number;
      ms: number;
      /** Longest gap between rAF ticks during the export (ms) — jank metric. */
      maxFrameGap: number;
      progressEvents: number;
    }>;
  }
}

window.__exportVideoWorker = async (name) => {
  const { requestWorkerExport } = await import('@glissade/export-web');
  const mod = corpus[name];
  if (!mod) throw new Error(`unknown export scene '${name}'`);
  const worker = new Worker(new URL('./export-worker.ts', import.meta.url), { type: 'module' });

  // jank meter: rAF must keep ticking on the main thread while the worker encodes
  let maxFrameGap = 0;
  let last = performance.now();
  let metering = true;
  const meter = () => {
    const now = performance.now();
    maxFrameGap = Math.max(maxFrameGap, now - last);
    last = now;
    if (metering) requestAnimationFrame(meter);
  };
  requestAnimationFrame(meter);

  let progressEvents = 0;
  const started = performance.now();
  try {
    const result = await requestWorkerExport(worker, {
      sceneKey: name,
      timeline: mod.timeline,
      options: { fps: 30 },
      onProgress: () => progressEvents++,
    }).result;
    const ms = performance.now() - started;
    metering = false;
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return {
      bytesBase64: btoa(bin),
      format: result.format,
      videoCodec: result.videoCodec,
      audioCodec: result.audioCodec,
      frames: result.frames,
      ms,
      maxFrameGap,
      progressEvents,
    };
  } finally {
    metering = false;
    worker.terminate();
  }
};
