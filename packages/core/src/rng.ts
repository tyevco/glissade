/**
 * Seeded RNG (DESIGN.md §5.5): the only sanctioned randomness in scene code.
 * splitmix32 — deterministic, fast, good enough distribution for motion.
 */

export type Rng = () => number;

/** Returns a deterministic [0,1) generator for the given integer seed. */
export function random(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 4294967296;
  };
}
