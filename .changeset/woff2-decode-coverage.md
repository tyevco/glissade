---
'@glissade/core': patch
---

woff2 decode coverage: decode unit test + golden + byte-stable sfnt assertion (DsW-aD_OUMoV item 1).

The font-ingest woff2/woff subpath was untested (no woff2 bytes existed in the repo) and latently broken: the decode branch read `parseCmap()` on the *compressed* woff2 bytes to build hb-subset's retain set — which is empty — so the decode dropped every glyph (a stripped cmap, 0 covered code points). It now decodes woff/woff2 → sfnt via `fontverter` (subset-font's own pure codec, dynamically imported on the font-ingest subpath only, never reaching the embed), reads real coverage from the decoded sfnt, and only then optionally instances axes via hb-subset.

Coverage:
- **decode unit test** (`packages/core/test/woff2Decode.test.ts`): a committed `Inconsolata-wght600.woff2` (OFL, a woff2 of the in-repo `Inconsolata-wght600.ttf`) ingested through `registerFont`/`ingestFont` → the covered code-point SET equals the round-trip-validated fixture (882 codepoints / 128 ranges) incl. spot-checks (U+0020/0041/0061/0030).
- **golden** (`golden-woff2`): a Text scene in the woff2-decoded face, rendered byte-exactly on Skia — proves the decode is byte-stable through the rasterizer.
- **byte-stable sfnt assertion**: decoding the same woff2 twice yields byte-identical sfnt bytes (sha256) — decode-once-at-ingest, never in evaluate.

The woff2 fixture is a TEST asset and the `fontverter` decoder stays on the dynamically-imported font-ingest subpath; the §4.4 leak-guard confirms neither reaches any embed bundle.
