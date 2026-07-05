# The closed authoring loop

*glissade 0.63 — the capstone that ends Era A.*

An agent authors **blind**: it writes scene code without eyes on the result.
Era A gave it eyes in stages — `describe()` on the API *surface*, `critique()` on
the *render*. **0.63 composes the whole verification suite into the one
author → render → critique → self-fix cycle** that was Era A's thesis.

There is **no new verification primitive** here. `assess()` composes the five
already-shipped gates and terminates in a certificate. That is why it is a
capstone.

## The division of labor

> **The framework owns the VERDICT. The agent owns the FIX.**

The framework must *not* own an `author_loop`. Auto-picking a fix lever is a
creative, meaning-laden decision that belongs to the author. So glissade ships:

- **`assess(scene, timeline, opts?)`** — the framework's one composed verdict:
  *"here is everything wrong, and whether you're done."*
- **`recipe(name, props)`** — clean-by-construction starter scaffolds so the loop
  starts near-clean.

…and the agent drives the loop. The framework never makes a meaning decision.

## `assess()` — the composed verdict

```ts
const v = assess(scene, timeline, opts);
//  v.clean         → nothing MECHANICAL remains (the termination signal)
//  v.diagnostics   → the unified, deduped, prioritized problem list
//  v.fixable       → warnings with an IN-BOUNDS geometry lever (the work queue)
//  v.escalated     → warnings the loop can't mechanically close (the human owns these)
//  v.accepted      → knowingly-accepted residual (opts.accepted)
//  v.certKey       → the trust handle (the render's content-address)
//  v.signature     → a stable hash of the diagnostic set (convergence detector)
```

It composes, in order:

| source | role | via |
| --- | --- | --- |
| `validateScene` (static) + `critique` (rendered) | **the verdict** | `critique()` (runs validateScene first, short-circuits on static errors) |
| `exportFidelity` (parity) | verdict, opt-in | `opts.exportBound` |
| `diff(previous, current)` | **blast-radius** (informational) | `opts.previous` |
| `certKey` | **the trust handle** | always |

The merged diagnostics are **deduped** (by code · node · track · source · detail)
and **prioritized** (severity first, then critique's canonical sort).

`clean` = **no error-severity** diagnostic **and no geometry-fixable warning**
remaining — after `accepted` diagnostics are removed and non-mechanical ones
escalated. `clean` is *clean-of-fixable*, not *clean-of-everything*: an accepted
export-drop or an escalated overflow can remain while `clean` is `true`.

> **`clean` is the loop's termination signal, not the ship gate.** The loop is
> mechanically done when `clean` is `true` — but a non-empty `v.escalated` means a
> human still owns something. **Ship iff `clean && v.escalated.length === 0`** (or
> every escalated item has been reviewed and moved into `opts.accepted`).

## The meaning-preservation veto — per-lever `fixClass`

A critique diagnostic carries a **list** of fix hints (in `detail.fixHints`), each
tagged with a **`fixClass`**:

```jsonc
// TEXT_OVERFLOW (width) offers up to three levers of two classes — a geometry
// lever appears ONLY while it stays in-bounds (see below):
"fixHints": [
  { "lever": "fontSize", "fixClass": "geometry", "hint": "reduce fontSize until the line fits" },
  { "lever": "width",    "fixClass": "geometry", "hint": "widen the wrap box…" },
  { "lever": "text",     "fixClass": "content",  "hint": "shorten the text (changes meaning — escalate)" }
]
```

The agent's rule:

> **An in-bounds geometry lever exists → auto-fix (pick a geometry lever, never a
> content one). No mechanical lever left → escalate to a human.**

So `TEXT_OVERFLOW` is auto-fixable via `fontSize`/`width` — the loop just never
picks *"shorten text."* A caption is verified dialog; a mechanically-green caption
that changed the teaching is worse than the overflow.

**Geometry levers are feasibility-bounded.** A geometry fix is a fix only while it
stays in-bounds: `fontSize` will not shrink below the legibility floor
(`MIN_LEGIBLE_PX`, matching `fitText({ minPx })`), and a resize (`width` / `box.h`)
will not grow off-canvas. When *both* geometry levers are out of bounds, only the
content lever remains → the overflow **escalates** instead of the loop converging
to a "clean" but unreadable caption. The string is preserved *and* so is the
result. `OFF_CANVAS` and `OCCLUSION` always expose an in-bounds geometry lever
(move / restack), so they stay auto-fixable. `assess()` partitions this for you:
`v.fixable` (in-bounds geometry) vs `v.escalated` (no mechanical fix — human owns
it), which also catches `RENDER_ONLY_EXPORT` (a fidelity decision with no lever).

## Accept — scoped intent

A knowingly-accepted diagnostic (a deliberate render-only export drop, an
intentional brand contrast) is removed from the *fixable* set so the loop can
terminate clean with a documented residual:

```ts
assess(scene, tl, { accepted: ['RENDER_ONLY_EXPORT', 'hero-drawer', 'OCCLUSION@badge'] });
// matches by code, by node id (SUBTREE — an ancestor suppresses its subtree),
// or by the combined '<code>@<node>' form.
```

## Recipes — starting near-clean

`describe().recipes` is a registry of whole-scene **patterns** an agent discovers
the way it discovers node primitives. `recipe(name, props)` returns a ready `Group`
fragment with typed props:

```ts
import { recipe } from '@glissade/scene/recipes';
const lower = recipe('lower-third', { title: 'Ada Lovelace', subtitle: 'Analyst' });
```

Starter scaffolds: **`lower-third`**, **`title-card`**, **`stat-reveal`**,
**`cold-open`** — the generic scaffold, not bespoke teaching visuals. **Every
recipe passes `assess()` clean at default props** (a test enforces this), so the
loop only fixes the delta *your* prop values introduce.

## The loop — agent-driven

The loop is **not** a framework function. It is this pattern:

```ts
import { assess, fixHintsOf, isGeometryFixable } from '@glissade/scene/diagnostics';

const MAX_ITERS = 20;
let last = '';
for (let i = 0; i < MAX_ITERS; i++) {
  const v = assess(scene, timeline);
  if (v.clean) break;                              // ← clean-of-fixable: done

  if (v.signature === last) {                      // ← convergence: no progress
    throw new Error('author loop STUCK — the diagnostic set did not change');
  }
  last = v.signature;

  const top = v.fixable[0];                         // prioritized; top first
  if (!top) break;                                  // only escalated/accepted left

  // pick a GEOMETRY lever — never a content one (the meaning-preservation veto)
  const lever = fixHintsOf(top).find((h) => h.fixClass === 'geometry')!;
  applyGeometryFix(scene, top, lever);             // ← the agent's fix intelligence
}
// terminate: clean-of-fixable OR no-progress OR MAX_ITERS (fail-loud)
// then: certKey(scene, timeline) is the trust handle for the converged render.
```

Termination is **clean-of-fixable** OR **diff-no-progress** (this round's
`signature` == last round's → stuck) OR **max-iters** (a fail-loud backstop —
never a silent infinite loop).

A runnable end-to-end example lives in
`packages/scene/test/authoringLoop.test.ts`.

## Importing — two-consumer-honest

Bundler consumers: `import { assess, critique, certKey, diff } from '@glissade/scene/diagnostics'`.
No-build (IIFE) consumers: use `window.glissade.assess/critique/certKey/diff` (the
composed API). The low-level classifiers `fixHintsOf`/`isGeometryFixable`/`isContentOnly`
are bundler-only (not on `window.glissade`) and are already applied inside `assess()`'s
partition — a no-build agent never needs them directly.

## Where the loop STOPS — the boundary is the product

The loop closes the **mechanical** half unattended: off-canvas, overflow,
occlusion, parity, determinism — everything `validateScene` + `critique` +
`exportFidelity` catch, all empty-set on clean. It structurally **cannot and must
not** judge:

- **aesthetic** — pacing, emphasis, alive-vs-robotic;
- the **three ship gates** — fact-check, truth-validation, humanize.

A series teaching verification and warning against workslop cannot auto-ship on
mechanical-green. So: **the mechanical loop closes unattended → `certKey` certifies
→ hand up to the human for meaning, truth, and aesthetic.** The framework knowing
where to stop is the point.
