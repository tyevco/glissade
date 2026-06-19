---
"@glissade/core": minor
"@glissade/cli": minor
---

feat(fonts): font ingestion front door — registerFont/font()/static instancing (§3.6)

The 0.12 font front door: `registerFont`, the fluent `font()` builder,
`ingestFont`, `sniffFontFormat`, `buildFontPlan`, and a `FontStore`, all on the
new `@glissade/core/font-ingest` sub-path entry. It turns a variable font into
an ordinary static face once, at ingest/prepare time — never inside
`evaluate()` — so variable-font support collapses to the already-solved
static-parity case.

- `@glissade/core/font-ingest`: magic-byte **sniffing** (ttf / otf / ttc →
  straight to Skia; woff / woff2 → decoded in-process to a plain sfnt),
  **STATIC variable-axis instancing** (a fixed axis tuple, e.g. `{ wght: 600 }`,
  → ONE content-hashed static sfnt; an axis RANGE / live per-frame instancing is
  intentionally deferred), eager `parseCmap` so `registerFont(...)` returns
  coverage + a build-time `covers(text)` / `missing(text)` predicate, and the
  pure `font('Inter').src(...).variable().axis('wght', 600).build()` builder.
  Determinism: the same source + axis tuple yields byte-identical sfnt bytes and
  hash run-to-run, so no new field flows through `FontSpec`/`DisplayList`.
- `@glissade/cli`: `gs fonts audit <scene>` — the font front-door report
  (per family: declared faces, sniffed format, cmap coverage, and missing-glyph
  RUNS for the text the scene actually renders — the "héllo 👋 renders emoji in
  Chrome, tofu in Skia" bug). The render path registers an instanced face like
  any other static ttf (`GlobalFonts.registerFromPath` for plain ttf/otf,
  preserving existing goldens byte-for-byte; `register(Buffer)` only for a
  decoded woff2).

The single heavy dependency, `subset-font` (harfbuzz `hb-subset` + a wasm woff2
decoder), is an `optionalDependencies` entry reached ONLY via a dynamic
`import()`, so it tree-shakes completely out of every embed bundle — a §4.4
leak-guard in `scripts/check-size.mjs` fails the build if `subset-font` /
harfbuzz / wawoff2 / fontIngest reach the embed graph (core/index, scene,
canvas2d, player, element).

Gates met: a new `font-instanced` Skia golden (the wght:600 instance of
Inconsolata-Variable) is per-path byte-exact and joins the browser↔Skia SSIM
parity suite at the shared 0.97 floor; all pre-existing goldens stay
byte-identical (additive); the leak-guard passes (the deps tree-shake out).
