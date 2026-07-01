# Migrating between glissade versions

Glissade is lockstep-versioned `0.x` and evolves fast. Occasionally a symbol moves
to a more precise import subpath (`tokenHighlight` → `@glissade/scene/tokens`,
`motionPath` → `@glissade/scene/motion`), a construction-only prop becomes
animatable, or a rarely-used helper is renamed. Historically, adopting a run of
minors on a long-lived branch meant hand-repointing those imports and *guessing*
what else changed — a scary, unreviewable batch.

`gs migrate` turns that guesswork into an exhaustive, generated report.

## How it works

The [`describe()`](/for-agents) manifest already pins, per release: the engine
version, the full node/prop taxonomy (with each prop's value-type and whether a
Track can drive it), every helper's import subpath and signature, the builder
methods, the value types, and the easings. **The diff between two manifests is the
migration surface** — and because the report is generated from the live registry,
it can't claim a move that didn't happen. The no-drift guarantee (the same one
that keeps `describe()` honest) extends to migration itself.

## The two commands

### `gs describe` — snapshot an engine's API

```sh
gs describe --out api-0.30.json      # write this engine's manifest to a file
gs describe                          # …or print it to stdout
gs describe --examples --out api.json # include the runnable example snippets
```

Commit the manifest alongside each release you ship on (or just snapshot the
version you're migrating *from*, if you still have it installed). This JSON is the
baseline `gs migrate` diffs against.

### `gs migrate` — diff a baseline against the current engine

```sh
gs migrate api-0.30.json             # human-readable report
gs migrate api-0.30.json --json      # machine-readable (feed an agent / codemod)
```

```
gs migrate: 0.13.0 → 0.31.0
  3 breaking · 5 additive · 8 total

BREAKING — action needed:
  → [helper] tokenHighlight: import moved @glissade/scene/diagnostics → @glissade/scene/tokens
      ↳ import { tokenHighlight } from '@glissade/scene/tokens'
  ✗ [node]   LegacyThing: node type removed (was imported from @glissade/scene)
      ↳ this node no longer exists — replace it or pin the last engine that had it
  ~ [prop]   Text.wrap: value type number → vec2
      ↳ a Track on Text.wrap now expects a vec2 value — VERIFY every keyframe

ADDITIVE — new in this engine:
  + [node]   MotionBlur: new node type (import from @glissade/scene)
  + [helper] lookAt: new helper (import from @glissade/scene/motion)
```

## What it classifies

Every change is either **breaking** (a consumer on the old engine could break — you
must act) or **additive** (new capability — informational):

| Category    | Breaking                                   | Additive                     |
| ----------- | ------------------------------------------ | ---------------------------- |
| node        | removed · import subpath moved             | new node type                |
| prop        | removed · value-type changed · animatable→non-animatable | new prop · non-animatable→animatable |
| helper      | removed · import moved · signature changed | new helper                   |
| builder     | method removed · signature changed         | new `tl.*` method            |
| value type  | removed                                    | new value type               |
| easing      | removed                                    | new easing                   |

The kind markers in the report: `→` moved · `✗` removed · `~` changed · `+` added.

## A note on very old baselines

`gs migrate` reports the diff between two manifests, so it can only tell you what
*those two manifests recorded*. A field that a `describe()` release didn't have yet
is simply absent on the old side — migrate treats a missing collection as empty and
diffs the rest (it never crashes on an old-but-valid manifest). One consequence
worth knowing: a symbol only shows up as **moved** when the baseline recorded it at
its *old* import path. Helpers were added to `describe()` after the 0.20 import
moves, so a baseline older than that never recorded `motionPath` at its root path —
migrate will list it as **additive at its current path** (`motionPath: import from
@glissade/scene/motion`), which is still exactly the actionable import you need,
just classified as "new here" rather than "moved." Move-detection is exact for any
change *after* the field entered the manifest. Snapshot each release with
`gs describe --out` going forward and this limit disappears for future jumps.

## What it does *not* do (yet)

This is an **advisory** tool: it hands you the precise change list plus a suggested
action per breaking item, but it never touches your files. It doesn't rewrite your
imports for you — the `--json` report is designed to be exactly the input an AST
codemod (or an AI agent driving your editor) consumes to apply those edits. Pair it
with `gs diff` and the [golden workflow](/caching) to confirm the render is
byte-identical after you adopt the changes.

## An agent-native loop

Because `gs migrate --json` is a structured, exhaustive, drift-proof description of
exactly what changed and where — with a suggested fix per item — an AI agent can
read it, apply the import repoints and signature updates across your source, then
re-render your golden probes to confirm nothing shifted. The report is the safe
bridge that lets a long-lived branch *track main* instead of accruing engine debt.
