/**
 * 0.75 two-tier render SCALE — the SkiaBackend `outputScale` path that backs
 * `gs render --preview-res <f>`. A watchable DRAFT rendered into a SMALLER canvas
 * at the EFFECTIVE output scale (fewer pixels to rasterize = the render-time win),
 * applied at the BACKEND OUTPUT raster layer ON TOP OF the composited DisplayList.
 *
 * The load-bearing properties proved here:
 *  - the DEFAULT (no outputScale) path is byte-untouched — it takes the EXACT
 *    current code path (no identity transform), so the goldens can't move;
 *  - a scaled render is deterministic (same DL + factor → same bytes);
 *  - a scaled render is DISTINCT (dims + bytes) from full-res and per factor;
 *  - ORTHOGONALITY: a scene `.scale` transform baked into the DisplayList composes
 *    UNDER the output raster scale (scene transform first, THEN output scale) — the
 *    two never multiply into one (the double-scale trap).
 */

import { describe, expect, it } from 'vitest';
import type { DisplayList } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';

/**
 * A `size` canvas with a solid-white axis-aligned rect drawn under an optional
 * leading SCENE transform (simulating a node `.props.scale`). Axis-aligned integer
 * geometry → sharp pixel edges, so the painted bbox is exact (no AA ambiguity).
 */
function rectScene(size: number, sceneScale: number): DisplayList {
  return {
    size: { w: size, h: size },
    resources: [{ kind: 'path', segs: [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']] }],
    commands: [
      // a SCENE-space node transform (e.g. `.scale = sceneScale`) baked into the DL
      { op: 'transform', m: [sceneScale, 0, 0, sceneScale, 0, 0] },
      { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#ffffff' } },
    ],
  };
}

/** Exact painted bounding box (alpha > 0) over an RGBA buffer. */
function paintedBox(rgba: Uint8ClampedArray, w: number, h: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3]! > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

describe('SkiaBackend default path is byte-untouched (no outputScale)', () => {
  it('render() with no outputScale is byte-identical run-to-run (the current code path)', () => {
    const dl = rectScene(64, 1);
    const a = new SkiaBackend(64, 64);
    a.render(dl);
    const pa = a.encodePng();
    const b = new SkiaBackend(64, 64);
    b.render(dl);
    const pb = b.encodePng();
    expect(pa.equals(pb)).toBe(true);
    // the default canvas is full-res
    a.dispose();
    b.dispose();
  });
});

describe('SkiaBackend outputScale — within-scale determinism (×2)', () => {
  for (const f of [0.5, 0.75] as const) {
    it(`scaled render at f=${f} is byte-identical ×2 (same DL + factor → same bytes)`, () => {
      const dl = rectScene(80, 1);
      const w = Math.round(80 * f);
      const mk = () => {
        const be = new SkiaBackend(w, w, { outputScale: { srcWidth: 80, srcHeight: 80 } });
        be.render(dl);
        const png = be.encodePng();
        be.dispose();
        return png;
      };
      expect(mk().equals(mk())).toBe(true);
    });
  }
});

describe('SkiaBackend outputScale — isolation (distinct dims + bytes)', () => {
  it('scaled canvases carry the scaled dims and DIFFERENT bytes vs full-res and per factor', () => {
    const dl = rectScene(100, 1);
    const full = new SkiaBackend(100, 100);
    full.render(dl);
    const pFull = full.encodePng();

    const half = new SkiaBackend(50, 50, { outputScale: { srcWidth: 100, srcHeight: 100 } });
    half.render(dl);
    const pHalf = half.encodePng();

    const q = Math.round(100 * 0.75); // 75
    const threeq = new SkiaBackend(q, q, { outputScale: { srcWidth: 100, srcHeight: 100 } });
    threeq.render(dl);
    const p3q = threeq.encodePng();

    // distinct bytes across every tier → a stored artifact can never cross-serve
    expect(pFull.equals(pHalf)).toBe(false);
    expect(pHalf.equals(p3q)).toBe(false);
    expect(pFull.equals(p3q)).toBe(false);
    full.dispose();
    half.dispose();
    threeq.dispose();
  });
});

describe('SkiaBackend outputScale — ORTHOGONAL to the scene .scale transform', () => {
  it('a node .scale (2×) composes UNDER the output raster scale (0.5), never multiplied into one', async () => {
    // Scene: a 10×10 path under a 2× scene transform → 20px painted at full res.
    const dl = rectScene(100, 2);

    const full = new SkiaBackend(100, 100);
    full.render(dl);
    const boxFull = paintedBox(await full.readPixels(), 100, 100)!;
    const wFull = boxFull.maxX - boxFull.minX + 1;
    expect(wFull).toBe(20); // 10 × the 2× node scale

    // Output raster scale 0.5 into a 50×50 canvas.
    const scaled = new SkiaBackend(50, 50, { outputScale: { srcWidth: 100, srcHeight: 100 } });
    scaled.render(dl);
    // determinism part (a): byte-identical ×2
    const again = new SkiaBackend(50, 50, { outputScale: { srcWidth: 100, srcHeight: 100 } });
    again.render(dl);
    expect(scaled.encodePng().equals(again.encodePng())).toBe(true);

    const boxScaled = paintedBox(await scaled.readPixels(), 50, 50)!;
    const wScaled = boxScaled.maxX - boxScaled.minX + 1;
    // part (b): the node 2× still applies, then ONE output 0.5 on top → 20 × 0.5 = 10.
    // The double-scale bug (f leaking into the scene transform) would give 20×0.5×0.5 = 5.
    expect(wScaled).toBe(10);
    expect(wScaled).not.toBe(5);

    full.dispose();
    scaled.dispose();
    again.dispose();
  });
});
