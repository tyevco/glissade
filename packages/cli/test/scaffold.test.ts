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
import { classifySegments, continuationBaseOf, generateScaffoldModule, scaffoldCommand, selectRecipe } from '../src/scaffold.js';

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
    expect(selectRecipe('seg-speaker-name')).toBe('lower-third'); // a real NAME super
    // bespoke body beats → null → stub (anti-workslop: don't force a recipe)
    expect(selectRecipe('seg-desk-intro')).toBeNull();
    expect(selectRecipe('seg-vending')).toBeNull();
    // v2: footnote/credit are FRAME-owned, NOT lower-third → stub (never confident-wrong)
    expect(selectRecipe('seg-footnote')).toBeNull();
    expect(selectRecipe('seg-credits')).toBeNull();
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
    // bespoke beats are labeled stubs, NOT forced recipes
    expect(code).toMatch(/TODO beat: drop a component for 'seg-desk-intro'/);
    expect(code).toMatch(/TODO beat: drop a component for 'seg-vending'/);
    expect(code).not.toContain('seg-desk-intro", { id'); // never a recipe on a bespoke beat
  });

  it('v2: a frame-owned convention (footnote) is a STUB tagged "likely FRAME-owned", not a lower-third recipe', () => {
    expect(code).not.toContain('recipe("lower-third", { id: "seg-footnote"'); // NOT a confident-wrong pick
    expect(code).toMatch(/TODO beat: drop a component for 'seg-footnote' \[likely FRAME-owned/);
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
    expect(r.recipes.map((x) => x.seg).sort()).toEqual(['seg-title']);
    expect(r.stubs.sort()).toEqual(['seg-desk-intro', 'seg-footnote', 'seg-vending']); // footnote now a frame-owned stub
    expect(r.continuations).toEqual([]);
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

describe('v2: split-suffix continuation coalescing (a -b/-c pause-split = one beat)', () => {
  const seg = (id: string, text = 'x'): { id: string; text: string; start: number; duration: number; file: string } => ({ id, text, start: 0, duration: 1, file: 'a.wav' });

  it('continuationBaseOf resolves -b/-b2/-c to the base (-a or bare), null when no base sibling', () => {
    const ids = new Set(['seg-cold-open-a', 'seg-cold-open-b', 'seg-desk', 'seg-desk-b', 'seg-lonely-c']);
    expect(continuationBaseOf('seg-cold-open-b', ids)).toBe('seg-cold-open-a'); // -a base wins
    expect(continuationBaseOf('seg-desk-b', ids)).toBe('seg-desk'); // bare base
    expect(continuationBaseOf('seg-cold-open-a', ids)).toBeNull(); // -a is the base, not a continuation
    expect(continuationBaseOf('seg-desk', ids)).toBeNull(); // standalone
    expect(continuationBaseOf('seg-lonely-c', ids)).toBeNull(); // no base sibling → standalone, not coalesced
  });

  it('v2.1: -a2/-N within-group continuation coalesces into -a (the send-line reveal case)', () => {
    const ids = new Set(['seg-sendline-a', 'seg-sendline-a2', 'seg-sendline-b', 'seg-orphan-a2']);
    expect(continuationBaseOf('seg-sendline-a2', ids)).toBe('seg-sendline-a'); // within-group second segment
    expect(continuationBaseOf('seg-sendline-a', ids)).toBeNull(); // -a (no digit) is the base
    expect(continuationBaseOf('seg-sendline-b', ids)).toBe('seg-sendline-a'); // new-letter still coalesces to -a
    expect(continuationBaseOf('seg-orphan-a2', ids)).toBeNull(); // no -a base sibling → standalone, not coalesced
  });

  it('a split cold-open emits ONE recipe (on the base) + a continuation note, NOT two cards', () => {
    const segs = [seg('seg-cold-open-a', 'Meet the assistant.'), seg('seg-cold-open-b', 'The one nobody manages.'), seg('seg-desk-intro', 'A desk beat.')];
    const picks = classifySegments(segs);
    expect(picks.map((p) => p.kind)).toEqual(['recipe', 'continuation', 'stub']);
    const code = generateScaffoldModule({ timingVersion: 1, segments: segs }, 'e02');
    // exactly ONE cold-open recipe (on -a), NOT two
    expect(code.match(/recipe\("cold-open"/g)?.length).toBe(1);
    expect(code).toContain(`recipe("cold-open", { id: "seg-cold-open-a"`);
    expect(code).not.toContain(`recipe("cold-open", { id: "seg-cold-open-b"`);
    // -b is labeled a continuation of -a (shares the beat), still in the require-guard
    expect(code).toMatch(/'seg-cold-open-b' continues 'seg-cold-open-a'/);
    expect(code).toContain('"seg-cold-open-b"'); // in require([...])
  });

  it('the coalescing is deterministic (same split narration → byte-identical .ts)', () => {
    const segs = [seg('seg-cold-open'), seg('seg-cold-open-b'), seg('seg-body')];
    expect(generateScaffoldModule({ timingVersion: 1, segments: segs }, 'e')).toBe(
      generateScaffoldModule({ timingVersion: 1, segments: segs }, 'e'),
    );
  });
});

describe('v3 cut 1: --frame emits the author episode frame via scaffoldFrame(opts, buildBody)', () => {
  const framed = generateScaffoldModule(timing, 'e01', './episode.js');

  it('is byte-identical run-to-run (pure fn of the manifest + the --frame path)', () => {
    expect(generateScaffoldModule(timing, 'e01', './episode.js')).toBe(framed);
  });

  it('emits scaffoldFrame(opts, buildBody) importing from the --frame path, not inline createScene/timeline', () => {
    expect(framed).toContain(`import { scaffoldFrame } from "./episode.js";`);
    expect(framed).toContain('export default scaffoldFrame(');
    expect(framed).toContain('(ep) => {');
    expect(framed).not.toContain('createScene('); // the frame owns the scene
    expect(framed).not.toContain('timeline('); // the frame owns the timeline
  });

  it('DROPS the frame-owned caption wiring (captionNode/captionTrack/labels) — finish() owns it', () => {
    expect(framed).not.toContain('captionNode');
    expect(framed).not.toContain('captionTrack');
    expect(framed).not.toMatch(/labels:/);
    // the require guard rides opts.require, not a separate beats.require() line
    expect(framed).toContain('require: ["seg-title", "seg-desk-intro", "seg-vending", "seg-footnote"]');
    expect(framed).not.toContain('beats.require(');
  });

  it('authors the body IMPERATIVELY against ep — recipe → ep.push + ep.add(ep.fadeIn), stub → ep-based TODO', () => {
    expect(framed).toContain(`ep.push(recipe("title-card", { id: "seg-title", frame: ep.size }))`);
    expect(framed).toContain(`ep.add(ep.fadeIn("seg-title", ep.anchor.start("seg-title")))`);
    // bespoke beats are honest ep-based stubs, never a forced recipe
    expect(framed).toMatch(/TODO beat: ep\.push\(<component for 'seg-desk-intro'>\).*ep\.anchor\.start\("seg-desk-intro"\)/);
  });

  it('splits editorial (TODO placeholders) from id-inferable (titleOutSeg/outroSeg filled)', () => {
    expect(framed).toMatch(/accent: "#888888", \/\/ TODO/);
    expect(framed).toMatch(/title: \{ title: "TODO: episode title" \}/);
    // titleOutSeg = first body beat (title-card is a recipe pick, so the first non-recipe body beat)
    expect(framed).toMatch(/titleOutSeg: "seg-desk-intro", \/\/ inferred/);
    // outroSeg inferred from the /outro/ convention (footnote here isn't outro → TODO)
    expect(framed).toMatch(/outroSeg: "TODO", \/\/ TODO/); // no seg-outro in this fixture
    expect(framed).toContain(`import { type NarrationTiming } from '@glissade/narrate';`);
  });

  it('the frameLESS path (no --frame) is UNCHANGED — byte-identical to the v2 output', () => {
    const frameless = generateScaffoldModule(timing, 'e01');
    expect(frameless).not.toBe(framed);
    expect(frameless).toContain('createScene('); // frameless keeps the inline scene
    expect(frameless).toContain('captionNode(SIZE)'); // frameless keeps caption wiring
    expect(frameless).toMatch(/TODO frame:/); // frameless keeps the frame stub
  });
});
