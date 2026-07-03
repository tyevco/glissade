/**
 * gs export --lottie (the inverse of `gs import`): a glissade scene module → a
 * Lottie/bodymovin .json. Loads the SceneModule (the node tree + Timeline), runs
 * the pure `@glissade/lottie` exporter, and writes the document. Scope-out /
 * degrade notes surface as warnings (mirroring `gs import`).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { exportLottie } from '@glissade/lottie';
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
  const doc = exportLottie(mod, {
    width,
    height,
    ...(opts.fps !== undefined ? { fps: opts.fps } : {}),
    onWarn: (w) => warnings.push(w),
  });
  const outAbs = resolve(opts.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, `${JSON.stringify(doc, null, 2)}\n`);
  return { out: outAbs, warnings };
}
