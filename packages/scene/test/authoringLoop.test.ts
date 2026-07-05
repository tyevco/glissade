/**
 * 0.63 the AGENT-LOOP pattern — a RUNNABLE example (docs/authoring-loop.md).
 *
 * The loop is AGENT-driven, NOT a framework function: the framework owns the VERDICT
 * (assess), the agent owns the FIX. This exercises the whole cycle on a
 * deliberately-broken-then-fixable scene: author → assess() → auto-apply a GEOMETRY
 * lever from the top diagnostic (never a content lever) → re-author → repeat until
 * clean-of-fixable OR no-progress (convergence) OR max-iters (fail-loud).
 *
 * The fixes here are GEOMETRY-only (move on-frame, widen the wrap box) — the
 * meaning-preservation veto: the loop never touches text content.
 */
import { describe, expect, it } from 'vitest';
import { type Timeline } from '@glissade/core';
import { createScene, Rect, Text } from '../src/index.js';
import { assess, fixHintsOf, type AssessResult, type SceneDiagnostic } from '../src/diagnostics.js';
import { type TextMeasurer } from '../src/text.js';

const size = { w: 200, h: 100 };
const empty: Timeline = { version: 1, tracks: [] };
const stub: TextMeasurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.6, ascent: f.size * 0.8, descent: f.size * 0.2 }),
};

/** The agent's editable source state — what it PATCHES between iterations. */
interface Draft {
  titleX: number;
  capWidth: number;
}

/** Author a scene from the draft (the agent's "author" step). */
function author(d: Draft) {
  const scene = createScene({
    size,
    children: [
      new Rect({ id: 'title', position: [d.titleX, 50], width: 40, height: 30, fill: '#f00' }),
      new Text({ id: 'cap', position: [100, 50], width: d.capWidth, text: 'a long overflowing caption', fontSize: 10, fill: '#000' }),
    ],
  });
  scene.setTextMeasurer(stub);
  return scene;
}

/** Apply a GEOMETRY lever for the top diagnostic (the agent's fix intelligence). It
 *  reads the structured detail — never the prose — and never a content lever. */
function applyGeometryFix(draft: Draft, top: SceneDiagnostic): Draft {
  const geo = fixHintsOf(top).find((h) => h.fixClass === 'geometry');
  expect(geo, 'top diagnostic must expose a geometry lever').toBeDefined();
  if (top.code === 'OFF_CANVAS') {
    // move the box on-frame: center it horizontally (a geometry move).
    return { ...draft, titleX: size.w / 2 };
  }
  if (top.code === 'TEXT_OVERFLOW') {
    // widen the wrap box to the measured ink (the 'width' geometry lever).
    const measured = (top.detail as { measured?: number }).measured ?? size.w;
    return { ...draft, capWidth: Math.ceil(measured) + 4 };
  }
  throw new Error(`no geometry fix wired for ${top.code}`);
}

describe('the agent loop — runs to clean on a fixable (geometry-only) scene', () => {
  it('author → assess → auto-fix geometry → re-assess → clean', () => {
    let draft: Draft = { titleX: -100, capWidth: 20 }; // off-canvas + overflow
    const MAX_ITERS = 20;
    let lastSignature = '';
    let iters = 0;
    let final: AssessResult | undefined;

    for (let i = 0; i < MAX_ITERS; i++) {
      iters = i + 1;
      const scene = author(draft);
      const v = assess(scene, empty);
      final = v;
      if (v.clean) break; // clean-of-fixable → done

      // convergence: no-progress ⇒ the fix isn't helping ⇒ fail loud (never silent).
      if (v.signature === lastSignature) throw new Error('author loop STUCK — diagnostic set unchanged');
      lastSignature = v.signature;

      const top = v.fixable[0];
      expect(top, 'a non-clean verdict must have a geometry-fixable in the queue').toBeDefined();
      draft = applyGeometryFix(draft, top!);
    }

    expect(final!.clean).toBe(true);
    expect(iters).toBeLessThan(MAX_ITERS); // converged well within the backstop
    // both geometry problems were actually fixed (not accepted away).
    expect(final!.accepted).toEqual([]);
    // the converged render carries a trust handle.
    expect(final!.certKey.length).toBeGreaterThan(0);
  });

  it('the convergence guard FIRES when a fix makes no progress (a no-op patch)', () => {
    // a fixer that never actually changes the draft → the diagnostic set repeats.
    let draft: Draft = { titleX: -100, capWidth: 20 };
    let lastSignature = '';
    let stuckDetected = false;

    for (let i = 0; i < 5; i++) {
      const v = assess(author(draft), empty);
      if (v.clean) break;
      if (v.signature === lastSignature) {
        stuckDetected = true;
        break;
      }
      lastSignature = v.signature;
      // BROKEN fixer: returns the draft unchanged (simulates a fix that doesn't help).
      draft = { ...draft };
    }
    expect(stuckDetected).toBe(true);
  });
});
