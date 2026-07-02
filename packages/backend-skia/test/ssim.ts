/**
 * The §3.4 parity metric moved to `src/perceptual.ts` (shipped) in the 0.37
 * perceptual-golden-tier work so `gs repin` can consume it. Re-exported here so
 * the PARITY suite's import (`./ssim.js`) is unchanged and the scalar is
 * bit-identical to before.
 */

export { ssim, ssimMap, heatmapRgba, type SsimMap } from '../src/perceptual.js';
