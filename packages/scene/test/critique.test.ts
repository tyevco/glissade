/**
 * 0.60 critique() — machine-readable RENDERED diagnostics from the DisplayList.
 *
 * Determinism-sensitive: fixed integer-frame grid sampling + canonically-sorted
 * output. These tests pin the empty-set gate (a clean scene MUST return zero
 * diagnostics), each of the 3 MVP codes firing (with an actionable fix-hint), the
 * span-not-per-frame discipline (slide-in entrances don't fire OFF_CANVAS; brief
 * occlusion doesn't fire OCCLUSION), the nested-Group composition axis (both), the
 * short-circuit on static errors, and sort-invariance (shuffle-then-sort ≡ emit).
 *
 * A deterministic STUB measurer stands in for a real backend so TEXT_OVERFLOW is
 * a confident verdict (identity-distinct from the estimating fallback); a separate
 * case exercises the MEASURER_FALLBACK downgrade with the estimating measurer.
 */
import { describe, expect, it } from 'vitest';
import { type Timeline, timeline, track, key } from '@glissade/core';
import { createScene, Rect, Text, Group } from '../src/index.js';
import { critique, sortDiagnostics, CritiqueError } from '../src/diagnostics.js';
import { describe as apiDescribe } from '../src/describe.js';
import { type TextMeasurer } from '../src/text.js';

const size = { w: 200, h: 100 };
const empty: Timeline = { version: 1, tracks: [] };

/** Deterministic, non-estimating measurer: width = len·size·0.6. */
const stub: TextMeasurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.6, ascent: f.size * 0.8, descent: f.size * 0.2 }),
};

describe('critique — empty-set on a clean scene (the HARD gate)', () => {
  it('returns ZERO diagnostics for a fully on-frame, non-overflowing, unoccluded scene', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'box', position: [100, 50], width: 40, height: 30, fill: '#3366ff' }),
        new Text({ id: 'cap', position: [100, 50], width: 200, text: 'Hi', fontSize: 10, fill: '#000' }),
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty);
    expect(res.renderedSkipped).toBe(false);
    expect(res.hasErrors).toBe(false);
    expect(res.diagnostics).toEqual([]);
    expect(res.sampledFrames).toBe(1); // duration 0 → frame 0 only
  });
});

describe('critique — OFF_CANVAS (span, composed-world bbox)', () => {
  it('FIRES for a node fully off-frame its whole lifetime, with a directional fix-hint', () => {
    const scene = createScene({
      size,
      children: [new Rect({ id: 'title', position: [-100, 50], width: 40, height: 30, fill: '#f00' })],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty);
    const d = res.diagnostics.find((x) => x.code === 'OFF_CANVAS');
    expect(d).toBeDefined();
    expect(d!.node).toBe('title');
    expect(d!.severity).toBe('warning');
    expect(d!.source).toBe('critique');
    expect(d!.message).toContain('off the LEFT');
    expect(d!.message).toContain('position');
    // mutual-exclusivity: an off-frame node fires OFF_CANVAS, NOT OCCLUSION
    expect(res.diagnostics.some((x) => x.code === 'OCCLUSION')).toBe(false);
  });

  it('does NOT fire for a slide-in entrance that starts off-frame but ends on-frame', () => {
    const scene = createScene({
      size,
      children: [new Rect({ id: 'slide', position: [-100, 50], width: 40, height: 30, fill: '#f00' })],
    });
    scene.setTextMeasurer(stub);
    const doc = timeline((tl) => tl.to('slide/position.x', 100, { from: -100, duration: 1 }));
    const res = critique(scene, doc, { fps: 10 });
    expect(res.diagnostics.some((x) => x.code === 'OFF_CANVAS')).toBe(false);
  });
});

describe('critique — nested-Group OFF_CANVAS (both composition axes)', () => {
  it('(i) FIRES for a genuinely off-canvas nested child while the on-screen Group does NOT', () => {
    const scene = createScene({
      size,
      children: [
        new Group({
          id: 'g',
          position: [100, 50],
          children: [
            new Rect({ id: 'anchor', position: [0, 0], width: 20, height: 20, fill: '#0f0' }), // on-screen
            new Rect({ id: 'kid', position: [200, 0], width: 40, height: 20, fill: '#f00' }), // composed → off RIGHT
          ],
        }),
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty);
    const off = res.diagnostics.filter((x) => x.code === 'OFF_CANVAS');
    expect(off.map((d) => d.node)).toEqual(['kid']); // ONLY the child, not the group or the anchor
    expect(off[0]!.message).toContain('off the RIGHT');
  });

  it('(ii) does NOT fire for an on-screen Group child at a large NEGATIVE local offset that composes on-screen', () => {
    const scene = createScene({
      size,
      children: [
        new Group({
          id: 'g2',
          position: [150, 50],
          children: [new Rect({ id: 'kid2', position: [-100, 0], width: 40, height: 20, fill: '#f00' })], // composed [50,50] on-screen
        }),
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty);
    expect(res.diagnostics.some((x) => x.code === 'OFF_CANVAS')).toBe(false);
  });
});

describe('critique — OFF_CANVAS offstage opt-out (author-declared intent, SUBTREE match)', () => {
  /** A parked drawer GROUP (off-frame) with a slot child + an UNRELATED off-frame stray. */
  const parkedScene = (): ReturnType<typeof createScene> => {
    const scene = createScene({
      size,
      children: [
        new Group({
          id: 'drawer',
          position: [-300, 50],
          children: [new Rect({ id: 'slot', position: [0, 0], width: 40, height: 20, fill: '#f00' })],
        }),
        new Rect({ id: 'stray', position: [-100, 50], width: 40, height: 20, fill: '#f00' }), // off LEFT, NOT parked
      ],
    });
    scene.setTextMeasurer(stub);
    return scene;
  };

  it('WITHOUT the opt-out, both the parked slot and the stray fire OFF_CANVAS', () => {
    const off = critique(parkedScene(), empty).diagnostics.filter((x) => x.code === 'OFF_CANVAS');
    expect(off.map((d) => d.node).sort()).toEqual(['slot', 'stray']);
  });

  it('offstage listing the GROUP id suppresses its whole SUBTREE (slot) but NOT a sibling stray', () => {
    const off = critique(parkedScene(), empty, { offstage: ['drawer'] }).diagnostics.filter((x) => x.code === 'OFF_CANVAS');
    // slot is silenced via its ancestor 'drawer'; the uncovered stray STILL fires
    expect(off.map((d) => d.node)).toEqual(['stray']);
  });

  it('offstage matches an exact LEAF id too (self-match)', () => {
    const off = critique(parkedScene(), empty, { offstage: ['stray'] }).diagnostics.filter((x) => x.code === 'OFF_CANVAS');
    expect(off.map((d) => d.node)).toEqual(['slot']); // only the still-uncovered parked slot
  });
});

describe('critique — TEXT_OVERFLOW (measured ink vs the node box, MEASURER_FALLBACK-aware)', () => {
  it('FIRES (warning) when a line overflows its wrap box under a REAL measurer', () => {
    const scene = createScene({
      size,
      children: [new Text({ id: 'label', position: [100, 50], width: 50, text: 'HELLO', fontSize: 20, fill: '#000' })],
    });
    scene.setTextMeasurer(stub); // 5·20·0.6 = 60 > 50 → overflow 10
    const res = critique(scene, empty);
    const d = res.diagnostics.find((x) => x.code === 'TEXT_OVERFLOW');
    expect(d).toBeDefined();
    expect(d!.node).toBe('label');
    expect(d!.severity).toBe('warning');
    expect(d!.detail).toMatchObject({ threshold: 50, dimension: 'width' });
    expect(Number((d!.detail as { overflowPx: number }).overflowPx)).toBeGreaterThan(0);
    expect(d!.message).toContain('fitText');
  });

  it('FIRES (warning) on a HEIGHT overflow — wrapped block TALLER than the box height (box.h)', () => {
    const scene = createScene({
      size,
      // three explicit lines at fontSize 20 (step quantize(20·1.25)=25 → block 75) in a 20px box
      children: [
        new Text({ id: 'card', position: [100, 40], text: 'L1\nL2\nL3', fontSize: 20, fill: '#000', box: { valign: 'top', h: 20 } }),
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty);
    const d = res.diagnostics.find((x) => x.code === 'TEXT_OVERFLOW' && (x.detail as { dimension?: string }).dimension === 'height');
    expect(d, 'a height-dimension TEXT_OVERFLOW should fire').toBeDefined();
    expect(d!.node).toBe('card');
    expect(d!.severity).toBe('warning');
    expect(d!.detail).toMatchObject({ dimension: 'height', threshold: 20 });
    expect(Number((d!.detail as { measured: number }).measured)).toBeGreaterThan(20); // block ~75px
    expect(Number((d!.detail as { overflowPx: number }).overflowPx)).toBeGreaterThan(0);
    expect(d!.message).toContain('box height');
    // width names the width lever, height names the height lever — distinct hints
    expect(d!.message).not.toContain('fitText');
  });

  it('does NOT fire a HEIGHT overflow when the block fits box.h (auto-height / roomy box)', () => {
    const scene = createScene({
      size,
      children: [
        new Text({ id: 'card', position: [100, 40], text: 'L1\nL2', fontSize: 20, fill: '#000', box: { valign: 'top', h: 200 } }),
      ],
    });
    scene.setTextMeasurer(stub);
    expect(critique(scene, empty).diagnostics.some((x) => x.code === 'TEXT_OVERFLOW')).toBe(false);
  });

  it('does NOT fire a HEIGHT overflow for auto-height text (no box.h to overflow)', () => {
    const scene = createScene({
      size,
      children: [new Text({ id: 'card', position: [100, 40], text: 'L1\nL2\nL3', fontSize: 20, fill: '#000' })],
    });
    scene.setTextMeasurer(stub);
    expect(critique(scene, empty).diagnostics.some((x) => x.code === 'TEXT_OVERFLOW')).toBe(false);
  });

  it('DOWNGRADES a height overflow to info under the estimating measurer', () => {
    const scene = createScene({
      size,
      children: [
        new Text({ id: 'card', position: [100, 40], text: 'L1\nL2\nL3', fontSize: 20, fill: '#000', box: { valign: 'top', h: 20 } }),
      ],
    });
    // no setTextMeasurer → estimating fallback
    const d = critique(scene, empty).diagnostics.find(
      (x) => x.code === 'TEXT_OVERFLOW' && (x.detail as { dimension?: string }).dimension === 'height',
    );
    expect(d).toBeDefined();
    expect(d!.severity).toBe('info');
    expect(d!.message).toContain('ESTIMATED');
  });

  it('DOWNGRADES to info under the estimating measurer (no confident verdict from estimated metrics)', () => {
    const scene = createScene({
      size,
      children: [new Text({ id: 'label', position: [100, 50], width: 50, text: 'HELLO', fontSize: 20, fill: '#000' })],
    });
    // no setTextMeasurer → the estimating fallback is in use
    const res = critique(scene, empty);
    const d = res.diagnostics.find((x) => x.code === 'TEXT_OVERFLOW');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('info');
    expect(d!.message).toContain('ESTIMATED');
  });

  it('does NOT fire when text fits its box', () => {
    const scene = createScene({
      size,
      children: [new Text({ id: 'label', position: [100, 50], width: 200, text: 'HELLO', fontSize: 20, fill: '#000' })],
    });
    scene.setTextMeasurer(stub);
    expect(critique(scene, empty).diagnostics.some((x) => x.code === 'TEXT_OVERFLOW')).toBe(false);
  });
});

describe('critique — OCCLUSION (bbox-level, opaque-only, whole-span)', () => {
  it('FIRES for a leaf fully covered by an OPAQUE occluder painted above it, whole span', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'logo', position: [100, 50], width: 20, height: 20, fill: '#0f0' }),
        new Rect({ id: 'card', position: [100, 50], width: 100, height: 70, fill: '#ffffff' }), // opaque, contains + above
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty);
    const d = res.diagnostics.find((x) => x.code === 'OCCLUSION');
    expect(d).toBeDefined();
    expect(d!.node).toBe('logo');
    expect(d!.severity).toBe('warning');
    expect(d!.detail).toMatchObject({ occluder: 'card' });
    expect(d!.message).toContain('zIndex');
    // the card itself is NOT occluded (nothing above it)
    expect(res.diagnostics.filter((x) => x.code === 'OCCLUSION')).toHaveLength(1);
  });

  it('does NOT fire when the occluder is TRANSLUCENT (paint alpha < 0.98)', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'logo', position: [100, 50], width: 20, height: 20, fill: '#0f0' }),
        new Rect({ id: 'card', position: [100, 50], width: 100, height: 70, fill: '#ffffff80' }), // 50% alpha
      ],
    });
    scene.setTextMeasurer(stub);
    expect(critique(scene, empty).diagnostics.some((x) => x.code === 'OCCLUSION')).toBe(false);
  });

  it('does NOT fire when the occluder is under a non-opaque GROUP (opacity < 1)', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'logo', position: [100, 50], width: 20, height: 20, fill: '#0f0' }),
        new Rect({ id: 'card', position: [100, 50], width: 100, height: 70, fill: '#ffffff', opacity: 0.5 }),
      ],
    });
    scene.setTextMeasurer(stub);
    expect(critique(scene, empty).diagnostics.some((x) => x.code === 'OCCLUSION')).toBe(false);
  });

  it('does NOT fire for BRIEF occlusion (covered only some frames, not the whole span)', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'logo', position: [100, 50], width: 20, height: 20, fill: '#0f0' }),
        new Rect({ id: 'card', position: [-200, 50], width: 100, height: 70, fill: '#ffffff' }),
      ],
    });
    scene.setTextMeasurer(stub);
    // card slides in from off-left to over the logo — covers only at the end
    const doc = timeline((tl) => tl.to('card/position.x', 100, { from: -200, duration: 1 }));
    const res = critique(scene, doc, { fps: 10 });
    expect(res.diagnostics.some((x) => x.code === 'OCCLUSION')).toBe(false);
  });
});

describe('critique — OUT_OF_BOUNDS (keep-WITHIN box, whole-span, the inverse of CAPTION_COLLISION)', () => {
  // a generous keep-within box the size of the frame interior
  const within = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

  it('does NOT fire for a node whose box stays fully INSIDE its declared box (clean)', () => {
    const scene = createScene({
      size,
      children: [new Rect({ id: 'card', position: [100, 50], width: 40, height: 30, fill: '#3366ff' })],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty, { containBounds: [{ node: 'card', within }] });
    expect(res.diagnostics.some((x) => x.code === 'OUT_OF_BOUNDS')).toBe(false);
  });

  it('FIRES for a node whose box is OUTSIDE its declared box its whole span (geometry position fixHint + detail.region)', () => {
    // box confined to the left half; the card sits centered at x=150 → pokes RIGHT out of it.
    const leftHalf = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const scene = createScene({
      size,
      children: [new Rect({ id: 'card', position: [150, 50], width: 60, height: 30, fill: '#3366ff' })],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty, { containBounds: [{ node: 'card', within: leftHalf }] });
    const d = res.diagnostics.find((x) => x.code === 'OUT_OF_BOUNDS');
    expect(d).toBeDefined();
    expect(d!.node).toBe('card');
    expect(d!.severity).toBe('warning');
    expect(d!.source).toBe('critique');
    expect(d!.message).toContain('RIGHT');
    expect(d!.message).toContain('keep-within box');
    const detail = d!.detail as { region: typeof leftHalf; overshoot: number; fixHints: { lever: string; fixClass: string }[] };
    expect(detail.region).toEqual(leftHalf);
    expect(detail.overshoot).toBeGreaterThan(0.5);
    expect(detail.fixHints.some((h) => h.lever === 'position' && h.fixClass === 'geometry')).toBe(true);
  });

  it('WHOLE-SPAN discipline: a node outside its box only TRANSIENTLY during an animation does NOT fire', () => {
    // card slides from far RIGHT (out of leftHalf) INTO the box — outside only early.
    const leftHalf = { minX: 0, minY: 0, maxX: 120, maxY: 100 };
    const scene = createScene({
      size,
      children: [new Rect({ id: 'card', position: [300, 50], width: 40, height: 30, fill: '#3366ff' })],
    });
    scene.setTextMeasurer(stub);
    const doc = timeline((tl) => tl.to('card/position.x', 40, { from: 300, duration: 1 }));
    const res = critique(scene, doc, { fps: 10, containBounds: [{ node: 'card', within: leftHalf }] });
    expect(res.diagnostics.some((x) => x.code === 'OUT_OF_BOUNDS')).toBe(false);
  });

  it('emits NOTHING without containBounds (opt-in; byte-identical to prior behaviour)', () => {
    const scene = createScene({
      size,
      children: [new Rect({ id: 'card', position: [150, 50], width: 60, height: 30, fill: '#3366ff' })],
    });
    scene.setTextMeasurer(stub);
    expect(critique(scene, empty).diagnostics.some((x) => x.code === 'OUT_OF_BOUNDS')).toBe(false);
  });

  it('a bad `within` region (negative extent) FAILS LOUD via validateRegion', () => {
    const scene = createScene({
      size,
      children: [new Rect({ id: 'card', position: [100, 50], width: 40, height: 30, fill: '#3366ff' })],
    });
    scene.setTextMeasurer(stub);
    const bad = { minX: 100, minY: 0, maxX: 10, maxY: 100 }; // maxX < minX
    expect(() => critique(scene, empty, { containBounds: [{ node: 'card', within: bad }] })).toThrow(/negative extent/);
  });

  it('a non-finite `within` bound FAILS LOUD via validateRegion', () => {
    const scene = createScene({
      size,
      children: [new Rect({ id: 'card', position: [100, 50], width: 40, height: 30, fill: '#3366ff' })],
    });
    scene.setTextMeasurer(stub);
    const bad = { minX: 0, minY: NaN, maxX: 200, maxY: 100 };
    expect(() => critique(scene, empty, { containBounds: [{ node: 'card', within: bad }] })).toThrow(/finite number/);
  });

  it('FAILS LOUD on an unknown / typo’d node id (never a silent no-op — a declared guard must resolve)', () => {
    const scene = createScene({
      size,
      children: [new Rect({ id: 'card', position: [100, 50], width: 40, height: 30, fill: '#3366ff' })],
    });
    scene.setTextMeasurer(stub);
    // an id that matches no node in the scene would silently guard nothing → fail loud.
    expect(() => critique(scene, empty, { containBounds: [{ node: 'crad', within }] })).toThrow(CritiqueError);
    expect(() => critique(scene, empty, { containBounds: [{ node: 'crad', within }] })).toThrow(/unknown node id/);
  });

  it('FAILS LOUD on a container GROUP id (no own box → would silently guard nothing; declare its leaf ids)', () => {
    // 'card' is a Group: indexed in the scene, but it emits no draw command, so it has no
    // own device box. A keep-within box on it must fail loud, not silently no-op.
    const scene = createScene({
      size,
      children: [
        new Group({
          id: 'card',
          children: [new Rect({ id: 'card-bg', position: [150, 50], width: 60, height: 30, fill: '#3366ff' })],
        }),
      ],
    });
    scene.setTextMeasurer(stub);
    expect(() => critique(scene, empty, { containBounds: [{ node: 'card', within }] })).toThrow(CritiqueError);
    expect(() => critique(scene, empty, { containBounds: [{ node: 'card', within }] })).toThrow(/no rendered box|container Group/);
    // the LEAF that carries the box works (declare 'card-bg' instead) — no throw.
    expect(() =>
      critique(scene, empty, { containBounds: [{ node: 'card-bg', within }] }),
    ).not.toThrow();
  });

  it('describe() exposes the ContainBound type + lists containBounds on the critique options schema', () => {
    const m = apiDescribe();
    expect(m.types?.ContainBound).toEqual({ node: 'string', within: 'Region' });
    const entry = (m.surface ?? []).find((e) => e.name === 'critique');
    const opt = entry?.options?.find((o) => o.name === 'containBounds');
    expect(opt, 'critique options should list containBounds').toBeDefined();
    expect(opt!.type).toBe('ContainBound[]');
  });
});

describe('critique — MISALIGNED + UNEVEN_SPACING (explicit alignGroups, settled-frame)', () => {
  // a top-aligned, evenly-spaced row of 3 same-size rects (position = box CENTER).
  // centers cy=50 for all; boxes [25,55] [85,115] [145,175]; gaps 30, 30.
  const cleanRow = (): ReturnType<typeof createScene> => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'c1', position: [40, 50], width: 30, height: 20, fill: '#3366ff' }),
        new Rect({ id: 'c2', position: [100, 50], width: 30, height: 20, fill: '#33aa66' }),
        new Rect({ id: 'c3', position: [160, 50], width: 30, height: 20, fill: '#aa6633' }),
      ],
    });
    scene.setTextMeasurer(stub);
    return scene;
  };
  const group = { id: 'row', members: ['c1', 'c2', 'c3'] };

  it('does NOT fire for a clean top-aligned, evenly-spaced row (the control)', () => {
    const res = critique(cleanRow(), empty, { alignGroups: [group] });
    expect(res.diagnostics.some((x) => x.code === 'MISALIGNED')).toBe(false);
    expect(res.diagnostics.some((x) => x.code === 'UNEVEN_SPACING')).toBe(false);
  });

  it('FIRES MISALIGNED when one member is nudged off the cross-axis (> alignTolerance)', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'c1', position: [40, 50], width: 30, height: 20, fill: '#3366ff' }),
        new Rect({ id: 'c2', position: [100, 56], width: 30, height: 20, fill: '#33aa66' }), // 6px low
        new Rect({ id: 'c3', position: [160, 50], width: 30, height: 20, fill: '#aa6633' }),
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty, { alignGroups: [group] });
    const d = res.diagnostics.find((x) => x.code === 'MISALIGNED');
    expect(d).toBeDefined();
    expect(d!.node).toBe('c2');
    expect(d!.severity).toBe('warning');
    expect(d!.source).toBe('critique');
    const detail = d!.detail as { axis: string; spread: number; group: string; fixHints: { lever: string; fixClass: string }[] };
    expect(detail.axis).toBe('row'); // axis inferred (horizontally spread) as 'row'
    expect(detail.spread).toBeGreaterThan(2); // > alignTolerance default 2
    expect(detail.fixHints.some((h) => h.lever === 'position' && h.fixClass === 'geometry')).toBe(true);
    // spacing is untouched (x unchanged) → no UNEVEN_SPACING
    expect(res.diagnostics.some((x) => x.code === 'UNEVEN_SPACING')).toBe(false);
  });

  it('FIRES UNEVEN_SPACING when one gap is widened (> gapTolerance), naming the offending member + pair', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'c1', position: [40, 50], width: 30, height: 20, fill: '#3366ff' }),
        new Rect({ id: 'c2', position: [100, 50], width: 30, height: 20, fill: '#33aa66' }),
        new Rect({ id: 'c3', position: [170, 50], width: 30, height: 20, fill: '#aa6633' }), // gap widened
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty, { alignGroups: [group] });
    const d = res.diagnostics.find((x) => x.code === 'UNEVEN_SPACING');
    expect(d).toBeDefined();
    expect(d!.node).toBe('c3'); // the member AFTER the offending gap
    expect(d!.source).toBe('critique');
    const detail = d!.detail as { axis: string; spread: number; gap: number; pair: string[]; fixHints: { lever: string }[] };
    expect(detail.axis).toBe('row');
    expect(detail.spread).toBeGreaterThan(2);
    expect(detail.pair).toEqual(['c2', 'c3']); // the gap bounded by c2→c3
    expect(detail.fixHints.some((h) => h.lever === 'gap')).toBe(true);
    // cross-axis is clean (all cy=50) → no MISALIGNED
    expect(res.diagnostics.some((x) => x.code === 'MISALIGNED')).toBe(false);
  });

  it('infers a COLUMN axis + fires MISALIGNED on the horizontal center when members are vertically spread', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'k1', position: [100, 20], width: 30, height: 16, fill: '#3366ff' }),
        new Rect({ id: 'k2', position: [108, 50], width: 30, height: 16, fill: '#33aa66' }), // 8px right
        new Rect({ id: 'k3', position: [100, 80], width: 30, height: 16, fill: '#aa6633' }),
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty, { alignGroups: [{ id: 'col', members: ['k1', 'k2', 'k3'] }] });
    const d = res.diagnostics.find((x) => x.code === 'MISALIGNED');
    expect(d).toBeDefined();
    expect(d!.node).toBe('k2');
    expect((d!.detail as { axis: string }).axis).toBe('column');
  });

  it('MODE-AWARE: a TOP-aligned row of DIFFERENT-height members does NOT fire (shares the top edge, not the center)', () => {
    // same top edge (minY=20) but different heights → centers span 10px. A center-only
    // check (shipped 0.78.0-pre.0) false-fired here; the 3-edge-min passes on the top edge.
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 't1', position: [40, 30], width: 30, height: 20, fill: '#3366ff' }), // h20 → minY 20
        new Rect({ id: 't2', position: [100, 35], width: 30, height: 30, fill: '#33aa66' }), // h30 → minY 20
        new Rect({ id: 't3', position: [160, 40], width: 30, height: 40, fill: '#aa6633' }), // h40 → minY 20
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty, { alignGroups: [{ id: 'row', members: ['t1', 't2', 't3'] }] });
    expect(res.diagnostics.some((x) => x.code === 'MISALIGNED')).toBe(false); // shares the TOP edge
  });

  it('MODE-AWARE: a fully-scattered row (shares no top, center, OR bottom) FIRES', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 's1', position: [40, 30], width: 30, height: 20, fill: '#3366ff' }), // top20 c30 bot40
        new Rect({ id: 's2', position: [100, 70], width: 30, height: 20, fill: '#33aa66' }), // top60 c70 bot80
        new Rect({ id: 's3', position: [160, 50], width: 30, height: 20, fill: '#aa6633' }), // top40 c50 bot60
      ],
    });
    scene.setTextMeasurer(stub);
    const res = critique(scene, empty, { alignGroups: [{ id: 'row', members: ['s1', 's2', 's3'] }] });
    // all three references (top/center/bottom) span 40px → shares none → fires.
    const d = res.diagnostics.find((x) => x.code === 'MISALIGNED');
    expect(d).toBeDefined();
    expect((d!.detail as { alignMode: string }).alignMode).toBeDefined(); // reports the nearest-shared ref
  });

  it('WHOLE-POINT settled-frame: a staggered slide-IN that HOLDS aligned does NOT false-positive', () => {
    // three rects whose RESTING positions form the clean row; each slides in from the
    // left on a staggered entrance, then holds. The settled frame is the HOLD (all
    // still), not any transient slide-in frame → clean.
    const scene = cleanRow();
    const doc = timeline((tl) =>
      tl
        .to('c1/position.x', 40, { from: -60, duration: 0.5 })
        .to('c2/position.x', 100, { from: -60, at: 0.2, duration: 0.5 })
        .to('c3/position.x', 160, { from: -60, at: 0.4, duration: 0.5 }),
    );
    const res = critique(scene, doc, { fps: 10, alignGroups: [group] });
    expect(res.diagnostics.some((x) => x.code === 'MISALIGNED')).toBe(false);
    expect(res.diagnostics.some((x) => x.code === 'UNEVEN_SPACING')).toBe(false);
  });

  it('FAILS LOUD on an unknown / typo’d member id', () => {
    expect(() => critique(cleanRow(), empty, { alignGroups: [{ members: ['c1', 'cX'] }] })).toThrow(CritiqueError);
    expect(() => critique(cleanRow(), empty, { alignGroups: [{ members: ['c1', 'cX'] }] })).toThrow(/unknown node id/);
  });

  it('FAILS LOUD on a 1-member group (needs >= 2 to check alignment)', () => {
    expect(() => critique(cleanRow(), empty, { alignGroups: [{ members: ['c1'] }] })).toThrow(CritiqueError);
    expect(() => critique(cleanRow(), empty, { alignGroups: [{ members: ['c1'] }] })).toThrow(/at least 2/);
  });

  it('FAILS LOUD when a group has no settled frame (a member animates + is culled while co-present)', () => {
    // c1 static the whole time; c2 slides continuously AND fades out (opacity→0) before
    // the end → it is co-present with c1 early but never at rest while present, and absent
    // at the last frame. No frame has BOTH present-and-still → fail loud.
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'c1', position: [50, 50], width: 30, height: 20, fill: '#3366ff' }),
        new Rect({ id: 'c2', position: [20, 50], width: 30, height: 20, fill: '#33aa66' }),
      ],
    });
    scene.setTextMeasurer(stub);
    // explicit doc (absolute keyframe times): c2 slides x 20→120 over [0,0.8] then holds,
    // but its opacity drops to 0 at t=0.85 → c2 is culled frames 9..20 while c1 (untracked,
    // static) is present the whole time. duration 2 → the LAST frame (20) has c2 absent, so
    // the settled-at-end clamp can't settle it; and while co-present (0..8) c2 is moving.
    const doc = timeline({
      fps: 10,
      duration: 2,
      tracks: [
        track('c2/position', 'vec2', [key(0, [20, 50]), key(0.8, [120, 50])]),
        track('c2/opacity', 'number', [key(0, 1), key(0.8, 1), key(0.85, 0)]),
      ],
    });
    expect(() => critique(scene, doc, { fps: 10, alignGroups: [{ id: 'row', members: ['c1', 'c2'] }] })).toThrow(
      /no settled frame/,
    );
  });

  it('FAILS LOUD on a non-integer alignTolerance', () => {
    expect(() => critique(cleanRow(), empty, { alignGroups: [group], alignTolerance: 1.5 })).toThrow(CritiqueError);
    expect(() => critique(cleanRow(), empty, { alignGroups: [group], alignTolerance: 1.5 })).toThrow(/finite integer/);
  });

  it('FAILS LOUD on a negative gapTolerance', () => {
    expect(() => critique(cleanRow(), empty, { alignGroups: [group], gapTolerance: -1 })).toThrow(CritiqueError);
  });

  it('a raised tolerance suppresses a small misalignment (the slack knob works)', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'c1', position: [40, 50], width: 30, height: 20, fill: '#3366ff' }),
        new Rect({ id: 'c2', position: [100, 54], width: 30, height: 20, fill: '#33aa66' }), // 4px low
        new Rect({ id: 'c3', position: [160, 50], width: 30, height: 20, fill: '#aa6633' }),
      ],
    });
    scene.setTextMeasurer(stub);
    // default tolerance 2 → fires; raised to 5 → suppressed
    expect(critique(scene, empty, { alignGroups: [group] }).diagnostics.some((x) => x.code === 'MISALIGNED')).toBe(true);
    expect(
      critique(scene, empty, { alignGroups: [group], alignTolerance: 5 }).diagnostics.some((x) => x.code === 'MISALIGNED'),
    ).toBe(false);
  });

  it('emits NOTHING without alignGroups (opt-in; byte-identical to prior behaviour)', () => {
    const res = critique(cleanRow(), empty);
    expect(res.diagnostics.some((x) => x.code === 'MISALIGNED' || x.code === 'UNEVEN_SPACING')).toBe(false);
  });

  it('sort-invariance holds with the new codes (shuffle-then-sort ≡ emit)', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'c1', position: [40, 50], width: 30, height: 20, fill: '#3366ff' }),
        new Rect({ id: 'c2', position: [100, 58], width: 30, height: 20, fill: '#33aa66' }), // off cross-axis
        new Rect({ id: 'c3', position: [175, 50], width: 30, height: 20, fill: '#aa6633' }), // gap widened
      ],
    });
    scene.setTextMeasurer(stub);
    const emitted = critique(scene, empty, { alignGroups: [group] }).diagnostics;
    expect(emitted.some((x) => x.code === 'MISALIGNED')).toBe(true);
    expect(emitted.some((x) => x.code === 'UNEVEN_SPACING')).toBe(true);
    expect(sortDiagnostics([...emitted].reverse())).toEqual(emitted);
  });

  it('describe() exposes the AlignGroup type + lists alignGroups/alignTolerance/gapTolerance on critique options', () => {
    const m = apiDescribe();
    expect(m.types?.AlignGroup).toEqual({ id: 'string?', members: 'string[]', axis: "'row' | 'column' (optional)" });
    const entry = (m.surface ?? []).find((e) => e.name === 'critique');
    const opt = entry?.options?.find((o) => o.name === 'alignGroups');
    expect(opt, 'critique options should list alignGroups').toBeDefined();
    expect(opt!.type).toBe('AlignGroup[]');
    expect(entry?.options?.some((o) => o.name === 'alignTolerance')).toBe(true);
    expect(entry?.options?.some((o) => o.name === 'gapTolerance')).toBe(true);
  });
});

describe('critique — layered short-circuit on static errors', () => {
  it('SKIPS the rendered pass and returns the static error when validateScene errors', () => {
    const scene = createScene({ size, children: [new Rect({ id: 'box', position: [100, 50], width: 20, height: 20 })] });
    scene.setTextMeasurer(stub);
    const doc = timeline((tl) => tl.to('ghost/opacity', 0, { from: 1, duration: 1 })); // UNKNOWN_TARGET
    const res = critique(scene, doc);
    expect(res.hasErrors).toBe(true);
    expect(res.renderedSkipped).toBe(true);
    expect(res.renderedSkipReason).toBeDefined();
    expect(res.sampledFrames).toBe(0);
    expect(res.diagnostics.some((d) => d.code === 'UNKNOWN_TARGET' && d.source === 'validateScene')).toBe(true);
    // no rendered code slipped through
    expect(res.diagnostics.every((d) => d.source !== 'critique')).toBe(true);
  });
});

describe('critique — canonical sort + sort-invariance', () => {
  it('shuffle-then-sort ≡ the emitted order (golden-stable)', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'a', position: [-100, 20], width: 40, height: 20, fill: '#f00' }), // off LEFT
        new Rect({ id: 'z', position: [400, 80], width: 40, height: 20, fill: '#f00' }), // off RIGHT
        new Text({ id: 'label', position: [100, 50], width: 50, text: 'HELLO', fontSize: 20, fill: '#000' }),
      ],
    });
    scene.setTextMeasurer(stub);
    const emitted = critique(scene, empty).diagnostics;
    expect(emitted.length).toBeGreaterThanOrEqual(3);
    // shuffle a copy, re-sort, expect identical order + content
    const shuffled = [...emitted].reverse();
    shuffled.push(shuffled.shift()!); // a second permutation
    expect(sortDiagnostics(shuffled)).toEqual(emitted);
  });

  it('is deterministic run-to-run (identical output on repeated critique)', () => {
    const scene1 = createScene({
      size,
      children: [new Rect({ id: 'title', position: [-100, 50], width: 40, height: 30, fill: '#f00' })],
    });
    scene1.setTextMeasurer(stub);
    const scene2 = createScene({
      size,
      children: [new Rect({ id: 'title', position: [-100, 50], width: 40, height: 30, fill: '#f00' })],
    });
    scene2.setTextMeasurer(stub);
    expect(critique(scene1, empty).diagnostics).toEqual(critique(scene2, empty).diagnostics);
  });
});
