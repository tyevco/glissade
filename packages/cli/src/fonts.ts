/**
 * gs fonts audit (DESIGN.md §3.6) — the font front-door report. Loads a scene
 * module, builds the FontRegistry from its timeline assets, ingests each face
 * (sniff format → woff2 decode → static instance, via @glissade/core/font-ingest),
 * and prints per family: the declared faces, the on-disk format, the cmap
 * coverage size, and any missing-glyph RUNS for the text the scene actually
 * renders ("héllo 👋 renders emoji in Chrome, tofu in Skia").
 *
 * Read-only and offline: no rasterization, no network. The same ingest path the
 * render/prepare steps use, so the audit reflects exactly what would ship.
 */

import { readFile } from 'node:fs/promises';
import { buildFontRegistry } from '@glissade/core';
import { collectTextUsages } from '@glissade/scene/diagnostics';
import { loadSceneModule } from './render.js';

export interface FontAuditFaceReport {
  family: string;
  url: string;
  weight: number;
  style: 'normal' | 'italic';
  /** sniffed source format, or 'missing' when the file could not be read. */
  format: string;
  /** number of code points the (decoded/instanced) face covers; -1 if unread. */
  coverage: number;
}

export interface FontAuditFamilyReport {
  family: string;
  faces: FontAuditFaceReport[];
  /** code points used by Text in this family that NO face covers, as runs. */
  missingRuns: { start: number; end: number }[];
}

export interface FontAuditReport {
  families: FontAuditFamilyReport[];
}

function codePointsOf(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) out.push(cp);
  }
  return out;
}

/** Collapse a sorted, de-duped code-point list into [start,end] inclusive runs. */
function toRuns(cps: number[]): { start: number; end: number }[] {
  const sorted = [...new Set(cps)].sort((a, b) => a - b);
  const runs: { start: number; end: number }[] = [];
  for (const cp of sorted) {
    const last = runs[runs.length - 1];
    if (last && cp === last.end + 1) last.end = cp;
    else runs.push({ start: cp, end: cp });
  }
  return runs;
}

function hex(cp: number): string {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Build the audit report for a scene module. `resolvePath` maps an asset url to
 * an absolute path to read (the CLI resolves relative to the scene module).
 */
export async function auditSceneFonts(
  modulePath: string,
  resolvePath: (url: string) => string,
): Promise<FontAuditReport> {
  const mod = await loadSceneModule(modulePath);
  const scene = mod.createScene();
  const doc = mod.timeline;
  const registry = buildFontRegistry(doc.assets);

  // one cmap per declared face, ingested through the real front door so a woff2
  // / variable face audits exactly as it would render.
  const ingest = await import('@glissade/core/font-ingest');
  const faceCoverage = new Map<string, ReadonlySet<number>>(); // family|url → covered cps

  const families: FontAuditFamilyReport[] = [];
  for (const family of [...new Set(registry.faces().map((f) => f.family))].sort()) {
    const faceReports: FontAuditFaceReport[] = [];
    for (const face of registry.faces().filter((f) => f.family === family)) {
      let format = 'missing';
      let coverage = -1;
      try {
        const src = await readFile(resolvePath(face.url));
        const result = await ingest.ingestFont({ family: face.family, src });
        format = result.sourceFormat;
        coverage = result.coverage.size;
        faceCoverage.set(`${family}|${face.url}`, result.coverage);
      } catch {
        // unreadable / unrecognized: reported as 'missing', contributes no coverage
      }
      faceReports.push({
        family: face.family,
        url: face.url,
        weight: face.weight,
        style: face.style,
        format,
        coverage,
      });
    }

    // missing glyphs: code points used by this family's Text that no face in the
    // family covers (the family-level chain is walked by the registry already).
    const missing = new Set<number>();
    const usages = collectTextUsages(scene).filter((u) => u.family === family);
    if (usages.length > 0) {
      const covered = new Set<number>();
      for (const face of registry.faces().filter((f) => f.family === family)) {
        const cov = faceCoverage.get(`${family}|${face.url}`);
        if (cov) for (const cp of cov) covered.add(cp);
      }
      for (const u of usages) for (const cp of codePointsOf(u.text)) if (!covered.has(cp)) missing.add(cp);
    }

    families.push({ family, faces: faceReports, missingRuns: toRuns([...missing]) });
  }

  return { families };
}

/** Render the audit report as the human-readable text `gs fonts audit` prints. */
export function formatFontAudit(report: FontAuditReport): string {
  if (report.families.length === 0) return 'no font families registered in this scene';
  const lines: string[] = [];
  for (const fam of report.families) {
    lines.push(`${fam.family}`);
    for (const f of fam.faces) {
      const cov = f.coverage >= 0 ? `${f.coverage} glyphs` : 'unreadable';
      lines.push(`  - ${f.weight}/${f.style}  ${f.format.padEnd(10)}  ${cov}  (${f.url})`);
    }
    if (fam.missingRuns.length > 0) {
      const runs = fam.missingRuns
        .map((r) => (r.start === r.end ? hex(r.start) : `${hex(r.start)}–${hex(r.end)}`))
        .join(', ');
      lines.push(`  ! missing glyphs for used text: ${runs}`);
    }
  }
  return lines.join('\n');
}

/** The `gs fonts audit <scene-module>` entry point. Returns the report + text. */
export async function fontsAuditCommand(args: {
  modulePath: string;
  resolvePath: (url: string) => string;
}): Promise<{ report: FontAuditReport; text: string }> {
  const report = await auditSceneFonts(args.modulePath, args.resolvePath);
  return { report, text: formatFontAudit(report) };
}
