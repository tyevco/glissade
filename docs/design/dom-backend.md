# Design memo: `@glissade/backend-dom` (0.20)

**Status: design-probe, NOT a commitment.** This memo names and *resolves the
seams* a real `@glissade/backend-dom` would need, so a future milestone can build
it without re-litigating direction. It ships **no backend** — only this memo plus
a throwaway, read-only spike (`packages/scene/spike/dom-backend-spike.ts` + its
test) that de-risks the load-bearing claim below. Nothing here touches the
`evaluate`/render path, so all 262 goldens stay byte-identical and the base embed
budget is unchanged.

Cross-references are to `docs/DESIGN.md`: §3.3 (the DisplayList IR), §3.4 (the
`RenderBackend` contract), §3.7 (the WebGPU-reserved seam this slots beside on the
roadmap), and §7.5 (roadmap / v2 themes — DOM/SVG rendering was listed there as
"roadmap, not v1", §1.5 "Out of scope for v1").

## Why a DOM backend at all

A DOM/SVG renderer is not a parity twin of Skia and never will be (see
"Parity" below). Its value is elsewhere:

- **Accessibility & selectable text** — real DOM text nodes, focusable elements,
  copy-paste, screen-reader semantics that a `<canvas>` cannot offer.
- **CSS-native embedding** — animated vector content that participates in page
  layout, inherits fonts, and themes via CSS custom properties.
- **Zero-raster preview** — a structural smoke view of a scene with no canvas
  allocation, useful in docs, SSR-ish snapshots, and DOM-diff debugging.

It is a **preview / non-parity** consumer of the same IR, in the same slot the
spec reserves for "future WebGPU" (§3.7): a backend that consumes the identical
`DisplayList` but is explicitly outside the byte-exact / SSIM parity guarantees.

## Seam 1 — node identity: OUT-OF-BAND (recommended)

**The tension.** The DisplayList is deliberately *identity-less*: DESIGN.md §3.3
states "DrawCommands carry **no node id** (stamping one is an IR change that would
ripple into every backend and the §3.5 cacheKey / parity goldens)." Confirmed in
`packages/scene/src/displayList.ts` — every `DrawCommand` variant is geometry +
paint only; there is no `id`/`nodeId` field anywhere in the union. A DOM renderer,
however, wants *stable element identity* to diff/patch a retained DOM tree across
frames (so `evaluate→render` at t and t+1 reuses the same `<path>`/`<div>` rather
than tearing down and rebuilding the subtree every frame).

**Two ways to supply identity:**

| | IN-BAND (an `id` field on `DrawCommand`) | OUT-OF-BAND (a parallel id stream) — **RECOMMENDED** |
|---|---|---|
| IR change | Yes — adds a field to the §3.3 union | None — DrawCommands stay byte-identical |
| Golden impact | **Regenerates every golden** (the serialized command stream changes), and taxes the §3.5 `cacheKey` (the id would have to be excluded or it poisons cache equality) | **Zero** — all 262 goldens freeze; canvas/Skia never see it |
| Cost to canvas/Skia | Carries a DOM-only field through both rasterizers + the parity suite for no benefit | None — they never read the side stream |
| Serialization | Bloats `.dl.json` snapshots (the §3.3 `dlSnapshotVersion` interchange schema) | Snapshot schema untouched; the id stream is a separate, optional artifact |

**Decision: OUT-OF-BAND.** IN-BAND is **REJECTED** — it regenerates every golden
and taxes the canvas/Skia/cacheKey path for a DOM-only need, exactly the "ripple
into every backend" cost §3.3 calls out.

**How the out-of-band stream is produced.** Identity is already latent in the
scene graph: `evaluate()` walks the node tree in a **stable, deterministic order**
— child-array order, locally reordered by `zIndex` via a *stable* sort
(`Group.draw` in `packages/scene/src/nodes.ts`: `.sort((a,b) => zIndex diff || index)`).
Because the walk order is fixed and pure, the *k*-th command a node emits lands at
the same relative position every frame for an unchanged graph. The producer is a
thin instrumented emit: as each node calls `out.push(cmd)`, record the emitting
node's stable id (the §6.5 explicit-id index, `Scene.nodes`) against the current
command index. The result is a `NodeIdStream = (string | undefined)[]`, positional
by command index, emitted *alongside* the DisplayList — never inside it. Nodes
without an explicit id contribute `undefined` (the DOM backend falls back to a
structural/positional key for those, the common case for synthesized sub-nodes).

This is the same positional-alignment discipline the §3.3 `diffDisplayLists`
diagnostic already relies on (command *i* of A vs command *i* of B). The id stream
is opt-in instrumentation, off by default, so realtime canvas/export pays nothing.

**How it's consumed.** The DOM backend renders each command to an element and, if
an id is present at that index, stamps `data-node-id="<id>"`. Across frames it
keys its retained-DOM reconciler on `(data-node-id, op)` — reusing and patching
the matching element rather than replacing it. The spike proves the *stamping*
half end-to-end: a fixed DisplayList whose commands carry no id field, rendered
with a separate id stream, yields a DOM tree with the expected `data-node-id`
attributes (and a structurally-correct tree even when *no* id stream is supplied —
the IR alone carries the geometry; identity only enables efficient patching).

**Open detail (deferred to the build milestone):** the exact reconciler keying
when ids collide or reorder (e.g. a keyed-list move). The spike does a single
forward render; cross-frame diffing is the real backend's job. The positional
producer + `(id, op)` key is the committed *shape*; tuning the move/reorder
heuristic is build-time work.

### S1 is BUILT — the `emitWithIds` producer (0.20, off by default)

The Seam-1 producer now ships as the opt-in **`@glissade/scene/identity`** subpath:

```ts
import { emitWithIds, type NodeIdStream } from '@glissade/scene/identity';

const { displayList, ids } = emitWithIds(scene, timeline, t);
// ids.length === displayList.commands.length;
// ids[i] is the stable explicit id of the node that emitted command i,
// or `undefined` for a node without one.
```

`emitWithIds` runs the **same pure emit** `evaluate()` runs, but through an
**instrumented `DisplayListBuilder`** that records, positionally by command
index, the emitting node's id — a `NodeIdStream = (string | undefined)[]`
emitted *alongside* the DisplayList, never inside it. The mechanism is a tiny
out-of-band seam on the builder interface: `Node.emit` brackets each node's whole
`save…restore` slice with `out.enterNode?.(this.id)` / `out.exitNode?.()`, and the
instrumented builder keeps a LIFO id stack, tagging every `push` with the stack
top. Because the emit walk is already stable + deterministic (the §3.3 positional
discipline `diffDisplayLists` relies on), the stream is stable across re-emits of
an unchanged graph at a given `t`.

**Off-by-default guarantee (the load-bearing proof).** The default
`createDisplayListBuilder` does NOT implement `enterNode`/`exitNode`, so those
guarded calls in `Node.emit` are no-ops on every normal `evaluate()` /
`emit()` / `render()` — **every DrawCommand stays byte-identical** and the 262
goldens are frozen. The DisplayList produced by `emitWithIds` is byte/deep-equal
to `evaluate()`'s; only the side `ids` stream is new. The subpath is
tree-shakeable and never imported by the base scene index (a `check:size`
metafile guard asserts it), so the base embed budget is unchanged (~35.55 gz);
it is npm-subpath-only (NOT re-exported onto the `@glissade/browser` IIFE — zero
IIFE delta). The DOM backend (S2+) consumes `ids` to stamp `data-node-id` and key
its retained-DOM reconciler; canvas/Skia/export never see it.

## Seam 2 — backend injection: a `mount` factory param (target)

**The pin today.** `packages/player/src/mount.ts` (~line 41) hardcodes
`const backend = new Canvas2DBackend(canvas)`, and `scripts/check-deps.mjs` pins
`player: ['core', 'scene', 'backend-canvas2d']` — so `player` may import *only*
canvas2d among backends. A DOM backend cannot be reached from `mount()` as written.

**Options considered:**

1. **`mount(el, scene, doc, { backend })` factory param** — `mount` accepts a
   backend *factory* (or instance) in `PlayerOptions`, defaulting to
   `Canvas2DBackend`. The DOM backend is passed by the caller.
2. **A separate `@glissade/player-dom` mount** — a sibling entry that wires the
   DOM backend, leaving `mount()` canvas-only.
3. **A `setShaderRunner`-style global register** — the DOM backend self-registers
   at load (the §3.7 `setShaderRunner` / `loadYogaLayoutEngine` pattern), and
   `mount` picks the registered backend.

**Decision: option 1 — the `mount` factory param.** Rationale:

- It is the smallest, most explicit seam: one optional `PlayerOptions.backend`
  (a `RenderBackend` factory `(canvasOrEl) => RenderBackend`), defaulting to the
  current `Canvas2DBackend` so every existing call site is byte-for-byte
  unchanged. Today's `mount` already returns `backend` on `Mounted` and injects it
  as the `TextMeasurer` (`scene.setTextMeasurer(backend)`), so the abstraction
  boundary already exists — only the *construction* line is hardcoded.
- Option 2 duplicates the whole `mount` body (font loading, reduced-motion
  planning, swap/HMR) for one swapped line — a maintenance fork.
- Option 3 hides the choice in load-order side effects, which is right for an
  *optional GPU effect runner* (§3.7) but wrong for a *base rendering target* the
  embedder chooses explicitly.

**check-deps consequence (noted, not done this milestone).** Option 1 means
`player` must NOT statically import `backend-dom` — the default stays
`backend-canvas2d`, and the DOM backend is injected by the *caller*, who lives
above `player` in the graph (e.g. `element`/`react`/an app). So the §7.1 map gains
a new package `backend-dom: ['core', 'scene']` (a peer of the other backends), and
`player`'s allow-list is **unchanged** — the param keeps DOM out of player's static
deps, preserving the "embed path never transitively imports a non-default backend"
promise. The one real change is the new map entry for the backend package itself.
No refactor lands in this memo; this records the direction.

**Status update (0.20).** The injection param itself has now shipped as the S3
*foundation*: `PlayerOptions.backend?: (target) => RenderBackend` is live in
`@glissade/player` (`mount.ts` constructs `opts.backend(canvas)` when supplied,
else `new Canvas2DBackend(canvas)`), and `Mounted.backend` widened to the
abstract `RenderBackend`. The default is byte-for-byte unchanged — all 262
goldens stay byte-identical, `check-deps` is unchanged (player added no static
backend import; the param's type is the abstract contract, not any DOM backend),
and the base embed budget is unchanged. What remains for S3 is the *caller* (the
real `@glissade/backend-dom` package + the cross-frame reconciler); the seam they
plug into now exists.

## Seam 3 — parity: PREVIEW / NON-PARITY

There is no canvas in a DOM/SVG renderer, so **both** parity guarantees are moot:

- **Skia byte-exact** (§3.4 "per-path byte-exactness on a pinned toolchain") —
  inapplicable: there are no rasterized bytes to hash. A DOM backend is explicitly
  **not a Skia-export twin**; it is never on the `gs render` path.
- **browser↔Skia SSIM** (§3.4 perceptual floor, §7.3 parity suite) — inapplicable:
  SSIM compares *two rasterizations*, and the DOM tree is structure, not pixels.
  Browser SVG/HTML rasterization is the user agent's, outside our determinism
  contract entirely.

**What "correct" means for the DOM backend** is therefore a **structural / visual-
smoke** contract, not a pixel contract:

- The DOM tree has the **right elements** for each consumed op (`fillPath` →
  `<svg><path>`, `fillText` → a positioned text element, `transform` → a nested
  element carrying the matrix, group/clip → nested wrappers).
- **Transforms compose** as nested element transforms matching the IR's CTM
  stack (a child's effective transform = product of its ancestor wrappers).
- Geometry round-trips: a path's `d` attribute reconstructs the `PathSeg[]`;
  text content, position, font, and fill match the command fields.

**How it's tested.** A jsdom structural assertion suite (the spike's test is the
seed): render a fixed DisplayList, assert the DOM shape, attributes, and nesting.
Explicitly **no** golden PNG and **no** SSIM — those would assert a parity the
backend does not claim. An optional later layer is a real-browser visual smoke
(does it look roughly like the canvas render) gated like the §7.3 Playwright
suites, but that is "looks plausible", never "matches Skia".

## The staged path to a real backend

| Stage | Scope | Exit criterion |
|---|---|---|
| **S0 — this memo + spike** | Resolve the three seams; prove out-of-band identity stamping with a throwaway read-only renderer over a fixed DisplayList | Memo merged; jsdom spike test green; zero golden/embed impact |
| **S1 — the identity stream** | Add the opt-in instrumented-emit producer of `NodeIdStream` in `scene` (off by default; canvas/export untouched), with a determinism test that the stream is stable across re-emits | DisplayList bytes unchanged (goldens frozen); id stream stable + positional |
| **S2 — `@glissade/backend-dom` (forward render)** | A real package implementing `RenderBackend` (incl. `measureText` via DOM measurement) for the full op set (clip, strokePath, drawImage, pushGroup/popGroup → nested SVG groups/`<foreignObject>`); new §7.1 map entry `backend-dom: ['core','scene']` | A scene renders to a correct DOM tree; structural test suite green |
| **S3 — injection + reconciliation** | The `mount({ backend })` param (Seam 2) — **landed in 0.20**, `Canvas2DBackend` default unchanged; remaining: a cross-frame retained-DOM reconciler keyed on `(data-node-id, op)` consuming the S1 stream | A scene mounts with the DOM backend and scrubs by patching, not rebuilding; `check-deps` green with player's allow-list unchanged |
| **S4 — a11y + CSS-native polish** | Selectable text, focus order, CSS-variable theming of fills/strokes; real-browser visual-smoke gate | a11y smoke passes; documented as preview/non-parity |

## Open questions that remain

1. **Reconciler keying under reorder/collision** (Seam 1 deferred detail): the
   keyed-list-move heuristic when two frames disagree on child order. Shape is
   committed (`(id, op)` key over the positional stream); tuning is S3 work.
2. **Filters & blend modes.** §3.3 `FilterSpec` maps cleanly to CSS `filter`, and
   `BlendMode` to CSS `mix-blend-mode` — but this is the *third* place the filter
   set is expressed (canvas-filter string, Skia, now CSS), and CSS blend semantics
   differ subtly from canvas `globalCompositeOperation`. Decide per-filter: native
   CSS vs. unsupported-with-warning (the §3.4 `caps` negotiation already exists —
   a DOM backend would advertise a reduced `caps.filters`).
3. **Text measurement source.** `RenderBackend extends TextMeasurer`; a DOM
   backend would measure via a hidden measuring element or the Canvas2D measurer.
   Using a *different* measurer than the export path means line breaks can differ —
   acceptable under the non-parity stance, but it must be stated, not silent.
4. **`Video`/`Image` and `pushGroup` shaders.** `<video>`/`<img>` map naturally;
   `pushGroup` with a `ShaderRef` (§3.7) has no DOM analogue — the DOM backend
   advertises `caps.shaders = false` and degrades per the existing negotiation.
5. **Is preview-only enough to justify a shipped package?** The a11y/CSS-native
   story is the gate. If the only consumer is docs snapshots, this stays a spike;
   if a11y embedding is a real product need, S2+ is justified. Left open for the
   build-milestone decision.

---

*This memo resolves direction; it ships no backend. The companion spike
(`packages/scene/spike/`) is throwaway, not exported, and not published.*
