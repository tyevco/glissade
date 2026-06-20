---
'@glissade/core': minor
'@glissade/cli': patch
---

0.15 i18n-hardening 5-pack — residual localization robustness gaps, all OFF the `evaluate()` path (252 goldens byte-identical; the no-locale base path unchanged). Each fix has a violating-input regression test.

FIX 1 (multi-cue collapse → hard-throw): `localize()` broadcasts `table[id]` to every key of a matched string track. For a multi-cue caption (a string track with >1 DISTINCT keyed value) that froze one caption over the whole video. `localize` now HARD-THROWS a `LocalizationError` naming the id and directing to per-locale narration regen; a single-value / single-key string track still localizes by broadcast.

FIX 2 (flat-table key collision → throw-on-ambiguity): a key matching BOTH a node-id-with-a-string-track AND a free-standing `t()` id (`opts.consumedIds`) silently rewrote the node's track. `localize` now throws a clear `LocalizationError` on any such collision. PURE ADDITIVE GUARD — the flat `messages.<locale>.json` shape (`MessageTable = Record<string, string>`) is UNCHANGED; no sectioned `{tracks,messages}` format introduced.

FIX 3 (ambient `t()` race across concurrent renders): the process-global ambient table/consumed-id set was shared across concurrent programmatic `render()`/`loadSceneModule` flows for different locales → wrong-language static `Text`. Added `runWithMessageTable(table, fn)` — an `AsyncLocalStorage`-scoped ambient table that isolates each async flow (lazily loaded `node:async_hooks`, off the embed; `core/i18n` stays 1.5 kB gz). `setMessageTable`/`getMessageTable`/`getConsumedMessageIds`/`t()` now read the active scope (ALS if present, else the process-global). Added `preservingMessageTable(fn)` (snapshot/restore the global ambient table), wired around the no-locale audio-mix helpers in the CLI (`collectMixAudioInputs`/`buildMixWav`) so they don't clobber or leak a concurrent locale's table. The CLI one-shot is unaffected.

FIX 4 (`requireParity` within-manifest duplicate ids): the Set-based union/diff swallowed `{en:['a','a','b']}`. `requireParity` now runs a per-manifest duplicate check (`new Set(m.ids).size !== m.ids.length`) FIRST — naming the locale + dup id and throwing a `ParityError` — even for a single (or zero) manifest, before the cross-manifest diff.

FIX 5 (`osFamilies` brand-warn gap): `buildFontExemptSet` folded the OS catalog into the exempt set; a registered/declared brand family whose name collides with an OS family could be waved through as "OS-only". The OS-catalog fold now SKIPS any name that collides with a registered family, so a declared brand font stays subject to glyph-coverage validation (a missing glyph still warns / throws under `--strict`). The exemption is for genuinely-OS-only families.
