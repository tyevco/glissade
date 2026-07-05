/**
 * The SHARED Region-ingest validator (0.65): ONE canonical boundary for both
 * critique/assess `safeAreas` and the Camera `clear`. Float bounds quantize to
 * integers (captionSafeArea's Math.round discipline); negative-extent / non-finite
 * fails loud. A hand-built integer Region ≡ a captionSafeArea Region downstream.
 */

import { describe, expect, it } from 'vitest';
import { key, timeline, track } from '@glissade/core';
import { Rect, Text, createScene } from '../src/index.js';
import { validateRegion, RegionError } from '../src/region.js';
import { critique, type SafeArea } from '../src/critique.js';

describe('validateRegion', () => {
  it('quantizes a FLOAT region to integer bounds (Math.round)', () => {
    expect(validateRegion({ minX: 0.3, minY: 120.7, maxX: 320.9, maxY: 180.2 }, 'x')).toEqual({
      minX: 0,
      minY: 121,
      maxX: 321,
      maxY: 180,
    });
  });

  it('is idempotent on an already-integer region (byte-identical passthrough)', () => {
    const r = { minX: 0, minY: 280, maxX: 640, maxY: 360 };
    expect(validateRegion(r, 'x')).toEqual(r);
    // a hand-built integer Region and a captionSafeArea-shaped Region validate to
    // the SAME value → byte-interchangeable downstream.
    expect(validateRegion({ minX: 0, minY: 280, maxX: 640, maxY: 360 }, 'a')).toEqual(
      validateRegion({ minX: 0, minY: 280, maxX: 640, maxY: 360 }, 'b'),
    );
  });

  it('throws on NEGATIVE extent (maxY < minY)', () => {
    expect(() => validateRegion({ minX: 0, minY: 180, maxX: 320, maxY: 120 }, 'x')).toThrow(RegionError);
    expect(() => validateRegion({ minX: 0, minY: 180, maxX: 320, maxY: 120 }, 'x')).toThrow(/negative extent/);
  });

  it('throws on NEGATIVE extent (maxX < minX)', () => {
    expect(() => validateRegion({ minX: 320, minY: 0, maxX: 10, maxY: 180 }, 'x')).toThrow(/negative extent/);
  });

  it('throws on a non-finite bound', () => {
    expect(() => validateRegion({ minX: 0, minY: NaN, maxX: 320, maxY: 180 }, 'x')).toThrow(/finite number/);
  });
});

describe('critique safeAreas ingest through the SHARED validator', () => {
  const scene = () => {
    const caption = new Text({ id: 'caption', text: 'HELLO', fontSize: 20, position: [320, 320], align: 'center' });
    const intruder = new Rect({ id: 'intruder', width: 200, height: 200, position: [320, 320], fill: '#f00' });
    return createScene({ size: { w: 640, h: 360 }, children: [caption, intruder] });
  };
  const tl = timeline({ fps: 30, duration: 0.5, tracks: [track('intruder/position', 'vec2', [key(0, [320, 320])])] });

  it('a FLOAT safeArea does not throw and the diagnostic carries the QUANTIZED region', () => {
    const sa: SafeArea = { bounds: { minX: 0.4, minY: 279.6, maxX: 639.6, maxY: 360.2 }, owner: 'caption' };
    const res = critique(scene(), tl, { safeAreas: [sa] });
    const coll = res.diagnostics.find((d) => d.code === 'CAPTION_COLLISION');
    expect(coll).toBeDefined();
    // the SAME validated integer Region reaches the diagnostic (quantized, not raw).
    expect(coll!.detail!.region).toEqual({ minX: 0, minY: 280, maxX: 640, maxY: 360 });
  });

  it('a NEGATIVE-extent safeArea fails loud', () => {
    const sa: SafeArea = { bounds: { minX: 0, minY: 360, maxX: 640, maxY: 280 }, owner: 'caption' };
    expect(() => critique(scene(), tl, { safeAreas: [sa] })).toThrow(/negative extent/);
  });
});
