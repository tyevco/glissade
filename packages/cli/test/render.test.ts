/**
 * gs render frame-indexing (§5): the CLI `--range`/`--frame` are integer frame
 * indices (export APIs are frame-indexed; Player APIs are seconds). Covers the
 * parse guard, the inclusive frame counts, the png-seq format override, and
 * back-compat of the seconds-based programmatic `range`.
 */

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { render, parseFrameRange, buildFontExemptSet } from '../src/render.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(SCENES, 'golden-shapes.ts');
const outDir = mkdtempSync(join(tmpdir(), 'glissade-render-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const pngCount = (dir: string): number => readdirSync(dir).filter((f) => f.endsWith('.png')).length;

describe('buildFontExemptSet (FIX 6 — host-independent --strict font validation)', () => {
  // a "macOS-fat" OS catalog vs a "clean Linux CI" one; the verdict must not differ
  const macCatalog = new Set(['helvetica neue', 'avenir', 'menlo', 'times new roman']);
  const linuxCatalog = new Set(['dejavu sans']);
  const registered = new Set(['brand']); // glissade registered from doc.assets

  it('under --strict the OS catalog is IGNORED regardless of host (an unregistered system family is NOT exempt)', () => {
    const mac = buildFontExemptSet(registered, { allowSystemFonts: true, strict: true, osCatalog: macCatalog });
    const linux = buildFontExemptSet(registered, { allowSystemFonts: true, strict: true, osCatalog: linuxCatalog });
    // same verdict on both hosts: only the glissade-registered family is exempt
    expect([...mac].sort()).toEqual(['brand']);
    expect([...linux].sort()).toEqual(['brand']);
    // 'Helvetica Neue' would throw under --strict on BOTH hosts (not exempt)
    expect(mac.has('helvetica neue')).toBe(false);
    expect(linux.has('helvetica neue')).toBe(false);
  });

  it('a glissade-registered (doc.assets) family is exempt with or without --strict (the 57AnKZ8G1v7o intent)', () => {
    expect(buildFontExemptSet(registered, { allowSystemFonts: false, strict: true, osCatalog: macCatalog }).has('brand')).toBe(true);
    expect(buildFontExemptSet(registered, { allowSystemFonts: false, strict: false, osCatalog: macCatalog }).has('brand')).toBe(true);
  });

  it('--allow-system-fonts (non-strict) opts the OS catalog in', () => {
    const set = buildFontExemptSet(registered, { allowSystemFonts: true, strict: false, osCatalog: macCatalog });
    expect(set.has('helvetica neue')).toBe(true); // OS family now exempt
    expect(set.has('brand')).toBe(true);
  });

  it('default (no --allow-system-fonts) never consults the OS catalog', () => {
    const set = buildFontExemptSet(registered, { allowSystemFonts: false, strict: false, osCatalog: macCatalog });
    expect([...set]).toEqual(['brand']);
  });
});

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

describe('render asset-reference pre-validation (0.14 DX)', () => {
  it('an undeclared assetId fails before evaluate with the real-cause message', async () => {
    const mod = join(outDir, 'undeclared-asset.ts');
    writeFileSync(
      mod,
      `
import { timeline } from '@glissade/core';
import { createScene, Rect, Image, type SceneModule } from '@glissade/scene';
const m: SceneModule = {
  createScene: () => createScene({
    size: { w: 64, h: 64 },
    children: [
      new Rect({ id: 'bg', width: 64, height: 64, position: [32, 32], fill: '#000' }),
      new Image({ id: 'logo', assetId: 'logo', width: 32, height: 32, position: [32, 32] }),
    ],
  }),
  timeline: timeline({ duration: 1, fps: 30, assets: { other: { kind: 'image', url: './x.png' } } }),
};
export default m;
`,
    );
    await expect(render({ modulePath: mod, out: join(outDir, 'undeclared'), frame: 0 })).rejects.toThrow(
      /assetId 'logo' .* is not declared in timeline\.assets \(declared: other\) .* not a `src` URL/s,
    );
  });

  it('a declared assetId renders normally', async () => {
    // write a real 32x32 PNG next to the scene so warming resolves it
    const dir = mkdtempSync(join(tmpdir(), 'glissade-asset-ok-'));
    const c = createCanvas(32, 32);
    const cx = c.getContext('2d');
    cx.fillStyle = '#ff0000';
    cx.fillRect(0, 0, 32, 32);
    writeFileSync(join(dir, 'logo.png'), c.toBuffer('image/png'));
    const mod = join(dir, 'declared-asset.ts');
    writeFileSync(
      mod,
      `
import { timeline } from '@glissade/core';
import { createScene, Rect, Image, type SceneModule } from '@glissade/scene';
const m: SceneModule = {
  createScene: () => createScene({
    size: { w: 64, h: 64 },
    children: [
      new Rect({ id: 'bg', width: 64, height: 64, position: [32, 32], fill: '#000' }),
      new Image({ id: 'logo', assetId: 'logo', width: 32, height: 32, position: [32, 32] }),
    ],
  }),
  timeline: timeline({ duration: 1, fps: 30, assets: { logo: { kind: 'image', url: './logo.png' } } }),
};
export default m;
`,
    );
    const result = await render({ modulePath: mod, out: join(dir, 'out.png'), frame: 0 });
    expect(existsSync(result.out)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
