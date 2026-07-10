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
import { type Timeline, timeline } from '@glissade/core';
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
