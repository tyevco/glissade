---
"@glissade/cli": patch
---

`gs build`: `ProjectConfig.ignore`, a positional-config note, and per-project font flags

Three config papercuts from the 0.43 real-project consumer read (ai-training):

- **`ignore` exclude globs.** The documented `scenes: ['episodes/**/*.ts']` swept colocated `*.test.ts` in as scenes — which `gs build` then tried to *load*, importing vitest and crashing. Add `ignore: ['*.test.ts']` to the config to exclude them: a `/`-less pattern matches the basename at any depth (`*.test.ts`), a `/`-bearing one matches the config-relative path (`_wip/**`).
- **A positional is a scene FILTER, not a config path.** `gs build my.config.ts` used to be silently treated as a filter (matching no scene) and fall back to `glissade.config.ts`; it now prints a note pointing you at `--config`. `gs build --help` prints usage.
- **Per-project font flags.** `defaults.strictFonts` / `defaults.allowSystemFonts` thread through to every render, so a series can enforce the §3.6 font gate (fail on a missing face) or opt into system fonts from the config instead of per-invocation.
