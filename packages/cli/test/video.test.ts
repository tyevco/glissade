/**
 * CLI video path end to end (§5.4): self-contained — renders the bounce scene
 * to an mp4 with `render()`, then embeds that mp4 via a Video node in a second
 * scene, renders THAT, and pixel-checks that known bounce-scene content shows
 * through the decode→re-render round trip.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { evaluate } from '@glissade/scene';
import { SkiaBackend } from '@glissade/backend-skia';
import { ffmpegAvailable, render } from '../src/render.js';
import { FfmpegVideoFrameSource, probeVideo } from '../src/videoSource.js';

describe.runIf(ffmpegAvailable())('CLI video pipeline (§5.4)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glissade-video-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const bounceModule = fileURLToPath(new URL('../../examples/src/scenes/golden-bounce.ts', import.meta.url));

  it('renders, embeds, decodes, and re-renders', async () => {
    // 1. produce a source video from our own deterministic scene
    const sourceMp4 = join(dir, 'source.mp4');
    await render({ modulePath: bounceModule, out: sourceMp4, fps: 30 });

    const info = probeVideo(sourceMp4);
    expect(info.fps).toBeCloseTo(30, 5);
    expect(info.width).toBe(640);

    // 2. a scene module embedding that mp4 (written next to it so asset paths resolve)
    const embedModule = join(dir, 'embed-scene.ts');
    writeFileSync(
      embedModule,
      `
import { timeline } from '@glissade/core';
import { createScene, Rect, Video, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#220033' }),
        new Video({
          id: 'tv', assetId: 'clip', at: 0.5, sourceFps: ${info.fps},
          width: 320, height: 180, position: [320, 180],
        }),
      ],
    }),
  timeline: timeline({
    duration: 2,
    fps: 30,
    assets: { clip: { kind: 'video', url: './source.mp4' } },
  }),
};
export default mod;
`,
    );

    // 3. render the embedding scene to PNGs
    const outDir = join(dir, 'out');
    const result = await render({ modulePath: embedModule, out: outDir, fps: 30 });
    expect(result.frames).toBe(60);

    // 4. pixel checks via a direct evaluate+Skia pass
    const { loadSceneModule } = await import('../src/render.js');
    const mod = await loadSceneModule(embedModule);
    const scene = mod.createScene();
    const backend = new SkiaBackend(640, 360);
    const source = new FfmpegVideoFrameSource(sourceMp4, info);
    await source.warm(0, info.duration);
    backend.setVideoAsset('clip', source);

    // before the clip starts: pure background
    backend.render(evaluate(scene, mod.timeline, 0.2));
    let px = await backend.readPixels();
    const at = (x: number, y: number) => {
      const o = (y * 640 + x) * 4;
      return [px[o], px[o + 1], px[o + 2]];
    };
    expect(at(320, 180)).toEqual([34, 0, 51]); // #220033

    // at t=1.5 the video shows source-time 1.0: bounce scene's dark bg
    // (#10131a) fills the video frame region around its center
    backend.render(evaluate(scene, mod.timeline, 1.5));
    px = await backend.readPixels();
    const [r, g, b] = at(200, 120); // inside the 320x180 video rect, away from the ball
    // h264 is lossy: assert near the bounce background, far from the embed bg
    expect(Math.abs(r! - 0x10)).toBeLessThan(12);
    expect(Math.abs(g! - 0x13)).toBeLessThan(12);
    expect(Math.abs(b! - 0x1a)).toBeLessThan(12);

    source.close();
  }, 120_000);

  it('cold sources throw the readiness error instead of misrendering', async () => {
    const sourceMp4 = join(dir, 'source.mp4');
    const cold = new FfmpegVideoFrameSource(sourceMp4);
    expect(() => cold.getFrameSync(1)).toThrow(/not ready/);
    cold.close();
  });
});
