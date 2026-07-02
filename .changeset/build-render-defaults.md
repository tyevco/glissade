---
"@glissade/cli": minor
---

`gs build`: render-option defaults in the project config + two loudness-pipeline fixes (the burned-captions batch, end to end)

A consumer's first full-series `gs build` (49 steps, 310 min) burned captions into 8 episode masters that ship soft captions — and the hand re-render batch that followed surfaced two more pipeline defects. All three are fixed:

**1. `defaults` now carries render options.** `ProjectConfig.defaults` was `{ fps, cache }` only, so every `gs build` render used the `--captions burn` default with no way to say otherwise:

```ts
export default defineProject({
  scenes: ['episodes/**/*.ts'],
  out: 'dist',
  defaults: { captions: 'sidecar', fps: 30 },   // narration/music/sfx/loudness too
});
```

The new options (`captions`, `narration`, `music`, `sfx`, `loudness`) thread into render, the mix modes ALSO thread into `measure-loudness` (the measured mix must be the rendered mix), and — critically — they **fold into the per-step staleness hash**: flipping `captions: 'sidecar'` re-runs render instead of serving the stale burned master from a fresh-looking cache. `cache` stays out of the hash (a speed knob, never an output input). Verified end to end: flip re-runs ONLY render; burn vs sidecar masters differ; the sidecar master carries no baked-in caption pixels.

**2. `mixHash` is now invocation-path-independent.** `computeMixHash` folded verbatim path strings (siblings derive from `modulePath`), so `gs build` (absolute path) and a standalone `gs measure-loudness <relative>` produced different hashes over byte-identical mixes — a `gs build`-committed measurement then read as *stale* from any standalone render. Inputs are now folded under scene-relative labels: `rel == abs == ./`-form, while content changes still invalidate. **Migration note:** committed `*.loudness.json` hashes from ≤0.32.0 will read stale once — the error message says so; one `gs measure-loudness` re-run migrates each (same measured numbers, new hash format).

**3. The stale-loudness guard now PREFLIGHTS.** It used to first run inside audio planning — *after* the entire frame loop — so a stale mixHash surfaced only after ~30 min of doomed rendering per episode (~2.5 h lost across the batch). Every input the guard reads exists at t=0; it now resolves (and throws) before frame 1, and the regression test asserts no output artifact is written on a stale render.
