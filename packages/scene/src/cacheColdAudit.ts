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
import { collapseReplacer } from './collapseReplacer.js';
import { diffDisplayLists, type CommandDelta } from './displayDiff.js';
import type { ViolationDetail } from './guards.js';
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
  /**
   * The FIRST command-level delta of the divergent node's isolated emit (set only
   * when a specific leaf diverged — never for a Group fallback or a missing node).
   * The WHOLE `CommandDelta` is embedded — index, kind, opA/opB, and every
   * field change — so a multi-field divergence isn't flattened away. `gs
   * verify-determinism --bisect` consumes this to name the (frame, node, op).
   */
  delta?: CommandDelta;
  /**
   * `true` when the two `createScene()` builds returned SHARED node instances
   * (identity-equal) rather than independent ones — so the twice-eval is
   * INCONCLUSIVE: a shared impure signal is evaluated once and memoized, making
   * the two DisplayLists identical by construction even for an impure node. The
   * audit can neither confirm purity nor localize a divergence. Set alongside
   * `ok:true` (nothing diverged, but the probe was defeated). The caller must
   * surface this LOUDLY, never read it as "pure". Root cause is almost always a
   * scene-frame helper that captures its `children` once and reuses them across
   * calls; the fix is to rebuild children per `createScene()`.
   */
  sharedInstances?: boolean;
}

/**
 * Do the two builds share ANY node instance (identity-equal for the same id)?
 * A `createScene` that returns independent trees shares nothing; a frame helper
 * that captures `children` once and reuses them shares its whole subtree. One
 * shared instance is enough to defeat the twice-eval (a shared impure signal
 * memoizes across both evaluates), so the first hit short-circuits.
 */
function sharesNodeInstances(a: Scene, b: Scene): boolean {
  for (const [id, nodeA] of a.nodes) {
    if (b.nodes.get(id) === nodeA) return true;
  }
  return false;
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
  // Detect the shared-instance trap BEFORE evaluating: if the two builds reuse
  // the same node instances, a shared impure signal memoizes across both evals
  // and the DisplayLists match by construction — the probe is defeated, not pure.
  const shared = sharesNodeInstances(warm, cold);
  const a = evaluate(warm, doc, t);
  const b = evaluate(cold, doc, t);
  if (hashDisplayList(a) === hashDisplayList(b)) {
    return shared ? { ok: true, sharedInstances: true } : { ok: true };
  }

  const frame = doc.fps !== undefined ? Math.round(t * doc.fps) : -1;
  const ctxA: EvalContext = { time: t, frame, measurer: warm.textMeasurer, playhead: warm.playhead };
  const ctxB: EvalContext = { time: t, frame, measurer: cold.textMeasurer, playhead: cold.playhead };
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
    const dlA = ea.finish();
    const dlB = eb.finish();
    if (hashDisplayList(dlA) === hashDisplayList(dlB)) continue;
    if (nodeA instanceof Group) {
      groupFallback ??= id;
      continue;
    }
    // a leaf diverged — the specific culprit. Embed the FIRST command-level
    // delta of its isolated emit so `--bisect` can name the exact (op, field).
    // The per-node emit isolates the node from any parent CTM, so this delta
    // LOCALIZES the divergence (it's a locator, not the byte authority).
    const diff = diffDisplayLists(dlA, dlB);
    const first = diff.deltas[0];
    return { ok: false, node: id, ...(first !== undefined ? { delta: first } : {}) };
  }
  return { ok: false, ...(groupFallback !== undefined ? { node: groupFallback } : {}) };
}

/**
 * Adapt {@link auditCacheCold} into a {@link ViolationLocator} payload for
 * `withDeterminismGuards('throw', fn, locate)`: name the first node whose cold
 * re-eval disagrees (plus its first command-level delta). Returns a `reason`
 * (no node) when the twice-eval was DEFEATED by shared node instances — so the
 * throw says out loud WHY it couldn't localize instead of silently degrading to
 * a bare violation (the gap that let long frame-helper episodes get no culprit).
 * Returns `undefined` only when the probe ran with independent builds and still
 * agreed (a rare timing-only impurity the cold probe can't reproduce — the bare
 * throw then stands). DEV-only — re-evaluates two FRESH scenes, throw branch only.
 */
export function locateViolation(createScene: () => Scene, doc: Timeline, t: number): ViolationDetail | undefined {
  const r = auditCacheCold(createScene, doc, t);
  if (r.ok) {
    // Independent builds agreed → genuinely couldn't reproduce; bare throw stands.
    if (!r.sharedInstances) return undefined;
    // Shared instances defeated the probe → say so LOUDLY (never a silent no-op).
    // `where` (the message fragment) is built HERE, off the sacred base embed.
    const reason =
      "Couldn't localize the divergent node: createScene() returned SHARED node instances across builds, so the determinism probe could not localize the culprit (a shared impure signal memoizes across both re-evaluations). Rebuild the scene fresh on every createScene() call — e.g. a scene-frame helper must rebuild its children each call, not capture them once.";
    return { reason, where: ` ${reason}` };
  }
  return {
    ...(r.node !== undefined ? { node: r.node, where: ` First divergent node '${r.node}'.` } : {}),
    ...(r.delta !== undefined ? { detail: r.delta } : {}),
  };
}
