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
  out: 'dist',                       // rendered videos land here (default: next to each scene)
  defaults: {
    fps: 30,
    captions: 'sidecar',             // burn (default) | sidecar | off
    cache: '.gscache',               // persistent frame cache (speed only)
  },
});
```

```sh
gs build                 # run the stale subtree across every scene
gs build e07             # only scenes whose path contains 'e07'
gs build --explain       # print the plan, run nothing
```

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
