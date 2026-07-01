/**
 * 0.27 audio-only remux fast path — integration. A cached mp4 render writes a
 * `<out>.gsrender.json` frame-key manifest; an IDENTICAL re-render detects the
 * unchanged video via the key-only pre-pass and takes the `-c:v copy` remux
 * (no re-encode). Guarded on ffmpeg (skipped when absent). The byte-identical
 * cache-hit invariant is exhaustively covered by the video-canary seat + the
 * renderManifest unit tests; this pins the CLI wiring end-to-end.
 */

import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ffmpegAvailable, render } from '../src/render.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(SCENES, 'golden-shapes.js'); // static, no audio → fast silent mp4
const outDir = mkdtempSync(join(tmpdir(), 'glissade-remux-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const d = describe.skipIf(!ffmpegAvailable());

d('gs render --cache: audio-only remux fast path', () => {
  it('writes a frame-key manifest on a cached mp4 render, then remuxes an identical re-render', async () => {
    const out = join(outDir, 'shapes.mp4');
    const cache = { dir: join(outDir, '.gscache'), mode: 'read-write' as const };

    // first render: full encode, writes the manifest + populates the frame cache
    await render({ modulePath: MODULE, out, fps: 30, range: [0, 0.2], cache });
    const manifestPath = `${out}.gsrender.json`;
    expect(existsSync(manifestPath), 'manifest written beside the mp4').toBe(true);
    expect(existsSync(out) && statSync(out).size > 0, 'mp4 produced').toBe(true);

    // second render, identical inputs → the pre-pass digest matches → remux
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      const res = await render({ modulePath: MODULE, out, fps: 30, range: [0, 0.2], cache });
      expect(res.out).toBe(out);
    } finally {
      spy.mockRestore();
    }
    const log = writes.join('');
    expect(log, 'took the audio-only remux fast path').toContain('video copy + remux');
    expect(existsSync(out) && statSync(out).size > 0, 'remuxed mp4 still valid').toBe(true);
    expect(existsSync(manifestPath)).toBe(true);
  }, 60000);
});
