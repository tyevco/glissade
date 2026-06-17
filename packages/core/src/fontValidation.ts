/**
 * Font validation (DESIGN.md §3.6) — the family-level + glyph-coverage check.
 * Pure: given the text usages collected from a scene, the FontRegistry, and the
 * already-parsed cmap coverage per family, it reports unregistered families and
 * glyphs that would hit system fallback ("héllo 👋 renders emoji in Chrome,
 * tofu in Skia"). Strict mode throws; dev mode warns and returns the report.
 *
 * The strict-vs-dev switch is a per-render/per-export OPTION, never a Timeline
 * document flag. Generic and OS families are exempt — only a non-generic,
 * UNREGISTERED family is a strict error (the locked decision).
 */

import { emitDevWarning } from './devWarning.js';
import type { FontRegistry } from './fontRegistry.js';

export type FontMode = 'strict' | 'dev';

/** One text usage to validate: a family and the (full, un-revealed) text. */
export interface FontUsage {
  family: string;
  text: string;
}

export interface MissingGlyphs {
  family: string;
  /** the uncovered code points, ascending, de-duplicated */
  codePoints: number[];
}

export interface CoverageReport {
  /** non-generic, unregistered families referenced by Text content */
  unregistered: string[];
  /** per-family code points no face in the family's chain covers */
  missingGlyphs: MissingGlyphs[];
}

export class FontValidationError extends Error {
  readonly report: CoverageReport;
  constructor(report: CoverageReport) {
    super(formatReport(report));
    this.name = 'FontValidationError';
    this.report = report;
  }
}

/**
 * Generic CSS families (CSS Fonts §15) — exempt from the unregistered check;
 * they intentionally resolve to a system/UA font. `sans-serif` is the Text
 * default, so a default-font Text never errors in strict mode.
 */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

/**
 * Is `family` exempt from the unregistered-family check? Generics are exempt by
 * the spec; an `osFamilies` allowlist lets a caller mark OS-installed families
 * (which the rasterizer can resolve without registration) as exempt too.
 */
export function isExemptFamily(family: string, osFamilies?: ReadonlySet<string>): boolean {
  const f = family.trim().toLowerCase();
  if (GENERIC_FAMILIES.has(f)) return true;
  return osFamilies?.has(f) ?? false;
}

function codePoints(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) out.push(cp);
  }
  return out;
}

function formatReport(report: CoverageReport): string {
  const parts: string[] = [];
  if (report.unregistered.length > 0) {
    parts.push(`unregistered font ${report.unregistered.length === 1 ? 'family' : 'families'}: ${report.unregistered.join(', ')}`);
  }
  for (const m of report.missingGlyphs) {
    const cps = m.codePoints.map((c) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')).join(', ');
    parts.push(`family '${m.family}' is missing glyphs for ${cps}`);
  }
  return (
    'font validation failed (§3.6): ' +
    parts.join('; ') +
    ' — register the family with its faces/fallback, or supply covering glyphs'
  );
}

export interface ValidateFontsOptions {
  /** OS-installed families to treat as registered (lowercased). */
  osFamilies?: ReadonlySet<string> | undefined;
}

/**
 * Validate `usages` against `registry`. `cmaps` maps family → covered code
 * points (already parsed via parseCmap by the caller's I/O). A family with no
 * cmap entry contributes no coverage (its glyphs all count as missing) unless
 * it is exempt or its chain reaches a covered family.
 *
 * Returns the report. In `'strict'` mode it throws FontValidationError when the
 * report is non-empty; in `'dev'` mode it emits a dev warning instead.
 */
export function validateFonts(
  usages: readonly FontUsage[],
  registry: FontRegistry,
  cmaps: ReadonlyMap<string, ReadonlySet<number>>,
  mode: FontMode,
  options: ValidateFontsOptions = {},
): CoverageReport {
  const unregistered = new Set<string>();
  // family → set of uncovered code points
  const missing = new Map<string, Set<number>>();

  for (const usage of usages) {
    const family = usage.family;
    const exempt = isExemptFamily(family, options.osFamilies);
    const registered = registry.has(family);

    if (!registered) {
      if (!exempt) unregistered.add(family);
      // an unregistered (or exempt) family has no cmap we can check against;
      // glyph coverage is the rasterizer's system-fallback problem, not ours
      continue;
    }

    const chain = registry.fallbackChain(family);
    for (const cp of codePoints(usage.text)) {
      const covered = chain.some((fam) => cmaps.get(fam)?.has(cp) ?? false);
      if (!covered) {
        let set = missing.get(family);
        if (!set) {
          set = new Set<number>();
          missing.set(family, set);
        }
        set.add(cp);
      }
    }
  }

  const report: CoverageReport = {
    unregistered: [...unregistered].sort(),
    missingGlyphs: [...missing.entries()]
      .map(([family, cps]) => ({ family, codePoints: [...cps].sort((a, b) => a - b) }))
      .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0)),
  };

  const empty = report.unregistered.length === 0 && report.missingGlyphs.length === 0;
  if (!empty) {
    if (mode === 'strict') throw new FontValidationError(report);
    emitDevWarning(formatReport(report));
  }
  return report;
}
