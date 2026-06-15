# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**glissade** (`@glissade/*`, Apache-2.0) is a TypeScript motion-graphics framework: realtime-first in the browser, deterministic headless video export from the same code. A pnpm + Turborepo monorepo of ~18 packages. CLI binary is `gs`; custom element is `<gs-player>`. Node ≥ 20.19, ESM-only.

## Commands

```sh
pnpm build                 # turbo run build (tsdown per package; respects the dep graph)
pnpm typecheck             # turbo run typecheck (tsc --noEmit per package)
pnpm test                  # vitest run — full unit + golden suite
pnpm test:watch            # vitest watch

# a single file / test
npx vitest run packages/<pkg>/test/<file>.test.ts
npx vitest run packages/<pkg>/test/<file>.test.ts -t "name substring"

pnpm check:deps            # enforce the package dependency DIRECTION (scripts/check-deps.mjs)
pnpm check:size            # enforce gzip bundle budgets (scripts/check-size.mjs)
```

`pnpm build` first is often required before typecheck/tests in a clean tree (Turbo cache races on cross-package types otherwise).

### Golden frames & gated suites

Golden frames are byte-compared PNGs rendered on Skia (`packages/backend-skia/test/golden.test.ts`), the corpus living in `packages/examples/src/scenes/golden-*.ts`. They are the determinism contract in CI.

```sh
GOLDEN_UPDATE=1 npx vitest run packages/backend-skia/test/golden.test.ts   # regenerate after an INTENTIONAL visual change
```

After regenerating, **visually inspect the new PNGs** and confirm every *unrelated* golden stayed byte-identical — every feature must be additive (opt-in / `reveal>=1` / a default that preserves prior bytes). Three suites are env-gated and run only in CI (need Playwright/ffmpeg): `PARITY=1` (browser↔Skia SSIM), `EXPORT=1` (WebCodecs), `INTERACT=1` (machine replay).

### Release (changesets; maintainer-driven)

Lockstep `0.x` versions. Add a `.changeset/*.md` per change. To cut a release: `pnpm exec changeset version` → commit `Version Packages: X` → push → `gh workflow run release.yml --ref main` (CI builds/tests then `changeset publish`). Pre-mode (`changeset pre enter pre`) publishes `0.X.0-pre.N` under the `pre` dist-tag; `changeset pre exit` + version promotes to stable `@latest`. A brand-new scoped package's first publish also lands on `@latest` (npm default), not `pre`.

## Architecture

### The one contract

`evaluate(scene, timeline, t)` is a **pure function of time** — same inputs → same `DisplayList`, in any call order, with no cross-frame state. Everything else falls out of this: backward scrub is an O(log keys) lookup, export shards frames across workers, and a golden test is one line. When touching `core`/`scene`, preserving this purity is non-negotiable — it is what makes the whole system work.

- **Signals** (`core`) are pull-based, lazy, cached, dependency-tracked. Node props are signals. A computed signal must be a pure function of its deps and the playhead — **never** "the value I had last frame."
- **Animation is data, not code.** A `Track` is a keyframe list targeting one `<nodeId>/<prop.path>`; a `Timeline` is a serializable document of tracks/labels/markers/audio/assets. The fluent builder (`timeline(tl => tl.to(...))`) *compiles to* that document — nothing executes at play time. There are **no generators and no promise-chained sequencing**; promises appear only as `.finished` completion notifications.
- **Determinism rules:** no `Date.now`/`performance.now`/`Math.random`/`setTimeout` in scene code; only the seeded `random(seed)`/`Rng` from core, reseeded fresh per draw (never a shared stateful stream — `evaluate` re-runs out of order). Stateful simulation enters only via `bake()`, which pre-computes physics into ordinary frame-indexed tracks.

### The layered package graph (dependency direction is enforced)

`scripts/check-deps.mjs` enforces `core ← scene ← backends ← player ← element/react/vite-plugin/studio`; nothing imports "up." The embed path must never transitively import `backend-skia`, the export packages, or `studio`.

- **`core`** — `Signal`, `Track`/`Timeline`, `evaluate`, the builder, easings, springs (closed-form, never integrated), seeded RNG, `bake()`. Zero DOM/Node deps.
- **`scene`** — node tree (`Group/Rect/Circle/Path/Text/Image/Video`), emits a flat **`DisplayList` IR** (plain draw commands + a resource table), never touching a render context. Declares a `TextMeasurer` interface that backends inject (so `scene` never imports a backend). `scene/layout` (Yoga flexbox) is a separately-budgeted entry point.
- **`backend-canvas2d`** / **`backend-skia`** — consume the identical `DisplayList`. Canvas2D = browser; Skia (`@napi-rs/canvas`) = the headless, per-path-byte-exact CLI twin.
- **`player`** — `mount()`, Playhead drivers (clock, scroll), play/pause/seek/loop. The Playhead is a writable time signal; drivers only *write* it.
- **`cli`** (`gs`) — `render` (Skia + FFmpeg), `dev`, `import` (`.json` Lottie / `.svg`), `narrate`, `sfx`, `prepare`. The only heavy package (alongside `studio`).
- Feature/leaf packages: `element` (`<gs-player>`), `react`, `vite-plugin` + `studio` (editor over the open core, sidecar-document model), `interact` (v2 state machines — opt-in, never imported by the embed path), `lottie`/`svg` (importers → scene nodes), `narrate`/`sfx` (offline TTS + procedural sound, the `gs narrate`/`gs sfx` prepare steps; render stays offline consuming committed `*.timing.json`), `effects-webgpu` (shader effects, outside the determinism guarantee), `examples` (the golden corpus).

### Conventions that bite

- **`exactOptionalPropertyTypes: true`** + `noUncheckedIndexedAccess`. Optional readonly fields need an explicit `| undefined`; spread-conditionally (`...(x !== undefined ? { x } : {})`) rather than passing `undefined`.
- **Bundle budgets** (`scripts/check-size.mjs`) fail the build: the base embed path ≤ 35 kB gz, with per-entry sub-budgets (core, scene, etc.). A byte-expensive feature must measure and justify a budget bump in the script.
- **`PathSeg[]`** (`['M',x,y]|['L'..]|['C'..]|['Q'..]|['E'..]|['Z']`) is the segment form; `PathValue = PathContour[]` (with relative tangents) is what `Path.data` wants. `pathFromSegs()` bridges them.
- **Cross-path parity is honest:** per-path byte-exactness on a pinned toolchain (the Skia CLI path, golden-tested); browser↔Skia is *perceptual* (SSIM) parity, never byte-equality — text/layout especially.

### The design is documented

`docs/DESIGN.md` (v1 architecture + decision record) and `docs/DESIGN-V2-INTERACTIVITY.md` (the interact layer) are the normative specs — every locked decision and milestone acceptance criterion lives there. Read the relevant section before changing core model, export, determinism, or studio behavior. User-facing topic docs are in `docs/*.md` (VitePress).
