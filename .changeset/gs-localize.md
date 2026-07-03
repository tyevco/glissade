---
"@glissade/cli": minor
---

`gs localize` — fork a narration into a new locale + preflight parity before TTS

Render already fans out across locales (`--locales en,zh`), but nothing *created* the per-locale artifacts — hand-forking a narration drifts silently (a dropped beat id breaks a `.start()` anchor; an orphaned message id throws), and you only discover it after a minute of TTS. `gs localize scene.ts --to zh` does the fork up front and runs the render path's checks *before* any synthesis:

```sh
gs localize scene.ts --to zh            # dry run: fork plan + a parity/localize preflight (exits non-zero on drift)
gs localize scene.ts --to zh --write    # emit scene.zh.narration.json + messages.zh.json
```

- **Forks the narration** (`<base>.narration.json`, or the committed timing when that's all there is) into `<base>.<locale>.narration.json`, **preserving every segment/pause id** so `.start()`/`beats.at()` anchors survive; the voice is dropped so the locale picks its own (`--keep-voice` retains it).
- **Stubs `messages.<locale>.json`** from the ids the scene actually uses — every `t()` id (harvested by loading the scene under a recording table) plus every `type:'string'` track node-id — sorted for a diff-stable file. A re-localize **carries existing translations over** (never blanks work done); `--from <locale>` seeds placeholders from a base locale.
- **Preflights** with the same `requireParity` + dry `localize()` the render runs, as one non-throwing report so all drift surfaces at once. Dry-run by default (non-zero exit on any issue — a CI gate); `--write` is the fix-forward.

CLI-only (no scene/embed surface, base embed unchanged); never synthesizes audio or calls `evaluate()`. Docs: `docs/narration.md` (Localizing to a new locale).
