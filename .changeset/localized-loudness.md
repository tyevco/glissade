---
'@glissade/cli': patch
---

0.15 canary fix (FIX 2): support per-locale publish loudness so a localized render isn't a loudness dead-end.

A localized render (`gs render --locale zh`) mixes the per-locale narration (the zh wavs) → a different `mixHash` than the base mix, but `gs measure-loudness` was locale-unaware: the committed `*.loudness.json` measured the BASE narration, so `resolveLoudnessGainDb` hard-threw `stale mixHash` for ANY localized video with committed loudness, with no supported way to commit a per-locale measurement.

`loudnessPathFor(modulePath, locale?)` now emits `<stem>.<locale>.loudness.json` when a locale is set (the base `<stem>.loudness.json` is unchanged for no-locale). `gs measure-loudness --locale <code>` measures the per-locale mix (threaded through `buildMixWav` / `collectMixAudioInputs`) and commits the per-locale file. `resolveLoudnessGainDb` reads the per-locale measurement first when rendering with a locale, and when it is MISSING throws an ACTIONABLE per-locale error (`no <stem>.<locale>.loudness.json — run gs measure-loudness <scene> --locale <locale>`) instead of the generic stale message. `renderLocales` names the failing locale on a per-locale dead-end (still fails loudly, never swallowed). The no-locale loudness path and all goldens are byte-identical.
