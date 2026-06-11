/**
 * In-browser WebCodecs export, end to end (DESIGN.md §5.1b — the M3 exit
 * criterion): Chromium runs exportVideo() on the golden corpus; the produced
 * file is ffprobe-verified for streams and duration. Gated behind EXPORT=1
 * (needs the Playwright chromium-headless-shell + ffprobe).
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ENABLED = process.env['EXPORT'] === '1';

describe.runIf(ENABLED)('in-browser WebCodecs export', () => {
  let server: import('vite').ViteDevServer;
  let browser: import('playwright-core').Browser;
  let page: import('playwright-core').Page;
  const outDir = mkdtempSync(join(tmpdir(), 'glissade-export-test-'));

  beforeAll(async () => {
    const { createServer } = await import('vite');
    server = await createServer({
      root: fileURLToPath(new URL('../../examples', import.meta.url)),
      server: { port: 0 },
      logLevel: 'silent',
    });
    await server.listen();
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
    page = await browser.newPage();
    const addrInfo = server.httpServer!.address();
    const port = typeof addrInfo === 'object' && addrInfo ? addrInfo.port : 0;
    await page.goto(`http://localhost:${port}/export.html`);
    await page.waitForFunction(() => (window as unknown as { __exportReady?: boolean }).__exportReady);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    rmSync(outDir, { recursive: true, force: true });
  });

  function probe(path: string) {
    const res = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name:format=duration',
      '-of', 'json', path,
    ]);
    return JSON.parse(res.stdout.toString()) as {
      streams: { codec_type: string; codec_name: string }[];
      format: { duration: string };
    };
  }

  it('shapes (video only) exports faster than realtime and probes clean', async () => {
    const result = await page.evaluate(() => window.__exportVideo('shapes'));
    expect(result.frames).toBe(90);
    const path = join(outDir, `shapes.${result.format}`);
    writeFileSync(path, Buffer.from(result.bytesBase64, 'base64'));
    const info = probe(path);
    expect(info.streams.map((s) => s.codec_type)).toEqual(['video']);
    expect(parseFloat(info.format.duration)).toBeCloseTo(3, 0);
    // faster-than-realtime: 3s of video in < 3s wall clock
    expect(result.ms).toBeLessThan(3000);
  }, 120_000);

  it('audio scene exports both streams, A/V in sync by construction', async () => {
    const result = await page.evaluate(() => window.__exportVideo('audio'));
    const path = join(outDir, `audio.${result.format}`);
    writeFileSync(path, Buffer.from(result.bytesBase64, 'base64'));
    const info = probe(path);
    expect(info.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
    expect(result.audioCodec).toBeTruthy();
    expect(parseFloat(info.format.duration)).toBeCloseTo(3, 0);
  }, 120_000);

  it('a scene embedding video exports through the Mediabunny decode path (§5.4)', async () => {
    // produce the embedded source with our own CLI, served by the vite root.
    // free ffmpeg builds may fall back to mpeg4 for .mp4, which browsers
    // cannot decode — use webm/vp9 as the source container in that case.
    const assetDir = fileURLToPath(new URL('../../examples/.tmp-test', import.meta.url));
    const { render, pickEncoder } = await import('@glissade/cli');
    const ext = pickEncoder('video', 'mp4').name === 'mpeg4' ? 'webm' : 'mp4';
    const bounceModule = fileURLToPath(new URL('../../examples/src/scenes/golden-bounce.ts', import.meta.url));
    await render({ modulePath: bounceModule, out: join(assetDir, `source.${ext}`), fps: 30 });

    const result = await page.evaluate(
      (src) => window.__exportWithVideo(src, 30),
      `/.tmp-test/source.${ext}`,
    );
    expect(result.frames).toBe(60);
    const path = join(outDir, `embedded.${result.format}`);
    writeFileSync(path, Buffer.from(result.bytesBase64, 'base64'));
    const info = probe(path);
    expect(info.streams.map((s) => s.codec_type)).toEqual(['video']);
    expect(parseFloat(info.format.duration)).toBeCloseTo(2, 0);

    // M4 exit criterion: scrubs both directions through the decoder seam
    const scrub = await page.evaluate(() => window.__scrubVideo('/.tmp-test/source.mp4'));
    expect(scrub).toEqual({ forward: true, backward: true });

    rmSync(assetDir, { recursive: true, force: true });
  }, 180_000);

  describe('worker-wrapped export (§5.1: the main thread stays interactive)', () => {
    it('shapes exports through the Worker with progress and a responsive main thread', async () => {
      const result = await page.evaluate(() => window.__exportVideoWorker('shapes'));
      expect(result.frames).toBe(90);
      expect(result.progressEvents).toBeGreaterThan(10); // progress streamed across the boundary
      // the jank metric: rAF kept ticking on the main thread throughout
      expect(result.maxFrameGap).toBeLessThan(250);
      const path = join(outDir, `worker-shapes.${result.format}`);
      writeFileSync(path, Buffer.from(result.bytesBase64, 'base64'));
      const info = probe(path);
      expect(info.streams.map((s) => s.codec_type)).toEqual(['video']);
      expect(parseFloat(info.format.duration)).toBeCloseTo(3, 0);
    }, 120_000);

    it('audio scenes premix on the main thread and transfer PCM (no OfflineAudioContext in workers)', async () => {
      const result = await page.evaluate(() => window.__exportVideoWorker('audio'));
      const path = join(outDir, `worker-audio.${result.format}`);
      writeFileSync(path, Buffer.from(result.bytesBase64, 'base64'));
      const info = probe(path);
      expect(info.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
      expect(parseFloat(info.format.duration)).toBeCloseTo(3, 0);
    }, 120_000);
  });
});

describe.runIf(!ENABLED)('in-browser WebCodecs export (skipped)', () => {
  it('set EXPORT=1 with a Playwright chromium + ffprobe to run the export suite', () => {
    expect(true).toBe(true);
  });
});
