---
"@glissade/cli": patch
---

`gs build --affected`: never silently skip an unattributable code change

`--affected` tracks each scene by its own files (source + sidecars), but a scene `.ts` *imports* other modules — so a change to a shared `src/util.ts` (or the config) affects scenes transitively, invisibly to the file-level diff. Selecting nothing on such a change would ship stale renders — the exact silent-skip the rest of the pipeline fails loud on (a real consumer's remaster edited shared `src/theme.ts` + backgrounds and would have shipped 16 stale episodes).

`--affected` now falls back **safe-by-default**: if the diff touched a code file (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs`) that is NOT any scene's recognized input — a shared module, or `glissade.config.ts` itself — it does **not** narrow; it rebuilds every scene (the per-step content hash still skips the genuinely fresh ones). A diff of only non-code files (docs, an unrelated JSON) narrows normally. Precise import-graph affectedness (rebuild only true dependents) is a follow-up.
