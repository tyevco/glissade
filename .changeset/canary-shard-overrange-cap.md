---
'@glissade/cli': patch
---

`gs render --workers N` now caps the sharded frame range to the timeline extent (`ceil(duration*fps)`), matching the linear path's `-t <duration>` trim. Previously an explicit over-range (e.g. `--range 0..119` on a shorter timeline) or an `--fps` override emitted more frames from the sharded path than the single-worker path — a silent break of the documented N-worker == 1-worker contract. (A copy-mode `-t` on the concat join is not frame-accurate, so the cap is applied to the rendered frames instead.)
