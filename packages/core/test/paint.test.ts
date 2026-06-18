/**
 * The `paint` value type (§2.2): gradient morphing — matched kind/stop-count
 * gradients lerp stops + geometry; a solid color lifts to a uniform gradient to
 * meet a gradient; mismatched shapes snap. Pure function of (a, b, t).
 */

import { describe, expect, it } from 'vitest';
import { getValueType, inferValueType, paintType, type Paint } from '../src/index.js';

const radial = (radius: number, c0 = '#000000', c1 = '#ffffff'): Paint => ({
  kind: 'radial',
  stops: [{ offset: 0, color: c0 }, { offset: 1, color: c1 }],
  center: [0, 0],
  radius,
});

describe('paintType (§2.2 gradient value type)', () => {
  it('is registered and resolvable by id', () => {
    expect(getValueType('paint')).toBe(paintType);
    expect(paintType.extrapolates).toBe(false);
    expect(paintType.defaultHandoff).toBe('blend-from-frozen');
  });

  it('infers a Paint OBJECT as paint, a color STRING as color', () => {
    expect(inferValueType({ kind: 'radial', stops: [{ offset: 0, color: '#fff' }] })).toBe('paint');
    expect(inferValueType({ kind: 'color', color: '#fff' })).toBe('paint');
    expect(inferValueType('#ffffff')).toBe('color'); // a bare string stays the color (string) type
  });

  it('lerps two matched radials: stops, center, radius pairwise', () => {
    const a = radial(50);
    const b: Paint = { kind: 'radial', stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }], center: [10, 20], radius: 150 };
    const mid = paintType.lerp(a, b, 0.5);
    expect(mid.kind).toBe('radial');
    if (mid.kind !== 'radial') return;
    expect(mid.radius).toBe(100); // 50 → 150
    expect(mid.center).toEqual([5, 10]); // [0,0] → [10,20]
    expect(mid.stops).toHaveLength(2);
    expect(mid.stops[0]!.offset).toBe(0);
    // endpoints
    expect((paintType.lerp(a, b, 0) as Extract<Paint, { kind: 'radial' }>).radius).toBe(50);
    expect((paintType.lerp(a, b, 1) as Extract<Paint, { kind: 'radial' }>).radius).toBe(150);
  });

  it('lerps two matched linears: from/to pairwise', () => {
    const a: Paint = { kind: 'linear', stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }], from: [0, 0], to: [0, 100] };
    const b: Paint = { kind: 'linear', stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }], from: [0, 0], to: [100, 0] };
    const mid = paintType.lerp(a, b, 0.5);
    expect(mid.kind).toBe('linear');
    if (mid.kind !== 'linear') return;
    expect(mid.to).toEqual([50, 50]); // [0,100] → [100,0]
  });

  it('lifts a solid color to a uniform gradient to meet a gradient (smooth color↔gradient)', () => {
    const color: Paint = { kind: 'color', color: '#ff0000' };
    const grad = radial(100, '#000000', '#ffffff');
    // at t=0 the result is a radial whose stops are all the solid color (a uniform disc)
    const at0 = paintType.lerp(color, grad, 0);
    expect(at0.kind).toBe('radial');
    if (at0.kind !== 'radial') return;
    expect(at0.stops.every((s) => s.color === '#ff0000')).toBe(true);
    expect(at0.radius).toBe(100);
    // at t=1 it's the target gradient
    const at1 = paintType.lerp(color, grad, 1) as Extract<Paint, { kind: 'radial' }>;
    expect(at1.stops[1]!.color).toBe('#ffffff');
  });

  it('snaps across mismatched gradient shapes (different stop count) — hold a, then b at t≥1', () => {
    const a = radial(50);
    const b: Paint = { kind: 'radial', stops: [{ offset: 0, color: '#000' }, { offset: 0.5, color: '#888' }, { offset: 1, color: '#fff' }], center: [0, 0], radius: 50 };
    expect(paintType.lerp(a, b, 0.4)).toBe(a); // held
    expect(paintType.lerp(a, b, 1)).toBe(b); // snapped
  });

  it('equals: structural for matched, false across kinds', () => {
    expect(paintType.equals(radial(50), radial(50))).toBe(true);
    expect(paintType.equals(radial(50), radial(60))).toBe(false);
    expect(paintType.equals({ kind: 'color', color: '#fff' }, { kind: 'color', color: '#fff' })).toBe(true);
    expect(paintType.equals(radial(50), { kind: 'color', color: '#fff' })).toBe(false);
  });
});
