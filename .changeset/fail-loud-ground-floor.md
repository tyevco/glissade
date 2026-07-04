---
'@glissade/scene': minor
---

**0.59 "fail-loud ground floor"** — close the perception gap so an agent can validate, inspect, and self-fix its own scenes. The ground under `critique()` (0.60).

- **`validateScene(scene, timeline)`** (on `@glissade/scene/diagnostics`) — an eager, render-neutral pre-render validator that aggregates ALL problems in one pass (not throw-on-first): unresolvable track targets (with a **Levenshtein nearest-id suggestion** — "did you mean `box/rotation`?"), Yoga-managed-child position tracks, off-canvas nodes, measurer fallbacks. Machine-readable, **schema-pinned from day 1**: `{ schemaVersion, code, severity, message, node?, track? }` with a closed `severity` enum and stable, additive-only codes (`UNKNOWN_TARGET`, `ID_COLLISION`, `OFF_CANVAS`, `YOGA_CHILD_POSITION`, `MEASURER_FALLBACK`). This is the shared diagnostic contract 0.60 `critique()` and 0.61 `gs parity --semantic` build on.

- **Production mode** — `mount({ production: true })` downgrades the existing unresolved-target `UnboundTargetError` from a throw to a logged warn + skipped track, so a shipped embed degrades gracefully instead of crashing a viewer. **Loud remains the default everywhere** (authoring, CI, `gs render`); the quiet path is opt-in at the shipping step. Byte-neutral: dev and production render valid scenes byte-identically — only the invalid-scene response differs.

- **`resolveAt(scene, target, t)`** (on `@glissade/scene/diagnostics`) — read a node's *resolved* property value at time `t`. A bound prop returns its real bound value (not the static default that inspection otherwise shows), closing the "looked broken but the binding was fine" trap. Load-bearing for `critique()`.

- **Bound-prop inspection** — `instanceProps(node)` reports which props are *currently bound on this instance*, so an agent inspecting its work knows when a static read is untrustworthy and must use `resolveAt`.

- **Measurer fail-loud opt-in** — `splitText`/`fitText` accept `{ requireMeasurer: true }` to throw (`MeasurerRequiredError`) instead of silently degrading to the rough estimator when no real text measurer is set.

- **Manifest conventions** — `describe()` entries now carry `unit` (e.g. seconds), `bindable`, and `requiresMeasurer` so anchor/unit/binding conventions are discoverable in the machine-readable surface rather than tribal knowledge.

Additive: all 415 goldens byte-identical, determinism unchanged, the diagnostic surface lives off the base embed (base 38.67 kB gz, ceiling held at 39).
