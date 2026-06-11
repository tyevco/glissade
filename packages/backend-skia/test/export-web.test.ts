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
});

describe.runIf(!ENABLED)('in-browser WebCodecs export (skipped)', () => {
  it('set EXPORT=1 with a Playwright chromium + ffprobe to run the export suite', () => {
    expect(true).toBe(true);
  });
});
