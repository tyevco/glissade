---
"@glissade/scene": patch
---

0.20: move `tokenHighlight` (production render UI) off `/diagnostics` onto `@glissade/scene/tokens` (ai-training finding)

`tokenHighlight` / `TokenHighlight` draw VISIBLE sub-line token tell-tags in real
episodes — they are a PRODUCTION rendering component, not a DEV/CLI diagnostic.
The 0.20 base-embed budget review wrongly grouped them onto
`@glissade/scene/diagnostics` (alongside the diff/snapshot/audit DEBUG tools), so
`import … from '@glissade/scene/diagnostics'` read as a debug import for visible
UI. This splits the whole token-highlight surface back out onto its OWN
PRODUCTION subpath **`@glissade/scene/tokens`**; the genuine diagnostics
(`diffDisplayLists` / `formatDisplayDiff` / `serializeDisplayList` /
`parseDisplaySnapshot` / `auditCacheCold`) stay on `/diagnostics`, which is now
debug-only.

**BREAKING import change** (these symbols now import from the new subpath, not
`/diagnostics`):

- **`@glissade/scene/tokens`** — `tokenHighlight`, `TokenHighlight`,
  `matchTokenRun`, `TokenMatchError`, `TokenHighlightProps`, `TokenRange`.

This is a SECOND move for `tokenHighlight` in 0.20 (it went base index →
`/diagnostics` in the budget review; now `/diagnostics` → `/tokens`, its
production home). It stays OFF the base scene index (opt-in production UI — the
base embed is unchanged at ~35.59 kB gz). It is npm-subpath-only: re-exporting it
onto the `@glissade/browser` IIFE measured +1.16 kB gz (47.47 → 48.63), busting
the 48 kB convenience-bundle ceiling, so a no-build author reaches it via the npm
subpath rather than `window.glissade.*`.

Pure module-graph relocation — all goldens stay byte-identical.
