/**
 * §3 mesh Paint determinism gates on the real Skia render path (0.12). The
 * shared CPU kernel + clip+drawImage blit must be:
 *  (1) re-render byte-stable in-process (same Paint → same buffer → same pixels);
 *  (2) RASTER_CACHE=0 == RASTER_CACHE=1 byte-identical — a mesh fill inside a
 *      cache:true group must blit a HIT identically to the cold uncached raster
 *      (the mesh adds no per-frame state, so it rides the §3.5 group cache).
 */

import { describe, expect, it } from 'vitest';
import { createCanvas, Path2D, type Canvas, type Image } from '@napi-rs/canvas';
import { Raster2D, type Ctx2DLike, type DisplayList, type DrawCommand, type MeshPaint, type Resource } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';

type Drawable = Canvas | Image;

const W = 200;
const H = 200;

const meshPaint: MeshPaint = {
  kind: 'mesh',
  points: [
    { pos: [0.2, 0.2], color: '#ff5d73' },
    { pos: [0.8, 0.3], color: '#6bd0ff' },
    { pos: [0.5, 0.85], color: '#ffd86b' },
  ],
  interpolation: 'smooth',
  bg: '#0a0a12',
};

const rect = (x: number, y: number, w: number, h: number): Resource => ({
  kind: 'path',
  segs: [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']],
});

/** A mesh fill wrapped in a cache:true group, so the §3.5 LRU is exercised. */
function meshList(): DisplayList {
  const commands: DrawCommand[] = [
    { op: 'pushGroup', opacity: 1, blend: 'source-over', filters: [], cacheKey: 'mesh-badge' },
    { op: 'fillPath', path: 0, paint: meshPaint },
    { op: 'popGroup' },
  ];
  return { commands, resources: [rect(20, 20, 160, 160)], size: { w: W, h: H } };
}

function uncachedRaster(): { render(list: DisplayList): Buffer } {
  const canvas = createCanvas(W, H);
  const raster = new Raster2D<Canvas, Path2D, Drawable>(
    {
      context: (c) => c.getContext('2d') as unknown as Ctx2DLike<Path2D, Drawable>,
      createCanvas: (w, h) => createCanvas(w, h),
      newPath: () => new Path2D(),
    },
    'warn',
    false, // cacheEnabled = false — the uncached oracle
  );
  return {
    render(list) {
      raster.render(canvas, list);
      return canvas.toBuffer('image/png');
    },
  };
}

describe('§3 mesh Paint determinism on Skia', () => {
  it('renders a non-trivial (non-blank) mesh fill', () => {
    const backend = new SkiaBackend(W, H);
    backend.render(meshList());
    const buf = backend.encodePng();
    // a blank 200×200 transparent PNG is tiny; a real mesh has many distinct pixels
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.equals(new SkiaBackend(W, H).encodePng())).toBe(false);
  });

  it('re-rendering the same mesh frame is byte-stable in-process', () => {
    const backend = new SkiaBackend(W, H);
    backend.render(meshList());
    const a = backend.encodePng();
    backend.render(meshList());
    const b = backend.encodePng();
    expect(a.equals(b)).toBe(true);
  });

  it('RASTER_CACHE on == off, byte-for-byte (mesh rides the §3.5 group cache)', () => {
    const cached = new SkiaBackend(W, H);
    const uncached = uncachedRaster();
    // render multiple times so the cached path takes a HIT after the cold MISS
    for (let i = 0; i < 3; i++) {
      cached.render(meshList());
      const withCache = cached.encodePng();
      const withoutCache = uncached.render(meshList());
      expect(withCache.equals(withoutCache), `iteration ${i}: cached mesh diverged from uncached`).toBe(true);
    }
  });
});
