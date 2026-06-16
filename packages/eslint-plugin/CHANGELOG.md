# @glissade/eslint-plugin

## 0.8.0-pre.0

## 0.7.0

### Minor Changes

- 2ddddf8: New `@glissade/eslint-plugin` package: ESLint rules that statically enforce the determinism contract (§5.5) in scene code — `gas/no-wall-clock` (no `Date.now`/`performance.now`/argless `new Date()`/`setTimeout`/`setInterval`/`requestAnimationFrame`), `gas/no-unseeded-random` (no `Math.random()` — use the seeded `random(seed)`/`Rng`), and `gas/no-async-in-evaluate` (no `async`/`await` in the synchronous `evaluate()` path). Wired into CI via a `pnpm lint` step over the `core`/`scene` evaluation substrate (the Yoga wasm loader is the one sanctioned async seam, excluded). Consumers can apply the same rules to their own scene modules.

### Patch Changes

- 4317102: `@glissade/eslint-plugin` now exports a flat-config preset `configs.recommended` that applies all three determinism rules and ignores test files (`**/*.test.ts`, `**/*.spec.ts`, `**/test(s)/**`) — so async golden tests don't trip `no-async-in-evaluate`. Spread it into your config: `export default [...glissade.configs.recommended]` (scope with `files` as needed). Reported downstream.

## 0.7.0-pre.0

### Minor Changes

- 2ddddf8: New `@glissade/eslint-plugin` package: ESLint rules that statically enforce the determinism contract (§5.5) in scene code — `gas/no-wall-clock` (no `Date.now`/`performance.now`/argless `new Date()`/`setTimeout`/`setInterval`/`requestAnimationFrame`), `gas/no-unseeded-random` (no `Math.random()` — use the seeded `random(seed)`/`Rng`), and `gas/no-async-in-evaluate` (no `async`/`await` in the synchronous `evaluate()` path). Wired into CI via a `pnpm lint` step over the `core`/`scene` evaluation substrate (the Yoga wasm loader is the one sanctioned async seam, excluded). Consumers can apply the same rules to their own scene modules.
