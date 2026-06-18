/**
 * Gradient stop densification (§3 Paint): `smooth`/`gaussian` resample the stops
 * into an oklab-eased ramp; `linear` passes through (canvas-native, byte-stable).
 */

import { describe, expect, it } from 'vitest';
import type { ColorStop } from '@glissade/core';
import { densifyStops, GRADIENT_RAMP_STEPS } from '../src/gradient.js';

const bw: ColorStop[] = [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }];

describe('densifyStops (§3 gradient interpolation)', () => {
  it('linear passes the authored stops through unchanged (byte-stable default)', () => {
    expect(densifyStops(bw, 'linear')).toBe(bw);
  });

  it('a single stop is returned unchanged (nothing to interpolate)', () => {
    const one: ColorStop[] = [{ offset: 0, color: '#abcdef' }];
    expect(densifyStops(one, 'smooth')).toBe(one);
  });

  it('smooth/gaussian densify to GRADIENT_RAMP_STEPS, spanning the offset range with monotonic offsets', () => {
    for (const mode of ['smooth', 'gaussian'] as const) {
      const out = densifyStops(bw, mode);
      expect(out).toHaveLength(GRADIENT_RAMP_STEPS);
      expect(out[0]!.offset).toBe(0);
      expect(out[out.length - 1]!.offset).toBeCloseTo(1, 9);
      // endpoints keep the authored colors
      expect(out[0]!.color).toBe('#000000');
      expect(out[out.length - 1]!.color.toLowerCase()).toBe('#ffffff');
      // strictly increasing offsets
      for (let i = 1; i < out.length; i++) expect(out[i]!.offset).toBeGreaterThan(out[i - 1]!.offset);
    }
  });

  it('smooth eases the blend (S-curve): the midpoint sits near the linear mid, the quarter lags it', () => {
    const out = densifyStops(bw, 'smooth');
    const lum = (hex: string): number => parseInt(hex.slice(1, 3), 16); // grayscale → R channel
    const mid = out[Math.floor((GRADIENT_RAMP_STEPS - 1) / 2)]!;
    const quarter = out[Math.floor((GRADIENT_RAMP_STEPS - 1) / 4)]!;
    // smoothstep(0.5)=0.5 → mid ≈ half luminance; smoothstep(0.25)=0.156 < 0.25 → quarter darker than a linear quarter
    expect(lum(mid.color)).toBeGreaterThan(90);
    expect(lum(mid.color)).toBeLessThan(170);
    expect(lum(quarter.color)).toBeLessThan(lum(mid.color));
  });

  it('is deterministic — same inputs, identical output', () => {
    expect(densifyStops(bw, 'gaussian')).toEqual(densifyStops(bw, 'gaussian'));
  });
});
