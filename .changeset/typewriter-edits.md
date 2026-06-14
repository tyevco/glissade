---
'@glissade/scene': minor
---

`typewriter()` — edit-event-aware typing, so a terminal cold-open can type, delete, and retype *different* text (the monotonic `Text.reveal` can't). It compiles a compact edit script (`{ type }`, `{ delete }`, `{ hold }`, per-step `perChar`) into a hold-key **string track** for `Text.text` plus a per-keystroke schedule `EditMark[] = { time, kind: 'insert' | 'delete', grapheme, value }` (backspaces included, carrying the removed grapheme for keystroke SFX). Drive `Text.text` with the track and leave `reveal` at its default — the whole current string shows, deletion just works, and `textCursor` rides the end of the live text with no extra wiring. No changes to `Text`/`draw`; `segmentGraphemes` is now exported too.
