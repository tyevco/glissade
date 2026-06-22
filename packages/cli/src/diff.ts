/**
 * gs diff (DESIGN.md §3.3): turn an opaque golden-hash mismatch into a
 * command-level explanation. Evaluate a scene at `--at <t>` to its pure
 * DisplayList, then compare against a committed baseline:
 *
 *   --against <baseline.dl.json>  → structural, index-aligned command diff
 *                                   (parse → diffDisplayLists → command tree)
 *   --against <baseline.png>      → raw encodePng byte-compare ONLY (no pixel
 *                                   diff algorithm, no new raster path)
 *
 * Operates entirely on the already-pure IR (no audio). Exits non-zero on any
 * divergence so it slots into CI / a golden-update workflow.
 */

import { readFileSync } from 'node:fs';
import { evaluate, type DisplayList } from '@glissade/scene';
// The diff/snapshot diagnostic surface moved to the `@glissade/scene/diagnostics`
// subpath in the 0.20 budget review (off the base embed). `gs diff` is its consumer.
import { diffDisplayLists, formatDisplayDiff, parseDisplaySnapshot, serializeDisplayList } from '@glissade/scene/diagnostics';
import { loadSceneModule } from './render.js';

export interface DiffOptions {
  modulePath: string;
  /** seconds (the §5 Player-API time unit; `diff` is a single-frame still). */
  at: number;
  /** baseline path: `.dl.json` (structural diff) or `.png` (byte-compare). */
  against: string;
}

export interface DiffResult {
  /** true when the scene matches the baseline. */
  equal: boolean;
  /** the rendered command-tree / byte-compare report (always populated). */
  report: string;
  /** the freshly-evaluated DisplayList (so callers can re-snapshot). */
  actual: DisplayList;
}

/** Evaluate the scene module at `t` to its DisplayList (single-frame, no audio). */
export async function evaluateAt(modulePath: string, t: number): Promise<DisplayList> {
  const mod = await loadSceneModule(modulePath);
  const scene = mod.createScene();
  // A baseline .dl.json diff needs no measurer; a .png compare needs the Skia
  // backend as the text measurer (so line breaking matches the render twin).
  return evaluate(scene, mod.timeline, t);
}

export async function diffCommand(opts: DiffOptions): Promise<DiffResult> {
  if (opts.against.endsWith('.png')) return diffAgainstPng(opts);
  if (opts.against.endsWith('.dl.json')) return diffAgainstSnapshot(opts);
  throw new Error(`--against must be a .dl.json or .png baseline, got '${opts.against}'`);
}

async function diffAgainstSnapshot(opts: DiffOptions): Promise<DiffResult> {
  const mod = await loadSceneModule(opts.modulePath);
  const scene = mod.createScene();
  const actual = evaluate(scene, mod.timeline, opts.at);
  const baseline = parseDisplaySnapshot(readFileSync(opts.against, 'utf8'));
  const diff = diffDisplayLists(baseline, actual);
  return {
    equal: diff.equal,
    report: diff.equal
      ? `match: ${actual.commands.length} commands identical to ${opts.against}`
      : `${opts.against} (baseline) -> scene @ ${opts.at}s\n${formatDisplayDiff(diff)}`,
    actual,
  };
}

async function diffAgainstPng(opts: DiffOptions): Promise<DiffResult> {
  // Render the still on Skia (the headless twin) and raw byte-compare the PNG.
  // No pixel-diff algorithm: a mismatch just reports the byte/length delta and
  // points at `gs diff --against <.dl.json>` for a command-level explanation.
  const { SkiaBackend } = await import('@glissade/backend-skia');
  const mod = await loadSceneModule(opts.modulePath);
  const scene = mod.createScene();
  const backend = new SkiaBackend(scene.size.w, scene.size.h);
  scene.setTextMeasurer(backend);
  const actual = evaluate(scene, mod.timeline, opts.at);
  backend.render(actual);
  const actualPng = backend.encodePng();
  const baselinePng = readFileSync(opts.against);
  const equal = actualPng.equals(baselinePng);
  return {
    equal,
    report: equal
      ? `match: rendered PNG is byte-identical to ${opts.against}`
      : `PNG mismatch vs ${opts.against}: baseline ${baselinePng.length}B, rendered ${actualPng.length}B` +
        `\n(byte-compare only; run with --against a .dl.json baseline for a command-level diff)`,
    actual,
  };
}

/** Snapshot a scene's DisplayList at `t` to a `.dl.json` string (the baseline writer). */
export async function snapshotAt(modulePath: string, t: number): Promise<string> {
  return serializeDisplayList(await evaluateAt(modulePath, t));
}
