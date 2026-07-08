/**
 * gs scaffold (Era B, card qv_iaQ6KBCRy) — the narration→beat-skeleton codegen.
 * Gates the canary-converged design spine: DETERMINISTIC output (pure fn of the
 * frozen manifest → byte-identical run-to-run, incl. the infer/stub boundary),
 * the CONSERVATIVE id-convention recipe selection (fixed/total priority), and
 * ANTI-WORKSLOP (an un-inferable segment → an honest labeled stub, never a forced
 * recipe). The scaffold-OUTPUT render golden lives in the Skia suite (a fixture
 * narration → scaffold → the emitted scene renders byte-identical).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generateScaffoldModule, scaffoldCommand, selectRecipe } from '../src/scaffold.js';

const dir = mkdtempSync(join(tmpdir(), 'glissade-scaffold-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// a fixture manifest: two bookend-convention segments (→ recipes) + two bespoke body
// segments (→ honest stubs), so both paths are exercised.
const timing = {
  timingVersion: 1,
  provider: 'fake',
  providerVersion: 'f',
  totalDuration: 8,
  segments: [
    { id: 'seg-title', text: 'The Assistant Nobody Manages', start: 0.2, duration: 1.6, file: 'a.wav' },
    { id: 'seg-desk-intro', text: 'First, picture your assistant as a contractor.', start: 1.8, duration: 2.4, file: 'b.wav' },
    { id: 'seg-vending', text: 'It vends an answer for every coin you drop in.', start: 4.2, duration: 2.0, file: 'c.wav' },
    { id: 'seg-footnote', text: 'Sources are approximate.', start: 6.2, duration: 1.6, file: 'd.wav' },
  ],
};

describe('selectRecipe — conservative, deterministic id-convention table', () => {
  it('maps only high-confidence structural conventions; everything else → null (honest stub)', () => {
    expect(selectRecipe('seg-title')).toBe('title-card');
    expect(selectRecipe('cold-open')).toBe('cold-open');
    expect(selectRecipe('seg-footnote')).toBe('lower-third');
    // bespoke body beats → null → stub (anti-workslop: don't force a recipe)
    expect(selectRecipe('seg-desk-intro')).toBeNull();
    expect(selectRecipe('seg-vending')).toBeNull();
    // stat-reveal is NEVER auto-picked (a digit is not a stat card)
    expect(selectRecipe('seg-42-stats')).toBeNull();
  });
  it('is a pure function of the id (same id → same verdict)', () => {
    for (const id of ['seg-title', 'seg-x', 'cold-open']) expect(selectRecipe(id)).toBe(selectRecipe(id));
  });
});

describe('generateScaffoldModule — deterministic, honest-stub emitter', () => {
  const code = generateScaffoldModule(timing, 'e01');

  it('is byte-identical run-to-run (canonical — pure fn of the manifest)', () => {
    expect(generateScaffoldModule(timing, 'e01')).toBe(code);
  });

  it('emits the require() drift-guard with EVERY segment id', () => {
    expect(code).toMatch(/beats\.require\(\[/);
    for (const s of timing.segments) expect(code).toContain(JSON.stringify(s.id));
  });

  it('emits a recipe() ONLY for confident matches, an honest // TODO beat: stub otherwise', () => {
    expect(code).toContain(`recipe("title-card", { id: "seg-title"`); // confident
    expect(code).toContain(`recipe("lower-third", { id: "seg-footnote"`); // confident
    // bespoke beats are labeled stubs, NOT forced recipes
    expect(code).toMatch(/TODO beat: drop a component for 'seg-desk-intro'/);
    expect(code).toMatch(/TODO beat: drop a component for 'seg-vending'/);
    expect(code).not.toContain('seg-desk-intro", { id'); // never a recipe on a bespoke beat
  });

  it('carries the verbatim segment text (from the frozen manifest) + the frame TODO', () => {
    expect(code).toContain('First, picture your assistant as a contractor.');
    expect(code).toMatch(/TODO frame: wrap the children/);
    expect(code).toContain(`import { recipe } from '@glissade/scene/recipes';`); // recipe import present (>=1 recipe)
    expect(code).toContain(`import timingJson from './e01.narration.timing.json';`);
  });

  it('omits the recipe import when NO segment matches (all-stub narration)', () => {
    const allStub = { ...timing, segments: [{ id: 'seg-a', text: 'x', start: 0, duration: 1, file: 'a.wav' }] };
    expect(generateScaffoldModule(allStub, 'e0')).not.toContain('@glissade/scene/recipes');
  });
});

describe('scaffoldCommand — writes the module, refuses to clobber', () => {
  it('writes <base>.scaffold.ts and reports the recipe/stub split', () => {
    const input = join(dir, 'e01.narration.timing.json');
    writeFileSync(input, JSON.stringify(timing));
    const r = scaffoldCommand({ input });
    expect(r.out).toBe(join(dir, 'e01.scaffold.ts'));
    expect(readFileSync(r.out, 'utf8')).toBe(generateScaffoldModule(timing, 'e01'));
    expect(r.recipes.map((x) => x.seg).sort()).toEqual(['seg-footnote', 'seg-title']);
    expect(r.stubs.sort()).toEqual(['seg-desk-intro', 'seg-vending']);
  });

  it('refuses to overwrite an existing scaffold without --force (protect refinements)', () => {
    const input = join(dir, 'e01.narration.timing.json');
    expect(() => scaffoldCommand({ input })).toThrow(/already exists/);
    expect(() => scaffoldCommand({ input, force: true })).not.toThrow();
  });

  it('fails loud on an empty / segment-less manifest', () => {
    const empty = join(dir, 'empty.narration.timing.json');
    writeFileSync(empty, JSON.stringify({ timingVersion: 1, segments: [] }));
    expect(() => scaffoldCommand({ input: empty })).toThrow(/no narration segments/);
  });
});
