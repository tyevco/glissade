---
"@glissade/cli": minor
---

`gs build` — a content-graph DAG runner that runs only the stale subtree

A `glissade.config.ts` lists a project's scenes; `gs build` derives each scene's narrate → sfx → measure-loudness → render pipeline, content-hashes every step's inputs (source + upstream outputs + glissade version), and runs ONLY what's stale. A one-segment re-narration re-narrates that asset, re-syncs ITS sfx, re-measures ITS loudness, re-renders it — and touches nothing else. The 5-step × N-asset manual batch becomes one command.

```ts
// glissade.config.ts
import { defineProject } from '@glissade/cli/config';
export default defineProject({ scenes: ['episodes/**/*.ts'] });
```

```
gs build              # build everything stale
gs build e07          # restrict to matching scenes
gs build --explain    # print the plan (run/skip + reason per step), run nothing
```

Staleness propagates by content hashing — a step's inputs include its upstream's outputs, so a changed upstream re-triggers everything downstream (and only that scene's downstream; other assets stay fresh). A per-scene `.gsbuild.json` records each step's last-built input hash. It reuses the shipped `narrate`/`sfx`/`measure-loudness`/`render` commands (and their fail-loud guards like `mixHash`), so it stays deterministic; step execution is injectable, so the orchestration is unit-tested without a TTS venv or ffmpeg. CLI-only — the base embed is unchanged.
