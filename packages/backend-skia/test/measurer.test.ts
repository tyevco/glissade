/**
 * createMeasurer (factory-time measurement): real rasterizer metrics before
 * any scene exists — the blessed replacement for downstream lazy-backend
 * shims. Must agree exactly with a SkiaBackend's own measureText.
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { setDefaultMeasurer, Text } from '@glissade/scene';
import { createMeasurer, SkiaBackend } from '../src/index.js';

const DEJAVU = fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url));
const FONT = { family: 'DejaVu Sans', size: 17 };

describe('createMeasurer', () => {
  it('agrees exactly with a SkiaBackend measureText (same rasterizer, same numbers)', () => {
    const measurer = createMeasurer({ fonts: { 'DejaVu Sans': DEJAVU } });
    const backend = new SkiaBackend(640, 360);
    const a = measurer.measureText('Animations are data', FONT);
    const b = backend.measureText('Animations are data', FONT);
    expect(a).toEqual(b);
  });

  it('one-liner factory-time pattern: setDefaultMeasurer + Text pulls, no scene', () => {
    setDefaultMeasurer(createMeasurer({ fonts: { 'DejaVu Sans': DEJAVU } }));
    try {
      const t = new Text({ text: 'Animations are data', fontFamily: 'DejaVu Sans', fontSize: 17 });
      const viaDefault = t.measuredSize();
      const viaBackend = new SkiaBackend(8, 8);
      expect(viaDefault).toEqual(t.measuredSize(viaBackend));
      expect(t.lineBoxes()[0]!.w).toBeGreaterThan(0);
    } finally {
      setDefaultMeasurer(null);
    }
  });

  it('is lazy: constructing a measurer allocates nothing until first measure', () => {
    expect(() => createMeasurer()).not.toThrow();
  });
});
