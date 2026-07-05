/**
 * 0.63 recipes — clean-by-construction starter scaffolds.
 *
 * THE HARD GUARD: every registered recipe passes assess() CLEAN at DEFAULT props
 * (no off-canvas / overflow / occlusion) — a recipe emitting a problem at defaults
 * is broken, and the loop that starts from it would inherit that problem. Plus the
 * describe().recipes registry populates on import, and recipe() fails loud on an
 * unknown name.
 */
import { describe, expect, it } from 'vitest';
import { type Timeline } from '@glissade/core';
import { createScene } from '../src/index.js';
import { assess } from '../src/diagnostics.js';
import { recipe, listRecipes, RECIPE_MANIFEST, DEFAULT_FRAME, UnknownRecipeError, type RecipeName } from '../src/recipes.js';
import { describe as describeApi } from '../src/describe.js';
import { type TextMeasurer } from '../src/text.js';

const empty: Timeline = { version: 1, tracks: [] };

/** Deterministic non-estimating measurer so TEXT_OVERFLOW would be a CONFIDENT
 *  verdict (not info-downgraded) — the clean-at-defaults guard is thus real. */
const stub: TextMeasurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.6, ascent: f.size * 0.8, descent: f.size * 0.2 }),
};

const NAMES: RecipeName[] = ['lower-third', 'title-card', 'stat-reveal', 'cold-open'];

describe('recipes — clean-by-construction at DEFAULT props (the hard guard)', () => {
  for (const name of NAMES) {
    it(`recipe('${name}') at defaults → assess() clean`, () => {
      const scene = createScene({ size: { ...DEFAULT_FRAME }, children: [recipe(name)] });
      scene.setTextMeasurer(stub);
      const v = assess(scene, empty);
      // No mechanical problem at defaults: clean of fixable AND no diagnostics of the
      // rendered-geometry codes.
      expect(v.clean, `${name}: ${JSON.stringify(v.diagnostics.map((d) => d.code))}`).toBe(true);
      expect(v.diagnostics.some((d) => ['OFF_CANVAS', 'TEXT_OVERFLOW', 'OCCLUSION'].includes(d.code))).toBe(false);
    });
  }
});

describe('recipes — the factory', () => {
  it('returns a Group fragment with the recipe id + prefixed child ids', () => {
    const g = recipe('lower-third', { title: 'Ada', subtitle: 'Analyst' });
    expect(g.describeType).toBe('Group');
    expect(g.id).toBe('lower-third');
  });

  it('honors a custom id and props', () => {
    const g = recipe('title-card', { id: 'intro', title: 'Hello' });
    expect(g.id).toBe('intro');
    // clean at custom short props too.
    const scene = createScene({ size: { ...DEFAULT_FRAME }, children: [g] });
    scene.setTextMeasurer(stub);
    expect(assess(scene, empty).clean).toBe(true);
  });

  it('fails loud on an unknown recipe name', () => {
    expect(() => recipe('nope' as RecipeName)).toThrow(UnknownRecipeError);
  });
});

describe('recipes — describe().recipes registry (populated on import)', () => {
  it('surfaces every registered recipe with typed, defaulted props', () => {
    const manifest = describeApi();
    expect(manifest.recipes).toBeDefined();
    const names = (manifest.recipes ?? []).map((r) => r.name).sort();
    expect(names).toEqual([...NAMES].sort());
    // every prop carries a type; the scaffold props carry a default.
    for (const r of manifest.recipes ?? []) {
      for (const [prop, spec] of Object.entries(r.props)) {
        expect(spec.type, `${r.name}.${prop}`).toBeTruthy();
      }
    }
  });

  it('listRecipes() matches the manifest', () => {
    expect(listRecipes().map((r) => r.name).sort()).toEqual(RECIPE_MANIFEST.map((r) => r.name).sort());
  });
});
