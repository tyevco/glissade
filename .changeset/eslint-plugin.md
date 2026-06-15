---
'@glissade/eslint-plugin': minor
---

New `@glissade/eslint-plugin` package: ESLint rules that statically enforce the determinism contract (§5.5) in scene code — `gas/no-wall-clock` (no `Date.now`/`performance.now`/argless `new Date()`/`setTimeout`/`setInterval`/`requestAnimationFrame`), `gas/no-unseeded-random` (no `Math.random()` — use the seeded `random(seed)`/`Rng`), and `gas/no-async-in-evaluate` (no `async`/`await` in the synchronous `evaluate()` path). Wired into CI via a `pnpm lint` step over the `core`/`scene` evaluation substrate (the Yoga wasm loader is the one sanctioned async seam, excluded). Consumers can apply the same rules to their own scene modules.
