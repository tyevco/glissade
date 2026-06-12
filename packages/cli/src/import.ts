/**
 * gs import (lottie-import.md §3.1): Lottie/bodymovin .json → a generated
 * TypeScript scene module (nodes + inline Timeline) consumable by gs render.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { generateSceneModule, importLottie } from '@glissade/lottie';

export interface ImportOptions {
  input: string;
  /** Output directory; the module is written as <basename>.ts inside it. */
  out: string;
  allowDegraded?: boolean;
}

export interface ImportCommandResult {
  out: string;
  warnings: string[];
}

export async function importCommand(opts: ImportOptions): Promise<ImportCommandResult> {
  const inputAbs = resolve(opts.input);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(inputAbs, 'utf8'));
  } catch (err) {
    throw new Error(`${opts.input}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = importLottie(json, { allowDegraded: opts.allowDegraded === true });
  const code = generateSceneModule(result, { source: basename(inputAbs) });
  const outDir = resolve(opts.out);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${basename(inputAbs).replace(/\.json$/i, '')}.ts`);
  writeFileSync(outFile, code);
  return { out: outFile, warnings: result.warnings };
}
