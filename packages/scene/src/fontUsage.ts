/**
 * Scene → font-validation bridge (DESIGN.md §3.6). Core owns the AssetRef,
 * FontRegistry, cmap reader, and the pure validation; this module owns the
 * node-walk (which only `scene` can do) and the I/O seam that loads a font
 * face's bytes so core stays DOM/Node-free.
 *
 * `collectTextUsages` walks every Text node and reads the FULL `.text()` (not
 * the reveal-masked prefix) — coverage is a property of the authored content,
 * independent of the playhead, so it stays out of the pure evaluate() path.
 */

import {
  buildFontRegistry,
  parseCmap,
  validateFonts,
  type CoverageReport,
  type FontMode,
  type FontUsage,
  type Timeline,
} from '@glissade/core';
import { Group, Text } from './nodes.js';
import type { Node } from './node.js';
import type { Scene } from './scene.js';

/** Walk `scene` for Text nodes; one usage per node carrying its full text. */
export function collectTextUsages(scene: Scene): FontUsage[] {
  const out: FontUsage[] = [];
  const visit = (node: Node): void => {
    if (node instanceof Text) {
      const text = node.text();
      if (text) out.push({ family: node.fontFamily, text });
    }
    if (node instanceof Group) {
      for (const child of node.children) visit(child);
    }
  };
  visit(scene.root);
  return out;
}

/**
 * Caller-supplied I/O: fetch the raw bytes for a font face URL (the export
 * paths read a file / fetch a URL; this keeps core pure). Returning undefined
 * means "could not load" — that family contributes no coverage, surfacing as
 * missing glyphs (strict) / a dev warning, never a hang.
 */
export type FontByteLoader = (url: string) => Promise<ArrayBuffer | undefined>;

export interface ValidateSceneFontsOptions {
  mode?: FontMode;
  /** OS-installed families to treat as registered (case-insensitive). */
  osFamilies?: ReadonlySet<string> | undefined;
}

/**
 * Run §3.6 font validation for a scene + its timeline document. Builds the
 * registry from `doc.assets`, loads each registered face's cmap via `loadBytes`
 * (once per family — the first face's URL is enough for coverage), and runs the
 * pure `validateFonts`. Strict mode throws FontValidationError; dev warns.
 */
export async function validateSceneFonts(
  scene: Scene,
  doc: Timeline,
  loadBytes: FontByteLoader,
  options: ValidateSceneFontsOptions = {},
): Promise<CoverageReport> {
  const mode: FontMode = options.mode ?? 'dev';
  const registry = buildFontRegistry(doc.assets);
  const usages = collectTextUsages(scene);

  // parse one cmap per registered family that's actually used (and any family
  // in a used family's fallback chain), so we don't load fonts no Text needs
  const wanted = new Set<string>();
  for (const u of usages) {
    if (registry.has(u.family)) for (const f of registry.fallbackChain(u.family)) wanted.add(f);
  }

  const cmaps = new Map<string, ReadonlySet<number>>();
  for (const family of wanted) {
    const face = registry.resolveFace(family);
    if (!face) continue; // fallback family not itself registered: no coverage data
    const bytes = await loadBytes(face.url);
    if (bytes) cmaps.set(family, parseCmap(bytes));
  }

  return validateFonts(usages, registry, cmaps, mode, {
    ...(options.osFamilies !== undefined ? { osFamilies: options.osFamilies } : {}),
  });
}
