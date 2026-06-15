/**
 * gs render frame-indexing (§5): the CLI `--range`/`--frame` are integer frame
 * indices (export APIs are frame-indexed; Player APIs are seconds). Covers the
 * parse guard, the inclusive frame counts, the png-seq format override, and
 * back-compat of the seconds-based programmatic `range`.
 */

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { render, parseFrameRange } from '../src/render.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(SCENES, 'golden-shapes.ts');
const outDir = mkdtempSync(join(tmpdir(), 'glissade-render-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const pngCount = (dir: string): number => readdirSync(dir).filter((f) => f.endsWith('.png')).length;

describe('parseFrameRange (--range is frame-indexed)', () => {
  it('parses inclusive integer frame ranges', () => {
    expect(parseFrameRange('0..120')).toEqual([0, 120]);
    expect(parseFrameRange(' 5..5 ')).toEqual([5, 5]);
  });

  it('rejects decimals, garbage, and reversed ranges', () => {
    expect(() => parseFrameRange('0.5..1')).toThrow(/integer frames/);
    expect(() => parseFrameRange('0..1.5')).toThrow(/integer frames/);
    expect(() => parseFrameRange('abc')).toThrow(/integer frames/);
    expect(() => parseFrameRange('10..2')).toThrow(/before start/);
  });
});

describe('render frame-indexing', () => {
  it('frameRange renders an inclusive count of PNGs', async () => {
    const out = join(outDir, 'fr');
    const result = await render({ modulePath: MODULE, out, frameRange: [0, 4] });
    expect(result.frames).toBe(5); // inclusive 0..4
    expect(pngCount(out)).toBe(5);
  });

  it('frame renders a single still through the same path', async () => {
    const out = join(outDir, 'single');
    const result = await render({ modulePath: MODULE, out, frame: 12 });
    expect(result.frames).toBe(1);
    expect(pngCount(out)).toBe(1);
  });

  it('seconds-based range still works for programmatic callers (back-compat)', async () => {
    const out = join(outDir, 'sec');
    const result = await render({ modulePath: MODULE, out, fps: 30, range: [0, 1] });
    expect(result.frames).toBe(30); // round(0)..ceil(30)-1 = 0..29
    expect(pngCount(out)).toBe(30);
  });

  it('--format png-seq forces a sequence even with a video-looking out name', async () => {
    const out = join(outDir, 'seq.mp4'); // looks like video; format overrides to a dir of PNGs
    const result = await render({ modulePath: MODULE, out, frame: 0, format: 'png-seq' });
    expect(result.frames).toBe(1);
    expect(pngCount(out)).toBe(1);
  });

  it('a single frame to a *.png path writes ONE file, not a directory', async () => {
    const out = join(outDir, 'still.png');
    const result = await render({ modulePath: MODULE, out, frame: 7 });
    expect(result.out).toBe(out);
    expect(existsSync(out)).toBe(true);
    expect(statSync(out).isFile()).toBe(true); // a file at the path, not out/frame-00007.png
  });
});
