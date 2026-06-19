/**
 * The `gs narration-lint` command wiring: read the committed timing manifest,
 * build the REAL caption-fit probe (Skia measurer + the render's fonts driving
 * the actual caption node), run `lintNarration`, and render JSON / a table /
 * the --fix diff. The pure rules live in narrationLint.ts; this file owns only
 * the I/O + the Skia-measurer plumbing (so the lint's geometry == render's).
 */

import { existsSync, readFileSync } from 'node:fs';
import type { NarrationScript, NarrationTiming } from '@glissade/narrate';
import {
  fixDiff,
  formatTable,
  hasErrors,
  lintNarration,
  type CaptionProbe,
  type Diagnostic,
  type LintOptions,
} from './narrationLint.js';
import { loadSceneModule } from './render.js';

export interface NarrationLintOptions {
  /** a scene module (resolves the sibling timing manifest) or the manifest itself */
  input: string;
  maxCps?: number;
  /** caption node maxLines for the fit rule; default 2 (captionNode's own default) */
  maxLines?: number;
  json?: boolean;
  fix?: boolean;
  /** skip Tier-2 (warn-only) diagnostics */
  noWarnings?: boolean;
}

export interface NarrationLintResult {
  diagnostics: Diagnostic[];
  /** true when any Tier-1 diagnostic fired (the CI gate / exit code) */
  hasErrors: boolean;
  /** the rendered human/JSON/diff text to print */
  output: string;
  timingPath: string;
}

/** `<scene>.narration.timing.json` or the manifest path itself. */
export async function lintTimingPathFor(input: string): Promise<string> {
  if (input.endsWith('.narration.timing.json')) {
    if (!existsSync(input)) throw new Error(`no narration timing manifest at ${input}`);
    return input;
  }
  const { timingPathFor } = await import('./captions.js');
  const p = timingPathFor(input);
  if (!p) {
    throw new Error(
      `no narration timing manifest beside ${input} — run \`gs narrate\` first, ` +
        'or pass a *.narration.timing.json path directly',
    );
  }
  return p;
}

/**
 * Build a caption-fit probe by loading the scene, registering its fonts, and
 * driving the REAL `captions` node with the Skia measurer. Returns null when
 * the input is a bare manifest (no scene module) or the scene has no caption
 * node — caption-fit then doesn't run, and the lint is still exact for the
 * other rules. Async because font registration + the scene load are.
 */
export async function buildCaptionProbe(
  input: string,
  maxLines: number,
): Promise<CaptionProbe | null> {
  // a bare manifest path has no scene to measure against
  if (input.endsWith('.narration.timing.json')) return null;
  let mod;
  try {
    mod = await loadSceneModule(input);
  } catch {
    return null; // can't load the scene → skip caption-fit (other rules still run)
  }
  const scene = mod.createScene();
  const node = scene.nodes.get('captions');
  // duck-type the Text node API we drive (text/lineBoxes/position) without a
  // hard import of the concrete class. `text` is a signal: call it to READ,
  // `.set(v)` to WRITE (so the autoFit fontSize/position bindings re-flow).
  const cap = node as unknown as
    | {
        text: { (): string; set: (v: string) => void };
        lineBoxes: () => { y: number; h: number }[];
        position: { y: () => number };
      }
    | undefined;
  if (
    !cap ||
    typeof cap.lineBoxes !== 'function' ||
    typeof cap.text !== 'function' ||
    typeof cap.text.set !== 'function'
  ) {
    return null;
  }

  // DEFAULT to the Skia measurer with the render's own fonts (§narration-lint):
  // a lint that passes on the estimator but burns over on Skia defeats the
  // purpose. Register the scene's font faces the same way render.ts does, then
  // inject createMeasurer() so breakLines/autoFit measure with the rasterizer.
  const { resolveAssetPath } = await import('./audioMix.js');
  const { buildFontRegistry } = await import('@glissade/core');
  const fontRegistry = buildFontRegistry(mod.timeline.assets);
  const fonts: Record<string, string> = {};
  for (const face of fontRegistry.faces()) {
    fonts[face.family] = resolveAssetPath(face.url, input);
  }
  const { createMeasurer } = await import('@glissade/backend-skia');
  const measurer = createMeasurer({ fonts });
  scene.setTextMeasurer(measurer);

  return {
    sceneH: scene.size.h,
    maxLines,
    measure: (cueText) => {
      cap.text.set(cueText);
      const boxes = cap.lineBoxes();
      const lines = boxes.length;
      // lowest ink Y, in scene space: the node's baseline Y + the deepest box
      // (boxes are draw-space, relative to the first-baseline origin). With
      // autoFit the node bottom-anchors, so position.y already accounts for the
      // upward growth — the deepest box lands at the box's true bottom edge.
      const deepest = boxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);
      const bottomY = cap.position.y() + deepest;
      return { lines, bottomY };
    },
  };
}

/** Run the lint end-to-end and render the output (JSON / table / --fix diff). */
export async function narrationLintCommand(opts: NarrationLintOptions): Promise<NarrationLintResult> {
  const timingPath = await lintTimingPathFor(opts.input);
  const timing = JSON.parse(readFileSync(timingPath, 'utf8')) as NarrationTiming;
  if (timing.timingVersion !== 1) {
    throw new Error(`unsupported timingVersion ${String(timing.timingVersion)} in ${timingPath}`);
  }

  const maxLines = opts.maxLines ?? 2;
  const caption = await buildCaptionProbe(opts.input, maxLines);
  const lintOpts: LintOptions = {
    ...(opts.maxCps !== undefined ? { maxCps: opts.maxCps } : {}),
    ...(caption ? { caption } : {}),
    ...(opts.noWarnings ? { warnings: false } : {}),
  };
  const diagnostics = lintNarration(timing, lintOpts);
  const errors = hasErrors(diagnostics);

  let output: string;
  if (opts.fix) {
    // --fix prints a git-apply-able diff against the SCRIPT (where budgets live);
    // it NEVER writes a committed artifact. Read the script if present.
    const scriptPath = opts.input.endsWith('.narration.timing.json')
      ? opts.input.replace(/\.narration\.timing\.json$/, '.narration.json')
      : opts.input.replace(/\.[jt]sx?$/, '') + '.narration.json';
    const script: NarrationScript | { budgets?: Record<string, number> } = existsSync(scriptPath)
      ? (JSON.parse(readFileSync(scriptPath, 'utf8')) as NarrationScript)
      : {};
    const diff = fixDiff(diagnostics, scriptPath, script);
    output = diff || 'narration-lint --fix: nothing to suggest (no budget bumps apply)\n';
  } else if (opts.json) {
    output = JSON.stringify({ timingPath, hasErrors: errors, diagnostics }, null, 2) + '\n';
  } else {
    output = formatTable(diagnostics);
  }

  return { diagnostics, hasErrors: errors, output, timingPath };
}
