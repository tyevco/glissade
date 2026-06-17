---
'@glissade/core': minor
'@glissade/scene': minor
'@glissade/cli': patch
'@glissade/export-web': patch
'@glissade/player': patch
---

feat(fonts): FontRegistry + strict-mode font validation + cmap glyph coverage (§3.6)

Explicit fonts grow up. `AssetRef` gains optional `faces` (weight/style variants)
and `fallback` (the family chain) — purely additive: a bare `{ kind: 'font', url }`
stays the single 400/normal face with a `[family]` chain, so every existing
document renders byte-identically.

New in `@glissade/core` (DEV/export-path only, never in `evaluate()`, tree-shaken
from real embeds):

- `buildFontRegistry(assets)` → `FontRegistry` with `has`, `faces()`,
  `resolveFace(family, weight, style)` (CSS nearest-weight), and
  `fallbackChain(family)`.
- `parseCmap(bytes)` — a pure, zero-dep sfnt `cmap` reader (formats 4 + 12)
  returning the covered code points; malformed input yields an empty set.
- `validateFonts(usages, registry, cmaps, mode)` + `FontValidationError` —
  reports unregistered non-generic families and uncovered glyphs (the
  "héllo 👋 renders emoji in Chrome, tofu in Skia" bug). Generic and
  caller-supplied OS families are exempt, so a default-font Text never errors.

New in `@glissade/scene`: `collectTextUsages(scene)`, `validateSceneFonts(scene,
doc, loadBytes, opts)` (node-walk + caller I/O → core validation), and
`TextProps.fontStyle: 'normal' | 'italic'` threaded into `FontSpec` (omitted when
normal, so goldens are unchanged).

Strict-vs-dev is a per-render/per-export OPTION (default dev-warn), never a
Timeline flag: `exportVideo({ strictFonts })`, `gs render --strict`, and a
`mount({ strictFonts })` option. All three loaders now register EVERY declared
face (not one-per-asset): export-web awaits each face before frame 0, the CLI
registers each path via `GlobalFonts`, the player loads non-awaited.
