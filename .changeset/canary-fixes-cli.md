---
'@glissade/cli': patch
---

0.14 canary fixes (3, 4, 6) — localization + font-validation render-path correctness. No `evaluate()` change; the base (no-`--locale`, no-`--strict`) render path is byte-identical to today, all 262 goldens unchanged.

- **FIX 3 (BLOCKER) — `--locale` CJK glyph gap passes `--strict` then renders tofu.** `validateSceneFonts` validated the authored BASE `node.text()` (read BEFORE `localize()` binds the localized string tracks), so a Latin-only declared font + a localized CJK track PASSED `--strict` then rendered `.notdef` tofu. Render now also validates the POST-localize document's string-track values: new `collectLocalizedTextUsages(scene, doc)` (`@glissade/scene`) walks `doc.tracks` of type `'string'`, resolves the target Text node's `fontFamily`, and the values flow into `validateSceneFonts` via the new `ValidateSceneFontsOptions.extraUsages`. Base (no-locale) render is unaffected.

- **FIX 4 (HIGH) — `--locale xx` with a missing messages file silently renders base.** An absent `messages.<locale>.json` made `loadMessageTable` return undefined → `localize` skipped → a declared `--locale` with unresolvable assets wrote a BASE-language artifact at exit 0, no warning. Render now resolves BOTH `messages.<locale>.json` AND the `<base>.<locale>.narration.timing.json` sibling up front and throws a new `UnknownLocaleError` (naming both attempted paths) when NEITHER resolves. A narration-only locale (sibling present, no messages file) still works.

- **FIX 6 (HIGH) — `osFamilies` made `--strict` font validation host-dependent.** The font-exempt set was seeded from the full OS `GlobalFonts.families` catalog (3 families on clean Linux, hundreds on macOS), so an unregistered `'Helvetica Neue'` passed `--strict` on macOS but threw on Linux CI — the verdict depended on the host. The exempt set now seeds ONLY from the families glissade actually registered out of `doc.assets` (new pure `buildFontExemptSet`). True-OS-font exemption is gated behind a new `--allow-system-fonts` flag (off by default) AND ignored under `--strict`, so `--strict` is host-independent. A glissade-registered (doc.assets) family still doesn't false-warn.
