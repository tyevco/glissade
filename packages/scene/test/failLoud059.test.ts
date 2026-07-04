/**
 * 0.59 "fail-loud ground floor" — validateScene (eager, aggregating,
 * render-neutral) + resolveAt (truthful read) + instanceProps (instance-level
 * bound indicator) + the throw/warn MODE GATE + the measurer fail-loud opt-in.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { createScene, evaluate, bindScene, Rect, Text } from '../src/index.js';
import { Column, loadYogaLayoutEngine } from '../src/layout.js';
import { splitText, MeasurerRequiredError } from '../src/type.js';
import { setDefaultMeasurer } from '../src/text.js';
import {
  validateScene,
  resolveAt,
  instanceProps,
  nearestId,
  levenshtein,
  DIAGNOSTIC_SCHEMA_VERSION,
} from '../src/diagnostics.js';

const size = { w: 200, h: 100 };

describe('validateScene — eager aggregating validator', () => {
  it('AGGREGATES every unresolved target (not throw-on-first) as UNKNOWN_TARGET errors', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
    const doc = timeline((tl) =>
      tl
        .to('box/opacity', 0, { from: 1, duration: 1 }) // valid
        .to('ghost/opacity', 0, { from: 1, duration: 1 }) // unknown node
        .to('box/opacty', 0, { from: 1, duration: 1 }), // typo'd prop
    );
    const res = validateScene(scene, doc);
    expect(res.schemaVersion).toBe(DIAGNOSTIC_SCHEMA_VERSION);
    expect(res.hasErrors).toBe(true);
    const unknowns = res.diagnostics.filter((d) => d.code === 'UNKNOWN_TARGET');
    // BOTH bad targets reported — aggregation, not throw-on-first
    expect(unknowns).toHaveLength(2);
    expect(unknowns.map((d) => d.track).sort()).toEqual(['box/opacty', 'ghost/opacity']);
    for (const d of unknowns) expect(d.severity).toBe('error');
  });

  it('suggests the nearest NODE id for an unknown node target', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'title', width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('ttle/opacity', 0, { from: 1, duration: 1 }));
    const d = validateScene(scene, doc).diagnostics.find((x) => x.code === 'UNKNOWN_TARGET')!;
    expect(d.message).toContain("did you mean 'title'");
  });

  it('suggests the nearest PROP when the node exists but the prop is typo\'d', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('box/opacty', 0, { from: 1, duration: 1 }));
    const d = validateScene(scene, doc).diagnostics.find((x) => x.code === 'UNKNOWN_TARGET')!;
    expect(d.message).toContain("did you mean 'box/opacity'");
    expect(d.node).toBe('box');
  });

  it('is CLEAN for a fully-valid scene (no diagnostics of error severity)', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', position: [50, 50], width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('box/opacity', 0, { from: 1, duration: 1 }));
    const res = validateScene(scene, doc);
    expect(res.hasErrors).toBe(false);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('every diagnostic carries the PINNED schema shape and JSON-round-trips', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('ghost/opacity', 0, { from: 1, duration: 1 }));
    const res = validateScene(scene, doc);
    for (const d of res.diagnostics) {
      expect(d.schemaVersion).toBe(DIAGNOSTIC_SCHEMA_VERSION);
      expect(['error', 'warning', 'info']).toContain(d.severity);
      expect(typeof d.code).toBe('string');
      expect(typeof d.message).toBe('string');
    }
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
  });

  it('does NOT emit OFF_CANVAS — it is reserved for critique() (0.60), a composed-geometry check', () => {
    // OFF_CANVAS is a RENDERED-geometry check (needs ancestor Group world
    // transforms), so validateScene — which reads only static LOCAL positions —
    // must NOT emit it (a nested child would false-positive). The code stays
    // reserved in the enum for 0.60 critique().
    const scene = createScene({ size, children: [new Rect({ id: 'far', position: [9999, 9999], width: 10, height: 10 })] });
    const res = validateScene(scene);
    expect(res.diagnostics.find((d) => d.code === 'OFF_CANVAS')).toBeUndefined();
    expect(res.hasErrors).toBe(false);
  });

  it('emits ONLY the three static codes (UNKNOWN_TARGET, MEASURER_FALLBACK, YOGA_CHILD_POSITION)', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'far', position: [9999, 9999], width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('ghost/opacity', 0, { from: 1, duration: 1 }));
    const emitted = new Set(validateScene(scene, doc).diagnostics.map((d) => d.code));
    for (const c of emitted) {
      expect(['UNKNOWN_TARGET', 'MEASURER_FALLBACK', 'YOGA_CHILD_POSITION']).toContain(c);
    }
  });
});

describe('validateScene — YOGA_CHILD_POSITION (C)', () => {
  beforeAll(async () => {
    await loadYogaLayoutEngine();
  });

  it('warns when a track drives position of a FLOWABLE child of a Layout', () => {
    const child = new Rect({ id: 'card', width: 20, height: 20 });
    const scene = createScene({ size, children: [Column({ id: 'stack', width: 100, height: 80, children: [child] })] });
    const doc = timeline((tl) => tl.to('card/position.x', 30, { from: 0, duration: 1 }));
    const res = validateScene(scene, doc);
    const warn = res.diagnostics.find((d) => d.code === 'YOGA_CHILD_POSITION');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
    expect(warn!.track).toBe('card/position.x');
    expect(res.hasErrors).toBe(false); // a warning, not an error
  });

  it('does NOT warn on a non-position track of a Layout child', () => {
    const child = new Rect({ id: 'card', width: 20, height: 20 });
    const scene = createScene({ size, children: [Column({ id: 'stack', width: 100, height: 80, children: [child] })] });
    const doc = timeline((tl) => tl.to('card/opacity', 0, { from: 1, duration: 1 }));
    expect(validateScene(scene, doc).diagnostics.find((d) => d.code === 'YOGA_CHILD_POSITION')).toBeUndefined();
  });

  it('does NOT warn on a position track of a NON-Layout (Group) child', () => {
    const child = new Rect({ id: 'card', width: 20, height: 20 });
    const scene = createScene({ size, children: [new Rect({ id: 'plain', width: 10, height: 10 }), child] });
    const doc = timeline((tl) => tl.to('card/position.x', 30, { from: 0, duration: 1 }));
    expect(validateScene(scene, doc).diagnostics.find((d) => d.code === 'YOGA_CHILD_POSITION')).toBeUndefined();
  });
});

describe('validateScene — RENDER NEUTRAL (the observer invariant)', () => {
  it('render(scene) is byte-identical whether or not validateScene ran first', () => {
    const make = () =>
      createScene({ size, children: [new Rect({ id: 'box', position: [50, 50], width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('box/position.x', 120, { from: 20, duration: 1 }));

    // cold render
    const cold = make();
    const a = JSON.stringify(evaluate(cold, doc, 0.5));

    // render after a preceding validateScene() on the same scene
    const warm = make();
    validateScene(warm, doc);
    const b = JSON.stringify(evaluate(warm, doc, 0.5));

    expect(b).toBe(a);
  });
});

describe('resolveAt — the truthful read primitive (B)', () => {
  it('a BOUND prop returns its real bound value at t (not the static default)', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('box/position.x', 100, { from: 0, duration: 1 }));
    bindScene(scene, doc);
    expect(resolveAt(scene, 'box/position.x', 0)).toBeCloseTo(0);
    expect(resolveAt(scene, 'box/position.x', 1)).toBeCloseTo(100);
    expect(resolveAt(scene, 'box/position.x', 0.5)).toBeCloseTo(50);
  });

  it('an UNBOUND prop returns its static value at any t', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', position: [7, 9], width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('box/position.x', 100, { from: 0, duration: 1 }));
    bindScene(scene, doc);
    // position.y is never targeted → static 9 regardless of t
    expect(resolveAt(scene, 'box/position.y', 0)).toBeCloseTo(9);
    expect(resolveAt(scene, 'box/position.y', 1)).toBeCloseTo(9);
  });

  it('an unresolvable target returns undefined', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
    expect(resolveAt(scene, 'ghost/opacity', 0)).toBeUndefined();
  });

  it('does not disturb a subsequent render (playhead restored)', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', position: [50, 50], width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('box/position.x', 100, { from: 0, duration: 1 }));
    const before = JSON.stringify(evaluate(scene, doc, 0.25));
    resolveAt(scene, 'box/position.x', 0.9); // read at a DIFFERENT time
    const after = JSON.stringify(evaluate(scene, doc, 0.25));
    expect(after).toBe(before);
  });
});

describe('instanceProps — instance-level bound indicator (B)', () => {
  it('announces which props are CURRENTLY bound on THIS instance after binding', () => {
    const box = new Rect({ id: 'box', width: 10, height: 10 });
    const scene = createScene({ size, children: [box] });
    const doc = timeline((tl) => tl.to('box/position.x', 100, { from: 0, duration: 1 }));
    bindScene(scene, doc);
    const props = instanceProps(box);
    const posX = props.find((p) => p.path === 'position.x')!;
    const opacity = props.find((p) => p.path === 'opacity')!;
    expect(posX.bound).toBe(true); // the track bound it
    expect(opacity.bound).toBe(false); // untouched
  });

  it('a computed-initializer prop reports bound even without a timeline', () => {
    const box = new Rect({ id: 'box', opacity: () => 0.5, width: 10, height: 10 });
    const opacity = instanceProps(box).find((p) => p.path === 'opacity')!;
    expect(opacity.bound).toBe(true);
  });
});

describe('mode gate — throw (default, loud) vs warn (prod)', () => {
  const badDoc = () => timeline((tl) => tl.to('ghost/opacity', 0, { from: 1, duration: 1 }));

  it('DEFAULT bindScene THROWS on an unresolved target (loud)', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
    expect(() => bindScene(scene, badDoc())).toThrow(/no property signal resolves|no node/i);
  });

  it("onUnbound:'warn' DOWNGRADES the throw and skips the dead track", () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
    const doc = badDoc();
    expect(() => bindScene(scene, doc, { onUnbound: 'warn' })).not.toThrow();
    // the scene still renders (degraded, not hard-failed) — same doc = memo hit
    expect(() => evaluate(scene, doc, 0)).not.toThrow();
  });

  it('both modes are BYTE-IDENTICAL for a VALID scene (only invalid-scene behavior differs)', () => {
    const make = () =>
      createScene({ size, children: [new Rect({ id: 'box', position: [50, 50], width: 10, height: 10 })] });
    const doc = timeline((tl) => tl.to('box/position.x', 120, { from: 20, duration: 1 }));

    const loud = make();
    bindScene(loud, doc, { onUnbound: 'throw' });
    const a = JSON.stringify(evaluate(loud, doc, 0.5));

    const quiet = make();
    bindScene(quiet, doc, { onUnbound: 'warn' });
    const b = JSON.stringify(evaluate(quiet, doc, 0.5));

    expect(b).toBe(a);
  });
});

describe('measurer fail-loud opt-in (E)', () => {
  it('splitText DEFAULT degrades (warn-once) with no real measurer — no throw', () => {
    setDefaultMeasurer(null); // force the estimating fallback
    expect(() => splitText(new Text({ id: 't', text: 'a b c' }), { by: 'word' })).not.toThrow();
  });

  it('splitText { requireMeasurer:true } THROWS MeasurerRequiredError with no real measurer', () => {
    setDefaultMeasurer(null);
    expect(() => splitText(new Text({ id: 't', text: 'a b c' }), { by: 'word', requireMeasurer: true })).toThrow(
      MeasurerRequiredError,
    );
  });
});

describe('Levenshtein / nearestId', () => {
  it('computes edit distance', () => {
    expect(levenshtein('title', 'title')).toBe(0);
    expect(levenshtein('ttle', 'title')).toBe(1);
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });

  it('suggests a near candidate within budget, none for a wild miss', () => {
    expect(nearestId('ttle', ['title', 'body'])).toBe('title');
    expect(nearestId('zzzzzz', ['title', 'body'])).toBeUndefined();
  });
});
