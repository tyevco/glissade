# @glissade/cli

## 0.17.0

### Patch Changes

- @glissade/backend-skia@0.17.0
- @glissade/core@0.17.0
- @glissade/interact@0.17.0
- @glissade/lottie@0.17.0
- @glissade/narrate@0.17.0
- @glissade/player@0.17.0
- @glissade/scene@0.17.0
- @glissade/sfx@0.17.0
- @glissade/svg@0.17.0

## 0.17.0-pre.0

### Patch Changes

- @glissade/backend-skia@0.17.0-pre.0
- @glissade/core@0.17.0-pre.0
- @glissade/interact@0.17.0-pre.0
- @glissade/lottie@0.17.0-pre.0
- @glissade/narrate@0.17.0-pre.0
- @glissade/player@0.17.0-pre.0
- @glissade/scene@0.17.0-pre.0
- @glissade/sfx@0.17.0-pre.0
- @glissade/svg@0.17.0-pre.0

## 0.16.0

### Patch Changes

- Updated dependencies [577f485]
- Updated dependencies [6ce395e]
  - @glissade/narrate@0.16.0
  - @glissade/backend-skia@0.16.0
  - @glissade/core@0.16.0
  - @glissade/interact@0.16.0
  - @glissade/lottie@0.16.0
  - @glissade/player@0.16.0
  - @glissade/scene@0.16.0
  - @glissade/sfx@0.16.0
  - @glissade/svg@0.16.0

## 0.16.0-pre.1

### Patch Changes

- Updated dependencies [577f485]
  - @glissade/narrate@0.16.0-pre.1
  - @glissade/backend-skia@0.16.0-pre.1
  - @glissade/core@0.16.0-pre.1
  - @glissade/interact@0.16.0-pre.1
  - @glissade/lottie@0.16.0-pre.1
  - @glissade/player@0.16.0-pre.1
  - @glissade/scene@0.16.0-pre.1
  - @glissade/sfx@0.16.0-pre.1
  - @glissade/svg@0.16.0-pre.1

## 0.16.0-pre.0

### Patch Changes

- Updated dependencies [6ce395e]
  - @glissade/narrate@0.16.0-pre.0
  - @glissade/backend-skia@0.16.0-pre.0
  - @glissade/core@0.16.0-pre.0
  - @glissade/interact@0.16.0-pre.0
  - @glissade/lottie@0.16.0-pre.0
  - @glissade/player@0.16.0-pre.0
  - @glissade/scene@0.16.0-pre.0
  - @glissade/sfx@0.16.0-pre.0
  - @glissade/svg@0.16.0-pre.0

## 0.15.0

### Minor Changes

- a7189dd: Add `gs render <scene> --locales <a,b,c>` (0.15) — render a scene ONCE PER comma-separated locale in a single invocation, over the existing 0.14 `--locale <code>` path. Pure CLI orchestration: each per-locale render IS the 0.14 single-`--locale` render (the locale's `messages.<code>.json` ambient table + the preferred `<base>.<code>.narration.timing.json` sibling, then `render()` runs `localize()`), so `--locales en,zh` ≡ `--locale en` then `--locale zh` with distinct outputs. No render-path change — the 252 goldens stay byte-identical.

  Per-locale output convention: a video/png `--out` gets a locale segment before the extension (`out/episode.mp4` → `out/episode.<locale>.mp4`); a directory `--out` (the PNG-sequence default) gets a per-locale subdir (`out/` → `out/<locale>/`). `--format png-seq` forces the directory convention even for a video-looking name.

  `--locale` and `--locales` are mutually exclusive (passing both is a hard error). A locale in the list with NO resolvable assets (neither a message table nor a narration sibling) throws the 0.14 `UnknownLocaleError` naming the bad locale, aborting the whole fan-out loudly — never silently skipped. The fan-out loop is sequential and the per-locale ambient i18n table can't leak between iterations (`loadSceneModule` re-installs the table at the top of every render). New programmatic exports: `renderLocales`, `parseLocalesList`, `localeOutPath`, `LocaleArgsError`.

### Patch Changes

- 53030d0: 0.15 i18n-hardening 5-pack — residual localization robustness gaps, all OFF the `evaluate()` path (252 goldens byte-identical; the no-locale base path unchanged). Each fix has a violating-input regression test.

  FIX 1 (multi-cue collapse → hard-throw): `localize()` broadcasts `table[id]` to every key of a matched string track. For a multi-cue caption (a string track with >1 DISTINCT keyed value) that froze one caption over the whole video. `localize` now HARD-THROWS a `LocalizationError` naming the id and directing to per-locale narration regen; a single-value / single-key string track still localizes by broadcast.

  FIX 2 (flat-table key collision → throw-on-ambiguity): a key matching BOTH a node-id-with-a-string-track AND a free-standing `t()` id (`opts.consumedIds`) silently rewrote the node's track. `localize` now throws a clear `LocalizationError` on any such collision. PURE ADDITIVE GUARD — the flat `messages.<locale>.json` shape (`MessageTable = Record<string, string>`) is UNCHANGED; no sectioned `{tracks,messages}` format introduced.

  FIX 3 (ambient `t()` race across concurrent renders): the process-global ambient table/consumed-id set was shared across concurrent programmatic `render()`/`loadSceneModule` flows for different locales → wrong-language static `Text`. Added `runWithMessageTable(table, fn)` — an `AsyncLocalStorage`-scoped ambient table that isolates each async flow (lazily loaded `node:async_hooks`, off the embed; `core/i18n` stays 1.5 kB gz). `setMessageTable`/`getMessageTable`/`getConsumedMessageIds`/`t()` now read the active scope (ALS if present, else the process-global). Added `preservingMessageTable(fn)` (snapshot/restore the global ambient table), wired around the no-locale audio-mix helpers in the CLI (`collectMixAudioInputs`/`buildMixWav`) so they don't clobber or leak a concurrent locale's table. The CLI one-shot is unaffected.

  FIX 4 (`requireParity` within-manifest duplicate ids): the Set-based union/diff swallowed `{en:['a','a','b']}`. `requireParity` now runs a per-manifest duplicate check (`new Set(m.ids).size !== m.ids.length`) FIRST — naming the locale + dup id and throwing a `ParityError` — even for a single (or zero) manifest, before the cross-manifest diff.

  FIX 5 (`osFamilies` brand-warn gap): `buildFontExemptSet` folded the OS catalog into the exempt set; a registered/declared brand family whose name collides with an OS family could be waved through as "OS-only". The OS-catalog fold now SKIPS any name that collides with a registered family, so a declared brand font stays subject to glyph-coverage validation (a missing glyph still warns / throws under `--strict`). The exemption is for genuinely-OS-only families.

- ec57f23: 0.15 canary fix (FIX 2): support per-locale publish loudness so a localized render isn't a loudness dead-end.

  A localized render (`gs render --locale zh`) mixes the per-locale narration (the zh wavs) → a different `mixHash` than the base mix, but `gs measure-loudness` was locale-unaware: the committed `*.loudness.json` measured the BASE narration, so `resolveLoudnessGainDb` hard-threw `stale mixHash` for ANY localized video with committed loudness, with no supported way to commit a per-locale measurement.

  `loudnessPathFor(modulePath, locale?)` now emits `<stem>.<locale>.loudness.json` when a locale is set (the base `<stem>.loudness.json` is unchanged for no-locale). `gs measure-loudness --locale <code>` measures the per-locale mix (threaded through `buildMixWav` / `collectMixAudioInputs`) and commits the per-locale file. `resolveLoudnessGainDb` reads the per-locale measurement first when rendering with a locale, and when it is MISSING throws an ACTIONABLE per-locale error (`no <stem>.<locale>.loudness.json — run gs measure-loudness <scene> --locale <locale>`) instead of the generic stale message. `renderLocales` names the failing locale on a per-locale dead-end (still fails loudly, never swallowed). The no-locale loudness path and all goldens are byte-identical.

- Updated dependencies [c87e88b]
- Updated dependencies [53030d0]
- Updated dependencies [ec57f23]
- Updated dependencies [b21fa79]
  - @glissade/core@0.15.0
  - @glissade/scene@0.15.0
  - @glissade/narrate@0.15.0
  - @glissade/backend-skia@0.15.0
  - @glissade/interact@0.15.0
  - @glissade/lottie@0.15.0
  - @glissade/player@0.15.0
  - @glissade/sfx@0.15.0
  - @glissade/svg@0.15.0

## 0.15.0-pre.1

### Patch Changes

- ec57f23: 0.15 canary fix (FIX 2): support per-locale publish loudness so a localized render isn't a loudness dead-end.

  A localized render (`gs render --locale zh`) mixes the per-locale narration (the zh wavs) → a different `mixHash` than the base mix, but `gs measure-loudness` was locale-unaware: the committed `*.loudness.json` measured the BASE narration, so `resolveLoudnessGainDb` hard-threw `stale mixHash` for ANY localized video with committed loudness, with no supported way to commit a per-locale measurement.

  `loudnessPathFor(modulePath, locale?)` now emits `<stem>.<locale>.loudness.json` when a locale is set (the base `<stem>.loudness.json` is unchanged for no-locale). `gs measure-loudness --locale <code>` measures the per-locale mix (threaded through `buildMixWav` / `collectMixAudioInputs`) and commits the per-locale file. `resolveLoudnessGainDb` reads the per-locale measurement first when rendering with a locale, and when it is MISSING throws an ACTIONABLE per-locale error (`no <stem>.<locale>.loudness.json — run gs measure-loudness <scene> --locale <locale>`) instead of the generic stale message. `renderLocales` names the failing locale on a per-locale dead-end (still fails loudly, never swallowed). The no-locale loudness path and all goldens are byte-identical.

- Updated dependencies [ec57f23]
  - @glissade/narrate@0.15.0-pre.1
  - @glissade/backend-skia@0.15.0-pre.1
  - @glissade/core@0.15.0-pre.1
  - @glissade/interact@0.15.0-pre.1
  - @glissade/lottie@0.15.0-pre.1
  - @glissade/player@0.15.0-pre.1
  - @glissade/scene@0.15.0-pre.1
  - @glissade/sfx@0.15.0-pre.1
  - @glissade/svg@0.15.0-pre.1

## 0.15.0-pre.0

### Minor Changes

- a7189dd: Add `gs render <scene> --locales <a,b,c>` (0.15) — render a scene ONCE PER comma-separated locale in a single invocation, over the existing 0.14 `--locale <code>` path. Pure CLI orchestration: each per-locale render IS the 0.14 single-`--locale` render (the locale's `messages.<code>.json` ambient table + the preferred `<base>.<code>.narration.timing.json` sibling, then `render()` runs `localize()`), so `--locales en,zh` ≡ `--locale en` then `--locale zh` with distinct outputs. No render-path change — the 252 goldens stay byte-identical.

  Per-locale output convention: a video/png `--out` gets a locale segment before the extension (`out/episode.mp4` → `out/episode.<locale>.mp4`); a directory `--out` (the PNG-sequence default) gets a per-locale subdir (`out/` → `out/<locale>/`). `--format png-seq` forces the directory convention even for a video-looking name.

  `--locale` and `--locales` are mutually exclusive (passing both is a hard error). A locale in the list with NO resolvable assets (neither a message table nor a narration sibling) throws the 0.14 `UnknownLocaleError` naming the bad locale, aborting the whole fan-out loudly — never silently skipped. The fan-out loop is sequential and the per-locale ambient i18n table can't leak between iterations (`loadSceneModule` re-installs the table at the top of every render). New programmatic exports: `renderLocales`, `parseLocalesList`, `localeOutPath`, `LocaleArgsError`.

### Patch Changes

- 53030d0: 0.15 i18n-hardening 5-pack — residual localization robustness gaps, all OFF the `evaluate()` path (252 goldens byte-identical; the no-locale base path unchanged). Each fix has a violating-input regression test.

  FIX 1 (multi-cue collapse → hard-throw): `localize()` broadcasts `table[id]` to every key of a matched string track. For a multi-cue caption (a string track with >1 DISTINCT keyed value) that froze one caption over the whole video. `localize` now HARD-THROWS a `LocalizationError` naming the id and directing to per-locale narration regen; a single-value / single-key string track still localizes by broadcast.

  FIX 2 (flat-table key collision → throw-on-ambiguity): a key matching BOTH a node-id-with-a-string-track AND a free-standing `t()` id (`opts.consumedIds`) silently rewrote the node's track. `localize` now throws a clear `LocalizationError` on any such collision. PURE ADDITIVE GUARD — the flat `messages.<locale>.json` shape (`MessageTable = Record<string, string>`) is UNCHANGED; no sectioned `{tracks,messages}` format introduced.

  FIX 3 (ambient `t()` race across concurrent renders): the process-global ambient table/consumed-id set was shared across concurrent programmatic `render()`/`loadSceneModule` flows for different locales → wrong-language static `Text`. Added `runWithMessageTable(table, fn)` — an `AsyncLocalStorage`-scoped ambient table that isolates each async flow (lazily loaded `node:async_hooks`, off the embed; `core/i18n` stays 1.5 kB gz). `setMessageTable`/`getMessageTable`/`getConsumedMessageIds`/`t()` now read the active scope (ALS if present, else the process-global). Added `preservingMessageTable(fn)` (snapshot/restore the global ambient table), wired around the no-locale audio-mix helpers in the CLI (`collectMixAudioInputs`/`buildMixWav`) so they don't clobber or leak a concurrent locale's table. The CLI one-shot is unaffected.

  FIX 4 (`requireParity` within-manifest duplicate ids): the Set-based union/diff swallowed `{en:['a','a','b']}`. `requireParity` now runs a per-manifest duplicate check (`new Set(m.ids).size !== m.ids.length`) FIRST — naming the locale + dup id and throwing a `ParityError` — even for a single (or zero) manifest, before the cross-manifest diff.

  FIX 5 (`osFamilies` brand-warn gap): `buildFontExemptSet` folded the OS catalog into the exempt set; a registered/declared brand family whose name collides with an OS family could be waved through as "OS-only". The OS-catalog fold now SKIPS any name that collides with a registered family, so a declared brand font stays subject to glyph-coverage validation (a missing glyph still warns / throws under `--strict`). The exemption is for genuinely-OS-only families.

- Updated dependencies [c87e88b]
- Updated dependencies [53030d0]
- Updated dependencies [b21fa79]
  - @glissade/core@0.15.0-pre.0
  - @glissade/scene@0.15.0-pre.0
  - @glissade/narrate@0.15.0-pre.0
  - @glissade/backend-skia@0.15.0-pre.0
  - @glissade/interact@0.15.0-pre.0
  - @glissade/lottie@0.15.0-pre.0
  - @glissade/player@0.15.0-pre.0
  - @glissade/sfx@0.15.0-pre.0
  - @glissade/svg@0.15.0-pre.0

## 0.14.0

### Minor Changes

- 1795d1c: Add the **0.14 localization core** — build-time + render-time i18n sugar that resolves a scene's strings against a per-locale message table, with NOTHING on the `evaluate()` path (the goldens stay byte-identical; the no-`--locale` render path is byte-identical to today).

  New tree-shakeable sub-path `@glissade/core/i18n` (off the base index, like `@glissade/core/clips`), with three pure pieces:

  - **`requireParity(...manifests: { locale, ids }[]): void`** — a pure cross-locale id-set diff (the cross-language analogue of `narration().require`); throws a `ParityError` naming every missing/extra id per locale.
  - **`localize(doc, table, { locale }): TimelineDoc`** — a pure doc→doc resolver that substitutes string-track key values whose target node-id is a key in the table (captions / narration-derived text live in the doc as string tracks). Returns a NEW doc; non-matching tracks pass through byte-identical.
  - **`t(id): string`** — build-time sugar resolving `id` against an ambient message table (`setMessageTable`/`getMessageTable`), for static Text-node text not animated by a track. Hard-fails on an unknown id (mirrors `require()`); with no table installed returns `id` verbatim (the base path).

  `@glissade/cli`: `gs render --locale <code>` selects `messages.<code>.json` (relative to the scene module) and prefers the locale-tagged narration sibling `<base>.<code>.narration.timing.json` (the suffix is a single clearly-commented constant in `cli/src/locale.ts`), injecting the table into the ambient context `loadSceneModule` uses and running `localize` over the doc. No `--locale` resolves the BASE files → byte-identical to today.

  `@glissade/narrate`: `narration().idManifest(locale)` returns `{ locale, ids }` (every addressable beat id) to feed `requireParity`.

### Patch Changes

- f13486d: 0.14 canary fixes (3, 4, 6) — localization + font-validation render-path correctness. No `evaluate()` change; the base (no-`--locale`, no-`--strict`) render path is byte-identical to today, all 262 goldens unchanged.

  - **FIX 3 (BLOCKER) — `--locale` CJK glyph gap passes `--strict` then renders tofu.** `validateSceneFonts` validated the authored BASE `node.text()` (read BEFORE `localize()` binds the localized string tracks), so a Latin-only declared font + a localized CJK track PASSED `--strict` then rendered `.notdef` tofu. Render now also validates the POST-localize document's string-track values: new `collectLocalizedTextUsages(scene, doc)` (`@glissade/scene`) walks `doc.tracks` of type `'string'`, resolves the target Text node's `fontFamily`, and the values flow into `validateSceneFonts` via the new `ValidateSceneFontsOptions.extraUsages`. Base (no-locale) render is unaffected.

  - **FIX 4 (HIGH) — `--locale xx` with a missing messages file silently renders base.** An absent `messages.<locale>.json` made `loadMessageTable` return undefined → `localize` skipped → a declared `--locale` with unresolvable assets wrote a BASE-language artifact at exit 0, no warning. Render now resolves BOTH `messages.<locale>.json` AND the `<base>.<locale>.narration.timing.json` sibling up front and throws a new `UnknownLocaleError` (naming both attempted paths) when NEITHER resolves. A narration-only locale (sibling present, no messages file) still works.

  - **FIX 6 (HIGH) — `osFamilies` made `--strict` font validation host-dependent.** The font-exempt set was seeded from the full OS `GlobalFonts.families` catalog (3 families on clean Linux, hundreds on macOS), so an unregistered `'Helvetica Neue'` passed `--strict` on macOS but threw on Linux CI — the verdict depended on the host. The exempt set now seeds ONLY from the families glissade actually registered out of `doc.assets` (new pure `buildFontExemptSet`). True-OS-font exemption is gated behind a new `--allow-system-fonts` flag (off by default) AND ignored under `--strict`, so `--strict` is host-independent. A glissade-registered (doc.assets) family still doesn't false-warn.

- 3281514: 0.14 DX bundle — three render-surface paper-cuts:

  - **Clearer undeclared-asset error.** `gs render` now pre-validates every Image/Video `assetId` against `timeline.assets` before evaluation, throwing an `UnknownAssetError` that names the real mistake — an Image/Video needs an `assetId` + a `timeline.assets` entry `{ kind, url }`, not a `src` URL (§2.5: remote URLs are not fetched at render) — instead of the downstream `asset 'undefined' not ready` ColdAssetError. (Image/Video carry a new `static assetKind` marker so the walk stays robust; the validation lives in the CLI, off the embed path.)
  - **No false font-validation warning for GlobalFonts/system families.** `gs render` builds an `osFamilies` set from `GlobalFonts.families` and exempts those families from the §3.6 unregistered-family check, so a family registered via `GlobalFonts.registerFromPath` (or OS-installed) no longer warns as "unregistered". A genuinely-unregistered family still warns.
  - **`each()` jitter decorrelation.** The per-index motion-jitter RNG is now salted (`mix(mix(baseSeed, i), JITTER_SALT)`) so it decorrelates from `ctx.rng` (both previously derived from the same `mix(baseSeed, i)` stream). Determinism-neutral; no corpus golden uses each-jitter, so all golden frames stay byte-identical.

- Updated dependencies [f13486d]
- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7ea5371]
- Updated dependencies [7456761]
  - @glissade/core@0.14.0
  - @glissade/scene@0.14.0
  - @glissade/narrate@0.14.0
  - @glissade/backend-skia@0.14.0
  - @glissade/interact@0.14.0
  - @glissade/lottie@0.14.0
  - @glissade/player@0.14.0
  - @glissade/sfx@0.14.0
  - @glissade/svg@0.14.0

## 0.14.0-pre.1

### Patch Changes

- f13486d: 0.14 canary fixes (3, 4, 6) — localization + font-validation render-path correctness. No `evaluate()` change; the base (no-`--locale`, no-`--strict`) render path is byte-identical to today, all 262 goldens unchanged.

  - **FIX 3 (BLOCKER) — `--locale` CJK glyph gap passes `--strict` then renders tofu.** `validateSceneFonts` validated the authored BASE `node.text()` (read BEFORE `localize()` binds the localized string tracks), so a Latin-only declared font + a localized CJK track PASSED `--strict` then rendered `.notdef` tofu. Render now also validates the POST-localize document's string-track values: new `collectLocalizedTextUsages(scene, doc)` (`@glissade/scene`) walks `doc.tracks` of type `'string'`, resolves the target Text node's `fontFamily`, and the values flow into `validateSceneFonts` via the new `ValidateSceneFontsOptions.extraUsages`. Base (no-locale) render is unaffected.

  - **FIX 4 (HIGH) — `--locale xx` with a missing messages file silently renders base.** An absent `messages.<locale>.json` made `loadMessageTable` return undefined → `localize` skipped → a declared `--locale` with unresolvable assets wrote a BASE-language artifact at exit 0, no warning. Render now resolves BOTH `messages.<locale>.json` AND the `<base>.<locale>.narration.timing.json` sibling up front and throws a new `UnknownLocaleError` (naming both attempted paths) when NEITHER resolves. A narration-only locale (sibling present, no messages file) still works.

  - **FIX 6 (HIGH) — `osFamilies` made `--strict` font validation host-dependent.** The font-exempt set was seeded from the full OS `GlobalFonts.families` catalog (3 families on clean Linux, hundreds on macOS), so an unregistered `'Helvetica Neue'` passed `--strict` on macOS but threw on Linux CI — the verdict depended on the host. The exempt set now seeds ONLY from the families glissade actually registered out of `doc.assets` (new pure `buildFontExemptSet`). True-OS-font exemption is gated behind a new `--allow-system-fonts` flag (off by default) AND ignored under `--strict`, so `--strict` is host-independent. A glissade-registered (doc.assets) family still doesn't false-warn.

- Updated dependencies [f13486d]
  - @glissade/core@0.14.0-pre.1
  - @glissade/scene@0.14.0-pre.1
  - @glissade/backend-skia@0.14.0-pre.1
  - @glissade/interact@0.14.0-pre.1
  - @glissade/lottie@0.14.0-pre.1
  - @glissade/narrate@0.14.0-pre.1
  - @glissade/player@0.14.0-pre.1
  - @glissade/sfx@0.14.0-pre.1
  - @glissade/svg@0.14.0-pre.1

## 0.14.0-pre.0

### Minor Changes

- 1795d1c: Add the **0.14 localization core** — build-time + render-time i18n sugar that resolves a scene's strings against a per-locale message table, with NOTHING on the `evaluate()` path (the goldens stay byte-identical; the no-`--locale` render path is byte-identical to today).

  New tree-shakeable sub-path `@glissade/core/i18n` (off the base index, like `@glissade/core/clips`), with three pure pieces:

  - **`requireParity(...manifests: { locale, ids }[]): void`** — a pure cross-locale id-set diff (the cross-language analogue of `narration().require`); throws a `ParityError` naming every missing/extra id per locale.
  - **`localize(doc, table, { locale }): TimelineDoc`** — a pure doc→doc resolver that substitutes string-track key values whose target node-id is a key in the table (captions / narration-derived text live in the doc as string tracks). Returns a NEW doc; non-matching tracks pass through byte-identical.
  - **`t(id): string`** — build-time sugar resolving `id` against an ambient message table (`setMessageTable`/`getMessageTable`), for static Text-node text not animated by a track. Hard-fails on an unknown id (mirrors `require()`); with no table installed returns `id` verbatim (the base path).

  `@glissade/cli`: `gs render --locale <code>` selects `messages.<code>.json` (relative to the scene module) and prefers the locale-tagged narration sibling `<base>.<code>.narration.timing.json` (the suffix is a single clearly-commented constant in `cli/src/locale.ts`), injecting the table into the ambient context `loadSceneModule` uses and running `localize` over the doc. No `--locale` resolves the BASE files → byte-identical to today.

  `@glissade/narrate`: `narration().idManifest(locale)` returns `{ locale, ids }` (every addressable beat id) to feed `requireParity`.

### Patch Changes

- 3281514: 0.14 DX bundle — three render-surface paper-cuts:

  - **Clearer undeclared-asset error.** `gs render` now pre-validates every Image/Video `assetId` against `timeline.assets` before evaluation, throwing an `UnknownAssetError` that names the real mistake — an Image/Video needs an `assetId` + a `timeline.assets` entry `{ kind, url }`, not a `src` URL (§2.5: remote URLs are not fetched at render) — instead of the downstream `asset 'undefined' not ready` ColdAssetError. (Image/Video carry a new `static assetKind` marker so the walk stays robust; the validation lives in the CLI, off the embed path.)
  - **No false font-validation warning for GlobalFonts/system families.** `gs render` builds an `osFamilies` set from `GlobalFonts.families` and exempts those families from the §3.6 unregistered-family check, so a family registered via `GlobalFonts.registerFromPath` (or OS-installed) no longer warns as "unregistered". A genuinely-unregistered family still warns.
  - **`each()` jitter decorrelation.** The per-index motion-jitter RNG is now salted (`mix(mix(baseSeed, i), JITTER_SALT)`) so it decorrelates from `ctx.rng` (both previously derived from the same `mix(baseSeed, i)` stream). Determinism-neutral; no corpus golden uses each-jitter, so all golden frames stay byte-identical.

- Updated dependencies [3281514]
- Updated dependencies [1795d1c]
- Updated dependencies [7ea5371]
- Updated dependencies [7456761]
  - @glissade/scene@0.14.0-pre.0
  - @glissade/core@0.14.0-pre.0
  - @glissade/narrate@0.14.0-pre.0
  - @glissade/backend-skia@0.14.0-pre.0
  - @glissade/interact@0.14.0-pre.0
  - @glissade/lottie@0.14.0-pre.0
  - @glissade/player@0.14.0-pre.0
  - @glissade/svg@0.14.0-pre.0
  - @glissade/sfx@0.14.0-pre.0

## 0.13.0

### Patch Changes

- 5f1729b: Three small 0.13 cli/narrate consumer/canary fixes.

  **Fix 1 — loudness publish gain can no longer overshoot the -1 dBTP ceiling.**
  The committed gain was rounded to 2 decimals with `Math.round` (round-to-nearest),
  which on a peak-clamp-bound mix could land the gain ~0.005 dB _above_ the computed
  clamp (e.g. -1.005 → -1.00), pushing the published true-peak over -1 dBTP. The
  committed gain now uses `Math.floor` (floor-to-2-decimals), which is always ≤ the
  computed clamp, so the publish guarantee holds.

  **Fix 2 — `gs render --cache scene.js` no longer eats the scene path.**
  `parseArgs` treated every non-`=` flag as value-taking, so the boolean `--cache`
  greedily consumed the following positional. A `KNOWN_BOOLEAN_FLAGS` set (`record`,
  `force`, `strict`, `cache`, `json`, `fix`, `no-warnings`, `lossless-intermediate`,
  `allow-gpu-shards`, `verbose`, `allow-degraded`, `bisect`, `watch`) now prevents
  boolean flags from consuming the next token. Use `--cache=<dir>` to set a custom
  cache directory.

  **Fix 3 — kokoro Chinese (z\*) voices now hard-error instead of emitting garble.**
  kokoro-js routes Chinese through espeak-ng `cmn`, not the misaki[zh] g2p the `z*`
  voices were trained on (mismatched phonemes → garbled audio). `kokoroProvider`
  now throws a clear `NarrationError` for any `zf_`/`zm_` voice, naming misaki[zh]
  and pointing to `--provider piper` for Chinese. English voices are unaffected.

- d486e73: Harden `gs verify-determinism --against`: reject an incomparable baseline grid (different `fps` or `size`) instead of silently byte-comparing the wrong frames, and stop the per-node divergence-localizer from misattributing a frame divergence to a baseline node id absent from the current render (renamed/removed nodes). Tooling-correctness only — no determinism-contract or render-path impact.
- Updated dependencies [d1e81b7]
- Updated dependencies [d1e81b7]
- Updated dependencies [1995ee8]
- Updated dependencies [707d228]
- Updated dependencies [5f1729b]
- Updated dependencies [88ba5bc]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
- Updated dependencies [8bec181]
- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0
  - @glissade/scene@0.13.0
  - @glissade/narrate@0.13.0
  - @glissade/backend-skia@0.13.0
  - @glissade/interact@0.13.0
  - @glissade/lottie@0.13.0
  - @glissade/player@0.13.0
  - @glissade/sfx@0.13.0
  - @glissade/svg@0.13.0

## 0.13.0-pre.3

### Patch Changes

- Updated dependencies [0a3d35b]
  - @glissade/core@0.13.0-pre.3
  - @glissade/backend-skia@0.13.0-pre.3
  - @glissade/interact@0.13.0-pre.3
  - @glissade/lottie@0.13.0-pre.3
  - @glissade/narrate@0.13.0-pre.3
  - @glissade/player@0.13.0-pre.3
  - @glissade/scene@0.13.0-pre.3
  - @glissade/sfx@0.13.0-pre.3
  - @glissade/svg@0.13.0-pre.3

## 0.13.0-pre.2

### Patch Changes

- Updated dependencies [8bec181]
  - @glissade/core@0.13.0-pre.2
  - @glissade/backend-skia@0.13.0-pre.2
  - @glissade/interact@0.13.0-pre.2
  - @glissade/lottie@0.13.0-pre.2
  - @glissade/narrate@0.13.0-pre.2
  - @glissade/player@0.13.0-pre.2
  - @glissade/scene@0.13.0-pre.2
  - @glissade/sfx@0.13.0-pre.2
  - @glissade/svg@0.13.0-pre.2

## 0.13.0-pre.1

### Patch Changes

- Updated dependencies [d1e81b7]
- Updated dependencies [d1e81b7]
  - @glissade/core@0.13.0-pre.1
  - @glissade/scene@0.13.0-pre.1
  - @glissade/backend-skia@0.13.0-pre.1
  - @glissade/interact@0.13.0-pre.1
  - @glissade/lottie@0.13.0-pre.1
  - @glissade/narrate@0.13.0-pre.1
  - @glissade/player@0.13.0-pre.1
  - @glissade/sfx@0.13.0-pre.1
  - @glissade/svg@0.13.0-pre.1

## 0.13.0-pre.0

### Patch Changes

- 5f1729b: Three small 0.13 cli/narrate consumer/canary fixes.

  **Fix 1 — loudness publish gain can no longer overshoot the -1 dBTP ceiling.**
  The committed gain was rounded to 2 decimals with `Math.round` (round-to-nearest),
  which on a peak-clamp-bound mix could land the gain ~0.005 dB _above_ the computed
  clamp (e.g. -1.005 → -1.00), pushing the published true-peak over -1 dBTP. The
  committed gain now uses `Math.floor` (floor-to-2-decimals), which is always ≤ the
  computed clamp, so the publish guarantee holds.

  **Fix 2 — `gs render --cache scene.js` no longer eats the scene path.**
  `parseArgs` treated every non-`=` flag as value-taking, so the boolean `--cache`
  greedily consumed the following positional. A `KNOWN_BOOLEAN_FLAGS` set (`record`,
  `force`, `strict`, `cache`, `json`, `fix`, `no-warnings`, `lossless-intermediate`,
  `allow-gpu-shards`, `verbose`, `allow-degraded`, `bisect`, `watch`) now prevents
  boolean flags from consuming the next token. Use `--cache=<dir>` to set a custom
  cache directory.

  **Fix 3 — kokoro Chinese (z\*) voices now hard-error instead of emitting garble.**
  kokoro-js routes Chinese through espeak-ng `cmn`, not the misaki[zh] g2p the `z*`
  voices were trained on (mismatched phonemes → garbled audio). `kokoroProvider`
  now throws a clear `NarrationError` for any `zf_`/`zm_` voice, naming misaki[zh]
  and pointing to `--provider piper` for Chinese. English voices are unaffected.

- d486e73: Harden `gs verify-determinism --against`: reject an incomparable baseline grid (different `fps` or `size`) instead of silently byte-comparing the wrong frames, and stop the per-node divergence-localizer from misattributing a frame divergence to a baseline node id absent from the current render (renamed/removed nodes). Tooling-correctness only — no determinism-contract or render-path impact.
- Updated dependencies [1995ee8]
- Updated dependencies [707d228]
- Updated dependencies [5f1729b]
- Updated dependencies [88ba5bc]
- Updated dependencies [750367f]
- Updated dependencies [3bc3270]
- Updated dependencies [993d46a]
  - @glissade/core@0.13.0-pre.0
  - @glissade/scene@0.13.0-pre.0
  - @glissade/narrate@0.13.0-pre.0
  - @glissade/backend-skia@0.13.0-pre.0
  - @glissade/interact@0.13.0-pre.0
  - @glissade/lottie@0.13.0-pre.0
  - @glissade/player@0.13.0-pre.0
  - @glissade/sfx@0.13.0-pre.0
  - @glissade/svg@0.13.0-pre.0

## 0.12.1

### Patch Changes

- 56fa1f3: Two 0.12.1 consumer papercut fixes from the 0.12.0 validation.

  **Fix A — narration-lint no longer over-flags sidecar caption workflows.**
  `caption-fit` is now Tier-2 (WARN, never fails CI) **by default**, escalating to
  Tier-1 (error, CI-failing) only when the NarrationScript declares caption-fit
  intent — `captionMode: 'burn'` or a `captionMaxLines` budget. The escalation
  signal travels with the content in the committed script/manifest (not a CLI
  flag). The warn variant carries a nudge telling the author how to promote it to
  a hard gate. A sidecar project with no declaration now exits 0 out of the box.
  Adds `captionMode?: 'burn' | 'sidecar'` and `captionMaxLines?: number` to
  `NarrationScript`, persisted into `NarrationTiming`.

  **Fix B — `registerFont({ src: './Inter.ttf' })` accepts a string path.**
  A string `src` is now fs-read to bytes node-side (on the export/prepare-only
  `@glissade/core/font-ingest` subpath; `node:fs` does not leak into the embed).
  An unreadable path throws a clear `FontIngestError` naming the path instead of
  the downstream "too short to be a font". Raw `Uint8Array | ArrayBuffer` keeps
  working unchanged.

- Updated dependencies [56fa1f3]
  - @glissade/narrate@0.12.1
  - @glissade/core@0.12.1
  - @glissade/backend-skia@0.12.1
  - @glissade/interact@0.12.1
  - @glissade/lottie@0.12.1
  - @glissade/player@0.12.1
  - @glissade/scene@0.12.1
  - @glissade/sfx@0.12.1
  - @glissade/svg@0.12.1

## 0.12.0

### Minor Changes

- 2850386: feat(fonts): font ingestion front door — registerFont/font()/static instancing (§3.6)

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

- 796b568: feat(diff): `gs diff` — DisplayList diff + serializable IR snapshots (gs-diff)

  The determinism-diagnostic substrate (§3.3). Operating on the already-pure
  DisplayList IR (no raster, no audio), it turns an opaque golden-hash mismatch
  into a command-level explanation.

  - `@glissade/scene`: `diffDisplayLists(a, b): DisplayDiff` — index-aligned,
    positional per-command deltas (changed fields named; `add`/`remove` for
    trailing commands). `serializeDisplayList`/`parseDisplaySnapshot` produce a
    committable `.dl.json` baseline, registered as the third versioned
    interchange schema (`dlSnapshotVersion`, §7.4). The byte-preserving
    collapse-replacer that backs the §3.5 raster cacheKey is extracted to a
    single shared function (a pinned-cacheKey regression guard proves the
    extraction did not move a byte). All diff/snapshot surface tree-shakes out of
    the embed bundle.
  - `@glissade/cli`: a `gs diff <scene> --at <t> --against <baseline.dl.json|.png>`
    subcommand — prints a command tree and exits non-zero on divergence
    (`--against .png` is a raw `encodePng` byte-compare only). `--snapshot <out>`
    writes a `.dl.json` baseline.

  The golden harness's `assertFrameMatches` now attaches a DisplayList diff (from
  a fresh-scene cold re-evaluation) to the thrown error, so a purity break names
  the exact op/field that moved.

  KNOWN v1 cliff: the positional alignment cascades on a leading insert/remove;
  LCS/Myers alignment is deferred.

- c46321d: feat(loudness): `gs measure-loudness` — loudness-normalized publish profiles via a deterministic peak-clamped scalar gain (loudness)

  Publish-loudness normalization that keeps the render hot path single-pass and
  byte-deterministic. The insight: YouTube/Shorts re-normalize loudness
  platform-side, so the publish target is _≤ target-LUFS AND ≤ -1 dBTP_, not exact
  — which means no two-pass limiter is needed.

  - **`gs measure-loudness <scene> [--profile <id>]`** builds the final mix to a
    WAV (the same `collectAudioClips` + `planAudioMix` render uses) and runs
    ffmpeg's `loudnorm` measurement pass over it at MEASURE-time, then commits a
    `<scene>.loudness.json { loudnessVersion, profileId, inputI, inputTp, inputLra,
gain, mixHash }`. The gain is peak-clamped:
    `gain = min(targetLufs - inputI, truePeakDb - inputTp)` — the clamp uses the
    MEASURED true-peak, so the published output is guaranteed ≤ -1 dBTP with no
    render-time oversampling.
  - **At render**: `<scene>.loudness.json` is read and `gain` is applied as a PURE
    `volume=<gain>dB` scalar on the FINAL mix node — a single scalar in the
    existing filter graph, NOT a second ffmpeg pass. The scalar gain is bit-exact
    (verified) and golden-hashable; the only non-deterministic stages (mix-to-PCM,
    measure-time ebur128) stay quarantined to commit/measure-time per §5.3.
  - **PublishProfiles**: `youtube`/`shorts` (-14 LUFS), `podcast` (-16),
    `broadcast`/`ebu` (-23) — all at a -1 dBTP ceiling. YouTube/Shorts ship fully;
    the brickwall true-peak limiter is deferred — an un-normalized profile whose
    peaky source can't reach its target without clipping gets an advisory warning.
  - **mixHash** binds the committed measurement to the mix CONTENT (a hash of the
    narration/music/sfx timing-manifest bytes, not mtime). Render recomputes it and
    HARD-THROWS naming the command on a mismatch, so a re-narrate invalidates the
    measurement loudly instead of silently mis-normalizing. `--loudness off` skips
    it entirely.

- 4ad8291: feat(narrate): `gs narration-lint` — catch slow-re-narrate failures at BUILD (narrlint)

  Lint the COMMITTED narration timing manifest + the REAL measured caption
  geometry, so a re-narrate that overran its beat, a caption too dense to read, or
  a caption that overflows its box fails CI now instead of surfacing render-hours
  later. Pure over the committed JSON + the injected measurer — no clock, RNG, or
  I/O beyond reading the committed files.

  - `@glissade/narrate`: a schema bump for anchor budgets — a script-level
    `budgets?: Record<string, number>` (per-id ceilings, segments + pauses share
    the id namespace) and a per-segment `maxSec?` (which wins). Both are committed
    with the script ("animation is data") and persisted into the timing manifest
    (`NarrationTiming.budgets`, `TimedSegment.maxSec`) so the lint reads them from
    the committed JSON. Default-off: omit them and the manifest is byte-identical.
  - `@glissade/cli`: `lintNarration(timing, opts): Diagnostic[]` + a
    `gs narration-lint <scene-module|*.narration.timing.json>` subcommand.
    - Tier-1 (HARD, can fail CI / exit non-zero): `reading-speed`
      (chars-per-second over each committed cue vs `--max-cps`, default 17),
      `anchor-budget` (a beat over its `maxSec`/`budgets` ceiling), `caption-fit`
      (a cue that overflows its box / exceeds `maxLines`, using the REAL measured
      geometry — the lint DEFAULTS to the Skia measurer with the render's own
      fonts and drives the actual caption node, so a passing lint can't
      burn-overflow).
    - Tier-2 (WARN-only, never fails CI): `beat-drift`, `silence` sanity.
    - Output: a human table, `--json`, and `--fix` (a git-apply-able budget-bump
      diff for the SCRIPT — it NEVER writes a committed artifact).

- e41e9f0: feat(render): persistent whole-frame raster cache (`.gscache`) — content-addressed disk cache (§3.5)

  `gs render --cache [<dir>] [--cache-max-size <bytes|2GB>]` (and `render({ cache: { dir, mode } })`)
  adds a persistent whole-frame raster cache so a one-line edit doesn't re-rasterize every blur-heavy
  frame across runs/shards. OFF by default (`mode:'off'`), preserving the exact current equality
  baseline — opting in only changes speed, never output.

  - **Whole-frame granularity** (per-group disk tiling deferred to 0.13): the key is over the ENTIRE
    frame's DisplayList, so a hit is byte-safe by construction.
  - **Complete key:** `sha256(serializeDisplayList(frame) ++ glissadeVersion ++ capsId)` — folds the
    DisplayList-snapshot bytes (geometry/paint/transform), the glissade version (bump-on-version
    invalidation), and the BackendCaps id. version/capsId are INJECTED via `CacheKeyContext`.
  - **HIT == MISS:** a hit loads stored RGBA into the backend (`SkiaBackend.putPixels`) and encodes
    through the IDENTICAL `encodePng` path, so it is byte-identical to a cold render.
  - **Storage:** raw-RGBA + zlib, one atomically-written file per frame. Shards share one `.gscache`.
  - **Size-capped LRU from day one** (default 2 GB, mtime/access-time ordered).
  - **`gs cache verify <scene>`:** renders cache-hits vs cache-off and asserts the `encodePng` bytes
    are equal frame-for-frame (a sampled fraction is logged). A NEGATIVE test proves an incomplete key
    makes the gate fail.

  Honesty: the cache wins repeated renders + the unchanged-prefix of a single-segment edit. A full
  re-narrate shifts every frame's timing → every DisplayList changes → every frame misses.

- 2a520c5: feat(verify): `gs verify-determinism` — the cross-shard/backend divergence locator (§5.5/§5.6)

  A new CLI subcommand that VERIFIES the frame-level determinism tenet a
  sharded / cross-machine render leans on — without perturbing it. It emits a
  `frames.manifest` (per-frame `sha256` of the raw RGBA from `backend.readPixels()`
  — NOT `encodePng`, sidestepping PNG-encoder nondeterminism; `node:crypto`
  sha256, no new hash dep — plus per-node DisplayList sub-hashes reusing the
  shipped `serializeDisplayList`), and bisects the first divergence to a
  `(frame, node, op)`.

  - `gs verify-determinism <scene> [--shards N] [--against <manifest>] [--range a..b] [--bisect] [--emit <p>]`.
  - `--shards N` diffs a linear render vs an N-shard render of the same range
    (each shard re-runs the module from scratch, exactly as `gs render --workers`
    does); `--against` diffs a committed / other-machine manifest; `--bisect`
    drills the divergent node via `diffDisplayLists` + `formatDisplayDiff`.
  - Evaluates under the SAME `withDeterminismGuards('throw')` as `gs render`, so a
    clock/random/timer call in scene code throws DURING verification.
  - HONEST SCOPE (§5.5 item 6): byte-equality is Skia↔Skia (cross-machine/shard)
    ONLY. The manifest stamps its `backend`, and an `--against` cross-backend
    byte-compare is REJECTED with a clear error — browser↔Skia is perceptual
    (SSIM) parity, never byte-identity. The full-frame RGBA hash is the byte
    authority; the per-node sub-hashes only LOCALIZE where a frame diverged.

  `@glissade/scene`: `CacheColdResult` gains an additive `delta?: CommandDelta`
  (the WHOLE `CommandDelta` of the first divergent leaf node's isolated emit, not
  a flattened op/index — a multi-field change isn't lost). The existing
  `{ ok, node? }` callers are unaffected.

### Patch Changes

- 78393f1: fix(0.12 canary): close four silent-wrong-output / false-verdict holes on opt-in surfaces

  Four fixes from the 0.12.0-pre.0 canary review. All are on opt-in or tooling
  paths; the default render output is unchanged (225 goldens stay byte-identical).

  - **frame cache (`@glissade/cli`)**: the `--cache` key folded only the
    DisplayList (which carries an asset _id_, not pixels), so editing an
    `image`/`video`/`font` asset in place served STALE frames. The key context now
    folds an asset-content digest (sha256 of each referenced asset's BYTES), so an
    in-place asset edit invalidates the key.
  - **`gs verify-determinism --against` (`@glissade/cli`)**: a disjoint
    baseline/render range compared zero frames yet returned a green
    `{ok:true, compared:0}`. A zero-overlap compare is now a FAILURE (exits
    non-zero) with a clear reason; a partial overlap passes but warns about the
    uncompared baseline frames.
  - **loudness mixHash (`@glissade/cli`)**: `computeMixHash` hashed only the timing
    manifests, never the actual mix audio bytes, so editing a timeline clip or
    music stem in place left a stale publish gain applied silently. The hash now
    folds the BYTES of the resolved mix audio inputs (timeline clips + music stem +
    narration cache) at both measure-time and render-time, so the render-time
    stale-gain gate fires on an edited audio file.
  - **`clip()` overrides (`@glissade/core`)**: a wrong-value-type override (e.g. a
    number on a `vec2` channel) sampled to NaN into both backends with no warning.
    The clip override path now asserts the override value's type matches the
    channel and throws `ClipError` on a mismatch.

- Updated dependencies [78393f1]
- Updated dependencies [2850386]
- Updated dependencies [796b568]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
- Updated dependencies [4ad8291]
- Updated dependencies [e41e9f0]
- Updated dependencies [2a520c5]
  - @glissade/core@0.12.0
  - @glissade/scene@0.12.0
  - @glissade/narrate@0.12.0
  - @glissade/backend-skia@0.12.0
  - @glissade/interact@0.12.0
  - @glissade/lottie@0.12.0
  - @glissade/player@0.12.0
  - @glissade/sfx@0.12.0
  - @glissade/svg@0.12.0

## 0.12.0-pre.1

### Patch Changes

- 78393f1: fix(0.12 canary): close four silent-wrong-output / false-verdict holes on opt-in surfaces

  Four fixes from the 0.12.0-pre.0 canary review. All are on opt-in or tooling
  paths; the default render output is unchanged (225 goldens stay byte-identical).

  - **frame cache (`@glissade/cli`)**: the `--cache` key folded only the
    DisplayList (which carries an asset _id_, not pixels), so editing an
    `image`/`video`/`font` asset in place served STALE frames. The key context now
    folds an asset-content digest (sha256 of each referenced asset's BYTES), so an
    in-place asset edit invalidates the key.
  - **`gs verify-determinism --against` (`@glissade/cli`)**: a disjoint
    baseline/render range compared zero frames yet returned a green
    `{ok:true, compared:0}`. A zero-overlap compare is now a FAILURE (exits
    non-zero) with a clear reason; a partial overlap passes but warns about the
    uncompared baseline frames.
  - **loudness mixHash (`@glissade/cli`)**: `computeMixHash` hashed only the timing
    manifests, never the actual mix audio bytes, so editing a timeline clip or
    music stem in place left a stale publish gain applied silently. The hash now
    folds the BYTES of the resolved mix audio inputs (timeline clips + music stem +
    narration cache) at both measure-time and render-time, so the render-time
    stale-gain gate fires on an edited audio file.
  - **`clip()` overrides (`@glissade/core`)**: a wrong-value-type override (e.g. a
    number on a `vec2` channel) sampled to NaN into both backends with no warning.
    The clip override path now asserts the override value's type matches the
    channel and throws `ClipError` on a mismatch.

- Updated dependencies [78393f1]
  - @glissade/core@0.12.0-pre.1
  - @glissade/backend-skia@0.12.0-pre.1
  - @glissade/interact@0.12.0-pre.1
  - @glissade/lottie@0.12.0-pre.1
  - @glissade/narrate@0.12.0-pre.1
  - @glissade/player@0.12.0-pre.1
  - @glissade/scene@0.12.0-pre.1
  - @glissade/sfx@0.12.0-pre.1
  - @glissade/svg@0.12.0-pre.1

## 0.12.0-pre.0

### Minor Changes

- 2850386: feat(fonts): font ingestion front door — registerFont/font()/static instancing (§3.6)

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

- 796b568: feat(diff): `gs diff` — DisplayList diff + serializable IR snapshots (gs-diff)

  The determinism-diagnostic substrate (§3.3). Operating on the already-pure
  DisplayList IR (no raster, no audio), it turns an opaque golden-hash mismatch
  into a command-level explanation.

  - `@glissade/scene`: `diffDisplayLists(a, b): DisplayDiff` — index-aligned,
    positional per-command deltas (changed fields named; `add`/`remove` for
    trailing commands). `serializeDisplayList`/`parseDisplaySnapshot` produce a
    committable `.dl.json` baseline, registered as the third versioned
    interchange schema (`dlSnapshotVersion`, §7.4). The byte-preserving
    collapse-replacer that backs the §3.5 raster cacheKey is extracted to a
    single shared function (a pinned-cacheKey regression guard proves the
    extraction did not move a byte). All diff/snapshot surface tree-shakes out of
    the embed bundle.
  - `@glissade/cli`: a `gs diff <scene> --at <t> --against <baseline.dl.json|.png>`
    subcommand — prints a command tree and exits non-zero on divergence
    (`--against .png` is a raw `encodePng` byte-compare only). `--snapshot <out>`
    writes a `.dl.json` baseline.

  The golden harness's `assertFrameMatches` now attaches a DisplayList diff (from
  a fresh-scene cold re-evaluation) to the thrown error, so a purity break names
  the exact op/field that moved.

  KNOWN v1 cliff: the positional alignment cascades on a leading insert/remove;
  LCS/Myers alignment is deferred.

- c46321d: feat(loudness): `gs measure-loudness` — loudness-normalized publish profiles via a deterministic peak-clamped scalar gain (loudness)

  Publish-loudness normalization that keeps the render hot path single-pass and
  byte-deterministic. The insight: YouTube/Shorts re-normalize loudness
  platform-side, so the publish target is _≤ target-LUFS AND ≤ -1 dBTP_, not exact
  — which means no two-pass limiter is needed.

  - **`gs measure-loudness <scene> [--profile <id>]`** builds the final mix to a
    WAV (the same `collectAudioClips` + `planAudioMix` render uses) and runs
    ffmpeg's `loudnorm` measurement pass over it at MEASURE-time, then commits a
    `<scene>.loudness.json { loudnessVersion, profileId, inputI, inputTp, inputLra,
gain, mixHash }`. The gain is peak-clamped:
    `gain = min(targetLufs - inputI, truePeakDb - inputTp)` — the clamp uses the
    MEASURED true-peak, so the published output is guaranteed ≤ -1 dBTP with no
    render-time oversampling.
  - **At render**: `<scene>.loudness.json` is read and `gain` is applied as a PURE
    `volume=<gain>dB` scalar on the FINAL mix node — a single scalar in the
    existing filter graph, NOT a second ffmpeg pass. The scalar gain is bit-exact
    (verified) and golden-hashable; the only non-deterministic stages (mix-to-PCM,
    measure-time ebur128) stay quarantined to commit/measure-time per §5.3.
  - **PublishProfiles**: `youtube`/`shorts` (-14 LUFS), `podcast` (-16),
    `broadcast`/`ebu` (-23) — all at a -1 dBTP ceiling. YouTube/Shorts ship fully;
    the brickwall true-peak limiter is deferred — an un-normalized profile whose
    peaky source can't reach its target without clipping gets an advisory warning.
  - **mixHash** binds the committed measurement to the mix CONTENT (a hash of the
    narration/music/sfx timing-manifest bytes, not mtime). Render recomputes it and
    HARD-THROWS naming the command on a mismatch, so a re-narrate invalidates the
    measurement loudly instead of silently mis-normalizing. `--loudness off` skips
    it entirely.

- 4ad8291: feat(narrate): `gs narration-lint` — catch slow-re-narrate failures at BUILD (narrlint)

  Lint the COMMITTED narration timing manifest + the REAL measured caption
  geometry, so a re-narrate that overran its beat, a caption too dense to read, or
  a caption that overflows its box fails CI now instead of surfacing render-hours
  later. Pure over the committed JSON + the injected measurer — no clock, RNG, or
  I/O beyond reading the committed files.

  - `@glissade/narrate`: a schema bump for anchor budgets — a script-level
    `budgets?: Record<string, number>` (per-id ceilings, segments + pauses share
    the id namespace) and a per-segment `maxSec?` (which wins). Both are committed
    with the script ("animation is data") and persisted into the timing manifest
    (`NarrationTiming.budgets`, `TimedSegment.maxSec`) so the lint reads them from
    the committed JSON. Default-off: omit them and the manifest is byte-identical.
  - `@glissade/cli`: `lintNarration(timing, opts): Diagnostic[]` + a
    `gs narration-lint <scene-module|*.narration.timing.json>` subcommand.
    - Tier-1 (HARD, can fail CI / exit non-zero): `reading-speed`
      (chars-per-second over each committed cue vs `--max-cps`, default 17),
      `anchor-budget` (a beat over its `maxSec`/`budgets` ceiling), `caption-fit`
      (a cue that overflows its box / exceeds `maxLines`, using the REAL measured
      geometry — the lint DEFAULTS to the Skia measurer with the render's own
      fonts and drives the actual caption node, so a passing lint can't
      burn-overflow).
    - Tier-2 (WARN-only, never fails CI): `beat-drift`, `silence` sanity.
    - Output: a human table, `--json`, and `--fix` (a git-apply-able budget-bump
      diff for the SCRIPT — it NEVER writes a committed artifact).

- e41e9f0: feat(render): persistent whole-frame raster cache (`.gscache`) — content-addressed disk cache (§3.5)

  `gs render --cache [<dir>] [--cache-max-size <bytes|2GB>]` (and `render({ cache: { dir, mode } })`)
  adds a persistent whole-frame raster cache so a one-line edit doesn't re-rasterize every blur-heavy
  frame across runs/shards. OFF by default (`mode:'off'`), preserving the exact current equality
  baseline — opting in only changes speed, never output.

  - **Whole-frame granularity** (per-group disk tiling deferred to 0.13): the key is over the ENTIRE
    frame's DisplayList, so a hit is byte-safe by construction.
  - **Complete key:** `sha256(serializeDisplayList(frame) ++ glissadeVersion ++ capsId)` — folds the
    DisplayList-snapshot bytes (geometry/paint/transform), the glissade version (bump-on-version
    invalidation), and the BackendCaps id. version/capsId are INJECTED via `CacheKeyContext`.
  - **HIT == MISS:** a hit loads stored RGBA into the backend (`SkiaBackend.putPixels`) and encodes
    through the IDENTICAL `encodePng` path, so it is byte-identical to a cold render.
  - **Storage:** raw-RGBA + zlib, one atomically-written file per frame. Shards share one `.gscache`.
  - **Size-capped LRU from day one** (default 2 GB, mtime/access-time ordered).
  - **`gs cache verify <scene>`:** renders cache-hits vs cache-off and asserts the `encodePng` bytes
    are equal frame-for-frame (a sampled fraction is logged). A NEGATIVE test proves an incomplete key
    makes the gate fail.

  Honesty: the cache wins repeated renders + the unchanged-prefix of a single-segment edit. A full
  re-narrate shifts every frame's timing → every DisplayList changes → every frame misses.

- 2a520c5: feat(verify): `gs verify-determinism` — the cross-shard/backend divergence locator (§5.5/§5.6)

  A new CLI subcommand that VERIFIES the frame-level determinism tenet a
  sharded / cross-machine render leans on — without perturbing it. It emits a
  `frames.manifest` (per-frame `sha256` of the raw RGBA from `backend.readPixels()`
  — NOT `encodePng`, sidestepping PNG-encoder nondeterminism; `node:crypto`
  sha256, no new hash dep — plus per-node DisplayList sub-hashes reusing the
  shipped `serializeDisplayList`), and bisects the first divergence to a
  `(frame, node, op)`.

  - `gs verify-determinism <scene> [--shards N] [--against <manifest>] [--range a..b] [--bisect] [--emit <p>]`.
  - `--shards N` diffs a linear render vs an N-shard render of the same range
    (each shard re-runs the module from scratch, exactly as `gs render --workers`
    does); `--against` diffs a committed / other-machine manifest; `--bisect`
    drills the divergent node via `diffDisplayLists` + `formatDisplayDiff`.
  - Evaluates under the SAME `withDeterminismGuards('throw')` as `gs render`, so a
    clock/random/timer call in scene code throws DURING verification.
  - HONEST SCOPE (§5.5 item 6): byte-equality is Skia↔Skia (cross-machine/shard)
    ONLY. The manifest stamps its `backend`, and an `--against` cross-backend
    byte-compare is REJECTED with a clear error — browser↔Skia is perceptual
    (SSIM) parity, never byte-identity. The full-frame RGBA hash is the byte
    authority; the per-node sub-hashes only LOCALIZE where a frame diverged.

  `@glissade/scene`: `CacheColdResult` gains an additive `delta?: CommandDelta`
  (the WHOLE `CommandDelta` of the first divergent leaf node's isolated emit, not
  a flattened op/index — a multi-field change isn't lost). The existing
  `{ ok, node? }` callers are unaffected.

### Patch Changes

- Updated dependencies [2850386]
- Updated dependencies [796b568]
- Updated dependencies [388a8f0]
- Updated dependencies [47a3ca0]
- Updated dependencies [4ad8291]
- Updated dependencies [e41e9f0]
- Updated dependencies [2a520c5]
  - @glissade/core@0.12.0-pre.0
  - @glissade/scene@0.12.0-pre.0
  - @glissade/narrate@0.12.0-pre.0
  - @glissade/backend-skia@0.12.0-pre.0
  - @glissade/interact@0.12.0-pre.0
  - @glissade/lottie@0.12.0-pre.0
  - @glissade/player@0.12.0-pre.0
  - @glissade/sfx@0.12.0-pre.0
  - @glissade/svg@0.12.0-pre.0

## 0.11.0

### Patch Changes

- 9150f03: Remove the dead `RenderOptions.videoOnly` shard option. It was never set to `true` (no `--video-only` flag exists) and its gated branches never ran — shard children render video-only via `--format png-seq` + `--narration/music/sfx off`. Pure cleanup; identical runtime behavior.
- Updated dependencies [6d3e061]
- Updated dependencies [6d3e061]
- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
- Updated dependencies [f716bfc]
  - @glissade/interact@0.11.0
  - @glissade/player@0.11.0
  - @glissade/core@0.11.0
  - @glissade/scene@0.11.0
  - @glissade/backend-skia@0.11.0
  - @glissade/lottie@0.11.0
  - @glissade/narrate@0.11.0
  - @glissade/sfx@0.11.0
  - @glissade/svg@0.11.0

## 0.11.0-pre.1

### Patch Changes

- Updated dependencies [6d3e061]
- Updated dependencies [6d3e061]
  - @glissade/interact@0.11.0-pre.1
  - @glissade/player@0.11.0-pre.1
  - @glissade/backend-skia@0.11.0-pre.1
  - @glissade/core@0.11.0-pre.1
  - @glissade/lottie@0.11.0-pre.1
  - @glissade/narrate@0.11.0-pre.1
  - @glissade/scene@0.11.0-pre.1
  - @glissade/sfx@0.11.0-pre.1
  - @glissade/svg@0.11.0-pre.1

## 0.11.0-pre.0

### Patch Changes

- 9150f03: Remove the dead `RenderOptions.videoOnly` shard option. It was never set to `true` (no `--video-only` flag exists) and its gated branches never ran — shard children render video-only via `--format png-seq` + `--narration/music/sfx off`. Pure cleanup; identical runtime behavior.
- Updated dependencies [c7c6660]
- Updated dependencies [230b7ad]
- Updated dependencies [f742c55]
- Updated dependencies [f716bfc]
  - @glissade/core@0.11.0-pre.0
  - @glissade/scene@0.11.0-pre.0
  - @glissade/player@0.11.0-pre.0
  - @glissade/interact@0.11.0-pre.0
  - @glissade/backend-skia@0.11.0-pre.0
  - @glissade/lottie@0.11.0-pre.0
  - @glissade/narrate@0.11.0-pre.0
  - @glissade/sfx@0.11.0-pre.0
  - @glissade/svg@0.11.0-pre.0

## 0.10.1

### Patch Changes

- Updated dependencies [f9f7ebe]
- Updated dependencies [7482378]
  - @glissade/core@0.10.1
  - @glissade/scene@0.10.1
  - @glissade/backend-skia@0.10.1
  - @glissade/interact@0.10.1
  - @glissade/lottie@0.10.1
  - @glissade/narrate@0.10.1
  - @glissade/player@0.10.1
  - @glissade/sfx@0.10.1
  - @glissade/svg@0.10.1

## 0.10.1-pre.1

### Patch Changes

- Updated dependencies [f9f7ebe]
  - @glissade/core@0.10.1-pre.1
  - @glissade/scene@0.10.1-pre.1
  - @glissade/backend-skia@0.10.1-pre.1
  - @glissade/interact@0.10.1-pre.1
  - @glissade/lottie@0.10.1-pre.1
  - @glissade/narrate@0.10.1-pre.1
  - @glissade/player@0.10.1-pre.1
  - @glissade/sfx@0.10.1-pre.1
  - @glissade/svg@0.10.1-pre.1

## 0.10.1-pre.0

### Patch Changes

- Updated dependencies [7482378]
  - @glissade/core@0.10.1-pre.0
  - @glissade/scene@0.10.1-pre.0
  - @glissade/backend-skia@0.10.1-pre.0
  - @glissade/interact@0.10.1-pre.0
  - @glissade/lottie@0.10.1-pre.0
  - @glissade/narrate@0.10.1-pre.0
  - @glissade/player@0.10.1-pre.0
  - @glissade/sfx@0.10.1-pre.0
  - @glissade/svg@0.10.1-pre.0

## 0.10.0

### Minor Changes

- 050db0a: Add `gs render --workers N` — **sharded parallel export** (§5.6, §8.1). The frame
  range is split into N contiguous sub-ranges, each rendered in a **separate `gs`
  child process** (not worker_threads — `@napi-rs/canvas`/`GlobalFonts` hold unsafe
  process-global state, and separate processes are cross-machine-ready). Because
  `evaluate` is a pure function of time, each shard re-runs the scene module from
  scratch — re-deriving any module-level `bake()` for its prefix — so an N-worker
  render of a range is **byte-identical to a single-worker render of the same range**
  at the frame level (verified by a determinism gate test).

  Shards render **video-only**; the orchestrator mixes timeline + auto-mixed
  (narration/music/sfx) audio **once** over the joined result, and emits caption/cue
  sidecars once. Two join strategies (the §8.1 decision):

  - **default** — per-shard encode to the final codec with a forced keyframe at each
    shard boundary (`-force_key_frames`), joined by the FFmpeg concat demuxer
    (verbatim `-c copy`).
  - **`--lossless-intermediate`** — FFV1 shards + a single final encode (the
    guaranteed byte-faithful path). Auto-enabled with a stderr note when the picked
    encoder can't honor precise boundary keyframes (mpeg4 / openh264), since a
    concat-copy of imprecise-GOP codecs would drop/dupe boundary frames.

  GPU/shader scenes are outside the cross-process reproducibility guarantee (§3.7):
  a scene containing a `ShaderEffect` **refuses to shard** unless `--allow-gpu-shards`
  is passed.

  New `RenderOptions`: `workers?`, `losslessIntermediate?`, `allowGpuShards?`. New
  CLI flags: `--workers <n>`, `--lossless-intermediate`, `--allow-gpu-shards`. New
  exports from `@glissade/cli`: `renderSharded`, `splitFrameRange`,
  `sceneHasGpuNodes`, `planFinalAudio`, `ShardError`.

  Note: serialized shipped-checkpoint warming for checkpointed `bake()` sources
  (§2.8) remains a follow-up; each shard currently re-derives its prefix.

### Patch Changes

- fbdcc44: `gs render --workers N` now caps the sharded frame range to the timeline extent (`ceil(duration*fps)`), matching the linear path's `-t <duration>` trim. Previously an explicit over-range (e.g. `--range 0..119` on a shorter timeline) or an `--fps` override emitted more frames from the sharded path than the single-worker path — a silent break of the documented N-worker == 1-worker contract. (A copy-mode `-t` on the concat join is not frame-accurate, so the cap is applied to the rendered frames instead.)
- e4190b5: Docs: `gs render --workers` now notes it helps CPU-bound, per-frame-cheap scenes — a single render is already internally multi-threaded, so bandwidth-bound / blur-heavy scenes gain little from sharding. `NodeProps.cache` now documents that the cache is for a static subtree under a _moving parent_ (a subtree that drifts on sub-pixel positions misses every frame), and that a `filter` is a live composite parameter never baked into the cached bitmap. (0.10 downstream validation.)
- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
- Updated dependencies [b2f1fd7]
- Updated dependencies [278ea05]
- Updated dependencies [e4190b5]
- Updated dependencies [680f8ae]
- Updated dependencies [0cc640f]
- Updated dependencies [0a1844c]
  - @glissade/scene@0.10.0
  - @glissade/core@0.10.0
  - @glissade/backend-skia@0.10.0
  - @glissade/interact@0.10.0
  - @glissade/lottie@0.10.0
  - @glissade/narrate@0.10.0
  - @glissade/player@0.10.0
  - @glissade/svg@0.10.0
  - @glissade/sfx@0.10.0

## 0.10.0-pre.1

### Patch Changes

- fbdcc44: `gs render --workers N` now caps the sharded frame range to the timeline extent (`ceil(duration*fps)`), matching the linear path's `-t <duration>` trim. Previously an explicit over-range (e.g. `--range 0..119` on a shorter timeline) or an `--fps` override emitted more frames from the sharded path than the single-worker path — a silent break of the documented N-worker == 1-worker contract. (A copy-mode `-t` on the concat join is not frame-accurate, so the cap is applied to the rendered frames instead.)
- Updated dependencies [fbdcc44]
- Updated dependencies [fbdcc44]
  - @glissade/scene@0.10.0-pre.1
  - @glissade/core@0.10.0-pre.1
  - @glissade/backend-skia@0.10.0-pre.1
  - @glissade/interact@0.10.0-pre.1
  - @glissade/lottie@0.10.0-pre.1
  - @glissade/narrate@0.10.0-pre.1
  - @glissade/player@0.10.0-pre.1
  - @glissade/svg@0.10.0-pre.1
  - @glissade/sfx@0.10.0-pre.1

## 0.10.0-pre.0

### Minor Changes

- 050db0a: Add `gs render --workers N` — **sharded parallel export** (§5.6, §8.1). The frame
  range is split into N contiguous sub-ranges, each rendered in a **separate `gs`
  child process** (not worker_threads — `@napi-rs/canvas`/`GlobalFonts` hold unsafe
  process-global state, and separate processes are cross-machine-ready). Because
  `evaluate` is a pure function of time, each shard re-runs the scene module from
  scratch — re-deriving any module-level `bake()` for its prefix — so an N-worker
  render of a range is **byte-identical to a single-worker render of the same range**
  at the frame level (verified by a determinism gate test).

  Shards render **video-only**; the orchestrator mixes timeline + auto-mixed
  (narration/music/sfx) audio **once** over the joined result, and emits caption/cue
  sidecars once. Two join strategies (the §8.1 decision):

  - **default** — per-shard encode to the final codec with a forced keyframe at each
    shard boundary (`-force_key_frames`), joined by the FFmpeg concat demuxer
    (verbatim `-c copy`).
  - **`--lossless-intermediate`** — FFV1 shards + a single final encode (the
    guaranteed byte-faithful path). Auto-enabled with a stderr note when the picked
    encoder can't honor precise boundary keyframes (mpeg4 / openh264), since a
    concat-copy of imprecise-GOP codecs would drop/dupe boundary frames.

  GPU/shader scenes are outside the cross-process reproducibility guarantee (§3.7):
  a scene containing a `ShaderEffect` **refuses to shard** unless `--allow-gpu-shards`
  is passed.

  New `RenderOptions`: `workers?`, `losslessIntermediate?`, `allowGpuShards?`. New
  CLI flags: `--workers <n>`, `--lossless-intermediate`, `--allow-gpu-shards`. New
  exports from `@glissade/cli`: `renderSharded`, `splitFrameRange`,
  `sceneHasGpuNodes`, `planFinalAudio`, `ShardError`.

  Note: serialized shipped-checkpoint warming for checkpointed `bake()` sources
  (§2.8) remains a follow-up; each shard currently re-derives its prefix.

### Patch Changes

- Updated dependencies [b2f1fd7]
- Updated dependencies [278ea05]
- Updated dependencies [680f8ae]
- Updated dependencies [0cc640f]
- Updated dependencies [0a1844c]
  - @glissade/core@0.10.0-pre.0
  - @glissade/scene@0.10.0-pre.0
  - @glissade/backend-skia@0.10.0-pre.0
  - @glissade/interact@0.10.0-pre.0
  - @glissade/lottie@0.10.0-pre.0
  - @glissade/narrate@0.10.0-pre.0
  - @glissade/player@0.10.0-pre.0
  - @glissade/sfx@0.10.0-pre.0
  - @glissade/svg@0.10.0-pre.0

## 0.9.1

### Patch Changes

- 4da552c: `gs render --chapters vtt` now writes **only chapter-kind cues** as WebVTT chapters by default — ad-break and plain `cue` markers stay out of the chapter list (they remain in `cues.json` for machines), so the VTT pastes straight into a YouTube description without manual filtering. Override the set with `--chapters-kind <kind[,kind]>` (e.g. `--chapters-kind chapter,ad-break`). `cues.json` is unchanged — it keeps every kind. The `00:00` "Intro" anchor logic now applies to the filtered chapter set.
  - @glissade/backend-skia@0.9.1
  - @glissade/core@0.9.1
  - @glissade/interact@0.9.1
  - @glissade/lottie@0.9.1
  - @glissade/narrate@0.9.1
  - @glissade/player@0.9.1
  - @glissade/scene@0.9.1
  - @glissade/sfx@0.9.1
  - @glissade/svg@0.9.1

## 0.9.1-pre.0

### Patch Changes

- 4da552c: `gs render --chapters vtt` now writes **only chapter-kind cues** as WebVTT chapters by default — ad-break and plain `cue` markers stay out of the chapter list (they remain in `cues.json` for machines), so the VTT pastes straight into a YouTube description without manual filtering. Override the set with `--chapters-kind <kind[,kind]>` (e.g. `--chapters-kind chapter,ad-break`). `cues.json` is unchanged — it keeps every kind. The `00:00` "Intro" anchor logic now applies to the filtered chapter set.
  - @glissade/backend-skia@0.9.1-pre.0
  - @glissade/core@0.9.1-pre.0
  - @glissade/interact@0.9.1-pre.0
  - @glissade/lottie@0.9.1-pre.0
  - @glissade/narrate@0.9.1-pre.0
  - @glissade/player@0.9.1-pre.0
  - @glissade/scene@0.9.1-pre.0
  - @glissade/sfx@0.9.1-pre.0
  - @glissade/svg@0.9.1-pre.0

## 0.9.0

### Patch Changes

- 04a1059: feat(fonts): FontRegistry + strict-mode font validation + cmap glyph coverage (§3.6)

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

- Updated dependencies [f3b471b]
- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0
  - @glissade/scene@0.9.0
  - @glissade/player@0.9.0
  - @glissade/backend-skia@0.9.0
  - @glissade/interact@0.9.0
  - @glissade/lottie@0.9.0
  - @glissade/narrate@0.9.0
  - @glissade/sfx@0.9.0
  - @glissade/svg@0.9.0

## 0.9.0-pre.1

### Patch Changes

- Updated dependencies [f3b471b]
  - @glissade/core@0.9.0-pre.1
  - @glissade/scene@0.9.0-pre.1
  - @glissade/backend-skia@0.9.0-pre.1
  - @glissade/interact@0.9.0-pre.1
  - @glissade/lottie@0.9.0-pre.1
  - @glissade/narrate@0.9.0-pre.1
  - @glissade/player@0.9.0-pre.1
  - @glissade/sfx@0.9.0-pre.1
  - @glissade/svg@0.9.0-pre.1

## 0.9.0-pre.0

### Patch Changes

- 04a1059: feat(fonts): FontRegistry + strict-mode font validation + cmap glyph coverage (§3.6)

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

- Updated dependencies [04a1059]
- Updated dependencies [7035c6b]
- Updated dependencies [7edd807]
- Updated dependencies [ea9657c]
  - @glissade/core@0.9.0-pre.0
  - @glissade/scene@0.9.0-pre.0
  - @glissade/player@0.9.0-pre.0
  - @glissade/backend-skia@0.9.0-pre.0
  - @glissade/interact@0.9.0-pre.0
  - @glissade/lottie@0.9.0-pre.0
  - @glissade/narrate@0.9.0-pre.0
  - @glissade/sfx@0.9.0-pre.0
  - @glissade/svg@0.9.0-pre.0

## 0.8.1

### Patch Changes

- e338c7d: Fix `--provider kokoro` under pnpm (downstream canary findings on 0.8.1-pre.0):

  - **Resolve `kokoro-js` from the user's project, not from `@glissade/narrate`'s own location.** Under pnpm's isolated layout an optional peer isn't linked into narrate's store dir, so the bare `import('kokoro-js')` failed even when it was installed and loadable. It's now resolved via `createRequire(cwd).resolve('kokoro-js')` (falling back to this module for hoisted/global installs) and loaded through a computed `file://` import — which also keeps it out of any bundle.
  - **Surface the real error.** The `catch {}` that masked every failure as a generic "not found" now includes the actual error `code` + `message`, so resolution/load problems are diagnosable.
  - **Read the version without the non-exported subpath.** `kokoro-js` doesn't export `./package.json`; `version()` now walks up from the resolved entry instead of resolving that subpath (which threw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
  - **Docs:** package-manager-agnostic install, and a pnpm note that downstreams must allow/ignore the native build scripts (`onnxruntime-node` / `sharp` / `protobufjs`) or `pnpm install --frozen-lockfile` exits non-zero.

- 0f09b67: Add a **Kokoro** TTS provider (`--provider kokoro`) — an Apache-2.0, 82M-param neural voice that is markedly more natural than espeak/piper, fully offline on CPU, with no API key. Unlike piper there's no `pip install` or external binary: it runs **pure-Node** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js + onnxruntime), declared as an **optional peer dependency** — `npm i kokoro-js` only if you use it. The model downloads and caches on first use; pick a voice via the script's `voice` (e.g. `af_heart`) and the quant via `kokoroProvider({ dtype })` (`q8` default, `fp32` for top quality).

  Deterministic by construction: Kokoro inference uses a fixed voice/style embedding (not diffusion-sampled per call), so the same text re-synthesizes byte-identical — verified by a gated determinism test. `version()` pins the `kokoro-js` version + model + dtype, so any of those moving invalidates the per-segment cache. New exports from `@glissade/narrate/providers`: `kokoroProvider`, `floatToWav`, `KokoroDtype`.

- Updated dependencies [e338c7d]
- Updated dependencies [0f09b67]
  - @glissade/narrate@0.8.1
  - @glissade/backend-skia@0.8.1
  - @glissade/core@0.8.1
  - @glissade/interact@0.8.1
  - @glissade/lottie@0.8.1
  - @glissade/player@0.8.1
  - @glissade/scene@0.8.1
  - @glissade/sfx@0.8.1
  - @glissade/svg@0.8.1

## 0.8.1-pre.1

### Patch Changes

- e338c7d: Fix `--provider kokoro` under pnpm (downstream canary findings on 0.8.1-pre.0):

  - **Resolve `kokoro-js` from the user's project, not from `@glissade/narrate`'s own location.** Under pnpm's isolated layout an optional peer isn't linked into narrate's store dir, so the bare `import('kokoro-js')` failed even when it was installed and loadable. It's now resolved via `createRequire(cwd).resolve('kokoro-js')` (falling back to this module for hoisted/global installs) and loaded through a computed `file://` import — which also keeps it out of any bundle.
  - **Surface the real error.** The `catch {}` that masked every failure as a generic "not found" now includes the actual error `code` + `message`, so resolution/load problems are diagnosable.
  - **Read the version without the non-exported subpath.** `kokoro-js` doesn't export `./package.json`; `version()` now walks up from the resolved entry instead of resolving that subpath (which threw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
  - **Docs:** package-manager-agnostic install, and a pnpm note that downstreams must allow/ignore the native build scripts (`onnxruntime-node` / `sharp` / `protobufjs`) or `pnpm install --frozen-lockfile` exits non-zero.

- Updated dependencies [e338c7d]
  - @glissade/narrate@0.8.1-pre.1
  - @glissade/backend-skia@0.8.1-pre.1
  - @glissade/core@0.8.1-pre.1
  - @glissade/interact@0.8.1-pre.1
  - @glissade/lottie@0.8.1-pre.1
  - @glissade/player@0.8.1-pre.1
  - @glissade/scene@0.8.1-pre.1
  - @glissade/sfx@0.8.1-pre.1
  - @glissade/svg@0.8.1-pre.1

## 0.8.1-pre.0

### Patch Changes

- 0f09b67: Add a **Kokoro** TTS provider (`--provider kokoro`) — an Apache-2.0, 82M-param neural voice that is markedly more natural than espeak/piper, fully offline on CPU, with no API key. Unlike piper there's no `pip install` or external binary: it runs **pure-Node** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js + onnxruntime), declared as an **optional peer dependency** — `npm i kokoro-js` only if you use it. The model downloads and caches on first use; pick a voice via the script's `voice` (e.g. `af_heart`) and the quant via `kokoroProvider({ dtype })` (`q8` default, `fp32` for top quality).

  Deterministic by construction: Kokoro inference uses a fixed voice/style embedding (not diffusion-sampled per call), so the same text re-synthesizes byte-identical — verified by a gated determinism test. `version()` pins the `kokoro-js` version + model + dtype, so any of those moving invalidates the per-segment cache. New exports from `@glissade/narrate/providers`: `kokoroProvider`, `floatToWav`, `KokoroDtype`.

- Updated dependencies [0f09b67]
  - @glissade/narrate@0.8.1-pre.0
  - @glissade/backend-skia@0.8.1-pre.0
  - @glissade/core@0.8.1-pre.0
  - @glissade/interact@0.8.1-pre.0
  - @glissade/lottie@0.8.1-pre.0
  - @glissade/player@0.8.1-pre.0
  - @glissade/scene@0.8.1-pre.0
  - @glissade/sfx@0.8.1-pre.0
  - @glissade/svg@0.8.1-pre.0

## 0.8.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.

### Patch Changes

- dac15c9: Cue→chapters polish (downstream validation follow-ups on the 0.8 ad-break feature):

  - **Plain `cue()` now serializes.** `cue(at, name, data?)` stamps `data.kind: 'cue'` by default (a caller-supplied `kind` still wins), so a cue authored without an explicit kind now lands in `cues.json` and fires `player.onCue('cue', …)` instead of being silently dropped. The `data.kind` gate that excludes `.call()`/label markers stays intact.
  - **`--chapters vtt` shows the human title, not the kind.** The WebVTT cue text is now `data.title ?? name` (was the machine `kind`), and a `00:00` "Intro" chapter is auto-anchored when the earliest cue starts later — making the output a drop-in for a YouTube description chapter block (YouTube reads the cue text as the title and requires a 0:00 start). `cues.json` is unchanged (keeps `kind` for machines) and stays byte-deterministic.

- Updated dependencies [1d56c0a]
- Updated dependencies [dac15c9]
- Updated dependencies [dac15c9]
- Updated dependencies [012d9c0]
- Updated dependencies [1c9a303]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0
  - @glissade/player@0.8.0
  - @glissade/scene@0.8.0
  - @glissade/backend-skia@0.8.0
  - @glissade/interact@0.8.0
  - @glissade/lottie@0.8.0
  - @glissade/narrate@0.8.0
  - @glissade/sfx@0.8.0
  - @glissade/svg@0.8.0

## 0.8.0-pre.1

### Patch Changes

- dac15c9: Cue→chapters polish (downstream validation follow-ups on the 0.8 ad-break feature):

  - **Plain `cue()` now serializes.** `cue(at, name, data?)` stamps `data.kind: 'cue'` by default (a caller-supplied `kind` still wins), so a cue authored without an explicit kind now lands in `cues.json` and fires `player.onCue('cue', …)` instead of being silently dropped. The `data.kind` gate that excludes `.call()`/label markers stays intact.
  - **`--chapters vtt` shows the human title, not the kind.** The WebVTT cue text is now `data.title ?? name` (was the machine `kind`), and a `00:00` "Intro" chapter is auto-anchored when the earliest cue starts later — making the output a drop-in for a YouTube description chapter block (YouTube reads the cue text as the title and requires a 0:00 start). `cues.json` is unchanged (keeps `kind` for machines) and stays byte-deterministic.

- Updated dependencies [dac15c9]
- Updated dependencies [dac15c9]
  - @glissade/player@0.8.0-pre.1
  - @glissade/core@0.8.0-pre.1
  - @glissade/interact@0.8.0-pre.1
  - @glissade/backend-skia@0.8.0-pre.1
  - @glissade/lottie@0.8.0-pre.1
  - @glissade/narrate@0.8.0-pre.1
  - @glissade/scene@0.8.0-pre.1
  - @glissade/sfx@0.8.0-pre.1
  - @glissade/svg@0.8.0-pre.1

## 0.8.0-pre.0

### Minor Changes

- 1d56c0a: Composer cue signaling (the ad-break feature). Author cues on the builder: `tl.cue(at, name, data?)` and `tl.adBreak(at, { id, duration })` emit serialized `Marker`s (an ad-break carries `data.kind: 'ad-break'`). At runtime `player.onCue(kind, cb)` fires for any cue of that kind on forward crossing (sugar over `onMarker`). At render, `gs render` writes a deterministic `<stem>.cues.json` (`{ t, kind, name, duration }`) next to the output whenever cue markers exist, plus `--chapters vtt` for a WebVTT chapters file — so a downstream NLE / ad-insertion pipeline has machine-readable break points. Rides the existing pure marker substrate; no new evaluation surface.

### Patch Changes

- Updated dependencies [1d56c0a]
- Updated dependencies [012d9c0]
- Updated dependencies [1c9a303]
- Updated dependencies [7290397]
- Updated dependencies [bc75e7c]
- Updated dependencies [8820f3f]
- Updated dependencies [bc15866]
  - @glissade/core@0.8.0-pre.0
  - @glissade/player@0.8.0-pre.0
  - @glissade/scene@0.8.0-pre.0
  - @glissade/backend-skia@0.8.0-pre.0
  - @glissade/interact@0.8.0-pre.0
  - @glissade/lottie@0.8.0-pre.0
  - @glissade/narrate@0.8.0-pre.0
  - @glissade/sfx@0.8.0-pre.0
  - @glissade/svg@0.8.0-pre.0

## 0.7.0

### Minor Changes

- 8f4fa6c: `gs render --range` is now **frame-indexed** (`--range 0..120` = inclusive frame indices), matching the spec's rule that export APIs take frames while Player APIs take seconds. Decimal/garbage ranges are rejected. New flags: `--frame N` (render a single still through the same path) and `--format png-seq` (force a PNG sequence even when `--out` looks like a video). `--workers` and `--watch` are recognized but print an honest not-yet-implemented note (parallel sharding is tracked separately). The programmatic `render({ range })` still accepts seconds for back-compat; new `frame`/`frameRange`/`format` options drive the frame-indexed path.

### Patch Changes

- 0c0a583: A/V sync offsets are now sample-accurate and identical across export paths by construction (§5.3). A new `audioOffsetSamples(at, sampleRate)` in core (`round(at * sampleRate)`) is the single source of truth: the CLI mixer derives its `adelay` from the sample grid instead of rounding to milliseconds, and the browser `OfflineAudioContext` mixer snaps clip starts (and gain-envelope times) to the same grid instead of using raw float seconds. Previously the two paths could drift sub-frame and a non-frame-aligned `at` passed through silently.
- 4317102: `gs render --frame N --out foo.png` now writes that single PNG file at the path, instead of creating a directory `foo.png/` containing `frame-0000N.png` + caption sidecars. A single frame to a `*.png` `--out` is a still; rendering into a directory still works with a directory `--out`. Reported downstream.
- 9aa42e6: Render-mode determinism guards (§5.5): `withDeterminismGuards(mode, fn)` from `@glissade/scene` patches the banned globals (`Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`) for the synchronous scope of a single `evaluate()` — throwing a `DeterminismViolationError` under `throw` mode (CLI/CI), warning-once-then-delegating under `warn` (dev), and always restoring them afterward. `gs render` now wraps every frame's `evaluate()` in `throw` mode, so a scene that reads a wall clock or unseeded random is rejected at render time instead of producing a silently nondeterministic export. This is the runtime backstop to the static `@glissade/eslint-plugin` rules.
- Updated dependencies [0c0a583]
- Updated dependencies [9a360b2]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [9aa42e6]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0
  - @glissade/scene@0.7.0
  - @glissade/backend-skia@0.7.0
  - @glissade/interact@0.7.0
  - @glissade/lottie@0.7.0
  - @glissade/narrate@0.7.0
  - @glissade/player@0.7.0
  - @glissade/sfx@0.7.0
  - @glissade/svg@0.7.0

## 0.7.0-pre.0

### Minor Changes

- 8f4fa6c: `gs render --range` is now **frame-indexed** (`--range 0..120` = inclusive frame indices), matching the spec's rule that export APIs take frames while Player APIs take seconds. Decimal/garbage ranges are rejected. New flags: `--frame N` (render a single still through the same path) and `--format png-seq` (force a PNG sequence even when `--out` looks like a video). `--workers` and `--watch` are recognized but print an honest not-yet-implemented note (parallel sharding is tracked separately). The programmatic `render({ range })` still accepts seconds for back-compat; new `frame`/`frameRange`/`format` options drive the frame-indexed path.

### Patch Changes

- 0c0a583: A/V sync offsets are now sample-accurate and identical across export paths by construction (§5.3). A new `audioOffsetSamples(at, sampleRate)` in core (`round(at * sampleRate)`) is the single source of truth: the CLI mixer derives its `adelay` from the sample grid instead of rounding to milliseconds, and the browser `OfflineAudioContext` mixer snaps clip starts (and gain-envelope times) to the same grid instead of using raw float seconds. Previously the two paths could drift sub-frame and a non-frame-aligned `at` passed through silently.
- 9aa42e6: Render-mode determinism guards (§5.5): `withDeterminismGuards(mode, fn)` from `@glissade/scene` patches the banned globals (`Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`) for the synchronous scope of a single `evaluate()` — throwing a `DeterminismViolationError` under `throw` mode (CLI/CI), warning-once-then-delegating under `warn` (dev), and always restoring them afterward. `gs render` now wraps every frame's `evaluate()` in `throw` mode, so a scene that reads a wall clock or unseeded random is rejected at render time instead of producing a silently nondeterministic export. This is the runtime backstop to the static `@glissade/eslint-plugin` rules.
- Updated dependencies [0c0a583]
- Updated dependencies [9a360b2]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [0848530]
- Updated dependencies [9aa42e6]
- Updated dependencies [25c5986]
- Updated dependencies [ecdece8]
  - @glissade/core@0.7.0-pre.0
  - @glissade/scene@0.7.0-pre.0
  - @glissade/backend-skia@0.7.0-pre.0
  - @glissade/interact@0.7.0-pre.0
  - @glissade/lottie@0.7.0-pre.0
  - @glissade/narrate@0.7.0-pre.0
  - @glissade/player@0.7.0-pre.0
  - @glissade/sfx@0.7.0-pre.0
  - @glissade/svg@0.7.0-pre.0

## 0.6.1

### Patch Changes

- Updated dependencies [c231e58]
  - @glissade/narrate@0.6.1
  - @glissade/backend-skia@0.6.1
  - @glissade/core@0.6.1
  - @glissade/interact@0.6.1
  - @glissade/lottie@0.6.1
  - @glissade/player@0.6.1
  - @glissade/scene@0.6.1
  - @glissade/sfx@0.6.1
  - @glissade/svg@0.6.1

## 0.6.0

### Minor Changes

- c5dbc0e: New `@glissade/svg` package: static SVG import. `importSvg(svgString)` parses an SVG document into a glissade scene — `<path d>` strings (full M/L/H/V/C/S/Q/T/A/Z command set, with arcs converted to native ellipse-arc segments), the basic shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`), `<g>` grouping, `transform` (translate/scale/rotate/matrix → node TRS), and fill/stroke/stroke-width with SVG presentation inheritance. Unsupported features (text, images, gradients, filters, masks) are dropped with warnings. Returns `{ size, root, warnings, toSceneModule() }`.

  `gs import` now accepts `.svg` alongside `.json`: it emits a scene module that defers to `importSvg` (the conversion's single source of truth), renderable by `gs render`.

### Patch Changes

- Updated dependencies [1aa2228]
- Updated dependencies [e249f0d]
- Updated dependencies [6c07c96]
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
- Updated dependencies [12c5841]
- Updated dependencies [c5dbc0e]
- Updated dependencies [977b3d5]
  - @glissade/narrate@0.6.0
  - @glissade/core@0.6.0
  - @glissade/scene@0.6.0
  - @glissade/svg@0.6.0
  - @glissade/backend-skia@0.6.0
  - @glissade/interact@0.6.0
  - @glissade/lottie@0.6.0
  - @glissade/player@0.6.0
  - @glissade/sfx@0.6.0

## 0.6.0-pre.1

### Minor Changes

- c5dbc0e: New `@glissade/svg` package: static SVG import. `importSvg(svgString)` parses an SVG document into a glissade scene — `<path d>` strings (full M/L/H/V/C/S/Q/T/A/Z command set, with arcs converted to native ellipse-arc segments), the basic shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`), `<g>` grouping, `transform` (translate/scale/rotate/matrix → node TRS), and fill/stroke/stroke-width with SVG presentation inheritance. Unsupported features (text, images, gradients, filters, masks) are dropped with warnings. Returns `{ size, root, warnings, toSceneModule() }`.

  `gs import` now accepts `.svg` alongside `.json`: it emits a scene module that defers to `importSvg` (the conversion's single source of truth), renderable by `gs render`.

### Patch Changes

- Updated dependencies [6c07c96]
- Updated dependencies [c5dbc0e]
- Updated dependencies [977b3d5]
  - @glissade/core@0.6.0-pre.1
  - @glissade/svg@0.6.0-pre.1
  - @glissade/scene@0.6.0-pre.1
  - @glissade/backend-skia@0.6.0-pre.1
  - @glissade/interact@0.6.0-pre.1
  - @glissade/lottie@0.6.0-pre.1
  - @glissade/narrate@0.6.0-pre.1
  - @glissade/player@0.6.0-pre.1
  - @glissade/sfx@0.6.0-pre.1

## 0.6.0-pre.0

### Patch Changes

- Updated dependencies [1aa2228]
- Updated dependencies [e249f0d]
- Updated dependencies [301fd07]
- Updated dependencies [4c6424d]
- Updated dependencies [37e48be]
  - @glissade/narrate@0.6.0-pre.0
  - @glissade/scene@0.6.0-pre.0
  - @glissade/backend-skia@0.6.0-pre.0
  - @glissade/interact@0.6.0-pre.0
  - @glissade/lottie@0.6.0-pre.0
  - @glissade/player@0.6.0-pre.0
  - @glissade/core@0.6.0-pre.0
  - @glissade/sfx@0.6.0-pre.0

## 0.5.0

### Minor Changes

- 27d4727: `gs prepare <scene>` — one command to materialize ALL of a scene's committed audio assets: it runs the narration prepare (if a `.narration.json` sibling exists), the sfx prepare (if a `.sfx.json` exists, anchors resolving against the narration timing), and then **imports the scene module** so any in-code sfx caches the author writes at module/timeline-build time (e.g. `renderSfxAssets` for `keystrokeClips`) are flushed too. It never calls `evaluate()` (a pure read that writes nothing); the import side-effects are the flush. A missing sibling or a failing import is a skip/warning, not an abort — so prepare is a no-op-friendly superset of `gs narrate` + `gs sfx`. After it, `gs render` is a pure read of committed files.
- 3af5f67: Piper provider + provider-independent word alignment. `piperProvider({ model })` adds local **neural** TTS (rhasspy/piper) — natural voice, offline, free, no key. The bigger change: word timing is now an alignment step decoupled from synthesis, because no real provider (espeak/openai/piper) emits word timestamps. After `synthesize()`, a segment without provider words is run through an aligner: `heuristic` (default — pure-JS syllable distribution, always available, deterministic), `vosk` (offline ASR via the optional `vosk` package — Apache-2.0, ~50 MB model, no Docker/Python/multi-GB download), or `none`. `vosk` derives timings against the audio and maps them onto the script tokens (`mapAsrToScript`, exported) so `segments[].words[i]` lines up with `wordBoxes()[i]`. Provider-supplied words always win. Set it with the script's `align` field or `gs narrate --align <id>`. Alignment runs only in the prepare step and is cached separately from audio (`wordsFrom`), so swapping aligners re-aligns the cached wav at zero synthesis cost. `synthesizeScript` gains `providerImpl`/`alignerImpl` instance overrides — the bring-your-own seam for custom providers (ElevenLabs, Azure) and aligners (whisper.cpp, MFA, …). Docs: a provider matrix and a "Word timing & alignment" section in the narration guide.
- adc00ba: `gs sfx` — the sound-effects prepare step + render auto-mix, closing the SFX zero-config loop (parity with narration/music). Write a `<scene>.sfx.json` with effect hits that anchor to a narration beat (`{ voice, anchor, offset }`, resolved against the sibling `*.narration.timing.json` so they re-flow on re-narrate) or use an absolute `at`. `gs sfx <scene>` resolves the times, renders the referenced voices once (deduped) to `<scene>.sfx-cache/`, bakes the deterministic index-seeded jitter into a committed `<scene>.sfx.timing.json`, and `gs render` auto-mixes that manifest with zero config (`--sfx off` opts out). Author-wired clips are detected and never doubled (the +6dB guard). v1 drives the procedural `sfxr` source; sample packs remain available from code via `@glissade/sfx`'s `buildSfxClips`.
- 1c53eeb: `gs sfx --verbose` echoes each resolved hit as `<time>s  <voice>` (plus gain/rate when jittered), so anchor coupling validates at a glance instead of reading the committed timing.json. `prepareSfx` now returns the resolved `clips` for programmatic use.

### Patch Changes

- 3af5f67: `gs render` now auto-mixes narration, closing the asymmetry a consumer flagged: 0.4.x auto-mixed a sibling music manifest but the narration voice still had to be hand-wired onto `timeline.audio` (the music manifest read the narration timing only to _duck_ the bed, never to add the voice). Now a sibling `<scene>.narration.timing.json` is discovered and its clips mixed automatically — scene + narration manifest → a voiced mp4, zero-config, the promise the music-parity framing implied. `--narration off` opts out. Author-wired clips are detected and never doubled (the same +6dB guard as the bed), and the browser-export path is unchanged (it mixes only `timeline.audio`, so wire `beats.clips()` there).
- Updated dependencies [763bd2f]
- Updated dependencies [2521fdc]
- Updated dependencies [ca2150f]
- Updated dependencies [e1865d2]
- Updated dependencies [363c7b7]
- Updated dependencies [1c53eeb]
- Updated dependencies [3af5f67]
- Updated dependencies [fcfb962]
- Updated dependencies [3383077]
- Updated dependencies [829b14d]
- Updated dependencies [43b326b]
- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [43b326b]
- Updated dependencies [adc7941]
- Updated dependencies [27b4b49]
- Updated dependencies [4495359]
  - @glissade/narrate@0.5.0
  - @glissade/scene@0.5.0
  - @glissade/sfx@0.5.0
  - @glissade/backend-skia@0.5.0
  - @glissade/interact@0.5.0
  - @glissade/lottie@0.5.0
  - @glissade/player@0.5.0
  - @glissade/core@0.5.0

## 0.5.0-pre.7

### Patch Changes

- Updated dependencies [763bd2f]
  - @glissade/narrate@0.5.0-pre.7
  - @glissade/backend-skia@0.5.0-pre.7
  - @glissade/core@0.5.0-pre.7
  - @glissade/interact@0.5.0-pre.7
  - @glissade/lottie@0.5.0-pre.7
  - @glissade/player@0.5.0-pre.7
  - @glissade/scene@0.5.0-pre.7
  - @glissade/sfx@0.5.0-pre.7

## 0.5.0-pre.6

### Minor Changes

- 27d4727: `gs prepare <scene>` — one command to materialize ALL of a scene's committed audio assets: it runs the narration prepare (if a `.narration.json` sibling exists), the sfx prepare (if a `.sfx.json` exists, anchors resolving against the narration timing), and then **imports the scene module** so any in-code sfx caches the author writes at module/timeline-build time (e.g. `renderSfxAssets` for `keystrokeClips`) are flushed too. It never calls `evaluate()` (a pure read that writes nothing); the import side-effects are the flush. A missing sibling or a failing import is a skip/warning, not an abort — so prepare is a no-op-friendly superset of `gs narrate` + `gs sfx`. After it, `gs render` is a pure read of committed files.

### Patch Changes

- Updated dependencies [d679e81]
- Updated dependencies [8f631ab]
- Updated dependencies [4e93a59]
- Updated dependencies [adc7941]
  - @glissade/scene@0.5.0-pre.6
  - @glissade/backend-skia@0.5.0-pre.6
  - @glissade/interact@0.5.0-pre.6
  - @glissade/lottie@0.5.0-pre.6
  - @glissade/narrate@0.5.0-pre.6
  - @glissade/player@0.5.0-pre.6
  - @glissade/core@0.5.0-pre.6
  - @glissade/sfx@0.5.0-pre.6

## 0.5.0-pre.5

### Patch Changes

- Updated dependencies [2521fdc]
- Updated dependencies [4495359]
  - @glissade/narrate@0.5.0-pre.5
  - @glissade/scene@0.5.0-pre.5
  - @glissade/backend-skia@0.5.0-pre.5
  - @glissade/interact@0.5.0-pre.5
  - @glissade/lottie@0.5.0-pre.5
  - @glissade/player@0.5.0-pre.5
  - @glissade/core@0.5.0-pre.5
  - @glissade/sfx@0.5.0-pre.5

## 0.5.0-pre.4

### Minor Changes

- 1c53eeb: `gs sfx --verbose` echoes each resolved hit as `<time>s  <voice>` (plus gain/rate when jittered), so anchor coupling validates at a glance instead of reading the committed timing.json. `prepareSfx` now returns the resolved `clips` for programmatic use.

### Patch Changes

- Updated dependencies [ca2150f]
- Updated dependencies [1c53eeb]
  - @glissade/scene@0.5.0-pre.4
  - @glissade/narrate@0.5.0-pre.4
  - @glissade/backend-skia@0.5.0-pre.4
  - @glissade/interact@0.5.0-pre.4
  - @glissade/lottie@0.5.0-pre.4
  - @glissade/player@0.5.0-pre.4
  - @glissade/core@0.5.0-pre.4
  - @glissade/sfx@0.5.0-pre.4

## 0.5.0-pre.3

### Patch Changes

- Updated dependencies [e1865d2]
- Updated dependencies [43b326b]
- Updated dependencies [43b326b]
  - @glissade/scene@0.5.0-pre.3
  - @glissade/sfx@0.5.0-pre.3
  - @glissade/backend-skia@0.5.0-pre.3
  - @glissade/interact@0.5.0-pre.3
  - @glissade/lottie@0.5.0-pre.3
  - @glissade/narrate@0.5.0-pre.3
  - @glissade/player@0.5.0-pre.3
  - @glissade/core@0.5.0-pre.3

## 0.5.0-pre.2

### Minor Changes

- adc00ba: `gs sfx` — the sound-effects prepare step + render auto-mix, closing the SFX zero-config loop (parity with narration/music). Write a `<scene>.sfx.json` with effect hits that anchor to a narration beat (`{ voice, anchor, offset }`, resolved against the sibling `*.narration.timing.json` so they re-flow on re-narrate) or use an absolute `at`. `gs sfx <scene>` resolves the times, renders the referenced voices once (deduped) to `<scene>.sfx-cache/`, bakes the deterministic index-seeded jitter into a committed `<scene>.sfx.timing.json`, and `gs render` auto-mixes that manifest with zero config (`--sfx off` opts out). Author-wired clips are detected and never doubled (the +6dB guard). v1 drives the procedural `sfxr` source; sample packs remain available from code via `@glissade/sfx`'s `buildSfxClips`.

### Patch Changes

- Updated dependencies [363c7b7]
- Updated dependencies [3383077]
- Updated dependencies [829b14d]
- Updated dependencies [27b4b49]
  - @glissade/narrate@0.5.0-pre.2
  - @glissade/sfx@0.5.0-pre.2
  - @glissade/scene@0.5.0-pre.2
  - @glissade/backend-skia@0.5.0-pre.2
  - @glissade/interact@0.5.0-pre.2
  - @glissade/lottie@0.5.0-pre.2
  - @glissade/player@0.5.0-pre.2
  - @glissade/core@0.5.0-pre.2

## 0.5.0-pre.1

### Patch Changes

- Updated dependencies [fcfb962]
  - @glissade/narrate@0.5.0-pre.1
  - @glissade/backend-skia@0.5.0-pre.1
  - @glissade/core@0.5.0-pre.1
  - @glissade/interact@0.5.0-pre.1
  - @glissade/lottie@0.5.0-pre.1
  - @glissade/player@0.5.0-pre.1
  - @glissade/scene@0.5.0-pre.1

## 0.5.0-pre.0

### Minor Changes

- 3af5f67: Piper provider + provider-independent word alignment. `piperProvider({ model })` adds local **neural** TTS (rhasspy/piper) — natural voice, offline, free, no key. The bigger change: word timing is now an alignment step decoupled from synthesis, because no real provider (espeak/openai/piper) emits word timestamps. After `synthesize()`, a segment without provider words is run through an aligner: `heuristic` (default — pure-JS syllable distribution, always available, deterministic), `vosk` (offline ASR via the optional `vosk` package — Apache-2.0, ~50 MB model, no Docker/Python/multi-GB download), or `none`. `vosk` derives timings against the audio and maps them onto the script tokens (`mapAsrToScript`, exported) so `segments[].words[i]` lines up with `wordBoxes()[i]`. Provider-supplied words always win. Set it with the script's `align` field or `gs narrate --align <id>`. Alignment runs only in the prepare step and is cached separately from audio (`wordsFrom`), so swapping aligners re-aligns the cached wav at zero synthesis cost. `synthesizeScript` gains `providerImpl`/`alignerImpl` instance overrides — the bring-your-own seam for custom providers (ElevenLabs, Azure) and aligners (whisper.cpp, MFA, …). Docs: a provider matrix and a "Word timing & alignment" section in the narration guide.

### Patch Changes

- 3af5f67: `gs render` now auto-mixes narration, closing the asymmetry a consumer flagged: 0.4.x auto-mixed a sibling music manifest but the narration voice still had to be hand-wired onto `timeline.audio` (the music manifest read the narration timing only to _duck_ the bed, never to add the voice). Now a sibling `<scene>.narration.timing.json` is discovered and its clips mixed automatically — scene + narration manifest → a voiced mp4, zero-config, the promise the music-parity framing implied. `--narration off` opts out. Author-wired clips are detected and never doubled (the same +6dB guard as the bed), and the browser-export path is unchanged (it mixes only `timeline.audio`, so wire `beats.clips()` there).
- Updated dependencies [3af5f67]
  - @glissade/narrate@0.5.0-pre.0
  - @glissade/backend-skia@0.5.0-pre.0
  - @glissade/core@0.5.0-pre.0
  - @glissade/interact@0.5.0-pre.0
  - @glissade/lottie@0.5.0-pre.0
  - @glissade/player@0.5.0-pre.0
  - @glissade/scene@0.5.0-pre.0

## 0.4.5

### Patch Changes

- 70159ad: Adoption-report follow-ups. TokenHighlight ranges gain an `offset` target (`'<id>/<rangeId>/offset'` + .x/.y) — per-range shakes and nudges without moving sibling ranges (downstream's red-flip shake previously had to jitter the whole node). `gs render` auto-mix never double-adds the bed: when the timeline's audio already references the stem (any url spelling resolving to the same file), the bed is skipped with a note — a coherent duplicate measured +6dB downstream. Docs: em-derived padding guidance for tokenHighlight at high resolutions; gainDb override (not compose) semantics pinned.
- Updated dependencies [70159ad]
  - @glissade/scene@0.4.5
  - @glissade/backend-skia@0.4.5
  - @glissade/interact@0.4.5
  - @glissade/lottie@0.4.5
  - @glissade/narrate@0.4.5
  - @glissade/player@0.4.5
  - @glissade/core@0.4.5

## 0.4.4

### Patch Changes

- 40f5a31: The two downstream feature requests, built from their production specs. `tokenHighlight(text, { ranges })` (scene): sub-line multi-color token highlights over wordBoxes — each range matches a token (whitespace-insensitive boundary-exact runs, or [wordIndex, wordIndex]) and carries its OWN animatable fill/opacity/progress/scale targets; ranges validate at construction and throw on copy drift at draw (rematch: true for animated text); wrap-spanning ranges produce one rect per line segment. Music manifest blessed (narrate): `*.music.timing.json` ({musicVersion, bpm, beatsPerCycle, cps, durationSec, offsetSec, stem, gainDb}) with the beat-0-equals-sample-0 invariant and cps↔bpm validation; `music(timing, at)` anchors (beat/cycle/nearestBeat/nextBeat/grid) mirror narration(); `m.clip()` composes bed gainDb (10^(dB/20) over the whole envelope) with duckEnvelope under a narration manifest. `gs render` auto-mix parity: a sibling music manifest with a stem joins the mix automatically, ducked under narration when both manifests sit next to the scene — the zero-config narrated-explainer-with-bed; `--music off` opts out.
- Updated dependencies [40f5a31]
  - @glissade/scene@0.4.4
  - @glissade/narrate@0.4.4
  - @glissade/backend-skia@0.4.4
  - @glissade/interact@0.4.4
  - @glissade/lottie@0.4.4
  - @glissade/player@0.4.4
  - @glissade/core@0.4.4

## 0.4.3

### Patch Changes

- 2282bcb: The downstream-friction batch (driven by a consuming project's 0.3.0→0.4.2 report). `createMeasurer({ fonts })` in backend-skia + `setDefaultMeasurer()` in scene bless factory-time measurement — Text pulls and un-injected scenes fall back through the process default before the estimator, so component factories measure with the rasterizer's real metrics (scene-injected measurers still win). `springTo(endT, from, to, cfg)` in core returns the [launch, settle] key pair with the spring-duration arithmetic done — settle-ON-the-beat without hand math. `Text.wordBoxes()` trims whitespace that punctuation-gluing folds into a segment (' $' → '$'), so boxes cover exactly the ink. `AudioClip.gain` accepts keys-only envelopes (`{ keys }`); the meaningless-but-mandatory target string is gone (full Tracks still work structurally). `duckEnvelope(timing, opts)` in narrate derives the music-bed ducking gain from the narration manifest (segment windows, attack/release ramps, near-window merging) — upstreamed from downstream. `gs render` progress detects non-TTY stderr and emits sparse newline-terminated updates instead of an unbroken \r stream.
- Updated dependencies [2282bcb]
  - @glissade/scene@0.4.3
  - @glissade/backend-skia@0.4.3
  - @glissade/core@0.4.3
  - @glissade/narrate@0.4.3
  - @glissade/interact@0.4.3
  - @glissade/lottie@0.4.3
  - @glissade/player@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [53f6f9f]
  - @glissade/scene@0.4.2
  - @glissade/backend-skia@0.4.2
  - @glissade/interact@0.4.2
  - @glissade/lottie@0.4.2
  - @glissade/narrate@0.4.2
  - @glissade/player@0.4.2
  - @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [80d9ac1]
  - @glissade/scene@0.4.1
  - @glissade/interact@0.4.1
  - @glissade/backend-skia@0.4.1
  - @glissade/lottie@0.4.1
  - @glissade/narrate@0.4.1
  - @glissade/player@0.4.1
  - @glissade/core@0.4.1

## 0.4.0

### Minor Changes

- 613a00a: New package `@glissade/lottie` + `gs import` (Lottie S1): an import-only, fail-fast Lottie/bodymovin converter. Shape, null, solid, and image layers; full transform mapping (anchor sandwiches, parent chains incl. hidden parents, ip/op visibility wrappers, ease-shift onto arrival keys, hold and same-frame rewrites, arc-length-baked spatial tangents); painter-model shape denormalization to Path nodes with animated path morphing; el/rc kappa conversion (exact under animation, direction-aware winding for nonzero holes); merge-paths mode 1. Everything outside the cut rejects in ONE error enumerating every problem (`--allow-degraded` downgrades expressions and exotic merge modes to warnings). Output is a plain SceneModule + v1 Timeline — render, studio, machines, and export consume it unchanged. Byte-deterministic across processes; never mutates its input.
- cc57dfc: TTS narration + caption primitives. `@glissade/narrate` (new): narration scripts collocated with scenes, pluggable TTS providers (espeak / openai / deterministic fake) behind an explicit `gs narrate` prepare step with sha256 segment caching, narration-derived timeline anchors (`narration(timing).start('seg')`), captions as hold-key string tracks + safe-area caption nodes (16:9 and 9:16), and `.srt`/`.vtt` exporters. CLI: `gs narrate` command and `gs render --captions burn|sidecar|off` with sidecars that match the burned timing by construction. Render stays fully offline after prepare.

### Patch Changes

- Updated dependencies [056817c]
- Updated dependencies [869d406]
- Updated dependencies [613a00a]
- Updated dependencies [cc57dfc]
- Updated dependencies [3986798]
  - @glissade/scene@0.4.0
  - @glissade/lottie@0.4.0
  - @glissade/narrate@0.4.0
  - @glissade/backend-skia@0.4.0
  - @glissade/interact@0.4.0
  - @glissade/player@0.4.0
  - @glissade/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [fbb12ca]
- Updated dependencies [ab8ca37]
- Updated dependencies [bc9add6]
- Updated dependencies [e89c3d0]
  - @glissade/scene@0.3.0
  - @glissade/backend-skia@0.3.0
  - @glissade/core@0.3.0
  - @glissade/interact@0.3.0
  - @glissade/player@0.3.0

## 0.2.0

### Minor Changes

- 1693a55: Record → replay → bake (v2 addendum §A.6/§C.5). `@glissade/interact`: `InputTrace` (event list, raw pre-filter values at raw timestamps), `recordTrace` (transparent tap on input writes), `bakeTrace` (frame-quantized replay through a fresh machine → a plain version-1 linear Timeline, bit-deterministic per trace), `hashMachine` trace identity covering referenced timeline documents, and `MachineSpec` — the scene-module machine declaration. Machines additionally expose `doc`, `hash`, `hasStepped`, and `sampleTargets`. `@glissade/cli`: `gs render --trace/--state/--force` (machines without an export story are a build error), and `gs dev [--record]` — an esbuild-served harness that mounts the module's machines and writes `.trace.json` sidecars on stop.

### Patch Changes

- Updated dependencies [715be32]
- Updated dependencies [dcb28f2]
- Updated dependencies [1d2fd20]
- Updated dependencies [1693a55]
  - @glissade/interact@0.2.0
  - @glissade/core@0.2.0
  - @glissade/player@0.2.0
  - @glissade/scene@0.2.0
  - @glissade/backend-skia@0.2.0

## 0.1.0

### Minor Changes

- First public release.

  glissade is a TypeScript framework for programmatic motion graphics built on
  one contract: `evaluate(scene, timeline, t)` is a pure function of time. No
  generator functions — animations are serializable keyframe documents authored
  via a fluent builder or raw data.

  - Pull-based signals (lazy, cached, dependency-tracked) driving a
    renderer-agnostic scene graph with a flat DisplayList IR
  - Canvas 2D (browser) and Skia (headless CLI) backends with golden-frame CI:
    frames byte-compare across machines on a pinned toolchain — including text
    (explicit fonts) and flexbox layout (Yoga behind the LayoutEngine seam)
  - `gs render` CLI: PNG sequences or mp4/webm with mixed audio, encoder
    feature detection, video assets via FFmpeg extraction
  - In-browser export via WebCodecs + Mediabunny, faster than realtime, with
    sample-accurate OfflineAudioContext audio and bidirectional video scrub
  - Time-based Player with a Driver seam (rAF clock, scroll), `<gs-player>`
    custom element (~1 kB), React bindings
  - `bake()`: stateful simulation compiled to ordinary keyframe tracks
  - A React studio with draggable keyframes persisted to git-diffable sidecars
    that survive code edits

### Patch Changes

- Updated dependencies
  - @glissade/core@0.1.0
  - @glissade/scene@0.1.0
  - @glissade/backend-skia@0.1.0
