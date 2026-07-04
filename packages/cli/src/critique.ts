/**
 * `gs critique <scene-module>` (0.60): machine-readable RENDERED diagnostics from
 * the DisplayList — the rendered-geometric half of `gs describe --lint` /
 * validateScene. Loads the scene, injects the Skia measurer (so TEXT_OVERFLOW
 * measures with the same metrics `gs render` lays out with), runs `critique`, and
 * prints the flat, canonically-sorted diagnostics. `--json` emits the raw result
 * for a machine consumer; exits non-zero iff any diagnostic is `error` severity
 * (only static errors are — the rendered pass emits warnings/info).
 */

import { critique, type CritiqueResult } from '@glissade/scene/diagnostics';
import { loadSceneModule } from './render.js';

export interface CritiqueCommandOptions {
  modulePath: string;
  json?: boolean;
}

export interface CritiqueCommandResult {
  result: CritiqueResult;
  report: string;
  /** true iff any diagnostic is `error` severity (⇒ non-zero exit). */
  hasErrors: boolean;
}

export async function critiqueCommand(opts: CritiqueCommandOptions): Promise<CritiqueCommandResult> {
  // Layout scenes need the (async, wasm) Yoga engine registered before evaluate()
  // — evaluate() never awaits (§2.5), so load it up front like `gs render` does.
  try {
    const { loadYogaLayoutEngine } = await import('@glissade/scene/layout');
    await loadYogaLayoutEngine();
  } catch {
    /* engine optional — a Layout-free scene renders fine without it */
  }
  const mod = await loadSceneModule(opts.modulePath);
  const scene = mod.createScene();
  // Skia = the headless measurer twin, so TEXT_OVERFLOW / text bounds match the
  // render path (line breaking uses the rasterizer that will draw).
  const { SkiaBackend } = await import('@glissade/backend-skia');
  scene.setTextMeasurer(new SkiaBackend(scene.size.w, scene.size.h));
  const result = critique(scene, mod.timeline);

  if (opts.json) {
    return { result, report: JSON.stringify(result, null, 2), hasErrors: result.hasErrors };
  }
  return { result, report: formatCritique(result), hasErrors: result.hasErrors };
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
