# Contributing to glissade

Thanks for considering it. A few ground rules keep the project healthy.

## Developer Certificate of Origin (DCO)

We use the [DCO](https://developercertificate.org/) rather than a CLA: sign your commits with `git commit -s` (`Signed-off-by: Your Name <you@example.com>`). There is no copyright assignment and there will be no relicensing rug-pull — the project is Apache-2.0, permanently. CI enforces the sign-off on every commit in a pull request (`.github/workflows/dco.yml`).

## Clean-room policy (important)

Remotion's source-available license prohibits using its code to build other frameworks. Therefore:

- **Never read or port Remotion source code** for implementation work here.
- Referencing Remotion's *public documentation, issues, discussions, and blog posts* is fine (we cite several in DESIGN.md).
- Motion Canvas is MIT: studying and adapting its mechanisms is fine; preserve headers if you vendor code.

If a contribution looks like it was derived from Remotion internals, it will be declined.

## Development

```sh
pnpm install
pnpm build          # tsdown, all packages (jiti-loaded scene modules need dists)
pnpm test           # vitest, fast and offline
pnpm typecheck
```

Browser-gated suites (need `pnpm exec playwright install chromium-headless-shell` and ffmpeg):

```sh
PARITY=1 pnpm vitest run packages/backend-skia/test/parity.test.ts
EXPORT=1 pnpm vitest run packages/backend-skia/test/export-web.test.ts
```

Golden frames byte-compare on a pinned toolchain; re-bless intentional changes with `GOLDEN_UPDATE=1`.

## What makes a good PR

- Tests come with the change — purity properties (twice ≡ once, any-order ≡ sorted) for anything touching evaluation, golden frames for anything touching rendering.
- Core stays free of DOM and Node APIs (`lib: ["ES2022"]` enforces this).
- No generator functions in public APIs; promises are completion signals only.
- State must be a function of time. If your feature needs cross-frame state, it belongs in `bake()` or behind a warming seam — never inside `evaluate()`.
