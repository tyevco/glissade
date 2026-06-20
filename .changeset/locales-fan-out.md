---
'@glissade/cli': minor
---

Add `gs render <scene> --locales <a,b,c>` (0.15) — render a scene ONCE PER comma-separated locale in a single invocation, over the existing 0.14 `--locale <code>` path. Pure CLI orchestration: each per-locale render IS the 0.14 single-`--locale` render (the locale's `messages.<code>.json` ambient table + the preferred `<base>.<code>.narration.timing.json` sibling, then `render()` runs `localize()`), so `--locales en,zh` ≡ `--locale en` then `--locale zh` with distinct outputs. No render-path change — the 252 goldens stay byte-identical.

Per-locale output convention: a video/png `--out` gets a locale segment before the extension (`out/episode.mp4` → `out/episode.<locale>.mp4`); a directory `--out` (the PNG-sequence default) gets a per-locale subdir (`out/` → `out/<locale>/`). `--format png-seq` forces the directory convention even for a video-looking name.

`--locale` and `--locales` are mutually exclusive (passing both is a hard error). A locale in the list with NO resolvable assets (neither a message table nor a narration sibling) throws the 0.14 `UnknownLocaleError` naming the bad locale, aborting the whole fan-out loudly — never silently skipped. The fan-out loop is sequential and the per-locale ambient i18n table can't leak between iterations (`loadSceneModule` re-installs the table at the top of every render). New programmatic exports: `renderLocales`, `parseLocalesList`, `localeOutPath`, `LocaleArgsError`.
