---
'@glissade/scene': patch
'@glissade/browser': patch
---

0.38.0-pre.1: Gauge nit fixes (ai-training + video-canary + edcc consumer reads)

Three seats promoted 0.38.0 green (Gauge subsumes ai-training's trust-dial ~85%);
these close the non-blocking nits they flagged:

- **Soft glow**: `glow: { blur }` adds a Gaussian blur filter to the center glow
  Circle — a real soft center-glow instead of the default hard-edged disc (all
  three seats saw the flat disc). Default (no blur) unchanged.
- **README discoverability**: the shipped `@glissade/scene` README now has a
  `Gauge()`/`Meter()` section + lists the subpath (a README-reader had no path to
  the feature — describe() carried the full surface, but the prose didn't ship).
- **Recurring-gap CI guard** (`check:readme`): asserts every user-facing scene
  subpath (`chart`/`gauge`/`grid`/`component`/`type`/`motion`/`path`) is mentioned
  in the shipped README — converts a 4-release miss (0.34/0.35/0.37/0.38) into a
  one-time gate, per ai-training's process ask.

Deferred to a fast-follow card: a Gauge label-position hook + optional `hub`
sub-id (ergonomics parity, zero correctness impact). Determinism/goldens unchanged.
