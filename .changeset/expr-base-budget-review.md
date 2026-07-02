---
'@glissade/core': patch
'@glissade/scene': patch
---

0.40.0-pre.1: keep the base embed ≤39 for Expr via a budget-review relocation (revert the 39→40 bump)

Expr adds an irreducible base sampler seam (~0.17 kB: `sampleTrack`'s `tr.expr`
branch + `compileTimeline`'s `validateTrack` skip-keys for expr tracks). pre.0
bumped the base embed 39→40 to seat it — but that contravened the "preserve the
base-embed budget" constraint, and all three canary seats correctly held their
promote vote for a human ruling rather than bless it.

Instead of bumping the SACRED ceiling, this recovers headroom the proven way (the
0.20 budget-review playbook): `retime` — a pure build-time key-time transform
(speed/shift/reverse/pingpong), never on the sampleTrack/evaluate hot path — plus
its private `reversedKeys`/`mirrorEase` helpers (string-heavy) move OFF the base
core index onto `@glissade/core/clips`. That recovers ~0.5 kB gz, so the base embed
lands at **38.44/39 WITH Expr's seam** — the ceiling stays 39, no bump.

- `retime` / `RetimeSpec` now import from `@glissade/core/clips` (not
  `@glissade/core`). `window.glissade.retime` is unaffected (the IIFE re-exports
  `@glissade/core/clips`). `core/clips` budget 8→9 (off the base embed).
- Determinism hash + all goldens unchanged.
