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
import { critique, sortDiagnostics } from '../src/diagnostics.js';
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
    expect(d!.detail).toMatchObject({ threshold: 50 });
    expect(Number((d!.detail as { overflowPx: number }).overflowPx)).toBeGreaterThan(0);
    expect(d!.message).toContain('fitText');
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
