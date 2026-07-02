/**
 * Perceptual golden tier (0.37): the SSIM scalar stays bit-identical to the
 * historical parity metric, the per-tile map localizes WHERE a frame changed,
 * and the heat-map recedes on unchanged regions / glows on divergence.
 */

import { describe, expect, it } from 'vitest';
import { ssim, ssimMap, heatmapRgba } from '../src/perceptual.js';

const W = 32;
const H = 24;

function solid(r: number, g: number, b: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  return px;
}

describe('ssim / ssimMap', () => {
  it('identical buffers score 1 (mean and every tile)', () => {
    const a = solid(120, 130, 140);
    expect(ssim(a, a, W, H)).toBeCloseTo(1, 10);
    const map = ssimMap(a, a, W, H);
    expect(map.mean).toBeCloseTo(1, 10);
    expect(map.min).toBeCloseTo(1, 10);
    expect([...map.tiles].every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
  });

  it('ssim() equals ssimMap().mean (the scalar delegates, bit-identical)', () => {
    const a = solid(10, 20, 30);
    const b = solid(200, 40, 60);
    expect(ssim(a, b, W, H)).toBe(ssimMap(a, b, W, H).mean);
  });

  it('grid dimensions cover full 8×8 tiles only', () => {
    const map = ssimMap(solid(0, 0, 0), solid(0, 0, 0), W, H);
    expect(map.cols).toBe(W / 8); // 4
    expect(map.rows).toBe(H / 8); // 3
    expect(map.tiles.length).toBe(map.cols * map.rows);
    expect(map.win).toBe(8);
  });

  it('localizes the worst tile: a single dirty patch flags its grid cell', () => {
    const a = solid(128, 128, 128);
    const b = solid(128, 128, 128);
    // corrupt the tile at grid (tx=2, ty=1): pixels x∈[16,24), y∈[8,16)
    for (let y = 8; y < 16; y++) {
      for (let x = 16; x < 24; x++) {
        const o = (y * W + x) * 4;
        b[o] = 255;
        b[o + 1] = 0;
        b[o + 2] = 0;
      }
    }
    const map = ssimMap(a, b, W, H);
    expect(map.min).toBeLessThan(0.9);
    expect(map.minTile).toEqual({ tx: 2, ty: 1 });
    // the untouched tiles stayed at 1
    expect(map.mean).toBeGreaterThan(map.min);
  });

  it('rejects mismatched buffer dimensions', () => {
    expect(() => ssimMap(new Uint8ClampedArray(4), solid(0, 0, 0), W, H)).toThrow(/identical dimensions/);
  });

  it('an image smaller than one 8×8 tile yields no NaN (vacuous mean 1, empty grid)', () => {
    const tiny = new Uint8ClampedArray(5 * 5 * 4);
    const map = ssimMap(tiny, tiny, 5, 5);
    expect(map.cols).toBe(0);
    expect(map.rows).toBe(0);
    expect(map.tiles.length).toBe(0);
    expect(Number.isNaN(map.mean)).toBe(false);
    expect(map.mean).toBe(1);
    expect(ssim(tiny, tiny, 5, 5)).toBe(1);
  });
});

describe('heatmapRgba', () => {
  it('unchanged tiles recede to the dark ground; divergent tiles glow hot', () => {
    const a = solid(128, 128, 128);
    const b = solid(128, 128, 128);
    for (let y = 8; y < 16; y++) {
      for (let x = 16; x < 24; x++) {
        const o = (y * W + x) * 4;
        b[o] = 255;
        b[o + 1] = 0;
        b[o + 2] = 0;
      }
    }
    const heat = heatmapRgba(ssimMap(a, b, W, H), W, H);
    // an unchanged pixel (top-left) is near-black ground, fully opaque
    expect([heat[0], heat[1], heat[2], heat[3]]).toEqual([10, 12, 20, 255]);
    // a pixel inside the dirty tile is hot (high red) and opaque
    const o = (10 * W + 18) * 4;
    expect(heat[o]!).toBeGreaterThan(150);
    expect(heat[o + 3]).toBe(255);
  });
});
