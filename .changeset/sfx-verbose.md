---
'@glissade/cli': minor
---

`gs sfx --verbose` echoes each resolved hit as `<time>s  <voice>` (plus gain/rate when jittered), so anchor coupling validates at a glance instead of reading the committed timing.json. `prepareSfx` now returns the resolved `clips` for programmatic use.
