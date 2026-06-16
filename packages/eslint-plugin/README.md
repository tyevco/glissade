# @glissade/eslint-plugin

ESLint rules enforcing glissade's determinism contract in scene code — the same
guarantees that make `evaluate(scene, timeline, t)` a pure function of time and
keep headless export byte-reproducible.

## Rules

| Rule | What it forbids |
| --- | --- |
| `gas/no-wall-clock` | `Date.now` / `performance.now` / `new Date()` / `setTimeout` / `setInterval` — clock reads make a draw non-reproducible |
| `gas/no-unseeded-random` | `Math.random()` — use the seeded `random(seed)` / `Rng` from `@glissade/core` |
| `gas/no-async-in-evaluate` | `async` / `await` on the `evaluate()` path — evaluation is synchronous (§2.5) |

## Usage (flat config)

```js
// eslint.config.js
import glissade from '@glissade/eslint-plugin';

export default [...glissade.configs.recommended];
```

`configs.recommended` enables all three rules at `error`.

## Note for release-age-gating downstreams

If your install gates on package release age (e.g. pnpm
`minimumReleaseAgeExclude`), exempt **`@glissade/eslint-plugin` alongside the
runtime `@glissade/*` scope** — a fresh plugin publish is otherwise blocked
(`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`) even when the runtime packages are
exempted. The dev-tooling package ships on the same lockstep `0.x` cadence as
the runtime, so it needs the same exemption.
