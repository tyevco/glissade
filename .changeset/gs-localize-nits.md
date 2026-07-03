---
"@glissade/cli": patch
---

`gs localize`: carry over translated narration (no silent wipe) + `--strict` + a no-message fast-path

Three fixes from the 0.42 real-episode consumer read (ai-training):

- **Data-loss fix (top):** a re-localize `--write` used to re-fork the base narration text every time, silently wiping a translator's already-localized `<base>.<locale>.narration.json`. It now **carries the existing per-segment translation over by id** (symmetric with the message-table carry-over) — a re-localize preserves translated segments and re-stubs only NEW ones. The report shows the carried-over count.
- **`--strict`:** refuses to emit on a preflight failure (exit 1, no write), mirroring the dry-run gate — a CI-friendly "don't write drifted artifacts" mode. Plain `--write` stays the fix-forward (exit 0).
- **Multi-cue + no-`t()` fast-path:** the id harvest no longer offers **multi-cue** string tracks (a many-cue caption/typewriter node) as message-table targets — `localize()` can't table-localize them, so offering them only kept the preflight permanently red. And a scene with **no localizable messages** (no `t()` ids, no single-cue string tracks) now skips `messages.<locale>.json` entirely and reaches a clean parity-only preflight.
