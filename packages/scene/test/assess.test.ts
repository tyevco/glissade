/**
 * 0.63 assess() — the ONE composed VERDICT (the Era-A capstone).
 *
 * assess COMPOSES the shipped suite (validateScene + critique + exportFidelity +
 * diff + certKey) and UNIFIES / dedupes / PRIORITIZES the diagnostics, then reports
 * `clean` = no error + no geometry-fixable warning (accepted removed, content-only
 * escalated). These tests pin: the composition + clean-of-fixable gate, the
 * per-lever fixClass veto (TEXT_OVERFLOW stays auto-fixable), the ACCEPT mechanism
 * (scoped-intent removes from the fixable set), and the diff-convergence detector.
 */
import { describe, expect, it } from 'vitest';
import { type Timeline, timeline } from '@glissade/core';
import { createScene, Rect, Text, Group } from '../src/index.js';
import {
  assess,
  fixHintsOf,
  isGeometryFixable,
  isContentOnly,
  sameDiagnostics,
  type SceneDiagnostic,
} from '../src/diagnostics.js';
import { type TextMeasurer } from '../src/text.js';

const size = { w: 200, h: 100 };
const empty: Timeline = { version: 1, tracks: [] };

/** Deterministic, non-estimating measurer: width = len·size·0.6. */
const stub: TextMeasurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.6, ascent: f.size * 0.8, descent: f.size * 0.2 }),
};

function sceneWith(...children: (Rect | Text | Group)[]) {
  const s = createScene({ size, children });
  s.setTextMeasurer(stub);
  return s;
}

describe('assess — the composed verdict + clean-of-fixable gate', () => {
  it('a clean scene → clean:true, empty fixable, a certKey', () => {
    const scene = sceneWith(
      new Rect({ id: 'box', position: [100, 50], width: 40, height: 30, fill: '#3366ff' }),
      new Text({ id: 'cap', position: [100, 50], text: 'Hi', fontSize: 10, fill: '#000' }),
    );
    const v = assess(scene, empty);
    expect(v.clean).toBe(true);
    expect(v.fixable).toEqual([]);
    expect(v.hasErrors).toBe(false);
    expect(typeof v.certKey).toBe('string');
    expect(v.certKey.length).toBeGreaterThan(0);
  });

  it('an off-canvas node → clean:false, the diagnostic is a geometry-fixable in the work queue', () => {
    const scene = sceneWith(new Rect({ id: 'title', position: [-100, 50], width: 40, height: 30, fill: '#f00' }));
    const v = assess(scene, empty);
    expect(v.clean).toBe(false);
    expect(v.fixable.some((d) => d.code === 'OFF_CANVAS')).toBe(true);
    expect(isGeometryFixable(v.fixable[0]!)).toBe(true);
  });

  it('composes static errors from validateScene (a dead track → error → clean:false)', () => {
    const scene = sceneWith(new Rect({ id: 'box', position: [100, 50], width: 40, height: 30, fill: '#00f' }));
    const doc = timeline((tl) => tl.to('nope/position.x', 10, { duration: 1 }));
    const v = assess(scene, doc);
    expect(v.hasErrors).toBe(true);
    expect(v.clean).toBe(false);
    expect(v.diagnostics.some((d) => d.code === 'UNKNOWN_TARGET' && d.severity === 'error')).toBe(true);
    // prioritized: an error sorts before any warning.
    expect(v.diagnostics[0]!.severity).toBe('error');
  });

  it('folds exportFidelity in ONLY when exportBound — a render-only feature escalates, does not block clean', () => {
    const scene = sceneWith(
      new Text({ id: 'cap', position: [100, 50], text: 'Hi', fontSize: 10, fill: '#000', reveal: 1 }),
    );
    const off = assess(scene, empty);
    expect(off.diagnostics.some((d) => d.code === 'RENDER_ONLY_EXPORT')).toBe(false);

    const on = assess(scene, empty, { exportBound: true });
    expect(on.diagnostics.some((d) => d.code === 'RENDER_ONLY_EXPORT')).toBe(true);
    // A render-only warning has NO mechanical lever → it must ESCALATE (the human
    // decides: accept the export-fidelity loss or restructure), NOT sit unpartitioned.
    // This is the meaning-veto's escalate half — the reachability edcc caught dead.
    expect(on.escalated.some((d) => d.code === 'RENDER_ONLY_EXPORT')).toBe(true);
    // ...and it is NEVER auto-fixable (no geometry lever to auto-apply).
    expect(on.fixable.some((d) => d.code === 'RENDER_ONLY_EXPORT')).toBe(false);
    // ...and it does NOT block `clean` — the loop has done all it mechanically can.
    expect(on.clean).toBe(true);
    // Regression guard: `escalated` is a REACHABLE partition, not dead code.
    expect(on.escalated.length).toBeGreaterThan(0);
  });

  it('attaches a blast-radius when a previous state is given (informational, never blocks clean)', () => {
    const before = sceneWith(new Rect({ id: 'box', position: [100, 50], width: 40, height: 30, fill: '#00f' }));
    const after = sceneWith(new Rect({ id: 'box', position: [100, 50], width: 40, height: 30, fill: '#f00' }));
    const v = assess(after, empty, { previous: { scene: before, timeline: empty } });
    expect(v.blastRadius).toBeDefined();
    expect(v.blastRadius!.empty).toBe(false);
    expect(v.clean).toBe(true); // a color change is a change, not a problem
  });
});

describe('assess — per-lever fixClass (the meaning-preservation veto)', () => {
  it('a FEASIBLE TEXT_OVERFLOW exposes ≥1 in-bounds geometry lever (stays auto-fixable) + a content lever marked content', () => {
    // measured 5·20·0.6 = 60 > box 50 → over 10; shrinking to fit lands fontSize
    // ~16.7px (≥ MIN_LEGIBLE_PX) and a 60px box fits the 200px canvas → BOTH
    // geometry levers are in-bounds, so the overflow stays auto-fixable.
    const scene = sceneWith(
      new Text({ id: 'cap', position: [100, 50], width: 50, text: 'HELLO', fontSize: 20, fill: '#000' }),
    );
    const v = assess(scene, empty);
    const overflow = v.diagnostics.find((d) => d.code === 'TEXT_OVERFLOW');
    expect(overflow).toBeDefined();
    const hints = fixHintsOf(overflow!);
    expect(hints.some((h) => h.fixClass === 'geometry')).toBe(true);
    expect(hints.some((h) => h.lever === 'text' && h.fixClass === 'content')).toBe(true);
    // an in-bounds geometry lever ⇒ auto-fixable ⇒ it's in the work queue, blocks clean.
    expect(isGeometryFixable(overflow!)).toBe(true);
    expect(v.fixable).toContain(overflow);
    expect(v.clean).toBe(false);
  });

  it('an OUT-OF-BOUNDS TEXT_OVERFLOW ESCALATES — geometry exhausted (shrink goes sub-legible AND a box big enough runs off-canvas), never auto-shrunk sub-legible', () => {
    // 40 chars at fontSize 20 in a 30px box on a 200px canvas: measured 480px.
    // fontSize fix would need ~1.25px (< MIN_LEGIBLE_PX 6) and a 480px box exceeds
    // the 200px canvas — BOTH geometry levers are infeasible, so the loop must NOT
    // auto-produce a "clean" but unreadable caption; it ESCALATES to a human.
    // (ai-training's content-seat catch: the string is preserved, but so is the RESULT.)
    const scene = sceneWith(
      new Text({ id: 'cap', position: [100, 50], width: 30, text: 'X'.repeat(40), fontSize: 20, fill: '#000' }),
    );
    const v = assess(scene, empty);
    const esc = v.escalated.find((d) => d.code === 'TEXT_OVERFLOW');
    expect(esc, 'an overflow with no in-bounds geometry fix must ESCALATE, not silently auto-shrink').toBeDefined();
    // never in the auto-fix work queue…
    expect(v.fixable.some((d) => d.code === 'TEXT_OVERFLOW')).toBe(false);
    expect(isGeometryFixable(esc!)).toBe(false);
    // …and its ONLY remaining lever is the content one (both geometry levers dropped).
    const hints = fixHintsOf(esc!);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.every((h) => h.fixClass === 'content')).toBe(true);
    // the escalate reason is legible in the message.
    expect(esc!.message).toContain('human decision');
  });

  it('a SYNTHETIC all-content diagnostic → isContentOnly → escalate (never auto-fixable)', () => {
    const allContent: SceneDiagnostic = {
      schemaVersion: 1,
      code: 'OFF_CANVAS',
      severity: 'warning',
      message: 'synthetic',
      node: 'x',
      detail: { fixHints: [{ lever: 'text', fixClass: 'content', hint: 'reword' }] },
    };
    expect(isContentOnly(allContent)).toBe(true);
    expect(isGeometryFixable(allContent)).toBe(false);
  });
});

describe('assess — ACCEPT (scoped-intent removes from the fixable set)', () => {
  it('an accepted diagnostic → clean:true with the diagnostic in the accepted residual', () => {
    const scene = sceneWith(new Rect({ id: 'parked', position: [-100, 50], width: 40, height: 30, fill: '#f00' }));
    // without acceptance: off-canvas blocks clean.
    expect(assess(scene, empty).clean).toBe(false);
    // accept by node id → removed from fixable, clean true, still in accepted[].
    const v = assess(scene, empty, { accepted: ['parked'] });
    expect(v.clean).toBe(true);
    expect(v.fixable).toEqual([]);
    expect(v.accepted.some((d) => d.node === 'parked' && d.code === 'OFF_CANVAS')).toBe(true);
    // the diagnostic still appears in the full list (residual, not hidden).
    expect(v.diagnostics.some((d) => d.node === 'parked')).toBe(true);
  });

  it('accept by CODE, by <code>@<node>, and by SUBTREE ancestor id', () => {
    const scene = sceneWith(
      new Group({ id: 'wing', children: [new Rect({ id: 'card', position: [-100, 50], width: 40, height: 30, fill: '#f00' })] }),
    );
    // critique reports the off-canvas on the leaf 'card' (the drawn node).
    expect(assess(scene, empty).diagnostics.some((d) => d.code === 'OFF_CANVAS' && d.node === 'card')).toBe(true);
    expect(assess(scene, empty, { accepted: ['OFF_CANVAS'] }).clean).toBe(true);
    expect(assess(scene, empty, { accepted: ['OFF_CANVAS@card'] }).clean).toBe(true);
    // SUBTREE: accepting the parked ancestor group id suppresses its child's off-canvas.
    expect(assess(scene, empty, { accepted: ['wing'] }).clean).toBe(true);
  });
});

describe('assess — diff-convergence (the loop termination detector)', () => {
  it('two identical rounds → same signature → sameDiagnostics true (no progress)', () => {
    const scene = sceneWith(new Rect({ id: 'title', position: [-100, 50], width: 40, height: 30, fill: '#f00' }));
    const a = assess(scene, empty);
    const b = assess(scene, empty);
    expect(a.signature).toBe(b.signature);
    expect(sameDiagnostics(a.diagnostics, b.diagnostics)).toBe(true);
  });

  it('a fixed scene → a DIFFERENT signature (progress detected)', () => {
    const broken = sceneWith(new Rect({ id: 'title', position: [-100, 50], width: 40, height: 30, fill: '#f00' }));
    const fixed = sceneWith(new Rect({ id: 'title', position: [100, 50], width: 40, height: 30, fill: '#f00' }));
    expect(assess(broken, empty).signature).not.toBe(assess(fixed, empty).signature);
  });

  it('assess is a PURE, deterministic composition (identical output run-to-run)', () => {
    const scene = sceneWith(new Rect({ id: 'title', position: [-100, 50], width: 40, height: 30, fill: '#f00' }));
    const a = assess(scene, empty);
    const b = assess(scene, empty);
    expect(a.certKey).toBe(b.certKey);
    expect(a.diagnostics).toEqual(b.diagnostics);
  });
});

// ── 0.63.1 minLegiblePx — the per-call legibility floor reaches the partition ──
//
// A caption whose fontSize auto-fix would land BELOW minLegiblePx is geometry-
// EXHAUSTED (only the content lever remains) → assess ESCALATES it. Lowering the
// floor lets the fontSize lever back in → FIXABLE; raising it escalates a modest
// overflow sooner. edcc's anti-"schema-accepts-but-handler-ignores" guard: these
// prove the option THREADS from assess() opts → critique → the feasibility check,
// on BOTH the width and height overflow axes. Resize is held infeasible (measured
// ink exceeds the canvas) so the fontSize lever is the SOLE geometry lever — the
// clean toggle that flips fixable⇄escalated with the floor.

const hasOverflow = (ds: SceneDiagnostic[], dim: 'width' | 'height'): boolean =>
  ds.some((d) => d.code === 'TEXT_OVERFLOW' && (d.detail as { dimension?: string }).dimension === dim);

// WIDTH: unbreakable 20-char word, fontSize 20 → measured ink 240px (> canvas 200,
// so resize is infeasible). fitFontPx = 20·(boxWidth/240).
//   box width 50  → fitFontPx ≈ 4.17  (EXHAUSTED at floor 6, FIXABLE at floor 1)
//   box width 100 → fitFontPx ≈ 8.33  (FIXABLE at floor 6, EXHAUSTED at floor 40)
const widthExhausted = () =>
  sceneWith(new Text({ id: 'cap', position: [100, 50], width: 50, text: 'HELLOHELLOHELLOHELLO', fontSize: 20, fill: '#000' }));
const widthModest = () =>
  sceneWith(new Text({ id: 'cap', position: [100, 50], width: 100, text: 'HELLOHELLOHELLOHELLO', fontSize: 20, fill: '#000' }));

// HEIGHT: 6 lines, fontSize 20, lineHeight 1.25 → block 150px tall (> canvas 100,
// so resize is infeasible). fitFontPx = 20·(box.h/150).
//   box.h 20 → fitFontPx ≈ 2.67  (EXHAUSTED at floor 6, FIXABLE at floor 1)
//   box.h 90 → fitFontPx = 12    (FIXABLE at floor 6, EXHAUSTED at floor 40)
const heightExhausted = () =>
  sceneWith(new Text({ id: 'card', position: [100, 20], text: 'L1\nL2\nL3\nL4\nL5\nL6', fontSize: 20, fill: '#000', box: { valign: 'top', h: 20 } }));
const heightModest = () =>
  sceneWith(new Text({ id: 'card', position: [100, 20], text: 'L1\nL2\nL3\nL4\nL5\nL6', fontSize: 20, fill: '#000', box: { valign: 'top', h: 90 } }));

describe('assess — minLegiblePx per-call floor threads into the fixable/escalated partition', () => {
  it('WIDTH: a caption EXHAUSTED at the default floor (6) becomes FIXABLE at {minLegiblePx:1}', () => {
    const def = assess(widthExhausted(), empty);
    expect(hasOverflow(def.escalated, 'width')).toBe(true);
    expect(hasOverflow(def.fixable, 'width')).toBe(false);
    expect(def.clean).toBe(true); // escalated does not block clean

    const lowered = assess(widthExhausted(), empty, { minLegiblePx: 1 });
    expect(hasOverflow(lowered.fixable, 'width')).toBe(true);
    expect(hasOverflow(lowered.escalated, 'width')).toBe(false);
    expect(lowered.clean).toBe(false); // a geometry-fixable warning now blocks
  });

  it('WIDTH: a MODEST overflow FIXABLE at the default floor becomes ESCALATED at {minLegiblePx:40}', () => {
    const def = assess(widthModest(), empty);
    expect(hasOverflow(def.fixable, 'width')).toBe(true);
    expect(hasOverflow(def.escalated, 'width')).toBe(false);

    const raised = assess(widthModest(), empty, { minLegiblePx: 40 });
    expect(hasOverflow(raised.escalated, 'width')).toBe(true);
    expect(hasOverflow(raised.fixable, 'width')).toBe(false);
    // the raised floor reads back in the escalated diagnostic's message
    const d = raised.escalated.find((x) => x.code === 'TEXT_OVERFLOW');
    expect(d!.message).toContain('below 40px');
  });

  it('HEIGHT: a card EXHAUSTED at the default floor (6) becomes FIXABLE at {minLegiblePx:1}', () => {
    const def = assess(heightExhausted(), empty);
    expect(hasOverflow(def.escalated, 'height')).toBe(true);
    expect(hasOverflow(def.fixable, 'height')).toBe(false);

    const lowered = assess(heightExhausted(), empty, { minLegiblePx: 1 });
    expect(hasOverflow(lowered.fixable, 'height')).toBe(true);
    expect(hasOverflow(lowered.escalated, 'height')).toBe(false);
  });

  it('HEIGHT: a MODEST overflow FIXABLE at the default floor becomes ESCALATED at {minLegiblePx:40}', () => {
    const def = assess(heightModest(), empty);
    expect(hasOverflow(def.fixable, 'height')).toBe(true);
    expect(hasOverflow(def.escalated, 'height')).toBe(false);

    const raised = assess(heightModest(), empty, { minLegiblePx: 40 });
    expect(hasOverflow(raised.escalated, 'height')).toBe(true);
    expect(hasOverflow(raised.fixable, 'height')).toBe(false);
  });

  it('default equals OMITTED — assess(scene, tl) deep-equals assess(scene, tl, {minLegiblePx: 6})', () => {
    for (const make of [widthExhausted, widthModest, heightExhausted, heightModest]) {
      const omitted = assess(make(), empty);
      const explicit = assess(make(), empty, { minLegiblePx: 6 });
      expect(explicit.fixable).toEqual(omitted.fixable);
      expect(explicit.escalated).toEqual(omitted.escalated);
      expect(explicit.diagnostics).toEqual(omitted.diagnostics);
    }
  });
});
