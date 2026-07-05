// @glissade/scene/fidelity — 0.61 static render-only export-fidelity check.
//
// exportFidelity(scene, timeline?) is a LIGHTWEIGHT STATIC scan (NO export run,
// no render) that flags nodes using RENDER-ONLY features the Lottie exporter drops
// — motionBlur, echo trails, standalone/camera shake, mesh fills, text-cursor, and
// the typewriter reveal mask. It hoists the 0.55–0.58 never-silent EXPORT warnings
// from CLI-export-time to AUTHORING-time-queryable, the way validateScene made the
// fail-loud render throw pre-render-queryable.
//
// It is a DIAGNOSTIC (kind:'diagnostic', source:'parity'): a scene that uses a
// render-only feature emits; a scene that uses none emits NOTHING (clean-scene-empty).
// A realtime-only scene is not WRONG to use these — the finding is a warning aimed
// at an EXPORT-BOUND author, with an actionable hint per feature.
//
// PURE READ — it walks the node tree and reads signals under untracked(); it never
// touches evaluate() or a render path, so every golden stays byte-identical. Lives
// on the tree-shakeable @glissade/scene/diagnostics subpath (off the base embed).

import { untracked, type Timeline } from '@glissade/core';
import { type Node } from './node.js';
import { type Scene } from './scene.js';
import { Group } from './nodes.js';
import { shakenSpec } from './shake.js';
import { DIAGNOSTIC_SCHEMA_VERSION, type SceneDiagnostic } from './validate.js';

/** exportFidelity result — the CLI-lint `{ hasErrors, diagnostics }` shape. */
export interface ExportFidelityResult {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  /** true iff any diagnostic is severity `error` — always false here (render-only
   *  use is a warning, never a build error), kept for shape-parity with the family. */
  hasErrors: boolean;
  /** every RENDER_ONLY_EXPORT finding, canonically sorted. */
  diagnostics: SceneDiagnostic[];
}

/** The render-only feature a finding concerns — a stable string for `detail.feature`. */
type Feature =
  | 'motion-blur'
  | 'echo-trails'
  | 'shake'
  | 'camera-shake'
  | 'text-cursor'
  | 'reveal'
  | 'mesh-fill';

/** Per-feature actionable hint tail (after the "won't survive Lottie export" clause). */
const HINT: Record<Feature, string> = {
  'motion-blur':
    'the round-trip shows the un-blurred shape; if export-bound, pre-bake the blur into keyframed copies or accept the loss',
  'echo-trails':
    'only the base shape exports (no ghost copies); if export-bound, bake the trail into real staggered layers or accept the loss',
  shake:
    'the closed-form jitter is not a keyframe track; if export-bound, bake() the shake into position/rotation tracks or accept the loss',
  'camera-shake':
    'whole-frame camera shake is not exported; if export-bound, bake it into the camera pose tracks or accept the loss',
  'text-cursor':
    'the caret sibling is not exportable and is dropped; if export-bound, drop the cursor or accept the loss',
  reveal:
    'Lottie has no range selector, so the FULL text shows on the round-trip; if export-bound, use per-word/line reveal tracks (revealWords/revealLines) or accept the loss',
  'mesh-fill':
    'a mesh fill has no Lottie gradient ramp; if export-bound, thread a PNG encoder to rasterize it (gs render does), use a solid/linear/radial fill, or accept the loss',
};

function label(feature: Feature): string {
  switch (feature) {
    case 'motion-blur':
      return 'motionBlur';
    case 'echo-trails':
      return 'echo trails';
    case 'shake':
      return 'shake() jitter';
    case 'camera-shake':
      return 'camera shake';
    case 'text-cursor':
      return 'a text cursor';
    case 'reveal':
      return 'a typewriter reveal mask';
    case 'mesh-fill':
      return 'a mesh fill';
  }
}

/**
 * Statically scan `scene` (+ optional `timeline`, for reveal-track detection) for
 * render-only features that won't survive Lottie export, aggregating one
 * RENDER_ONLY_EXPORT warning per affected node. Pure read; a scene with no
 * render-only feature returns an EMPTY diagnostics list.
 */
export function exportFidelity(scene: Scene, timeline?: Timeline): ExportFidelityResult {
  const diagnostics: SceneDiagnostic[] = [];
  const revealTargets = new Set<string>();
  if (timeline) {
    for (const tr of timeline.tracks) {
      if (/\/reveal(Fraction)?$/.test(tr.target)) revealTargets.add(tr.target);
    }
  }

  const push = (node: Node, feature: Feature): void => {
    const id = displayId(node);
    diagnostics.push({
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      code: 'RENDER_ONLY_EXPORT',
      severity: 'warning',
      source: 'parity',
      ...(node.id !== undefined ? { node: node.id } : {}),
      message:
        `${label(feature)} on '${id}' is render-only — won't survive Lottie export (${HINT[feature]}).`,
      detail: { feature, node: id, ...(node.id !== undefined ? {} : { unnamed: true }) },
    });
  };

  untracked(() => {
    const visit = (node: Node): void => {
      const type = node.describeType;
      if (type === 'MotionBlur') push(node, 'motion-blur');
      else if (type === 'Echo') push(node, 'echo-trails');
      else if (type === 'TextCursor') push(node, 'text-cursor');
      else if (type === 'Camera') {
        // Camera itself is exported (its pose bakes into a parent transform); only
        // its whole-frame SHAKE is render-only.
        if ((node as unknown as { shakeSpec?: unknown }).shakeSpec !== undefined) push(node, 'camera-shake');
      } else if (shakenSpec(node) !== undefined) {
        // standalone shake(node,…) — the render-only marker is the WeakMap, not a type.
        push(node, 'shake');
      }

      if (type === 'Text') {
        const id = node.id;
        const hasRevealTrack =
          id !== undefined && (revealTargets.has(`${id}/reveal`) || revealTargets.has(`${id}/revealFraction`));
        // mirror the exporter's OWN drop predicate (warnTextUnsupported): a finite
        // `reveal` or a non-NaN `revealFraction` means a partial reveal is set.
        const rf = readNumber(node, 'revealFraction');
        const rv = readNumber(node, 'reveal');
        const revealSet = hasRevealTrack || (rf !== undefined && !Number.isNaN(rf)) || (rv !== undefined && Number.isFinite(rv));
        if (revealSet) push(node, 'reveal');
      }

      // mesh fill on a Shape (Rect/Circle/Path) — a fill Paint whose kind is 'mesh'.
      const fill = (node as unknown as { fill?: () => unknown }).fill;
      if (typeof fill === 'function') {
        try {
          const v = fill();
          if (v && typeof v === 'object' && (v as { kind?: unknown }).kind === 'mesh') push(node, 'mesh-fill');
        } catch {
          /* unreadable fill — skip */
        }
      }

      if (node instanceof Group) for (const c of node.children) visit(c);
      else {
        const children = (node as unknown as { children?: Node[] }).children;
        if (Array.isArray(children)) for (const c of children) visit(c);
      }
    };
    visit(scene.root);
  });

  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    hasErrors: false,
    diagnostics: sortFidelity(diagnostics),
  };
}

/** Canonical order — by node id, then feature (detail.feature). Shuffle-stable. */
function sortFidelity(diags: SceneDiagnostic[]): SceneDiagnostic[] {
  const featureOf = (d: SceneDiagnostic): string => String((d.detail as { feature?: unknown } | undefined)?.feature ?? '');
  return diags
    .map((d, i) => [d, i] as const)
    .sort((A, B) => {
      const [a, ai] = A;
      const [b, bi] = B;
      const na = String((a.detail as { node?: unknown } | undefined)?.node ?? a.node ?? '');
      const nb = String((b.detail as { node?: unknown } | undefined)?.node ?? b.node ?? '');
      if (na !== nb) return na < nb ? -1 : 1;
      const fa = featureOf(a);
      const fb = featureOf(b);
      if (fa !== fb) return fa < fb ? -1 : 1;
      return ai - bi;
    })
    .map(([d]) => d);
}

/** A readable id for a node: its own id, else the first id-bearing descendant
 *  (a wrapper like `motionBlur(rect)` reports the wrapped child), else its type. */
function displayId(node: Node): string {
  if (node.id !== undefined) return node.id;
  const stack: Node[] = [node];
  while (stack.length) {
    const n = stack.shift()!;
    if (n !== node && n.id !== undefined) return n.id;
    const children = (n as unknown as { children?: Node[] }).children;
    if (Array.isArray(children)) stack.push(...children);
  }
  return `<${node.describeType}>`;
}

/** Read a node's numeric signal by prop name under untracked, or undefined. */
function readNumber(node: Node, prop: string): number | undefined {
  const sig = (node as unknown as Record<string, unknown>)[prop];
  if (typeof sig !== 'function') return undefined;
  try {
    const v = (sig as () => unknown)();
    return typeof v === 'number' ? v : undefined;
  } catch {
    return undefined;
  }
}
