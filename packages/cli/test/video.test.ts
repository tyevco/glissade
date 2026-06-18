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
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { evaluate } from '@glissade/scene';
import { SkiaBackend } from '@glissade/backend-skia';
import { ffmpegAvailable, render } from '../src/render.js';
import { FfmpegVideoFrameSource, probeVideo } from '../src/videoSource.js';

/** Decode a PNG file to RGBA via @napi-rs/canvas (no DOM globals in this env). */
async function decodePngRgba(path: string, w: number, h: number): Promise<Uint8ClampedArray> {
  const img = await loadImage(path);
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

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

    // §M4 cross-path near-parity: the SAME embedded-video frame, produced once
    // through the full render() PNG-seq export pipeline (encodePng → file) and
    // once through a direct evaluate+Skia readPixels, must NOT diverge — the
    // export path round-trip (encode → decode) is ±1 LSB / perceptual on the
    // embedded video region, not byte-perturbed. frame at t=1.5 == index 45.
    const exportedFrame = join(outDir, `frame-${String(45).padStart(5, '0')}.png`);
    const exportedPx = await decodePngRgba(exportedFrame, 640, 360);
    // compare a grid of probe points inside the embedded video rect
    let maxDelta = 0;
    for (const [x, y] of [
      [200, 120],
      [320, 180],
      [400, 240],
      [260, 150],
    ] as const) {
      const o = (y * 640 + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        maxDelta = Math.max(maxDelta, Math.abs(exportedPx[o + ch]! - px[o + ch]!));
      }
    }
    // PNG is lossless; the only delta is the encode/decode round-trip — ~0.
    expect(maxDelta).toBeLessThanOrEqual(1);

    source.close();
  }, 120_000);

  it('cold sources throw the readiness error instead of misrendering', async () => {
    const sourceMp4 = join(dir, 'source.mp4');
    const cold = new FfmpegVideoFrameSource(sourceMp4);
    expect(() => cold.getFrameSync(1)).toThrow(/not ready/);
    cold.close();
  });
});

/**
 * PNG-sequence fallback + alpha (F2IP, §5.2) — NOT gated on ffmpeg/WebCodecs:
 * the CLI render path is pure Skia. A partially-covered scene (no full-canvas
 * background) must emit frames whose uncovered pixels stay TRANSPARENT through
 * the encode → decode round trip (alpha is preserved, not flattened to opaque).
 */
describe('CLI PNG-seq fallback + alpha (§5.2)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glissade-pngseq-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('renders a PNG sequence with a non-opaque alpha channel (no ffmpeg)', async () => {
    const sceneModule = join(dir, 'alpha-scene.ts');
    writeFileSync(
      sceneModule,
      `
import { timeline } from '@glissade/core';
import { createScene, Rect, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  // a small opaque rect on an otherwise EMPTY (transparent) canvas
  createScene: () =>
    createScene({
      size: { w: 16, h: 16 },
      children: [new Rect({ id: 'dot', width: 4, height: 4, position: [8, 8], fill: '#ff0000' })],
    }),
  timeline: timeline({ duration: ${1 / 30}, fps: 30 }),
};
export default mod;
`,
    );

    const outDir = join(dir, 'frames');
    const result = await render({ modulePath: sceneModule, out: outDir, fps: 30, format: 'png-seq' });
    expect(result.frames).toBe(1);

    const px = await decodePngRgba(join(outDir, 'frame-00000.png'), 16, 16);
    const alphaAt = (x: number, y: number) => px[(y * 16 + x) * 4 + 3]!;
    // a corner pixel (uncovered) is fully transparent; the center dot is opaque
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(8, 8)).toBe(255);
    // not silently flattened to opaque
    let transparent = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] === 0) transparent++;
    expect(transparent).toBeGreaterThan(0);
  });
});
