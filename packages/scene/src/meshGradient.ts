/**
 * Mesh-gradient kernel (§3 Paint, 0.12). A `mesh` Paint is N color points
 * scattered across the [0,1]² fill rectangle, blended into ONE animatable fill
 * — the native replacement for the "N blurred blobs" aurora backdrop.
 *
 * THE DETERMINISM TENTPOLE: `@napi-rs/canvas` exposes NO SkSL RuntimeEffect /
 * makeShader, so there is no SkSL-vs-fallback fork — there is exactly ONE shared
 * CPU kernel that BOTH backends run. This file is that kernel, mirroring
 * `densifyStops` (gradient.ts): pinned named constants (`MESH_SIGMA`,
 * `MESH_SHEPARD_POWER`, `MESH_DOWNSCALE`) so neither backend picks its own, OKLab
 * blend reused bit-identically from `@glissade/core`, and integer `Uint8ClampedArray`
 * quantization so the buffer is reproducible run-to-run and byte-identical across
 * backends. Only the FINAL blit (clip + drawImage upscale) differs per backend —
 * the source pixels are identical, which is what makes browser↔Skia SSIM ≥ 0.97.
 *
 * The blend is ONE deterministic Shepard inverse-distance kernel with a
 * colorspace knob: `smooth` = inverse-distance weighting in OKLab; `gaussian` =
 * a pinned-sigma gaussian weight (a softer, blurrier melt); `oklab` is an alias
 * for `smooth` (the blend space is always OKLab — the gradient path's contract).
 * NO triangulator (Gouraud/Delaunay/Coons are deferred).
 */

import { oklabToRgba, parseColor, rgbaToOklab, type MeshPaint, type OkLab } from '@glissade/core';

/**
 * The mesh raster resolution divisor. The mesh is computed at
 * ceil(bounds / MESH_DOWNSCALE) and the backend upscales it (clip + drawImage,
 * `imageSmoothingEnabled` pinned true) — a gradient is low-frequency, so the
 * downscale is invisible while cutting the per-pixel kernel cost ~16×. PINNED:
 * both backends compute the identical low-res ImageData.
 */
export const MESH_DOWNSCALE = 4;

/** Inverse-distance exponent for `smooth`/`oklab` (Shepard's method). Higher =
 * sharper points; 2 is the classic IDW value and the pinned default. */
export const MESH_SHEPARD_POWER = 2;

/**
 * Gaussian weight sigma for `gaussian` mode, in NORMALIZED [0,1] mesh space
 * (a point's influence falls to ~60% one sigma away). Pinned so the melt width
 * is identical on both backends — the GAUSS_K precedent from gradient.ts.
 */
export const MESH_SIGMA = 0.32;

/** Epsilon so a sample sitting exactly on a point doesn't divide by zero; small
 * enough to be a hard pin to that point's color. Pinned (folds into the bytes). */
const MESH_EPS = 1e-6;

/** Cap the mesh raster so a pathological tiny-downscale × huge-bounds can't OOM;
 * far above any real fill at /4. Pinned (it changes nothing for real meshes). */
const MESH_MAX_DIM = 1024;

interface MeshPointLab {
  u: number;
  v: number;
  lab: OkLab;
}

/**
 * Rasterize a mesh Paint into an RGBA `Uint8ClampedArray` of `w*h` pixels
 * (row-major, premultiply-free straight alpha). PURE function of
 * (mesh, w, h): identical inputs → byte-identical buffer, on any backend.
 *
 * `w`/`h` are the DOWNSCALED dimensions (the caller divides the fill bounds by
 * MESH_DOWNSCALE). Each output pixel's center maps to mesh space [0,1]²; the
 * blend is Shepard IDW (smooth/oklab) or a pinned-sigma gaussian (gaussian) of
 * the point colors in OKLab, with an optional `bg` color as a zero-weight floor
 * (a baseline so sparse meshes don't smear a single point across the whole rect).
 */
export function rasterizeMesh(mesh: MeshPaint, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4);
  const pts: MeshPointLab[] = mesh.points.map((p) => ({
    u: p.pos[0],
    v: p.pos[1],
    lab: rgbaToOklab(parseColor(p.color)),
  }));
  const bg: OkLab | null = mesh.bg !== undefined ? rgbaToOklab(parseColor(mesh.bg)) : null;
  const gaussian = mesh.interpolation === 'gaussian';
  // gaussian weight constant: exp(-d² / (2σ²)); precompute the denominator.
  const twoSigmaSq = 2 * MESH_SIGMA * MESH_SIGMA;

  for (let y = 0; y < h; y++) {
    // sample at the pixel CENTER in normalized mesh space (deterministic mapping)
    const v = h > 1 ? (y + 0.5) / h : 0.5;
    for (let x = 0; x < w; x++) {
      const u = w > 1 ? (x + 0.5) / w : 0.5;
      let wsum = 0;
      let L = 0;
      let A = 0;
      let B = 0;
      let alpha = 0;
      // bg is a zero-distance-independent baseline weight of 1 (when present)
      if (bg) {
        wsum = 1;
        L = bg.L;
        A = bg.a;
        B = bg.b;
        alpha = bg.alpha;
      }
      let pinned = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const du = u - p.u;
        const dv = v - p.v;
        const d2 = du * du + dv * dv;
        if (d2 <= MESH_EPS * MESH_EPS) {
          // exactly on a point: hard-pin to its color (avoids /0 + IDW spike)
          L = p.lab.L;
          A = p.lab.a;
          B = p.lab.b;
          alpha = p.lab.alpha;
          pinned = true;
          break;
        }
        let weight: number;
        if (gaussian) {
          weight = Math.exp(-d2 / twoSigmaSq);
        } else {
          // Shepard IDW: w = 1 / d^power. power=2 → 1/d²; use d2 directly.
          weight = MESH_SHEPARD_POWER === 2 ? 1 / d2 : 1 / Math.pow(Math.sqrt(d2), MESH_SHEPARD_POWER);
        }
        wsum += weight;
        L += weight * p.lab.L;
        A += weight * p.lab.a;
        B += weight * p.lab.b;
        alpha += weight * p.lab.alpha;
      }
      let rgba;
      if (pinned) {
        rgba = oklabToRgba({ L, a: A, b: B, alpha });
      } else if (wsum > 0) {
        const inv = 1 / wsum;
        rgba = oklabToRgba({ L: L * inv, a: A * inv, b: B * inv, alpha: alpha * inv });
      } else {
        // no points and no bg: transparent (only reachable for an empty mesh)
        rgba = { r: 0, g: 0, b: 0, a: 0 };
      }
      const o = (y * w + x) * 4;
      // Uint8ClampedArray rounds-half-to-even on assignment — integer-quantized,
      // so the buffer is reproducible run-to-run and identical across backends.
      out[o] = rgba.r;
      out[o + 1] = rgba.g;
      out[o + 2] = rgba.b;
      out[o + 3] = Math.round(rgba.a * 255);
    }
  }
  return out;
}

/** Downscaled raster dimensions for a fill of `bw×bh` local px (≥1, capped). */
export function meshRasterSize(bw: number, bh: number): { w: number; h: number } {
  const w = Math.min(MESH_MAX_DIM, Math.max(1, Math.ceil(Math.abs(bw) / MESH_DOWNSCALE)));
  const h = Math.min(MESH_MAX_DIM, Math.max(1, Math.ceil(Math.abs(bh) / MESH_DOWNSCALE)));
  return { w, h };
}
