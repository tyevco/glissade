/**
 * Perceptual golden tier (0.37) — SSIM over 8×8 luma windows, promoted from the
 * test-only §3.4 parity metric to a SHIPPED module so `gs repin` and any golden
 * reviewer can consume it. Two shapes:
 *
 *   ssim(a, b, w, h)          → the scalar mean (the exact number the PARITY
 *                               suite floors on — byte-identical to before).
 *   ssimMap(a, b, w, h)       → the PER-TILE grid + the worst tile, so a reviewer
 *                               can localize "where did it change" and render a
 *                               heat-map.
 *   heatmapRgba(map, w, h)    → a full-res thermal RGBA (unchanged = near-black
 *                               ground, hotter = larger perceptual drop), ready
 *                               for `putPixels()` → `encodePng()`.
 *
 * Pure over RGBA buffers — no PNG, no canvas, no I/O (the CLI owns decode/encode).
 * This is the headless twin's metric; it never runs on the embed path.
 */

/** Per-tile SSIM result — the heat-map data + the worst tile for a one-line cause. */
export interface SsimMap {
  /** mean SSIM over every full tile — identical to `ssim()`. */
  readonly mean: number;
  /** the single worst (lowest-SSIM) tile's value. */
  readonly min: number;
  /** grid coords of the worst tile (`tx` across, `ty` down). */
  readonly minTile: { readonly tx: number; readonly ty: number };
  /** tiles across / down (the fully-covered grid; edge remainder is excluded). */
  readonly cols: number;
  readonly rows: number;
  /** tile edge in px. */
  readonly win: number;
  /** row-major `rows*cols` SSIM values, each in [-1, 1]. */
  readonly tiles: Float64Array;
}

const WIN = 8;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

function toLuma(px: Uint8ClampedArray, n: number): Float64Array {
  const luma = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    luma[i] = 0.2126 * px[o]! + 0.7152 * px[o + 1]! + 0.0722 * px[o + 2]!;
  }
  return luma;
}

/**
 * Per-tile SSIM. Iteration order (row-major, `wy` outer) and the window formula
 * are IDENTICAL to the historical scalar `ssim()`, so `.mean` is bit-for-bit the
 * old return value — the PARITY floors are unaffected.
 */
export function ssimMap(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
): SsimMap {
  if (a.length !== b.length || a.length !== width * height * 4) {
    throw new Error('ssimMap: buffers must be RGBA of identical dimensions');
  }
  const lumaA = toLuma(a, width * height);
  const lumaB = toLuma(b, width * height);

  const cols = Math.floor(width / WIN);
  const rows = Math.floor(height / WIN);
  const tiles = new Float64Array(rows * cols);
  let total = 0;
  let windows = 0;
  let min = Infinity;
  let minTile = { tx: 0, ty: 0 };

  for (let ty = 0, wy = 0; wy + WIN <= height; wy += WIN, ty++) {
    for (let tx = 0, wx = 0; wx + WIN <= width; wx += WIN, tx++) {
      let sumA = 0;
      let sumB = 0;
      let sumA2 = 0;
      let sumB2 = 0;
      let sumAB = 0;
      for (let y = wy; y < wy + WIN; y++) {
        for (let x = wx; x < wx + WIN; x++) {
          const va = lumaA[y * width + x]!;
          const vb = lumaB[y * width + x]!;
          sumA += va;
          sumB += vb;
          sumA2 += va * va;
          sumB2 += vb * vb;
          sumAB += va * vb;
        }
      }
      const n = WIN * WIN;
      const muA = sumA / n;
      const muB = sumB / n;
      const varA = sumA2 / n - muA * muA;
      const varB = sumB2 / n - muB * muB;
      const cov = sumAB / n - muA * muB;
      const s =
        ((2 * muA * muB + C1) * (2 * cov + C2)) /
        ((muA * muA + muB * muB + C1) * (varA + varB + C2));
      tiles[ty * cols + tx] = s;
      total += s;
      windows++;
      if (s < min) {
        min = s;
        minTile = { tx, ty };
      }
    }
  }
  return { mean: total / windows, min: windows ? min : 1, minTile, cols, rows, win: WIN, tiles };
}

/**
 * Mean SSIM over 8×8 luma windows — the §3.4 parity metric. Delegates to
 * `ssimMap` and returns `.mean`; the summation order is unchanged, so the value
 * is bit-identical to the historical implementation.
 */
export function ssim(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  return ssimMap(a, b, width, height).mean;
}

/**
 * Full-resolution thermal RGBA from a `SsimMap`: unchanged tiles (SSIM≈1) recede
 * to the near-black golden ground; a larger perceptual drop reads hotter
 * (red → yellow → white). A pixel takes its covering tile's value; the edge
 * remainder (outside the full grid) clamps to the nearest tile. Opaque.
 */
export function heatmapRgba(map: SsimMap, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const { cols, rows, win, tiles } = map;
  for (let y = 0; y < height; y++) {
    const ty = Math.min(Math.floor(y / win), rows - 1);
    for (let x = 0; x < width; x++) {
      const tx = Math.min(Math.floor(x / win), cols - 1);
      const s = tiles[ty * cols + tx]!;
      // t: 0 when identical, 1 once the tile drops to SSIM ≤ 0.8 (full white-hot).
      const t = Math.max(0, Math.min(1, (1 - s) / 0.2));
      const o = (y * width + x) * 4;
      if (t <= 0.0001) {
        out[o] = 10;
        out[o + 1] = 12;
        out[o + 2] = 20; // the #0a0e17-ish ground: unchanged regions recede
      } else {
        // black → red → yellow → white thermal ramp
        out[o] = Math.min(1, 3 * t) * 255;
        out[o + 1] = Math.max(0, Math.min(1, 3 * t - 1)) * 255;
        out[o + 2] = Math.max(0, Math.min(1, 3 * t - 2)) * 255;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
