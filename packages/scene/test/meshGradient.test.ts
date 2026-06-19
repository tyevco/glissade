/**
 * The mesh-gradient kernel (§3 Paint, 0.12): ONE shared CPU rasterizer both
 * backends run (no SkSL fork). Pure function of (mesh, w, h) → byte-identical
 * RGBA buffer; that determinism is what makes the Skia golden byte-exact and
 * browser↔Skia SSIM-parity.
 */

import { describe, expect, it } from 'vitest';
import type { MeshPaint } from '@glissade/core';
import {
  MESH_DOWNSCALE,
  MESH_SHEPARD_POWER,
  MESH_SIGMA,
  meshRasterSize,
  rasterizeMesh,
} from '../src/meshGradient.js';

const mesh = (interpolation: MeshPaint['interpolation'] = 'smooth', bg?: string): MeshPaint => ({
  kind: 'mesh',
  points: [
    { pos: [0.2, 0.2], color: '#ff0000' },
    { pos: [0.8, 0.3], color: '#00ff00' },
    { pos: [0.5, 0.85], color: '#0000ff' },
  ],
  ...(interpolation ? { interpolation } : {}),
  ...(bg !== undefined ? { bg } : {}),
});

const px = (buf: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number, number] => {
  const i = (y * w + x) * 4;
  return [buf[i]!, buf[i + 1]!, buf[i + 2]!, buf[i + 3]!];
};

describe('rasterizeMesh (§3 mesh kernel)', () => {
  it('pins its named constants (both backends must agree)', () => {
    expect(MESH_DOWNSCALE).toBe(4);
    expect(MESH_SHEPARD_POWER).toBe(2);
    expect(MESH_SIGMA).toBeCloseTo(0.32, 6);
  });

  it('is byte-identical across repeated calls (run-to-run reproducible)', () => {
    const m = mesh('smooth', '#101018');
    const a = rasterizeMesh(m, 40, 40);
    const b = rasterizeMesh(m, 40, 40);
    expect(a.length).toBe(40 * 40 * 4);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('a pixel near a point reads near that point color (Shepard pins)', () => {
    const m = mesh('smooth');
    const buf = rasterizeMesh(m, 40, 40);
    // near red point (0.2,0.2) → pixel (8,8)
    const [r, g, b] = px(buf, 40, 8, 8);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(120);
    expect(b).toBeLessThan(120);
  });

  it('gaussian differs from smooth (a softer, distinct melt)', () => {
    const w = 40;
    const s = rasterizeMesh(mesh('smooth'), w, w);
    const gauss = rasterizeMesh(mesh('gaussian'), w, w);
    expect(Buffer.from(s).equals(Buffer.from(gauss))).toBe(false);
  });

  it('oklab is an alias for smooth (same blend space)', () => {
    const w = 24;
    const s = rasterizeMesh(mesh('smooth'), w, w);
    const o = rasterizeMesh(mesh('oklab'), w, w);
    expect(Buffer.from(s).equals(Buffer.from(o))).toBe(true);
  });

  it('bg is a baseline floor: a sparse mesh is brighter near its point than far from it', () => {
    const sparse: MeshPaint = { kind: 'mesh', points: [{ pos: [0.5, 0.5], color: '#ffffff' }], interpolation: 'gaussian', bg: '#000000' };
    const buf = rasterizeMesh(sparse, 41, 41);
    // far corner (0,0): the single white point's gaussian weight is tiny → bg dominates → dark
    const [corner] = px(buf, 41, 0, 0);
    // center (20,20) ≈ exactly on the white point → the white point dominates the bg floor
    const [center] = px(buf, 41, 20, 20);
    expect(corner).toBeLessThan(120);
    expect(center).toBeGreaterThan(corner + 80); // a clear bright-near / dark-far gradient
  });

  it('fully opaque output for opaque inputs (alpha = 255)', () => {
    const buf = rasterizeMesh(mesh('smooth', '#101018'), 30, 30);
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).toBe(255);
  });

  it('meshRasterSize downscales by MESH_DOWNSCALE, ceils, min 1', () => {
    expect(meshRasterSize(380, 320)).toEqual({ w: Math.ceil(380 / 4), h: Math.ceil(320 / 4) });
    expect(meshRasterSize(1, 1)).toEqual({ w: 1, h: 1 });
    expect(meshRasterSize(0, 0)).toEqual({ w: 1, h: 1 });
  });
});
