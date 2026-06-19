---
"@glissade/narrate": minor
"@glissade/cli": minor
---

feat(narrate): `gs narration-lint` — catch slow-re-narrate failures at BUILD (narrlint)

Lint the COMMITTED narration timing manifest + the REAL measured caption
geometry, so a re-narrate that overran its beat, a caption too dense to read, or
a caption that overflows its box fails CI now instead of surfacing render-hours
later. Pure over the committed JSON + the injected measurer — no clock, RNG, or
I/O beyond reading the committed files.

- `@glissade/narrate`: a schema bump for anchor budgets — a script-level
  `budgets?: Record<string, number>` (per-id ceilings, segments + pauses share
  the id namespace) and a per-segment `maxSec?` (which wins). Both are committed
  with the script ("animation is data") and persisted into the timing manifest
  (`NarrationTiming.budgets`, `TimedSegment.maxSec`) so the lint reads them from
  the committed JSON. Default-off: omit them and the manifest is byte-identical.
- `@glissade/cli`: `lintNarration(timing, opts): Diagnostic[]` + a
  `gs narration-lint <scene-module|*.narration.timing.json>` subcommand.
  - Tier-1 (HARD, can fail CI / exit non-zero): `reading-speed`
    (chars-per-second over each committed cue vs `--max-cps`, default 17),
    `anchor-budget` (a beat over its `maxSec`/`budgets` ceiling), `caption-fit`
    (a cue that overflows its box / exceeds `maxLines`, using the REAL measured
    geometry — the lint DEFAULTS to the Skia measurer with the render's own
    fonts and drives the actual caption node, so a passing lint can't
    burn-overflow).
  - Tier-2 (WARN-only, never fails CI): `beat-drift`, `silence` sanity.
  - Output: a human table, `--json`, and `--fix` (a git-apply-able budget-bump
    diff for the SCRIPT — it NEVER writes a committed artifact).
