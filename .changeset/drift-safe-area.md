---
'@glissade/scene': patch
---

Particles `drift` preset: safe-area default + `safeBottom` clamp (0.57.1 fast-follow).

The `drift` preset's default spawn band now clears a standard lower-third caption safe-area by
itself (origin [0.5,0.5], area height 0.36H → spawn band ~[0.32H, 0.68H]; motes drift up from the
0.68H bottom), so a bare `drift()` honors safe-area by default instead of spraying ambient motes
into the caption band.

New `safeBottom?` on the emitter (relative [0,1], forwarded by `drift`/`sparks`/`dispense`): clamps
the spawn region so no particle spawns below `safeBottom * box.h` — the precise opt-in for a consumer
who knows their exact captionTop. Fail-loud (a `ParticleError`) on non-finite, out-of-[0,1] (catches
a pixel captionTop passed by mistake), or a `safeBottom` above the spawn band top (no valid region).

Also surfaces `area` explicitly in drift's `describe().usage` (it was already a forwarded option, only
implicit in `...rest`). Determinism-neutral (pure spawn-region arithmetic, no new RNG); goldens
byte-identical (golden-particles pins an explicit area+origin).
