---
"@glissade/cli": minor
---

`gs parity <scene> --baseline <file> [--update-baseline] [--tolerance <eps>]` — turn the
red-by-design fidelity readout into a real regression gate. Instead of flooring every frame
at an absolute 0.98 SSIM (which the documented scope-outs — non-center-anchor transforms,
gradient/mesh fills, variable-font axes, text-wrap, media — legitimately fail), `--baseline`
compares each per-frame per-backend mean against a committed per-scene baseline of EXPECTED
drops and alerts only on a DEVIATION: a new/worse drop is a `⚠ REGRESSION` (non-zero exit),
while a documented scope-out that matches its pin PASSES even below the floor (`✓
expected-drop`). A frame/backend with no pin is `＋ NEW` (fail — accept it explicitly), and a
mean risen above its pin is `▲ improved` (pass, re-pin tighter). `--update-baseline` (re)writes
the baseline from the live run (mirrors `gs repin`'s write/compare split; exits 0); `--tolerance`
sets the expected-SSIM band (default 1e-4). The baseline header (width/height/fps/reference) is
validated against the live run — a config mismatch fails loud. `--baseline` takes precedence over
`--min`. Additive and CLI-only: non-gate runs are byte-identical to before, no scene/core/backend
change, no new dependencies, off the base embed path, zero determinism impact (read-only
measurement + a static JSON read; writes only under explicit `--update-baseline`).
