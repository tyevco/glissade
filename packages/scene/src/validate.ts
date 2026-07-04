/**
 * 0.59 "fail-loud ground floor" — the eager, render-NEUTRAL scene validator plus
 * the truthful read primitive (`resolveAt`) and the instance-level bound
 * indicator (`instanceProps`). All DIAGNOSTIC surface: it lives on the
 * tree-shakeable `@glissade/scene/diagnostics` subpath (re-exported from
 * `diagnostics.ts`), NEVER on the base scene index — the base embed pays zero
 * bytes for it, exactly like the diff/audit/fontUsage cluster.
 *
 * THE THREE INVARIANTS THIS MODULE UPHOLDS:
 *  - `validateScene(scene, doc)` is a PURE READ: it walks track targets through
 *    the EXISTING `scene.resolveTarget` (no new resolution machinery), reads node
 *    flow-flags, and reports. It NEVER draws RNG, warms a signal memo,
 *    populates a measurer/font cache, or mutates a node — so `render(scene)` is
 *    byte-identical whether or not `validateScene` ran first. (Flowable-ness is
 *    probed with the STATELESS estimating measurer, not the scene's injected one,
 *    so no backend font cache is touched.)
 *  - It AGGREGATES every failure (never throw-on-first) and returns them.
 *  - The schema is PINNED: a closed `severity` enum + stable, additive-only
 *    string `code`s + a `schemaVersion` — the shared contract with the CLI lint
 *    JSON shape and the future `gs parity --semantic`.
 */

import { evaluateAt, untracked, type Timeline, type ValueTypeId } from '@glissade/core';
import { type Node } from './node.js';
import { type Scene } from './scene.js';
import { estimatingMeasurer, isEstimatingMeasurer } from './text.js';

/**
 * Bumped ONLY on a breaking change to the diagnostic shape. New CODES and new
 * OPTIONAL fields are additive and do NOT bump it — a consumer keys on `code`
 * and tolerates unknown ones.
 */
export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;

/** Closed severity ladder. `error` = a build error (unbound target); `warning`
 *  = a probable-mistake (position of a flow child); `info` = a valid-but-notable
 *  observation (estimating measurer). */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Stable, ADDITIVE-ONLY diagnostic codes (never renamed/removed — the wire
 * contract). Chosen with BOTH `validateScene` and the future
 * `gs parity --semantic` surface in mind.
 *
 * This enum is the shared diagnostic VOCABULARY — NOT "everything validateScene
 * emits." Each code maps to a distinct ENFORCEMENT POINT:
 * - `UNKNOWN_TARGET` — EMITTED by validateScene: a track targets an id/prop that
 *   resolves to no signal.
 * - `MEASURER_FALLBACK` — EMITTED by validateScene: the scene carries Text but no
 *   real measurer is injected, so layout uses the rough per-character estimate.
 * - `YOGA_CHILD_POSITION` — EMITTED by validateScene: a track drives
 *   `position`/`position.*` of a FLOWABLE child of a Layout, whose flex slot
 *   overrides/confounds that position.
 * - `OFF_CANVAS` — RESERVED for `critique()` (0.60): a node's RENDERED box lands
 *   fully outside the viewport. It is a composed-geometry check (needs ancestor
 *   Group world transforms from the DisplayList), so validateScene — which reads
 *   only static LOCAL positions — does NOT emit it (a nested child would
 *   false-positive). Kept in the enum as the additive-only wire contract so 0.60
 *   critique() can emit it without a schema bump.
 * - `ID_COLLISION` — ENFORCED at `createScene()` (throws `DuplicateNodeIdError`):
 *   a built Scene structurally cannot contain a duplicate id, so validateScene
 *   never reaches this case. Kept for the shared contract / `gs parity` surface.
 */
export type DiagnosticCode =
  | 'UNKNOWN_TARGET'
  | 'ID_COLLISION'
  | 'OFF_CANVAS'
  | 'YOGA_CHILD_POSITION'
  | 'MEASURER_FALLBACK';

/** One diagnostic. The `{schemaVersion, code, severity, message, node?, track?}`
 *  core shape is PINNED; future fields are ADDITIVE only. */
export interface SceneDiagnostic {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  /** The node id the diagnostic concerns, when applicable. */
  node?: string;
  /** The track target string the diagnostic concerns, when applicable. */
  track?: string;
}

/** `validateScene` result — the CLI-lint `{ hasErrors, diagnostics }` shape,
 *  plus a top-level `schemaVersion`. */
export interface ValidateSceneResult {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  /** true iff any diagnostic has severity `error`. */
  hasErrors: boolean;
  /** Every diagnostic found — AGGREGATED, never throw-on-first, stable order. */
  diagnostics: SceneDiagnostic[];
}

// ── Levenshtein (nearest-id suggestion) ──────────────────────────────────────

/** Classic edit distance (iterative two-row DP). Small strings only (ids). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * The nearest candidate to `name` within a reasonable edit budget (≤ 2, or a
 * third of the length for longer names), or undefined if none is close enough —
 * so a wildly-different typo doesn't get a misleading "did you mean" tail.
 */
export function nearestId(name: string, candidates: Iterable<string>): string | undefined {
  const budget = Math.max(2, Math.floor(name.length / 3));
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = levenshtein(name, c);
    if (d < bestD && d <= budget) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// ── target → owning node (the same longest-prefix walk resolveTarget uses) ───

/** Resolve the OWNING node + remaining prop path for a `'<id>/<prop>'` target,
 *  by the same longest-registered-id-prefix walk `scene.resolveTarget` uses. */
function owningNode(scene: Scene, target: string): { node: Node; prop: string } | undefined {
  for (let slash = target.lastIndexOf('/'); slash > 0; slash = target.lastIndexOf('/', slash - 1)) {
    const node = scene.nodes.get(target.slice(0, slash));
    if (node) return { node, prop: target.slice(slash + 1) };
  }
  return undefined;
}

/** True when `node` is a FLOWABLE child of a Layout — i.e. its parent is a
 *  Layout (duck-typed via the `isLayoutNode` static marker, so this stays off
 *  the Yoga import) AND it has an intrinsic box (Layout flow-positions exactly
 *  these; non-flowable children emit absolutely, untouched). Flowable-ness is
 *  probed with the STATELESS estimating measurer — never the scene's injected
 *  one — so no backend font cache is warmed (render-neutrality). */
function isFlowableLayoutChild(node: Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  const ctor = parent.constructor as unknown as { isLayoutNode?: boolean } | undefined;
  if (ctor?.isLayoutNode !== true) return false;
  return node.intrinsicSize(estimatingMeasurer) !== null;
}

// ── validateScene ────────────────────────────────────────────────────────────

/**
 * Eagerly validate a scene (+ optional timeline) and AGGREGATE every problem —
 * the static belt that surfaces at the AUTHORING site what the render-time
 * `UnboundTargetError` backstop only shows one-at-a-time from deep in the render
 * loop. Pure read (see the module header): calling it never changes a subsequent
 * render's bytes.
 *
 * With a `doc`, every track target is walked through the existing
 * `scene.resolveTarget`; an unresolved one becomes an `UNKNOWN_TARGET` error
 * with a Levenshtein nearest-id / nearest-prop suggestion, and a
 * `position`/`position.*` track on a flowable Layout child becomes a
 * `YOGA_CHILD_POSITION` warning. The scene-only MEASURER_FALLBACK check runs
 * regardless. validateScene emits exactly three codes — UNKNOWN_TARGET,
 * MEASURER_FALLBACK, YOGA_CHILD_POSITION; OFF_CANVAS/ID_COLLISION are reserved
 * (see the DiagnosticCode doc for their enforcement points).
 */
export function validateScene(scene: Scene, doc?: Timeline): ValidateSceneResult {
  const diagnostics: SceneDiagnostic[] = [];
  const push = (
    code: DiagnosticCode,
    severity: DiagnosticSeverity,
    message: string,
    extra?: { node?: string; track?: string },
  ): void => {
    diagnostics.push({
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      code,
      severity,
      message,
      ...(extra?.node !== undefined ? { node: extra.node } : {}),
      ...(extra?.track !== undefined ? { track: extra.track } : {}),
    });
  };

  // Pure reads only. untracked() belt-and-suspenders: never register a signal
  // dependency on an ambient consumer while probing bounds/flow flags.
  untracked(() => {
    // ── track-target validation (needs a doc) ──
    if (doc) {
      for (const tr of doc.tracks) {
        const target = tr.target;
        const owner = owningNode(scene, target);
        // resolveTarget is the SAME resolution the bind uses — reuse it verbatim.
        const resolved = scene.resolveTarget(target);
        if (!resolved) {
          push('UNKNOWN_TARGET', 'error', unknownTargetMessage(scene, target, owner), {
            track: target,
            ...(owner?.node.id !== undefined ? { node: owner.node.id } : {}),
          });
          continue; // a dead target has no node to run the flow-child check against
        }
        // YOGA_CHILD_POSITION: a position track on a flowable Layout child.
        if (owner && /^position(\.[xy])?$/.test(owner.prop) && isFlowableLayoutChild(owner.node)) {
          push(
            'YOGA_CHILD_POSITION',
            'warning',
            `track '${target}' drives the position of a flowable child of a Layout — the flex slot ` +
              `overrides it, so the keyframes are confounded. Animate the Layout (gap/padding/width) or ` +
              `wrap the child in a Group and drive THAT, or make the child absolute (non-flowable).`,
            { track: target, ...(owner.node.id !== undefined ? { node: owner.node.id } : {}) },
          );
        }
      }
    }

    // ── scene-only checks (doc-independent) ──
    // Walk the node tree once to detect Text (for MEASURER_FALLBACK). NOTE:
    // OFF_CANVAS is deliberately NOT emitted here — it is a RENDERED-geometry
    // check (a node's box outside the viewport once ancestor Group world
    // transforms compose), so a static LOCAL-position read false-positives on
    // every nested child of a factory→Group architecture. The code stays
    // RESERVED in the enum for 0.60 `critique()`, which reads composed transforms
    // from the DisplayList. See the DiagnosticCode doc above.
    let sawText = false;
    const visit = (node: Node): void => {
      if (isTextNode(node)) sawText = true;
      const children = (node as unknown as { children?: Node[] }).children;
      if (Array.isArray(children)) for (const c of children) visit(c);
    };
    visit(scene.root);

    // MEASURER_FALLBACK: Text present but the scene measurer is the estimator.
    if (sawText && isEstimatingMeasurer(scene.textMeasurer)) {
      push(
        'MEASURER_FALLBACK',
        'info',
        `the scene contains Text but no real text measurer is injected — line breaking uses a rough ` +
          `per-character estimate. Call setTextMeasurer(backend) / setDefaultMeasurer(...) for exact layout.`,
      );
    }
  });

  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    hasErrors: diagnostics.some((d) => d.severity === 'error'),
    diagnostics,
  };
}

/** Build the friendliest UNKNOWN_TARGET message: nearest-PROP when the node
 *  exists (a typo'd prop), else nearest node-ID (a typo'd id). */
function unknownTargetMessage(scene: Scene, target: string, owner: { node: Node; prop: string } | undefined): string {
  if (owner) {
    // node resolved, prop did not → suggest a real target path on that node
    const props = owner.node.listTargets().map((t) => t.path);
    const near = nearestId(owner.prop, props);
    return (
      `track targets '${target}' but node '${owner.node.id}' has no animatable prop '${owner.prop}'` +
      (near ? ` — did you mean '${owner.node.id}/${near}'?` : '')
    );
  }
  const slash = target.indexOf('/');
  const idPart = slash >= 0 ? target.slice(0, slash) : target;
  const near = nearestId(idPart, scene.nodes.keys());
  return (
    `track targets '${target}' but no node '${idPart}' exists in the scene` +
    (near ? ` — did you mean '${near}'?` : '')
  );
}

/** Duck-typed Text detection (avoids importing nodes.ts / dragging its
 *  construction surface onto the diagnostics bundle): Text overrides
 *  `describeType` to `'Text'`. */
function isTextNode(node: Node): boolean {
  return node.describeType === 'Text';
}

// ── resolveAt — the truthful read primitive ──────────────────────────────────

/**
 * Read a node's RESOLVED prop value at time `t` — the always-truthful read, the
 * anti-false-conclusion primitive for inspection tooling (and load-bearing for
 * 0.60 `critique()`). A BOUND prop returns its REAL bound value at `t` (not the
 * misleading static default); an unbound prop returns its static value at any
 * `t`; an unresolvable target returns `undefined`.
 *
 * Thin wrapper over the existing `scene.resolveTarget` + core's `evaluateAt`
 * (read inside a read phase). NOTE: the scene must be BOUND (`bindScene`/
 * `evaluate` already ran for the doc) for a track-driven value to appear —
 * `resolveAt` reads the live signal, it does not itself bind. Render-neutral:
 * the scene playhead is restored after the read.
 */
export function resolveAt(scene: Scene, target: string, t: number): unknown {
  const sig = scene.resolveTarget(target) as unknown as (() => unknown) | undefined;
  if (typeof sig !== 'function') return undefined;
  const prev = scene.playhead.peek();
  try {
    return evaluateAt(scene.playhead, t, () => sig());
  } finally {
    // restore — resolveAt is a READ; it must not leave the playhead moved (a
    // following render forceSets its own t anyway, but keep it clean).
    scene.playhead.forceSet(prev);
  }
}

// ── instance-level bound indicator (ride-along B) ─────────────────────────────

/** One prop's live binding state on a SPECIFIC node instance. */
export interface InstancePropState {
  /** The track-target path (e.g. `position`, `opacity`). */
  path: string;
  /** The §2.2 value type(s) the prop accepts. */
  expects: ValueTypeId | readonly ValueTypeId[] | undefined;
  /**
   * TRUE when THIS instance's signal currently has a bound source (a timeline
   * track OR a computed `() => …` initializer) — so a static read of it is a
   * LIE; use `resolveAt` to read its real value over time. This is the
   * anti-false-conclusion guard (the cursorFill trap): type-level "bindable"
   * says the prop CAN be animated; this says it currently IS.
   */
  bound: boolean;
}

/**
 * Announce which props are CURRENTLY bound on THIS node instance (not just
 * type-level bindable). Reads `signal.isBound` per registered target — a pure
 * inspection read. Pair with `resolveAt` to read a bound prop's real value.
 */
export function instanceProps(node: Node): InstancePropState[] {
  return node.listTargets().map(({ path, expects }) => {
    const sig = node.resolveTarget(path) as unknown as { isBound?: boolean } | undefined;
    return { path, expects, bound: sig?.isBound === true };
  });
}
