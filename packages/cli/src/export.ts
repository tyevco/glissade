/**
 * gs export --lottie (the inverse of `gs import`): a glissade scene module → a
 * Lottie/bodymovin .json. Loads the SceneModule (the node tree + Timeline), runs
 * the pure `@glissade/lottie` exporter, and writes the document. Scope-out /
 * degrade notes surface as warnings (mirroring `gs import`).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { exportLottie } from '@glissade/lottie';
import type { SceneModule, TextMeasurer } from '@glissade/scene';
import { loadSceneModule } from './render.js';

export interface ExportOptions {
  /** Scene module path. */
  input: string;
  /** Output .json file. */
  out: string;
  width?: number;
  height?: number;
  fps?: number;
}

export interface ExportCommandResult {
  out: string;
  warnings: string[];
}

export async function exportCommand(opts: ExportOptions): Promise<ExportCommandResult> {
  const mod = await loadSceneModule(opts.input);
  // scene.size is the natural default for the document viewport
  const scene = mod.createScene();
  const width = opts.width ?? scene.size.w;
  const height = opts.height ?? scene.size.h;
  const warnings: string[] = [];
  // Build a Skia measurer with the scene's own fonts (narrationLint pattern) so
  // exportLottie can BAKE width-wrapped Text into the doc `t` with the SAME line
  // breaks the render produces — else wrapped text round-trips collapsed onto one
  // line. Absent this the exporter falls back to raw passthrough + a wrap warning.
  const measurer = await buildSceneMeasurer(mod, opts.input);
  const doc = exportLottie(mod, {
    width,
    height,
    ...(opts.fps !== undefined ? { fps: opts.fps } : {}),
    measurer,
    onWarn: (w) => warnings.push(w),
  });
  const outAbs = resolve(opts.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, `${JSON.stringify(doc, null, 2)}\n`);
  return { out: outAbs, warnings };
}

/**
 * A Skia measurer registered with the scene's declared font faces (the same
 * pattern narrationLintCommand uses) so `exportLottie` bakes width-wrapped Text
 * with the rasterizer's real metrics. Scenes referencing only system families
 * still measure faithfully (createMeasurer's SkiaBackend resolves them).
 */
async function buildSceneMeasurer(mod: SceneModule, input: string): Promise<TextMeasurer> {
  const { resolveAssetPath } = await import('./audioMix.js');
  const { buildFontRegistry } = await import('@glissade/core');
  const { createMeasurer } = await import('@glissade/backend-skia');
  const fontRegistry = buildFontRegistry(mod.timeline.assets);
  const fonts: Record<string, string> = {};
  for (const face of fontRegistry.faces()) {
    fonts[face.family] = resolveAssetPath(face.url, input);
  }
  return createMeasurer({ fonts });
}
