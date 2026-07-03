/**
 * `valueNoise(seed, t)` — closed-form smooth value noise, a PURE function of
 * `(seed, t)`. It lerps between two lattice hash values with a smoothstep ease of
 * the fractional part:
 *
 *   valueNoise(seed, t) = lerp(rand(seed, ⌊t⌋), rand(seed, ⌊t⌋+1), smoothstep(fract t))
 *
 * There is NO stored state, NO `bake()`, NO `Date.now`/`Math.random` — the only
 * randomness is the seeded splitmix hash (`random`, DESIGN.md §5.5), so it is
 * deterministic BY CONSTRUCTION: byte-identical run-to-run and re-entrant under
 * out-of-order `evaluate()` (the determinism contract). fps-independent, O(1), and
 * freely seekable — the closed-form sibling of a spring.
 *
 * Range is [0, 1) (the same as `rand`); center it to a signed jitter with
 * `valueNoise(seed, t) * 2 - 1`. Reused by the `shake` driver + camera whole-frame
 * shake (`@glissade/scene/motion`) and available to any scene that wants a smooth
 * deterministic wobble (`window.glissade.valueNoise`).
 */

import { random } from './rng.js';

/** smoothstep on a value already in [0,1] (the fractional part) — 3t²−2t³. */
function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic hash of the integer lattice point `i` for `seed` → [0, 1). Folds
 * `seed` and `i` into one uint32 (a splitmix-friendly mix) then draws one splitmix
 * step from core's seeded `random` — so adjacent seeds/lattice points decorrelate.
 */
function latticeRand(seed: number, i: number): number {
  return random((Math.imul(i | 0, 0x9e3779b1) ^ (seed | 0)) >>> 0)();
}

export function valueNoise(seed: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = latticeRand(seed, i);
  const b = latticeRand(seed, i + 1);
  return a + (b - a) * smoothstep01(f);
}
