---
"@glissade/scene": minor
---

Kinetic type presets — one-call animated typography (`@glissade/scene/type`).

New `typeOn`, `revealWords`, `revealLines`, and `emphasizeWords` wrap the existing text primitives so authors stop hand-wiring `splitText` → `tl.stagger` and `typewriter` → `textCursor`.

- `typeOn(source, { perChar, cursor?, mask? })` — one-call typewriter. Defaults to the string-track mechanism (drives `<id>/text`), which round-trips to Lottie as stepped text documents; `cursor: true` adds a caret and `mask: true` uses a grapheme reveal — both render-only and honestly warned on export.
- `revealWords` / `revealLines(source, { each, from, duration, ease })` — staggered per-word / per-line reveal over `splitText`, returning `{ node, tracks }` (draw the returned group). Real position/opacity/scale tracks → Lottie-faithful.
- `emphasizeWords(source, indices, opts)` — a per-word pulse on the given indices; an out-of-range or non-integer index fails loud.

All presets are pure closed-form track emission (deterministic, goldens byte-identical) on the tree-shakeable `/type` subpath — the sacred base embed is unchanged. (An animated `counter()` primitive was scoped but deferred — no current consumer.)
