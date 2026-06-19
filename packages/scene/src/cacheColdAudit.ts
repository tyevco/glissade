/**
 * Cache-cold determinism audit (DESIGN.md §2.1/§5.5). The sanctioned
 * memoization (signal caches, the bindScene WeakMap) must be semantics-
 * invisible: re-evaluating a previously-seen `t` with cold caches has to
 * produce a byte-identical DisplayList. This DEV harness checks that by
 * evaluating two FRESH scenes from the same factory at the same `t` — the
 * coldest possible re-eval, which (unlike merely clearing the binding cache)
 * also defeats a signal cache that doesn't depend on the playhead — and, on a
 * mismatch, names the first node whose isolated emit() diverged. An impure node
 * (wall clock, unseeded random, cross-frame state) is exactly what trips it.
 */

import type { Timeline } from '@glissade/core';
import { createDisplayListBuilder, type DisplayList } from './displayList.js';
import { collapseReplacer } from './displayDiff.js';
import type { EvalContext } from './node.js';
import { Group } from './nodes.js';
import { evaluate, type Scene } from './scene.js';

/** Stable string of a DisplayList for comparison (opaque resources collapse to a marker). */
function hashDisplayList(dl: DisplayList): string {
  // Shared byte-preserving collapse-replacer (displayDiff.ts).
  return JSON.stringify(dl, collapseReplacer);
}

export interface CacheColdResult {
  ok: boolean;
  /** id of the first node whose isolated emit() diverged (set only when !ok). */
  node?: string;
}

/**
 * Evaluate two fresh scenes from `createScene` at `t` and confirm the
 * DisplayLists are byte-identical. Returns `{ ok: true }` for a pure scene, or
 * `{ ok: false, node }` naming the first divergent node. DEV-only — never on
 * the render hot path.
 */
export function auditCacheCold(createScene: () => Scene, doc: Timeline, t: number): CacheColdResult {
  const warm = createScene();
  const cold = createScene();
  const a = evaluate(warm, doc, t);
  const b = evaluate(cold, doc, t);
  if (hashDisplayList(a) === hashDisplayList(b)) return { ok: true };

  const frame = doc.fps !== undefined ? Math.round(t * doc.fps) : -1;
  const ctxA: EvalContext = { time: t, frame, measurer: warm.textMeasurer };
  const ctxB: EvalContext = { time: t, frame, measurer: cold.textMeasurer };
  // A Group's emit() recurses into its children, so it diverges whenever any
  // descendant does — prefer the specific leaf, falling back to the Group only
  // if its own transform/props (not a child) are what diverged.
  let groupFallback: string | undefined;
  for (const [id, nodeA] of warm.nodes) {
    const nodeB = cold.nodes.get(id);
    if (!nodeB) return { ok: false, node: id };
    const ea = createDisplayListBuilder(warm.size);
    nodeA.emit(ea, ctxA);
    const eb = createDisplayListBuilder(cold.size);
    nodeB.emit(eb, ctxB);
    if (hashDisplayList(ea.finish()) === hashDisplayList(eb.finish())) continue;
    if (nodeA instanceof Group) {
      groupFallback ??= id;
      continue;
    }
    return { ok: false, node: id }; // a leaf diverged — the specific culprit
  }
  return { ok: false, ...(groupFallback !== undefined ? { node: groupFallback } : {}) };
}
