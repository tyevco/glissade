---
"@glissade/scene": minor
---

0.20: S1 NodeIdStream identity-stream producer (`emitWithIds`, opt-in, off-by-default — DOM-backend readiness)

The Seam-1 producer from the `backend-dom` design memo (docs/design/dom-backend.md
"Seam 1 — node identity: OUT-OF-BAND") now ships as a new tree-shakeable subpath
**`@glissade/scene/identity`**:

```ts
import { emitWithIds, type NodeIdStream } from '@glissade/scene/identity';

const { displayList, ids } = emitWithIds(scene, timeline, t);
// ids.length === displayList.commands.length;
// ids[i] = the stable explicit id of the node that emitted command i (or undefined).
```

`emitWithIds` runs the **same pure emit** as `evaluate()`, but through an
instrumented `DisplayListBuilder` that records, positionally by command index, the
emitting node's stable explicit id — a `NodeIdStream = (string | undefined)[]`
emitted *alongside* the DisplayList, **never inside it**. A node with no explicit
id contributes `undefined`. Because the emit walk is already stable +
deterministic, the stream is stable across re-emits of an unchanged graph at a
given `t`. The DOM backend (a future milestone) consumes this to stamp
`data-node-id` and key a retained-DOM reconciler.

**Off by default — byte-identical normal path.** The mechanism is an out-of-band
seam: `Node.emit` brackets each node's `save…restore` slice with guarded
`out.enterNode?.(this.id)` / `out.exitNode?.()` calls. The default
`createDisplayListBuilder` does NOT implement them, so they are no-ops on every
normal `evaluate()` / `emit()` / `render()` — **every DrawCommand stays
byte-identical** (the 262 goldens are frozen) and `emitWithIds`'s DisplayList is
byte/deep-equal to `evaluate()`'s. The subpath is never imported by the base scene
index (a `check:size` metafile guard asserts it), so the **base embed budget is
unchanged** (~35.55 kB gz); it is npm-subpath-only and is NOT re-exported onto the
`@glissade/browser` IIFE (zero IIFE delta). The only new symbols on the base scene
index are the optional `enterNode`/`exitNode` methods on the `DisplayListBuilder`
interface.
