---
"@glissade/cli": minor
---

`gs parity <scene> --backends skia,lottie [--ssim] [--heatmap <dir>] [--min <ssim>]` — a
cross-backend fidelity command: render one scene across backends and report per-frame SSIM
plus a worst-tile heatmap, in one command (productizes the hand-rolled cross-backend read).
Skia is the reference; the `lottie` leg is the export→import→Skia round-trip, so `gs parity`
measures Lottie interchange fidelity directly and localizes any gap with a heatmap PNG. Exits
non-zero on any frame below the SSIM floor (default 0.98). Read-only measurement — zero
determinism impact, no new dependencies, off the base embed. The `dom` backend leg (a
Playwright browser-render harness) fails loud as a not-yet-shipped Phase B; unknown backends
fail loud too — a requested backend is never silently skipped.
