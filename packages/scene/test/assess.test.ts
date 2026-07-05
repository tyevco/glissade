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
    // a render-only warning has no geometry lever → escalates, does NOT block clean.
    expect(on.clean).toBe(true);
    expect(on.escalated.length + on.diagnostics.filter((d) => d.code === 'RENDER_ONLY_EXPORT').length).toBeGreaterThan(0);
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
  it('TEXT_OVERFLOW exposes ≥1 geometry lever (stays auto-fixable) + a content lever marked content', () => {
    const scene = sceneWith(
      new Text({ id: 'cap', position: [100, 50], width: 30, text: 'a very long caption that overflows', fontSize: 12, fill: '#000' }),
    );
    const v = assess(scene, empty);
    const overflow = v.diagnostics.find((d) => d.code === 'TEXT_OVERFLOW');
    expect(overflow).toBeDefined();
    const hints = fixHintsOf(overflow!);
    expect(hints.some((h) => h.fixClass === 'geometry')).toBe(true);
    expect(hints.some((h) => h.lever === 'text' && h.fixClass === 'content')).toBe(true);
    // any geometry lever ⇒ auto-fixable ⇒ it's in the work queue, blocks clean.
    expect(isGeometryFixable(overflow!)).toBe(true);
    expect(v.fixable).toContain(overflow);
    expect(v.clean).toBe(false);
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
