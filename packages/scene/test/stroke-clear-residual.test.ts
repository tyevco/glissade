/**
 * The bounds-consumer agreement fix: `centerOn`'s `clear` and critique's
 * CAPTION_COLLISION now measure a STROKED node's bounds through the SAME
 * join→extent rule (content box + width/2 for a rounded stroke), so a cleared
 * stroked node leaves ZERO residual collision.
 *
 * TWO-SIDED acceptance (the determinism seat's requirement): the PHANTOM part (the
 * ~5×width miter over-inflation applied to ROUNDED strokes) is gone, but the REAL
 * part (the width/2 overhang) STAYS — clear lifts a stroked node by width/2 MORE,
 * and a genuinely-intruding stroke still fires. We do NOT solve residual→0 by going
 * stroke-blind (that would silently MISS a real overhang).
 */

import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { createScene, Rect, evaluate } from '../src/index.js';
import { camera } from '../src/camera.js';
import { resolveAt } from '../src/validate.js';
import { critique, type SafeArea } from '../src/diagnostics.js';

const SIZE = { w: 640, h: 360 };
const emptyTl = timeline({ fps: 60, duration: 1, tracks: [] });

describe('centerOn clear + critique — a cleared stroked node leaves ZERO residual collision', () => {
  it('a rounded STROKED node cleared out of the band clears its VISIBLE extent (stroke included) → no residual CAPTION_COLLISION', () => {
    // hero: content 160×200 centered at [320,180] → content screen y 80..280 (maxY
    // exactly the band top 280). A 24px rounded stroke overhangs width/2 = 12 →
    // visual maxY 292 dips 12px into the band. Content-only clear (the OLD bug)
    // would NOT push (content maxY == band top). Stroke-aware clear pushes up 12.
    const band = { minX: 0, minY: 280, maxX: 640, maxY: 360 };
    const hero = new Rect({ id: 'hero', width: 160, height: 200, cornerRadius: 20, stroke: '#fff', strokeWidth: 24, fill: '#123', position: [320, 180] });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero', clear: band });
    const scene = createScene({ size: SIZE, children: [cam] });
    evaluate(scene, emptyTl, 0);

    // clear lifted the node by the stroke overhang: focal.y = 180 + 12 (content-only
    // would have been 180, no push).
    const resolved = resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number];
    expect(resolved[1]).toBeCloseTo(192);

    // run the SAME scene through critique with the SAME band → the cleared node's
    // stroke ink now rests exactly at the band top → NO residual collision.
    const sa: SafeArea = { bounds: band };
    const res = critique(scene, emptyTl, { safeAreas: [sa] });
    const cc = res.diagnostics.filter((d) => d.code === 'CAPTION_COLLISION');
    expect(cc).toEqual([]);
  });

  it('clear is STROKE-AWARE: a stroked node lifts by width/2 MORE than an identical unstroked one', () => {
    const band = { minX: 0, minY: 250, maxX: 640, maxY: 360 };
    const build = (extra: Record<string, unknown>) => {
      const hero = new Rect({ id: 'hero', width: 160, height: 200, cornerRadius: 20, fill: '#123', position: [320, 180], ...extra });
      const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero', clear: band });
      const scene = createScene({ size: SIZE, children: [cam] });
      evaluate(scene, emptyTl, 0);
      return (resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number])[1];
    };
    // content maxY 280 intrudes band top 250 → push up 30 → focal 210.
    const unstroked = build({});
    // + a 24px rounded stroke (ext 12) → visual maxY 292 → push up 42 → focal 222.
    const stroked = build({ stroke: '#fff', strokeWidth: 24 });
    expect(unstroked).toBeCloseTo(210);
    expect(stroked).toBeCloseTo(222);
    expect(stroked - unstroked).toBeCloseTo(12); // exactly width/2, NOT 0, NOT 5×width
  });
});

describe('critique CAPTION_COLLISION — the rounded-stroke over-fire is gone (phantom removed)', () => {
  it('a rounded stroked node sitting clear of the band by more than width/2 no longer fires (previously fired on the ~5×width miter spike)', () => {
    // card at [320,200], content y 180..220, rounded stroke 20 (ext 10) → ink
    // 170..230. Band top 280 is 50px below the ink — clear. OLD miter inflation
    // (5×20 = 100) → phantom bounds 80..320 → intruded → fired. Now: no fire.
    const band: SafeArea = { bounds: { minX: 0, minY: 280, maxX: 640, maxY: 360 } };
    const card = new Rect({ id: 'card', width: 100, height: 40, cornerRadius: 10, stroke: '#fff', strokeWidth: 20, fill: '#0af', position: [320, 200] });
    const scene = createScene({ size: SIZE, children: [card] });
    const res = critique(scene, emptyTl, { safeAreas: [band] });
    expect(res.diagnostics.some((d) => d.code === 'CAPTION_COLLISION')).toBe(false);
  });

  it('the REAL overhang is STILL detected: a rounded stroke whose width/2 ink genuinely dips into the band FIRES (guards the under-mark)', () => {
    // card at [320,260], content y 240..280 (bottom edge exactly at band top → the
    // CONTENT box does NOT intrude). The 20px rounded stroke overhangs 10 → ink
    // maxY 290 dips 10px into the band → CAPTION_COLLISION MUST fire. If the extent
    // were 0 (stroke-blind), this real overhang would be silently missed.
    const band: SafeArea = { bounds: { minX: 0, minY: 280, maxX: 640, maxY: 360 } };
    const card = new Rect({ id: 'card', width: 100, height: 40, cornerRadius: 10, stroke: '#fff', strokeWidth: 20, fill: '#0af', position: [320, 260] });
    const scene = createScene({ size: SIZE, children: [card] });
    const res = critique(scene, emptyTl, { safeAreas: [band] });
    const cc = res.diagnostics.filter((d) => d.code === 'CAPTION_COLLISION');
    expect(cc.map((d) => d.node)).toEqual(['card']);
  });
});
