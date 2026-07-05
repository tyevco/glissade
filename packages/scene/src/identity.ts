// @glissade/scene/identity — the S1 OUT-OF-BAND node-identity producer
// (the DOM-backend readiness prerequisite; see docs/design/dom-backend.md
// "Seam 1 — node identity: OUT-OF-BAND").
//
// `emitWithIds(scene, timeline, t)` runs the SAME pure emit `evaluate()` runs,
// but through an INSTRUMENTED DisplayListBuilder that records, positionally by
// command index, the stable explicit id of the node that emitted each command —
// a `NodeIdStream = (string | undefined)[]` emitted ALONGSIDE the DisplayList,
// never inside it. A node without an explicit id contributes `undefined`.
//
// THE LOAD-BEARING GUARANTEE: the producer is OPT-IN and OFF on every normal
// `evaluate()`/`emit()`/`render()` — `createDisplayListBuilder` does not
// implement the `enterNode`/`exitNode` seam, so `Node.emit`'s guarded calls are
// no-ops and every DrawCommand stays byte-identical (the 262-golden contract).
// The DisplayList produced HERE is deep/byte-equal to the normal `evaluate()`;
// only the side `ids` stream is new. This subpath is tree-shakeable: it is never
// imported by the base scene index, so the embed budget is unchanged.

import {
  evaluateAt,
  type Timeline,
} from '@glissade/core';
import {
  createDisplayListBuilder,
  type DisplayList,
  type DisplayListBuilder,
  type DrawCommand,
  type Resource,
  type ResourceId,
} from './displayList.js';
import { bindScene, type Scene } from './scene.js';
import { type EvalContext } from './node.js';

/**
 * The out-of-band identity stream: one optional stable id per DisplayList
 * command INDEX. Positional, aligned 1:1 with `displayList.commands` — command
 * *i* was emitted by the node whose explicit id is `ids[i]` (or `undefined` for
 * a node without one). Because the emit walk is stable + deterministic (the
 * §3.3 positional discipline `diffDisplayLists` relies on), the stream is stable
 * across re-emits of an unchanged graph at a given `t`.
 */
export type NodeIdStream = readonly (string | undefined)[];

export interface EmitWithIdsResult {
  /** Byte/deep-equal to the normal `evaluate(scene, timeline, t)` DisplayList. */
  readonly displayList: DisplayList;
  /** Positional id stream, `ids.length === displayList.commands.length`. */
  readonly ids: NodeIdStream;
}

/**
 * Wrap a real `DisplayListBuilder` so it records the emitting node's id per
 * command index. It delegates every command/resource to the inner builder
 * UNCHANGED (so the produced DisplayList is byte-identical), and adds only the
 * `enterNode`/`exitNode` seam + an `ids` side array. The inner builder's
 * §3.5 cacheKey methods (mark/cacheKey/patchCacheKey) are forwarded so a
 * `cache:true` node behaves exactly as on the normal path.
 */
function instrument(
  inner: DisplayListBuilder & { finish(): DisplayList },
): DisplayListBuilder & { finish(): DisplayList; ids: (string | undefined)[] } {
  const ids: (string | undefined)[] = [];
  // LIFO stack of the currently-emitting node ids; the top is attributed to
  // each push. `Node.emit` brackets its whole save…restore slice with
  // enterNode(this.id)/exitNode(), and recurses into children between them, so
  // the stack top is always the node whose `draw()` slice we are inside.
  const stack: (string | undefined)[] = [];

  const builder: DisplayListBuilder & { finish(): DisplayList; ids: (string | undefined)[] } = {
    push(cmd: DrawCommand): void {
      ids.push(stack.length > 0 ? stack[stack.length - 1] : undefined);
      inner.push(cmd);
    },
    resource(res: Resource): ResourceId {
      return inner.resource(res);
    },
    enterNode(id: string | undefined): void {
      stack.push(id);
    },
    exitNode(): void {
      stack.pop();
    },
    finish(): DisplayList {
      return inner.finish();
    },
    ids,
  };
  // Forward the OPTIONAL §3.5 cacheKey seam only when the inner builder supplies
  // it, so a `cache:true` node takes the identical mark/cacheKey/patchCacheKey
  // path it would on the normal builder (preserving byte-identity).
  if (inner.mark) builder.mark = () => inner.mark!();
  if (inner.cacheKey) builder.cacheKey = (s, e) => inner.cacheKey!(s, e);
  if (inner.patchCacheKey) builder.patchCacheKey = (i, k) => inner.patchCacheKey!(i, k);
  return builder;
}

/**
 * Opt-in instrumented emit: the SAME pure evaluation as `evaluate(scene, doc, t)`,
 * but additionally producing the out-of-band `NodeIdStream`. Returns
 * `{ displayList, ids }`. The `displayList` is byte/deep-equal to `evaluate()`'s
 * (the producer never alters geometry); `ids` is positional by command index.
 *
 * Off the hot path: this is a tree-shakeable subpath; the normal evaluate/render
 * never touches it, so canvas/export pay nothing.
 */
export function emitWithIds(scene: Scene, doc: Timeline, t: number): EmitWithIdsResult {
  bindScene(scene, doc);
  const fps = doc.fps;
  const ctx: EvalContext = {
    time: t,
    frame: fps !== undefined ? Math.round(t * fps) : -1,
    measurer: scene.textMeasurer,
    playhead: scene.playhead,
    size: scene.size,
    resolveNode: (id) => scene.nodes.get(id),
  };
  return evaluateAt(scene.playhead, t, () => {
    const builder = instrument(createDisplayListBuilder(scene.size));
    scene.root.emit(builder, ctx);
    return { displayList: builder.finish(), ids: builder.ids };
  });
}
