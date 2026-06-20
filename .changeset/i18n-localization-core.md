---
'@glissade/core': minor
'@glissade/cli': minor
'@glissade/narrate': patch
---

Add the **0.14 localization core** — build-time + render-time i18n sugar that resolves a scene's strings against a per-locale message table, with NOTHING on the `evaluate()` path (the goldens stay byte-identical; the no-`--locale` render path is byte-identical to today).

New tree-shakeable sub-path `@glissade/core/i18n` (off the base index, like `@glissade/core/clips`), with three pure pieces:

- **`requireParity(...manifests: { locale, ids }[]): void`** — a pure cross-locale id-set diff (the cross-language analogue of `narration().require`); throws a `ParityError` naming every missing/extra id per locale.
- **`localize(doc, table, { locale }): TimelineDoc`** — a pure doc→doc resolver that substitutes string-track key values whose target node-id is a key in the table (captions / narration-derived text live in the doc as string tracks). Returns a NEW doc; non-matching tracks pass through byte-identical.
- **`t(id): string`** — build-time sugar resolving `id` against an ambient message table (`setMessageTable`/`getMessageTable`), for static Text-node text not animated by a track. Hard-fails on an unknown id (mirrors `require()`); with no table installed returns `id` verbatim (the base path).

`@glissade/cli`: `gs render --locale <code>` selects `messages.<code>.json` (relative to the scene module) and prefers the locale-tagged narration sibling `<base>.<code>.narration.timing.json` (the suffix is a single clearly-commented constant in `cli/src/locale.ts`), injecting the table into the ambient context `loadSceneModule` uses and running `localize` over the doc. No `--locale` resolves the BASE files → byte-identical to today.

`@glissade/narrate`: `narration().idManifest(locale)` returns `{ locale, ids }` (every addressable beat id) to feed `requireParity`.
