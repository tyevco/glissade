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
window.__exportReady = true;

document.querySelector('#go')?.addEventListener('click', () => {
  void run('audio').then((result) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(result.blob);
    a.download = `glissade-demo.${result.format}`;
    a.click();
  });
});
