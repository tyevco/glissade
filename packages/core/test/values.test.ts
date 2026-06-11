import { describe, expect, it } from 'vitest';
import {
  colorType,
  formatColor,
  getValueType,
  lerpColor,
  numberType,
  parseColor,
  random,
  stringType,
  vec2Type,
  ColorParseError,
  UnknownValueTypeError,
} from '../src/index.js';

describe('color parsing/formatting', () => {
  it('parses #rgb, #rrggbb, #rrggbbaa, rgb(), rgba()', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#e6a700')).toEqual({ r: 230, g: 167, b: 0, a: 1 });
    expect(parseColor('#ff000080').a).toBeCloseTo(0.502, 2);
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor('rgba(1, 2, 3, 0.5)').a).toBe(0.5);
  });

  it('round-trips through format', () => {
    expect(formatColor(parseColor('#e6a700'))).toBe('#e6a700');
    expect(formatColor(parseColor('#12345678'))).toBe('#12345678');
  });

  it('rejects garbage', () => {
    expect(() => parseColor('bisque-ish')).toThrow(ColorParseError);
  });
});

describe('OKLab interpolation', () => {
  it('endpoints are exact', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('black→white midpoint is perceptual gray (not sRGB 0x80)', () => {
    const mid = parseColor(lerpColor('#000000', '#ffffff', 0.5));
    expect(mid.r).toBe(mid.g);
    expect(mid.g).toBe(mid.b);
    // OKLab L=0.5 → ~#636363; naive sRGB midpoint would be #808080
    expect(mid.r).toBeGreaterThan(0x50);
    expect(mid.r).toBeLessThan(0x75);
  });

  it('blue→yellow midpoint avoids the gray dead zone', () => {
    const mid = parseColor(lerpColor('#0000ff', '#ffff00', 0.5));
    const spread = Math.max(mid.r, mid.g, mid.b) - Math.min(mid.r, mid.g, mid.b);
    expect(spread).toBeGreaterThan(30); // naive sRGB gives ~#808080 (spread 0)
  });

  it('interpolates alpha', () => {
    expect(parseColor(lerpColor('#ff000000', '#ff0000ff', 0.5)).a).toBeCloseTo(0.5, 1);
  });

  it('extrapolation clamps to displayable bytes', () => {
    const c = parseColor(lerpColor('#222222', '#eeeeee', 1.5));
    for (const v of [c.r, c.g, c.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe('value-type registry', () => {
  it('number/vec2 lerp and extrapolate', () => {
    expect(numberType.lerp(0, 10, 0.5)).toBe(5);
    expect(numberType.lerp(0, 10, 1.2)).toBeCloseTo(12); // spring overshoot
    expect(vec2Type.lerp([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
    expect(numberType.extrapolates).toBe(true);
    expect(colorType.extrapolates).toBe(true);
  });

  it('discrete types snap at t=1 and do not extrapolate', () => {
    expect(stringType.lerp('a', 'b', 0.99)).toBe('a');
    expect(stringType.lerp('a', 'b', 1)).toBe('b');
    expect(stringType.extrapolates).toBe(false);
  });

  it('unknown types throw', () => {
    expect(() => getValueType('quaternion')).toThrow(UnknownValueTypeError);
  });
});

describe('seeded RNG', () => {
  it('same seed → identical sequence; different seed → different', () => {
    const a1 = random(42);
    const a2 = random(42);
    const b = random(43);
    const seqA1 = Array.from({ length: 10 }, a1);
    const seqA2 = Array.from({ length: 10 }, a2);
    const seqB = Array.from({ length: 10 }, b);
    expect(seqA1).toEqual(seqA2);
    expect(seqA1).not.toEqual(seqB);
    for (const v of seqA1) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
