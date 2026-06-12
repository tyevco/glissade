# Evaluation: chenglou/pretext for the line-breaking layer

**Status:** Decided — **adopt later, behind explicit triggers** (do not adopt now).
**Tarot card:** `pTjcjzs3IdgV` ("Evaluate pretext for the line-breaking layer", board Glissade `z5kOPdkNByxw`).
**Date:** 2026-06-12. Evaluated against `@chenglou/pretext` 0.0.7 (npm, 2026-05-10) / repo HEAD `796b469` (pushed 2026-05-23).

All factual claims below were adversarially re-verified against primary sources (npm registry, GitHub API, a fresh clone, and a runtime experiment under Node 22). **No claim was refuted.** Two citation-level corrections surfaced during verification are noted inline where they matter.

---

## 1. Recommendation

**Adopt later, with trigger conditions — not now, not never.**

Defense, in order of weight:

1. **No present need.** A repo-wide pressure audit (scenes, docs, DESIGN.md, git history, tarot backlog) found zero demand for RTL/bidi, hyphenation, or vertical text, and only *mild emergent* pressure for rich text — showcase scenes fake multi-style labels with sibling Text nodes, but every fake is a short non-wrapping label already solvable with the existing Yoga `Layout` row plus `flowOffset` baseline anchoring (commit `10c35c2`). Nothing in the corpus wants inline style changes inside a *wrapped* paragraph, which is the first gap where pretext's machinery would actually pay for itself.

2. **The good ideas were already taken, cheaply.** Commit `66f712b` adopted pretext's two highest-value ideas into our ~100-line breaker: `Intl.Segmenter` word-granularity boundaries (with a whitespace-regex fallback pretext itself does not have) and no-break-before-punctuation gluing. The marginal value of full adoption today is the line-range/cursor API surface and bidi *metadata* — neither of which any scene consumes.

3. **Adoption has real, recurring costs.** Pretext is pre-1.0 (0.0.x, 8 releases in ~10 weeks, API surface still moving — 0.0.5 added the entire line-range + rich-inline surface), so we would chase upstream churn. Any change in break decisions forces re-blessing the byte-exact golden suite (66f712b already had to re-bless frames 90/120 of `golden-typography` and verify them visually). And `@glissade/scene` carries a 12 kB budget; pretext's `src/` is ~4,700 lines across six modules.

4. **The disqualifier in the card body is softer than recorded, but still a cost.** The card says "pretext is browser-only today." The Node experiment (§3) shows it *runs* under Node 22 + `@napi-rs/canvas` with a 3-line `OffscreenCanvas` shim. So Node compatibility is no longer a hard blocker — but pretext has **no measurer-injection API** (the measuring context is module-private), which violates our seam's load-bearing rule that the breaker must measure with the *injected* rasterizer that will draw. We'd be wiring our determinism contract through a global shim into a library whose accuracy is explicitly calibrated against browser font engines, with upstream calling server-side support "soon"/"eventually" and an open TODO question — aspirational, not shipped. Adopting now means owning an unsupported configuration of a fast-moving 0.0.x library to gain capabilities nobody needs yet.

**Why not "never":** the license (MIT, verified three ways), zero runtime dependencies, the proven Node shim, and the genuinely hard problems pretext solves (mixed-direction bidi paragraph metadata, rich inline flow with per-item fonts, cursor-based variable-width line iteration) make it the obvious source — for porting or depending on — *when* a trigger fires. Reimplementing bidi paragraph handling ourselves would be malpractice.

---

## 2. What pretext offers vs. what we have

### What we have (`packages/scene/src/text.ts`)

The seam is five public exports from `@glissade/scene` (re-exported at `packages/scene/src/index.ts:50-56` — note: the earlier seam report cited lines 43-47, which verification corrected; those lines are the `raster2d` export block):

- `breakLines(text, font, maxWidth | undefined, measurer): string[]` — greedy, single-`FontSpec`, pure. Explicit `\n` always breaks; `maxWidth` undefined/≤0 returns paragraphs unwrapped; over-wide segments get their own line (no intra-word breaking in v1); lines are `trimEnd()`-ed and never start with whitespace or punctuation; CJK wraps without spaces and rejoins losslessly.
- `quantize(v) = Math.round(v * 2) / 2` — the §3.6 0.5 px measurement quantum, applied at call sites so sub-pixel cross-version drift can't flip a break or move a Yoga layout.
- `estimatingMeasurer` — deterministic canvas-free fallback (`width = len × size × 0.52`).
- `type TextMeasurer` / `type TextMetricsLite` — the injection interface; backends *are* measurers (`SkiaBackend`, `Canvas2DBackend` both implement `measureText`).

Consumers: `Text.draw()` (one `fillText` op per non-empty broken line; shaping delegated to the backend), `Text.intrinsicSize()` (feeds Yoga), `Text.flowOffset()` (first-line-ascent baseline anchoring). Already adopted from pretext (66f712b): `Intl.Segmenter` word boundaries with regex fallback, punctuation gluing.

### What pretext adds (verified against 0.0.7 / HEAD `796b469`)

| Capability | Pretext | Ours |
|---|---|---|
| Line breaking | Streaming engine, per-browser engine profiles, Chrome/Firefox/Safari accuracy-sweep oracles | Greedy, good enough for author-controlled content |
| Cursor/range APIs | `layoutNextLineRange` / `materializeLineRange` / `walkLineRanges` — non-materializing, per-line **variable width** (text around floats), kinetic-typography-ready | `string[]` only |
| Rich inline flow | `@chenglou/pretext/rich-inline`: per-item fonts, atomic chips, `gapBefore`, letter-spacing | One `FontSpec` per Text node |
| Bidi | **Metadata only** — per-segment embedding levels (`segLevels`) forked from pdf.js, for custom rendering; *the line breaker does not consume them*; visual reordering is the caller's job | None (canvas `fillText` does intra-line reordering; no `direction` prop, no mixed-direction wrapped paragraphs) |
| Hyphenation | None automatic (pre-inserted soft hyphens honored) — **pretext does not buy dictionary hyphenation** | None (soft-hyphen support would be a small extension either way) |
| Vertical text | Not supported (horizontal-only `prepare()`) | Not expressible in canvas-delegated shaping; needs the reserved glyph-run/harfbuzzjs path. **Neither option helps.** |
| `white-space`/`word-break`/`letter-spacing` | `normal`/`pre-wrap`, `normal`/`keep-all`, numeric px letter-spacing | None of these |
| Vertical metrics | None — `lineHeight` is a pure multiplier | We carry real ascent/descent (`TextMetricsLite`) from the backend; pretext would *lose* our baseline anchoring data unless we keep our measurer alongside |

Project health: MIT (LICENSE file + GitHub API + package.json all verified), ~48.4k stars, zero runtime npm dependencies, ESM-only, active but very young (created 2026-03-07).

---

## 3. Node/determinism compatibility verdict

**Verdict: works under Node 22 + `@napi-rs/canvas`, with caveats that matter for our determinism contract.**

Experiment (script preserved at `/tmp/pretext-experiment/run.mjs` at evaluation time): the only intervention needed was a 3-line shim — `globalThis.OffscreenCanvas = function (w, h) { return createCanvas(w, h) }` — because `getMeasureContext()` (`src/measurement.ts:36-50`) tries `OffscreenCanvas`, then `document.createElement('canvas')`, then **throws** (verified throw under bare Node). Pretext only uses `ctx.font` and `ctx.measureText().width`, both of which `@napi-rs/canvas` provides. With the shim: `prepare`/`layout`, `layoutWithLines`, `measureNaturalWidth` (0.07 px segment-sum vs whole-string kerning delta), mixed Arabic/CJK/emoji wrapping, `pre-wrap`, `letterSpacing`, and Korean `keep-all` all ran correctly, and **every produced line independently re-measured under the 320 px max width** — break decisions self-consistent with the injected measurer.

Determinism analysis against DESIGN.md §3.6/§5.5 (one framing correction, confirmed by verification: the design does **not** require byte-exactness *across* browser and Skia — the guarantee is per-path byte-exactness on a pinned toolchain; browser↔Skia is SSIM-only, and text-bearing frames are exactly where cross-seam byte comparison is declared impossible):

- **Compatible in principle:** pretext's layout core is pure arithmetic over cached widths; per-path determinism on a pinned toolchain should hold. `Intl.Segmenter` is a hard requirement with no fallback (verified: no feature detection anywhere in `src/`), but Node 22 ships it with full ICU, and §5.5 already scopes segmentation to per-engine determinism.
- **Friction points:**
  - **No measurer injection.** The measuring context is module-private with no setter (verified against the full export list of `measurement.ts`). Our rule #1 — break with the measurer that will draw — would be enforced only by a global shim, and it couldn't honor per-scene measurer swapping (`Scene.setTextMeasurer`) without cache-clearing gymnastics (`clearCache()` exists, but that's observable global state our purity tests forbid inside `breakLines`).
  - **Engine profiles.** `navigator` exists in Node 22, so pretext classifies it as "unknown engine" (`lineFitEpsilon: 0.005`, generic break policies) — meaning the CLI path and the browser path would use *different break-policy tuning*, the exact class of drift our 0.5 px quantization exists to suppress. Pretext does no quantization of its own.
  - **Emoji correction silently no-ops** without `document` (correction = 0); emoji widths in headless rendering differ from browser unless the same emoji font is registered via `GlobalFonts.registerFromPath`. (Only DOM use beyond canvas, verified.)
  - **Unsupported configuration.** Upstream's server-side story is explicitly future work ("soon", "(eventually)", open TODO question); a HarfBuzz server-probe backend was tried and removed as "not the runtime direction for Pretext". Accuracy is calibrated against browser font engines; the napi-rs/FreeType backend has unvalidated accuracy upstream.

Net: the card's recorded blocker ("browser-only") should be downgraded to "runs headless via shim, but unsupported upstream and structurally at odds with our injected-measurer seam."

---

## 4. Trigger conditions and integration plan (deferred path)

### Triggers — re-evaluate (reopen card `pTjcjzs3IdgV`) when ANY of:

1. **Mixed-direction bidi wrapped paragraphs** are needed by a real scene or user. This is the genuine "pressure arrives" event: bidi paragraph segmentation is not worth reimplementing. (Single-direction RTL is *not* a trigger — that's a tiny `direction` prop + align-edge flip on our side; `fillText` already shapes intra-line.)
2. **Inline styled spans inside a wrapped paragraph** are needed *and* the day-scale extension of our breaker to a run list (per-run `FontSpec`, summed advances, one `fillText` per run per line) proves insufficient. Try the extension first.
3. **Pretext ships supported server-side/Node measurement** (the open TODO resolves in favor of an explicit backend, ideally with measurer injection or a documented `OffscreenCanvas` contract) **and** reaches a stabler API (≥0.1.x with a changelog-honored surface).
4. **Kinetic typography** (per-word/per-line reveal) becomes a showcase genre and our incremental segment-offset exposure isn't enough.

### Non-triggers (explicitly)

- **Hyphenation** — pretext doesn't provide dictionary hyphenation either; soft-hyphen honoring + character-granularity fallback via our existing `Intl.Segmenter` is the cheap path when asked.
- **Vertical text** — needs the reserved harfbuzzjs glyph-run path; neither option helps.
- **Text re-wrap at flex-resolved width** (card `5JD881O0jSsA`) — the nearest-term real text item, but it's a Yoga measure-func integration; pretext doesn't address it. If text work is wanted sooner, do that instead.

### Integration plan, if a trigger fires

Adopt **behind the existing seam**, never as a replacement of it:

1. Keep the five public exports (`breakLines`, `quantize`, `estimatingMeasurer`, `TextMeasurer`, `TextMetricsLite`) byte-compatible; pretext becomes an internal engine behind `breakLines` (and a new run-list entry point), not a new public surface. `scene` must still not import a backend (DESIGN.md §7.1 acyclicity).
2. **Prefer porting over depending** (MIT permits it): vendor the line-break engine and/or `src/bidi.ts` + generated tables, replacing `getMeasureContext()` with our injected `TextMeasurer` and quantizing every layout-feeding width to the 0.5 px grid. This resolves the no-injection problem, the global-shim purity problem, the engine-profile divergence, and the 12 kB budget question (vendor only what the trigger needs — bidi alone is ~175 lines + data table).
3. If depending instead: pin the exact version, force a single engine profile (don't let UA sniffing diverge browser vs CLI), wrap `clearCache()`/`setLocale()` so no observable global state leaks into the pure-function contract, and register identical font files (including an emoji font) on both paths.
4. The API shape worth copying regardless: the `layoutNextLineRange` cursor + `materializeLineRange` split (`LayoutCursor` is segment/grapheme-indexed, not string-offset) — right shape for variable-width flow and kinetic ranges.
5. **Budget a golden re-bless**: any break-decision change re-blesses `golden-typography` (frames 0–179 sweep, animated wrap width 330→180→330) with mandatory visual verification, plus the purity invariants (random-order re-evaluation byte-equality). Typography is *not* in the cross-seam SSIM corpus today; if adoption is bidi-motivated, add an RTL scene to both the golden and SSIM suites.

---

## 5. Open uncertainties (explicitly marked)

- **Accuracy of pretext on the FreeType/napi-rs backend is unvalidated upstream.** The Node experiment proved self-consistency (lines fit the width they were broken for), not browser parity. Unknown whether the "unknown engine" profile's break policies produce visually worse breaks on our corpus. *Would need our own accuracy sweep before adoption.*
- **API stability.** 0.0.x with surface-level additions per release (0.0.5 added the whole line-range + rich-inline API). Unknown when/whether it stabilizes; the upstream TODO leaves server-backend support and bidi-rendering scope (selection/copy-paste) explicitly open.
- **Vertical metrics mismatch.** Pretext has no ascent/descent model (`lineHeight` is a pure multiplier); our `flowOffset` baseline anchoring needs real first-line ascent. The integration assumes we keep our `TextMeasurer` for metrics while using pretext only for break decisions — *unproven that the two measurement paths stay consistent* (same canvas, so probably, but untested).
- **Pressure forecast is a snapshot.** The "no pressure" audit reflects today's corpus; this repo has a track record of text friction converting into carded work (`sJW190gB214A`). The rich-text trigger may fire sooner than the others.
- **Refuted claims: none.** All twelve adversarially-checked claims across the four investigation reports were confirmed against primary sources. Two minor citation corrections were absorbed above: the seam re-export lives at `index.ts:50-56` (not 43-47), and a couple of pretext line-range citations were off by a few lines (`getEmojiCorrection` 134-162, `getEngineProfile` 74-112). Neither affects any conclusion.
