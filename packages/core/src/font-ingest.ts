// @glissade/core/font-ingest — the font INGESTION front door (DESIGN.md §3.6):
// registerFont + the font() builder + magic-byte sniff + woff2 decode + static
// variable-axis instancing + content hashing. EXPORT/prepare-path ONLY: this
// entry dynamic-imports `subset-font` (harfbuzz hb-subset + woff2 wasm), which
// must NEVER reach the runtime document or the browser embed (the §4.4
// leak-guard in scripts/check-size.mjs asserts it tree-shakes out of core/index).

export {
  ingestFont,
  registerFont,
  font,
  buildFontPlan,
  sniffFontFormat,
  FontStore,
  FontIngestError,
  type FontFormat,
  type FontSource,
  type AxisTuple,
  type RegisterFontInit,
  type FontFaceResult,
  type IngestedFace,
  type FontBuilder,
  type FontPlan,
  type FontSrcEntry,
} from './fontIngest.js';
