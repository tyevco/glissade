/**
 * `gs critique <scene-module>` (0.60): machine-readable RENDERED diagnostics from
 * the DisplayList — the rendered-geometric half of `gs describe --lint` /
 * validateScene. Loads the scene, injects the Skia measurer (so TEXT_OVERFLOW
 * measures with the same metrics `gs render` lays out with), runs `critique`, and
 * prints the flat, canonically-sorted diagnostics. `--json` emits the raw result
 * for a machine consumer; exits non-zero iff any diagnostic is `error` severity
 * (only static errors are — the rendered pass emits warnings/info).
 *
 * `--by-beat <scene-module> --timing <narration.timing.json>` (scaffold-v3): runs
 * the SAME critique() unchanged, then GROUPS + ANNOTATES the resulting diagnostics
 * by the narration beat (segment) that OWNS each flagged node — a NON-MUTATING
 * report (it never edits the scene). A node's owning beat is the segment window
 * `[start, start+duration)` that contains the node's ENTRANCE (min keyframe time
 * across its own tracks). A keyframeless / full-duration-spanning node routes to an
 * explicit `[likely FRAME-owned]` marker (never a silent seg-0 bucket). Pure
 * function of (scene, timeline tracks, timing.json) → byte-identical run-to-run.
 */

import { critique, fixHintsOf, type CritiqueResult, type SceneDiagnostic } from '@glissade/scene/diagnostics';
import type { Timeline } from '@glissade/core';
import type { Scene } from '@glissade/scene';
import type { NarrationTiming } from '@glissade/narrate';
import { loadSceneModule } from './render.js';

export interface CritiqueCommandOptions {
  modulePath: string;
  json?: boolean;
  /** scaffold-v3: group the diagnostics by their owning narration beat. */
  byBeat?: boolean;
  /** path to the committed `narration.timing.json` (REQUIRED with `byBeat`). */
  timingPath?: string;
}

export interface CritiqueCommandResult {
  result: CritiqueResult;
  report: string;
  /** true iff any diagnostic is `error` severity (⇒ non-zero exit). */
  hasErrors: boolean;
}

/** The explicit marker for a FULL-DURATION SPAN node (a backdrop / persistent
 *  caption whose track span covers the whole timeline). A genuine frame-ownership
 *  signal — it routes the author to the FRAME config, NEVER to a body beat.
 *  Shared with `gs scaffold`; a determinism seat pins this literal. */
export const SPANS_LABEL = '[likely FRAME-owned]';

/** The explicit marker for a KEYFRAMELESS node (a flagged node with NO tracks →
 *  no entrance keyframe to time-attribute). NOT a frame-ownership claim — a
 *  keyframeless node is more likely a statically-pushed BODY node than frame art,
 *  so we DON'T over-claim `[likely FRAME-owned]`; we say honestly "couldn't
 *  time-attribute, locate by node id." critique-only; the literal is pinned. */
export const UNATTRIBUTED_LABEL = '[no entrance keyframe]';

export async function critiqueCommand(opts: CritiqueCommandOptions): Promise<CritiqueCommandResult> {
  // Layout scenes need the (async, wasm) Yoga engine registered before evaluate()
  // — evaluate() never awaits (§2.5), so load it up front like `gs render` does.
  try {
    const { loadYogaLayoutEngine } = await import('@glissade/scene/layout');
    await loadYogaLayoutEngine();
  } catch {
    /* engine optional — a Layout-free scene renders fine without it */
  }

  // fail-loud BEFORE loading the scene: --by-beat is meaningless without a manifest.
  if (opts.byBeat && !opts.timingPath) {
    throw new Error('gs critique --by-beat requires --timing <narration.timing.json>');
  }

  const mod = await loadSceneModule(opts.modulePath);
  const scene = mod.createScene();
  // Skia = the headless measurer twin, so TEXT_OVERFLOW / text bounds match the
  // render path (line breaking uses the rasterizer that will draw).
  const { SkiaBackend } = await import('@glissade/backend-skia');
  scene.setTextMeasurer(new SkiaBackend(scene.size.w, scene.size.h));
  const result = critique(scene, mod.timeline); // EXISTING critique() — unchanged.

  if (opts.byBeat) {
    const timing = await loadTiming(opts.timingPath!);
    const byBeat = buildByBeatReport(result, scene, mod.timeline.tracks, timing);
    if (opts.json) {
      return { result, report: JSON.stringify(byBeat, null, 2), hasErrors: result.hasErrors };
    }
    return { result, report: formatByBeatReport(result, byBeat), hasErrors: result.hasErrors };
  }

  if (opts.json) {
    return { result, report: JSON.stringify(result, null, 2), hasErrors: result.hasErrors };
  }
  return { result, report: formatCritique(result), hasErrors: result.hasErrors };
}

async function loadTiming(timingPath: string): Promise<NarrationTiming> {
  const { readFile } = await import('node:fs/promises');
  let raw: string;
  try {
    raw = await readFile(timingPath, 'utf8');
  } catch {
    throw new Error(`gs critique --by-beat: cannot read --timing manifest '${timingPath}'`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `gs critique --by-beat: '${timingPath}' is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  const seg = (parsed as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(seg) || seg.length === 0) {
    throw new Error(`gs critique --by-beat: '${timingPath}' has no narration segments`);
  }
  return parsed as NarrationTiming;
}

function formatCritique(r: CritiqueResult): string {
  const lines: string[] = [];
  if (r.renderedSkipped) {
    lines.push(`rendered pass SKIPPED: ${r.renderedSkipReason ?? ''}`);
  } else {
    lines.push(`sampled ${r.sampledFrames} integer-frame grid sample(s).`);
  }
  if (r.diagnostics.length === 0) {
    lines.push('ok — no diagnostics (clean scene).');
    return lines.join('\n');
  }
  for (const d of r.diagnostics) {
    const where = d.node ? ` [${d.node}]` : d.track ? ` [${d.track}]` : '';
    lines.push(`${d.severity.toUpperCase()} ${d.code}${where} (${d.source ?? '?'}): ${d.message}`);
  }
  const errs = r.diagnostics.filter((d) => d.severity === 'error').length;
  const warns = r.diagnostics.filter((d) => d.severity === 'warning').length;
  const infos = r.diagnostics.filter((d) => d.severity === 'info').length;
  lines.push(`\n${errs} error(s), ${warns} warning(s), ${infos} info.`);
  return lines.join('\n');
}

// ── by-beat attribution ───────────────────────────────────────────────────────

/** The structured, deterministic `--by-beat --json` shape. */
export interface ByBeatReport {
  /** groups in timing.json segment order (only segments with diagnostics). */
  byBeat: Array<{ segId: string; start: number; end: number; diagnostics: SceneDiagnostic[] }>;
  /** the `[likely FRAME-owned]` group — full-duration-span nodes ONLY. */
  spans: SceneDiagnostic[];
  /** the `[no entrance keyframe]` group — keyframeless nodes (no track to time). */
  unattributed: SceneDiagnostic[];
  /** diagnostics with no node at all (pure static). */
  static: SceneDiagnostic[];
}

/** Resolve a track target `'<id>/<prop.path>'` to its OWNING node id by the same
 *  longest-registered-id-prefix walk `scene.resolveTarget` uses. Reimplemented
 *  CLI-side (validate.ts's helper is private) — zero scene change. */
export function resolveOwningNodeId(target: string, nodeIds: ReadonlySet<string>): string | undefined {
  for (let slash = target.lastIndexOf('/'); slash > 0; slash = target.lastIndexOf('/', slash - 1)) {
    const id = target.slice(0, slash);
    if (nodeIds.has(id)) return id;
  }
  return undefined;
}

interface NodeEntrance {
  /** min keyframe time across the node's OWN tracks (undefined ⇒ keyframeless). */
  min: number | undefined;
  /** max keyframe time across the node's OWN tracks. */
  max: number | undefined;
}

/** Per-node min/max keyframe time — the stable node→track partition (each track
 *  resolves to exactly one owning node via longest-prefix). */
export function nodeEntranceTimes(tracks: Timeline['tracks'], nodeIds: ReadonlySet<string>): Map<string, NodeEntrance> {
  const acc = new Map<string, NodeEntrance>();
  for (const tr of tracks) {
    const owner = resolveOwningNodeId(tr.target, nodeIds);
    if (owner === undefined) continue;
    let e = acc.get(owner);
    if (!e) {
      e = { min: undefined, max: undefined };
      acc.set(owner, e);
    }
    for (const k of tr.keys) {
      if (e.min === undefined || k.t < e.min) e.min = k.t;
      if (e.max === undefined || k.t > e.max) e.max = k.t;
    }
  }
  return acc;
}

/** The owning-beat verdict for one flagged node — a 4-way honest split: a concrete
 *  segment id, the `spans` (frame-owned full span) marker, the `unattributed`
 *  (keyframeless — no entrance) marker, or (upstream) static. Total — never
 *  undefined, never order-dependent. */
export type BeatOwner = { kind: 'seg'; segId: string } | { kind: 'spans' } | { kind: 'unattributed' };

/**
 * Map a node to its owning beat. Two DISTINCT honest fallbacks (never a silent
 * seg-0):
 *   • KEYFRAMELESS (no tracks → entrance undefined) → `unattributed`
 *     (`[no entrance keyframe]`). NOT a frame-ownership claim — a keyframeless
 *     node is more likely a statically-pushed body node than frame art, so
 *     tagging it FRAME-owned would be a confident mis-route (anti-workslop).
 *   • FULL-DURATION SPAN (entrance defined AND min ≤ firstStart AND max ≥ lastEnd)
 *     → `spans` (`[likely FRAME-owned]`) — the genuine backdrop / persistent-caption
 *     signal.
 * Otherwise the half-open window `[start, start+duration)` containing the entrance
 * owns it; entrance == a window's end belongs to the NEXT segment.
 */
export function attributeNode(entrance: NodeEntrance | undefined, timing: NarrationTiming): BeatOwner {
  const segs = timing.segments;
  const firstStart = Math.min(...segs.map((s) => s.start));
  const lastEnd = Math.max(...segs.map((s) => s.start + s.duration));

  // keyframeless — NO entrance keyframe to time-attribute; locate by node id.
  if (!entrance || entrance.min === undefined || entrance.max === undefined) {
    return { kind: 'unattributed' };
  }
  // full-duration span (backdrop / persistent caption) — genuinely FRAME-owned.
  if (entrance.min <= firstStart && entrance.max >= lastEnd) {
    return { kind: 'spans' };
  }

  const e = entrance.min;
  // half-open owner: the LAST segment whose start <= entrance. At a contiguous
  // boundary (end_i == start_{i+1} == e) this picks the NEXT segment; within a
  // window it picks that window. Deterministic tie-break: latest start, then the
  // segment's manifest order.
  let owner: (typeof segs)[number] | undefined;
  for (const s of segs) {
    if (s.start <= e) {
      if (owner === undefined || s.start > owner.start) owner = s;
    }
  }
  // entrance before the first beat begins → the first beat (a legitimate seg-0,
  // NOT the silent keyframeless/spanning bucket the marker guards against).
  if (owner === undefined) {
    owner = segs.reduce((a, b) => (b.start < a.start ? b : a));
  }
  return { kind: 'seg', segId: owner.id };
}

/** PURE: build the beat-attributed report from (critique result, scene, tracks,
 *  timing). No wall-clock, no RNG — byte-identical for identical inputs. */
export function buildByBeatReport(
  result: CritiqueResult,
  scene: Scene,
  tracks: Timeline['tracks'],
  timing: NarrationTiming,
): ByBeatReport {
  const nodeIds = new Set<string>(scene.nodes.keys());
  const entrances = nodeEntranceTimes(tracks, nodeIds);

  const perSeg = new Map<string, SceneDiagnostic[]>();
  const spans: SceneDiagnostic[] = [];
  const unattributed: SceneDiagnostic[] = [];
  const staticGroup: SceneDiagnostic[] = [];

  for (const d of result.diagnostics) {
    if (d.node === undefined) {
      staticGroup.push(d);
      continue;
    }
    const owner = attributeNode(entrances.get(d.node), timing);
    if (owner.kind === 'spans') {
      spans.push(d);
    } else if (owner.kind === 'unattributed') {
      unattributed.push(d);
    } else {
      let g = perSeg.get(owner.segId);
      if (!g) {
        g = [];
        perSeg.set(owner.segId, g);
      }
      g.push(d);
    }
  }

  // canonical order: groups in timing.json segment order, then spans, then
  // unattributed, then static; within a group, sort by node id then diagnostic
  // code (then message/track).
  const byBeat: ByBeatReport['byBeat'] = [];
  for (const s of timing.segments) {
    const g = perSeg.get(s.id);
    if (g && g.length) {
      byBeat.push({ segId: s.id, start: s.start, end: s.start + s.duration, diagnostics: sortDiags(g) });
    }
  }
  return { byBeat, spans: sortDiags(spans), unattributed: sortDiags(unattributed), static: sortDiags(staticGroup) };
}

function sortDiags(ds: SceneDiagnostic[]): SceneDiagnostic[] {
  return [...ds].sort((a, b) => {
    const byNode = (a.node ?? '').localeCompare(b.node ?? '');
    if (byNode !== 0) return byNode;
    const byCode = a.code.localeCompare(b.code);
    if (byCode !== 0) return byCode;
    const byMsg = a.message.localeCompare(b.message);
    if (byMsg !== 0) return byMsg;
    return (a.track ?? '').localeCompare(b.track ?? '');
  });
}

// ── escalate-boundary-aware presentation ──────────────────────────────────────

/** One presented fix lever, tagged by whether it is auto-suggestable (geometry)
 *  or an author decision (content — never auto-applied). */
function leverLines(d: SceneDiagnostic): string[] {
  const out: string[] = [];
  for (const h of fixHintsOf(d)) {
    if (h.fixClass === 'geometry') {
      out.push(`    suggested fix: ${h.lever} — ${h.hint}`);
    } else {
      out.push(`    author decision (meaning): ${h.lever} — ${h.hint}`);
    }
  }
  return out;
}

function diagLines(d: SceneDiagnostic): string[] {
  const where = d.node ? ` [${d.node}]` : d.track ? ` [${d.track}]` : '';
  const lines = [`  ${d.severity.toUpperCase()} ${d.code}${where} (${d.source ?? '?'}): ${d.message}`];
  lines.push(...leverLines(d));
  return lines;
}

/** Human report. Deterministic — pure function of (result, report). */
export function formatByBeatReport(result: CritiqueResult, report: ByBeatReport): string {
  const lines: string[] = [];
  if (result.renderedSkipped) {
    lines.push(`rendered pass SKIPPED: ${result.renderedSkipReason ?? ''}`);
  } else {
    lines.push(`sampled ${result.sampledFrames} integer-frame grid sample(s).`);
  }
  if (result.diagnostics.length === 0) {
    lines.push('ok — no diagnostics (clean scene).');
    return lines.join('\n');
  }

  for (const g of report.byBeat) {
    lines.push('');
    lines.push(`beat '${g.segId}' [${fmtSec(g.start)}–${fmtSec(g.end)}s]:`);
    for (const d of g.diagnostics) lines.push(...diagLines(d));
  }
  // canonical section order: beats (segment order) → spans → unattributed → static.
  if (report.spans.length) {
    lines.push('');
    lines.push(`spans ${SPANS_LABEL}:`);
    for (const d of report.spans) lines.push(...diagLines(d));
  }
  if (report.unattributed.length) {
    lines.push('');
    lines.push(`unattributed ${UNATTRIBUTED_LABEL}:`);
    for (const d of report.unattributed) lines.push(...diagLines(d));
  }
  if (report.static.length) {
    lines.push('');
    lines.push('static (no node):');
    for (const d of report.static) lines.push(...diagLines(d));
  }

  const errs = result.diagnostics.filter((d) => d.severity === 'error').length;
  const warns = result.diagnostics.filter((d) => d.severity === 'warning').length;
  const infos = result.diagnostics.filter((d) => d.severity === 'info').length;
  lines.push('');
  lines.push(`${errs} error(s), ${warns} warning(s), ${infos} info.`);
  return lines.join('\n');
}

/** Stable, locale-free second formatting (no trailing-zero drift). */
function fmtSec(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}
