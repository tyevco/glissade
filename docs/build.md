# Building a project — `gs build`

`gs build` is the content-graph DAG runner (0.29). A `glissade.config.ts` lists
your scenes; the build derives each scene's `narrate → sfx → measure-loudness →
render` pipeline, content-hashes every step's inputs, and runs **only the stale
subtree**. A one-segment re-narration re-narrates that asset, re-syncs *its* sfx,
re-measures *its* loudness, re-renders it — and touches nothing else.

```ts
// glissade.config.ts
import { defineProject } from '@glissade/cli/config';

export default defineProject({
  scenes: ['episodes/**/*.ts'],
  ignore: ['*.test.ts'],             // exclude colocated tests (else gs build tries to LOAD them)
  out: 'dist',                       // rendered videos land here (default: next to each scene)
  defaults: {
    fps: 30,
    captions: 'sidecar',             // burn (default) | sidecar | off
    cache: '.gscache',               // persistent frame cache (speed only)
    // strictFonts: true,            // fail the render on a missing/fallback font (§3.6 gate)
  },
});
```

```sh
gs build                 # run the stale subtree across every scene
gs build e07             # only scenes whose path contains 'e07' (a FILTER, not a config path)
gs build --config x.ts   # point at a specific config file
gs build --explain       # print the plan, run nothing
```

`ignore` runs after `scenes` expands, so a broad glob stays safe: a `/`-less pattern matches the basename at any depth (`*.test.ts`), a `/`-bearing one matches the config-relative path (`_wip/**`). A bare positional (`gs build e07`) is a scene **filter**, not a config path — use `--config` to point at a config file.

## Render defaults (0.33)

`defaults` carries the per-scene render options — before 0.33 it was `fps`/`cache`
only, so every build rendered with burned captions no matter what the series
shipped:

| Option | Values | Notes |
| --- | --- | --- |
| `fps` | number | frames per second |
| `captions` | `'burn' \| 'sidecar' \| 'off'` | `sidecar` writes `.srt`/`.vtt` next to the video, no baked-in pixels |
| `narration` / `music` / `sfx` | `'auto' \| 'off'` | auto-mix modes; threaded into **both** render and `measure-loudness`, so the measured mix is always the rendered mix |
| `loudness` | `'auto' \| 'off'` | apply the committed publish gain at render |
| `cache` | string | frame-cache dir — **speed only**, never changes output |

## Staleness is option-aware

Every output-affecting option is folded into the step's staleness hash. Flipping
`captions: 'sidecar'` re-runs the render — it can never serve a stale burned
master out of a fresh-looking cache. Changing only `cache` re-runs nothing (it's
a speed knob). Changing a mix mode (`music: 'off'`) re-runs `measure-loudness`
*and* `render`, keeping the loudness measurement bound to the mix it gates.

The per-scene state lives in `.gsbuild.json` next to the config; the committed
step outputs (`*.timing.json`, `*.loudness.json`, the videos) are the artifacts.
Deleting `.gsbuild.json` forces a full rebuild — outputs are re-verified by
content, so an unchanged project settles back to all-fresh after one pass.

## Project runtime: `--affected` + a shared master (0.43)

`gs build` is a project runtime, not just a per-scene loop.

### Rebuild only what a change touched — `--affected`

In CI you rarely want to re-hash every scene's inputs. `gs build --affected <git-ref>` pre-filters to the scenes a git diff since `<ref>` **touched** — a scene is affected when its source or any of its sidecar inputs changed:

```sh
gs build --affected origin/main       # only scenes this branch changed
gs build --affected HEAD~1 --explain  # what would the last commit rebuild?
```

It composes with the normal content-hash staleness: `--affected` narrows the set, then each kept scene is still hash-checked (so a scene the diff touched but whose *output-affecting* inputs are unchanged still skips). It never runs a scene the diff didn't touch, and never skips a real change within the ones it keeps.

Because a scene `.ts` *imports* other modules, `--affected` is **safe-by-default** about changes it can't attribute to a scene: if the diff touched a code file that is not any scene's input — a shared `src/` module, or `glissade.config.ts` itself — it rebuilds **all** scenes rather than silently skipping transitively-affected ones (the per-step hash still skips the genuinely fresh). A diff of only non-code files (docs, an unrelated JSON) narrows normally.

### Master the whole project to a shared target

Add a `master` block to the config and `gs build` runs a second, cross-scene phase after rendering — the series-level [shared-target loudness](/mastering) applied as part of the build:

```ts
// glissade.config.ts
import { defineProject } from '@glissade/cli/config';
export default defineProject({
  scenes: ['episodes/**/*.ts'],
  master: { profile: 'youtube', consistency: 'shared-target' }, // limiter on by default
});
```

The runtime is then a two-phase schedule with an explicit barrier:

1. **render** every stale scene (each with its own per-scene loudness), then
2. **barrier** → **master**: measure every member, plan one shared LUFS target + true-peak limiter across the whole project, and commit each `<scene>.loudness.json`, then
3. the render staleness takes over — a member whose committed loudness *moved* is now stale, so it **remuxes** (a fast mix-only re-encode, not a full re-render) to apply the shared gain. A member whose loudness is unchanged stays fresh.

The master phase always measures **all** members (the shared target is the quietest member's reach, so it can't be computed from a subset) — so `--affected` narrows the expensive *render* phase, while the master + remux still consider the whole project. An unchanged project settles: the master re-commits byte-identical loudness, so nothing remuxes on the second pass.
