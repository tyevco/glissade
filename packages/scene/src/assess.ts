// @glissade/scene/assess — 0.63 the ONE composed VERDICT (ENDS Era A).
//
// assess(scene, timeline, opts?) is the capstone COMPOSITION — it does NOT add a
// new verification primitive. It runs the already-shipped suite and UNIFIES it:
//   • validateScene (static) + critique (rendered)  — via `critique()`, which
//     already runs validateScene first + short-circuits on static errors, so its
//     merged output is the static+rendered VERDICT.
//   • exportFidelity (parity)                        — opt-in (`opts.exportBound`).
//   • diff(previous, current)                        — the blast-radius, if a
//     previous state is given (informational; never affects `clean`).
//   • certKey(scene, timeline)                       — the TRUST HANDLE.
// then DEDUPES + PRIORITIZES (severity, then critique's canonical sort) and
// computes `clean` = no error-severity AND no geometry-fixable warning remaining
// (accepted removed, content-only escalated).
//
// FRAMEWORK OWNS THE VERDICT, AGENT OWNS THE FIX: assess is a PURE READ (it only
// composes pure reads) and NEVER picks a fix lever — that is a meaning decision the
// author owns. The agent drives `while (!assess(...).clean) patch(pickGeometryLever
// (top.fixHints))`. See docs/authoring-loop.md.
//
// Lives on the tree-shakeable @glissade/scene/diagnostics subpath (re-exported from
// diagnostics.ts), OFF the SACRED base embed — the base pays zero bytes for it.

import { type Timeline } from '@glissade/core';
import { type Scene } from './scene.js';
import {
  critique,
  type CritiqueOptions,
  type FixHint,
} from './critique.js';
import { exportFidelity } from './fidelity.js';
import { diff, type ChangeSet, type DiffInput } from './diff.js';
import { certKey } from './canonicalScene.js';
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  type SceneDiagnostic,
  type DiagnosticSeverity,
} from './validate.js';

// ── options + result ──────────────────────────────────────────────────────────

export interface AssessOptions extends CritiqueOptions {
  /**
   * ALSO fold in the static render-only export-fidelity scan (exportFidelity) —
   * for an EXPORT-BOUND scene, a render-only feature (motionBlur/echo/…) the Lottie
   * exporter drops is part of the verdict. Default false (a realtime-only scene
   * needn't see it). Its findings are warnings, never geometry-fixable, so they
   * ESCALATE (report up) rather than block `clean`.
   */
  exportBound?: boolean;
  /**
   * A PREVIOUS state to diff against — assess folds in the blast-radius (`diff(
   * previous, current)`) so an author sees "exactly what my edit changed." Purely
   * informational: it NEVER affects `clean` (a change is neither right nor wrong).
   */
  previous?: DiffInput;
  /**
   * KNOWINGLY-ACCEPTED diagnostics (scoped-intent, like critique's `offstage`) — a
   * deliberate render-only export drop, an intentional brand-contrast. Each entry
   * matches a diagnostic by its `code`, its `node` id (SUBTREE match — an ancestor
   * id suppresses its whole subtree), or the combined `'<code>@<node>'` form. A
   * matched diagnostic is removed from the FIXABLE set (so `clean` can be true with
   * an accepted residual) but still appears in `diagnostics` + `accepted`.
   */
  accepted?: readonly string[];
}

export interface AssessResult {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  /**
   * TRUE iff nothing MECHANICAL remains: no error-severity diagnostic AND no
   * geometry-fixable warning — after accepted diagnostics are removed and
   * content-only ones escalated. `clean` is the loop's termination signal.
   */
  clean: boolean;
  /** true iff any (non-accepted) diagnostic is severity `error`. */
  hasErrors: boolean;
  /** The UNIFIED, deduped, PRIORITIZED diagnostics (severity, then canonical sort). */
  diagnostics: SceneDiagnostic[];
  /**
   * The loop's WORK QUEUE — non-accepted warnings that expose a GEOMETRY lever (so
   * the agent can auto-apply a fix). Prioritized; `fixable[0]` is the top target.
   */
  fixable: SceneDiagnostic[];
  /**
   * Non-accepted diagnostics whose ONLY levers are content-class (all-content →
   * changing them touches MEANING) — the mechanical/human boundary. The loop
   * reports these UP; it never auto-applies them.
   */
  escalated: SceneDiagnostic[];
  /** Diagnostics matched by `opts.accepted` — the knowingly-accepted residual. */
  accepted: SceneDiagnostic[];
  /** The pure semantic content-address — the TRUST HANDLE keyed by the certify layer. */
  certKey: string;
  /**
   * A stable signature of the diagnostic SET — the loop's CONVERGENCE detector. If
   * this round's `signature` equals last round's, the fix made NO progress (stuck) →
   * terminate. Lets the loop detect no-progress from the IIFE with no extra export.
   */
  signature: string;
  /** The blast-radius vs `opts.previous`, present iff a previous state was given. */
  blastRadius?: ChangeSet;
}

// ── fix-hint / fix-class reads (the meaning-preservation veto, decidably) ──────

/** The structured fix-hint list a critique diagnostic carries in `detail.fixHints`
 *  (empty for diagnostics without decidable levers — static errors, parity notes). */
export function fixHintsOf(d: SceneDiagnostic): readonly FixHint[] {
  const hints = (d.detail as { fixHints?: unknown } | undefined)?.fixHints;
  return Array.isArray(hints) ? (hints as FixHint[]) : [];
}

/** TRUE iff the diagnostic offers ANY geometry lever — the agent may AUTO-fix it
 *  (pick a geometry lever, never a content one). The veto's positive half. */
export function isGeometryFixable(d: SceneDiagnostic): boolean {
  return fixHintsOf(d).some((h) => h.fixClass === 'geometry');
}

/** TRUE iff the diagnostic has levers but ALL are content-class — its only
 *  resolution touches MEANING, so it must ESCALATE (never auto-apply). */
export function isContentOnly(d: SceneDiagnostic): boolean {
  const hints = fixHintsOf(d);
  return hints.length > 0 && hints.every((h) => h.fixClass === 'content');
}

// ── the composed verdict ───────────────────────────────────────────────────────

const severityRank: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };

export function assess(scene: Scene, timeline: Timeline, opts: AssessOptions = {}): AssessResult {
  // 1. VERDICT: critique already composes validateScene (static, short-circuits on
  //    error) + the rendered pass — one merged list. Pass through the fps/offstage
  //    knobs (AssessOptions extends CritiqueOptions).
  const crit = critique(scene, timeline, opts);

  // 2. PARITY (opt-in): the static export-fidelity scan for an export-bound scene.
  const fidelity = opts.exportBound ? exportFidelity(scene, timeline).diagnostics : [];

  // 3. UNIFY + dedupe + prioritize.
  const merged = prioritize(dedupe([...crit.diagnostics, ...fidelity]));

  // 4. ACCEPT (scoped-intent): partition off the knowingly-accepted residual.
  const acceptedSet = new Set<string>(opts.accepted ?? []);
  const isAccepted = (d: SceneDiagnostic): boolean => matchesAccepted(scene, d, acceptedSet);

  const accepted: SceneDiagnostic[] = [];
  const fixable: SceneDiagnostic[] = [];
  const escalated: SceneDiagnostic[] = [];
  let blocks = false;
  let hasErrors = false;
  for (const d of merged) {
    if (isAccepted(d)) {
      accepted.push(d);
      continue; // accepted ⇒ removed from the fixable set (never blocks clean)
    }
    if (d.severity === 'error') {
      hasErrors = true;
      blocks = true; // a static error always blocks (not geometry-lever-fixable)
      continue;
    }
    if (d.severity === 'warning' && isGeometryFixable(d)) {
      fixable.push(d);
      blocks = true; // a geometry-fixable warning is mechanical work still to do
      continue;
    }
    if (isContentOnly(d)) escalated.push(d); // all-content → human owns it
    // any other warning/info (no lever, or a parity note) reports up, doesn't block.
  }

  // 5. TRUST HANDLE + optional blast-radius. Both bind/evaluate the scene, which a
  //    scene with a STATIC ERROR (an unbound target) cannot do — critique already
  //    short-circuited it. So skip them on a hasErrors verdict: an unbindable scene
  //    has no trustworthy content-address ('' sentinel) and no meaningful diff.
  const key = crit.hasErrors ? '' : certKey(scene, timeline);
  const blastRadius = !crit.hasErrors && opts.previous ? diff(opts.previous, { scene, timeline }) : undefined;

  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    clean: !blocks,
    hasErrors,
    diagnostics: merged,
    fixable,
    escalated,
    accepted,
    certKey: key,
    signature: diagnosticsSignature(merged),
    ...(blastRadius ? { blastRadius } : {}),
  };
}

// ── convergence (the loop's termination detector) ─────────────────────────────

/**
 * A stable signature of a diagnostic SET — the loop compares this round's signature
 * to last round's; EQUAL ⇒ no progress ⇒ STUCK ⇒ terminate (never a silent infinite
 * loop). Deterministic: built from the already-canonically-sorted `diagnostics`.
 */
export function diagnosticsSignature(diagnostics: readonly SceneDiagnostic[]): string {
  return diagnostics.map((d) => `${d.severity}|${d.code}|${d.node ?? ''}|${d.track ?? ''}`).join('\n');
}

/** TRUE iff two assess rounds produced the SAME diagnostic set (no progress). */
export function sameDiagnostics(a: readonly SceneDiagnostic[], b: readonly SceneDiagnostic[]): boolean {
  return diagnosticsSignature(a) === diagnosticsSignature(b);
}

// ── internals ──────────────────────────────────────────────────────────────────

/** A dedupe identity for a diagnostic — code + node + track + source + detail. Two
 *  diagnostics from different composed sources that describe the SAME problem
 *  collapse to one entry. */
function dedupeKey(d: SceneDiagnostic): string {
  return `${d.code}|${d.node ?? ''}|${d.track ?? ''}|${d.source ?? ''}|${stableDetail(d.detail)}`;
}

function dedupe(diags: SceneDiagnostic[]): SceneDiagnostic[] {
  const seen = new Set<string>();
  const out: SceneDiagnostic[] = [];
  for (const d of diags) {
    const k = dedupeKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

/** PRIORITIZE — severity FIRST (error > warning > info), then critique's canonical
 *  key (frame, code, node, track). Stable for fully-equal keys. */
function prioritize(diags: SceneDiagnostic[]): SceneDiagnostic[] {
  const frameOf = (d: SceneDiagnostic): number => {
    const f = (d.detail as { frame?: unknown } | undefined)?.frame;
    return typeof f === 'number' ? f : Number.POSITIVE_INFINITY;
  };
  return diags
    .map((d, i) => [d, i] as const)
    .sort((A, B) => {
      const [a, ai] = A;
      const [b, bi] = B;
      const sa = severityRank[a.severity];
      const sb = severityRank[b.severity];
      if (sa !== sb) return sa - sb;
      const fa = frameOf(a);
      const fb = frameOf(b);
      if (fa !== fb) return fa - fb;
      if (a.code !== b.code) return a.code < b.code ? -1 : 1;
      const na = a.node ?? '';
      const nb = b.node ?? '';
      if (na !== nb) return na < nb ? -1 : 1;
      const ta = a.track ?? '';
      const tb = b.track ?? '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return ai - bi;
    })
    .map(([d]) => d);
}

/** Deterministic stringification of a detail object (sorted keys) for the dedupe key. */
function stableDetail(detail: Record<string, unknown> | undefined): string {
  if (!detail) return '';
  const keys = Object.keys(detail).sort();
  return keys.map((k) => `${k}=${safeJson(detail[k])}`).join(',');
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Does an accepted entry match this diagnostic? Reuses the offstage SUBTREE-match
 * shape (a node-scoped entry suppresses its whole subtree). An entry matches iff it
 * equals the diagnostic's `code`, its `node` id, an ANCESTOR of its node, or the
 * combined `'<code>@<node>'` form.
 */
function matchesAccepted(scene: Scene, d: SceneDiagnostic, accepted: ReadonlySet<string>): boolean {
  if (accepted.size === 0) return false;
  if (accepted.has(d.code)) return true;
  const node = d.node;
  if (node !== undefined) {
    if (accepted.has(node)) return true;
    if (accepted.has(`${d.code}@${node}`)) return true;
    // SUBTREE match: any ided ancestor of the node in the accepted set.
    let p = scene.nodes.get(node)?.parent ?? null;
    while (p) {
      if (p.id !== undefined && accepted.has(p.id)) return true;
      p = p.parent;
    }
  }
  return false;
}
