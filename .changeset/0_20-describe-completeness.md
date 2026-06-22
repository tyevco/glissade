---
"@glissade/scene": patch
---

0.20: `describe()` completeness — `Text.fontVariationSettings` (construction prop → discoverable + specific bind error) + `Grid` in the manifest (HNar9da3oDXb)

A video-canary review found three gaps where the 0.20 surface rendered but was
invisible to `glissade.describe()` (the machine-readable manifest an AI/agent
consumer reads as ground truth). One name fix closes two of them:

- **`Text.fontVariationSettings`** — the 0.20 headline variable-font prop was
  ABSENT from the manifest (`Text.props` listed `fontWeight`/`fontStyle`/
  `lineHeight` but not it) and binding a track to `<id>/fontVariationSettings`
  fell through to the generic `UnboundTargetError`. Adding it to the Text
  CONSTRUCTION-prop NAME set in `constructionProps.ts` (the single source both
  `describe()` and the bind guard read) makes it appear in the manifest as
  `{ type: 'string', animatable: false }` AND makes binding it throw the
  construction-prop-SPECIFIC message ("…is a construction prop… set it at
  construction") instead of the generic resolver error.
- **`Grid`** (the `@glissade/scene/grid` build-time track resolver) — now listed
  in `describe().helpers` with its `@glissade/scene/grid` import and usage, so
  the no-build consumer discovers `window.glissade.Grid`. The `Stack`/`Row`/
  `Column` layout factories (`@glissade/scene/layout`) join it in the helpers
  section (they were already in `.nodes`, now also surfaced as the call-shaped
  factories an agent reaches for). The cross-package browser drift guard still
  passes (every `helpers[*].name` resolves to a real `window.glissade.<name>`).

Pure manifest data + a name-set addition — no render change. All 262 goldens
stay byte-identical; the committed `glissade.api.json` is regenerated.
