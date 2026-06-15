/**
 * gs import (lottie-import.md §3.1): a vector asset → a generated TypeScript
 * scene module consumable by gs render. `.json` → Lottie/bodymovin (nodes +
 * inline Timeline); `.svg` → a static SVG scene (a wrapper deferring to
 * `@glissade/svg`'s `importSvg`, the single source of truth for the conversion).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { generateSceneModule, importLottie } from '@glissade/lottie';
import { importSvg } from '@glissade/svg';

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

/** Emit a renderable scene module that re-imports the SVG at module load. */
function generateSvgModule(svg: string, source: string): string {
  // embed the raw SVG verbatim; escape only what a template literal needs
  const embedded = svg.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return [
    `// Generated from ${source} by gs import. Re-imported via @glissade/svg at load;`,
    `// edit the source SVG and re-run, or replace this with hand-authored nodes.`,
    `import { importSvg } from '@glissade/svg';`,
    ``,
    `const SVG = \`${embedded}\`;`,
    ``,
    `export default importSvg(SVG).toSceneModule();`,
    ``,
  ].join('\n');
}

export async function importCommand(opts: ImportOptions): Promise<ImportCommandResult> {
  const inputAbs = resolve(opts.input);
  const outDir = resolve(opts.out);
  mkdirSync(outDir, { recursive: true });

  if (/\.svg$/i.test(inputAbs)) {
    let svg: string;
    try {
      svg = readFileSync(inputAbs, 'utf8');
    } catch (err) {
      throw new Error(`${opts.input}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const result = importSvg(svg); // validate + collect warnings (throws on no <svg>)
    const code = generateSvgModule(svg, basename(inputAbs));
    const outFile = join(outDir, `${basename(inputAbs).replace(/\.svg$/i, '')}.ts`);
    writeFileSync(outFile, code);
    return { out: outFile, warnings: result.warnings };
  }

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(inputAbs, 'utf8'));
  } catch (err) {
    throw new Error(`${opts.input}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = importLottie(json, { allowDegraded: opts.allowDegraded === true });
  const code = generateSceneModule(result, { source: basename(inputAbs) });
  const outFile = join(outDir, `${basename(inputAbs).replace(/\.json$/i, '')}.ts`);
  writeFileSync(outFile, code);
  return { out: outFile, warnings: result.warnings };
}
