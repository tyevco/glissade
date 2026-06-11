/**
 * Mean SSIM over 8x8 luma windows — the §3.4 parity metric. Plain
 * implementation of the standard formula; no deps.
 */

export function ssim(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (a.length !== b.length || a.length !== width * height * 4) {
    throw new Error('ssim: buffers must be RGBA of identical dimensions');
  }
  const lumaA = new Float64Array(width * height);
  const lumaB = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    lumaA[i] = 0.2126 * a[o]! + 0.7152 * a[o + 1]! + 0.0722 * a[o + 2]!;
    lumaB[i] = 0.2126 * b[o]! + 0.7152 * b[o + 1]! + 0.0722 * b[o + 2]!;
  }

  const WIN = 8;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0;
  let windows = 0;

  for (let wy = 0; wy + WIN <= height; wy += WIN) {
    for (let wx = 0; wx + WIN <= width; wx += WIN) {
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
      total +=
        ((2 * muA * muB + C1) * (2 * cov + C2)) /
        ((muA * muA + muB * muB + C1) * (varA + varB + C2));
      windows++;
    }
  }
  return total / windows;
}
