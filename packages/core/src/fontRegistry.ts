/**
 * FontRegistry (DESIGN.md §3.6) — a pure index over a Timeline's font assets:
 * which families are declared, their concrete faces, and their fallback chains.
 * Built once from `doc.assets`; consumed by the loaders (register every face)
 * and by font validation (family coverage). Zero DOM/Node — just data.
 *
 * The asset id IS the font family name (the §3.6 convention). A bare
 * `{ kind: 'font', url }` is the family's single 400/normal face with no
 * fallback, so existing documents map to byte-identical registries.
 */

import type { AssetRef } from './timeline.js';

/** A concrete, fully-resolved face: family + the URL to load it from. */
export interface ResolvedFace {
  family: string;
  url: string;
  weight: number;
  style: 'normal' | 'italic';
}

export interface FontRegistry {
  /** true iff `family` was declared as a font asset (case-sensitive, §3.6). */
  has(family: string): boolean;
  /** Every declared face across every family — what the loaders register. */
  faces(): ResolvedFace[];
  /**
   * CSS nearest-weight matching within `family` (and the requested style when
   * an exact style match exists), or undefined when the family is unregistered.
   */
  resolveFace(family: string, weight?: number, style?: 'normal' | 'italic'): ResolvedFace | undefined;
  /** `[family, ...declaredFallback]` — the order glyph coverage walks. */
  fallbackChain(family: string): string[];
}

interface FamilyEntry {
  faces: ResolvedFace[];
  fallback: string[];
}

function facesOf(family: string, ref: AssetRef): ResolvedFace[] {
  if (ref.faces && ref.faces.length > 0) {
    return ref.faces.map((f) => ({
      family,
      url: f.url,
      weight: f.weight ?? 400,
      style: f.style ?? 'normal',
    }));
  }
  // bare single-face form: the family url is the 400/normal face
  return [{ family, url: ref.url, weight: 400, style: 'normal' }];
}

/**
 * CSS Fonts §5.2 nearest-weight: among candidates (already filtered to the
 * desired style when possible), pick the closest weight. Ties below the target
 * prefer the lighter; the standard's directional preference (≤500 search down
 * first, ≥500 search up first) collapses to "closest, lighter on a tie" here,
 * which is sufficient for the small, explicit face sets glissade documents
 * carry.
 */
function nearestWeight(faces: ResolvedFace[], weight: number): ResolvedFace | undefined {
  let best: ResolvedFace | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const f of faces) {
    const dist = Math.abs(f.weight - weight);
    if (dist < bestDist || (dist === bestDist && best !== undefined && f.weight < best.weight)) {
      best = f;
      bestDist = dist;
    }
  }
  return best;
}

export function buildFontRegistry(assets?: Record<string, AssetRef> | undefined): FontRegistry {
  const families = new Map<string, FamilyEntry>();
  for (const [family, ref] of Object.entries(assets ?? {})) {
    if (ref.kind !== 'font') continue;
    families.set(family, { faces: facesOf(family, ref), fallback: ref.fallback ? [...ref.fallback] : [] });
  }

  return {
    has(family) {
      return families.has(family);
    },
    faces() {
      const out: ResolvedFace[] = [];
      for (const entry of families.values()) out.push(...entry.faces);
      return out;
    },
    resolveFace(family, weight = 400, style = 'normal') {
      const entry = families.get(family);
      if (!entry) return undefined;
      // prefer the requested style when that style is present at all
      const styled = entry.faces.filter((f) => f.style === style);
      const pool = styled.length > 0 ? styled : entry.faces;
      return nearestWeight(pool, weight);
    },
    fallbackChain(family) {
      const entry = families.get(family);
      return entry ? [family, ...entry.fallback] : [family];
    },
  };
}
