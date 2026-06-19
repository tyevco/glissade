/**
 * The `paint` value type (§2.2): gradient morphing — matched kind/stop-count
 * gradients lerp stops + geometry; a solid color lifts to a uniform gradient to
 * meet a gradient; mismatched shapes snap. Pure function of (a, b, t).
 */

import { describe, expect, it, vi } from 'vitest';
import { getValueType, inferValueType, paintType, parseColor, type Paint } from '../src/index.js';

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

const mesh = (pts: [number, number, string][], interpolation: 'smooth' | 'gaussian' | 'oklab' = 'smooth', bg?: string): Paint => ({
  kind: 'mesh',
  points: pts.map(([u, v, color]) => ({ pos: [u, v], color })),
  ...(interpolation ? { interpolation } : {}),
  ...(bg !== undefined ? { bg } : {}),
});

describe('paintType mesh variant (§3 Paint 0.12)', () => {
  it('infers a mesh Paint OBJECT as paint', () => {
    expect(inferValueType({ kind: 'mesh', points: [{ pos: [0, 0], color: '#fff' }] })).toBe('paint');
  });

  it('lerps two matched-count meshes: pos + oklab color pairwise, carries interpolation/bg', () => {
    const a = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth', '#101010');
    const b = mesh([[0.5, 0.5, '#000000'], [0.5, 0.5, '#ffffff']], 'smooth', '#303030');
    const mid = paintType.lerp(a, b, 0.5);
    expect(mid.kind).toBe('mesh');
    if (mid.kind !== 'mesh') return;
    expect(mid.points[0]!.pos).toEqual([0.25, 0.25]); // [0,0] → [0.5,0.5]
    expect(mid.points[1]!.pos).toEqual([0.75, 0.75]); // [1,1] → [0.5,0.5]
    expect(mid.interpolation).toBe('smooth'); // discrete metadata carried from A
    expect(mid.bg).toBeDefined();
    // endpoints
    const at0 = paintType.lerp(a, b, 0);
    expect(at0.kind === 'mesh' && at0.points[0]!.pos).toEqual([0, 0]);
  });

  it('snaps a matched-count mesh whose interpolation MODE differs (smooth → gaussian): holds A + kernel until t≥1, warns once', async () => {
    // fresh module instance so the once-per-process paint snap warning is unfired
    vi.resetModules();
    const fresh = await import('../src/index.js');
    const warnings: string[] = [];
    fresh.setDevWarning((m) => warnings.push(m));
    try {
      const a = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth');
      const b = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'gaussian');
      // held at A (value + its kernel) for the whole tween, then snaps to B at t≥1
      expect(fresh.paintType.lerp(a, b, 0.5)).toBe(a);
      expect(fresh.paintType.lerp(a, b, 0.99)).toBe(a);
      expect(fresh.paintType.lerp(a, b, 1)).toBe(b);
      const modeWarns = warnings.filter((w) => w.includes('mesh interpolation mode'));
      expect(modeWarns.length).toBe(1);
      expect(modeWarns[0]).toContain("'smooth'");
      expect(modeWarns[0]).toContain("'gaussian'");
    } finally {
      fresh.setDevWarning(() => {});
    }
  });

  it('fades an APPEARING bg (a-no-bg → b-bg) continuously: alpha ramps from 0, matches endpoints', () => {
    const a = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth'); // no bg
    const b = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth', '#ff0000');
    const at0 = paintType.lerp(a, b, 0);
    const mid = paintType.lerp(a, b, 0.5);
    const at1 = paintType.lerp(a, b, 1);
    if (at0.kind !== 'mesh' || mid.kind !== 'mesh' || at1.kind !== 'mesh') throw new Error('expected mesh');
    // endpoints: invisible at t=0 (alpha 0), full red at t=1
    expect(at0.bg).toBeDefined();
    expect(parseColor(at0.bg!).a).toBeCloseTo(0, 5);
    expect(at1.bg).toBeDefined();
    expect(parseColor(at1.bg!).a).toBeCloseTo(1, 5);
    // continuous midpoint: alpha strictly between the endpoints (no pop at t≥1)
    expect(mid.bg).toBeDefined();
    const midA = parseColor(mid.bg!).a;
    expect(midA).toBeGreaterThan(0);
    expect(midA).toBeLessThan(1);
  });

  it('fades a DISAPPEARING bg (a-bg → b-no-bg) continuously: alpha ramps to 0, symmetric with appearing', () => {
    const a = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth', '#ff0000');
    const b = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth'); // no bg
    const at0 = paintType.lerp(a, b, 0);
    const mid = paintType.lerp(a, b, 0.5);
    const at1 = paintType.lerp(a, b, 1);
    if (at0.kind !== 'mesh' || mid.kind !== 'mesh' || at1.kind !== 'mesh') throw new Error('expected mesh');
    expect(at0.bg).toBeDefined();
    expect(parseColor(at0.bg!).a).toBeCloseTo(1, 5); // full at start
    expect(at1.bg).toBeDefined();
    expect(parseColor(at1.bg!).a).toBeCloseTo(0, 5); // faded out at end
    expect(mid.bg).toBeDefined();
    const midA = parseColor(mid.bg!).a;
    expect(midA).toBeGreaterThan(0);
    expect(midA).toBeLessThan(1);
  });

  // FIX 5 (0.13 canary): a one-sided mesh bg in a NON-HEX color (hsl/named —
  // parseColor only knows hex/rgb) must NOT throw inside lerp during evaluate().
  // transparentOf + the bg lerp fall back to a safe snap instead of crashing.
  it('does NOT throw when a one-sided bg uses a non-hex color (hsl/named)', () => {
    for (const bg of ['hsl(210, 50%, 40%)', 'rebeccapurple']) {
      // bg PRESENT on a, absent on b (the symmetric one-sided case from 0.13)
      const a = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth', bg);
      const b = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth'); // no bg
      // the regression: lerp must NOT throw at any t (it runs inside evaluate())
      expect(() => paintType.lerp(a, b, 0)).not.toThrow();
      expect(() => paintType.lerp(a, b, 0.5)).not.toThrow();
      expect(() => paintType.lerp(a, b, 1)).not.toThrow();
      // and the symmetric case (bg on b, absent on a) is equally safe
      expect(() => paintType.lerp(b, a, 0.5)).not.toThrow();
      // safe fallback: the un-parseable color is held (snapped), still a string
      const mid = paintType.lerp(a, b, 0.5);
      expect(mid.kind === 'mesh' && typeof mid.bg === 'string').toBe(true);
    }
  });

  it('snaps mismatched point count — hold a, then b at t≥1', () => {
    const a = mesh([[0, 0, '#000'], [1, 1, '#fff']]);
    const b = mesh([[0, 0, '#000'], [0.5, 0.5, '#888'], [1, 1, '#fff']]);
    expect(paintType.lerp(a, b, 0.4)).toBe(a);
    expect(paintType.lerp(a, b, 1)).toBe(b);
  });

  it('snaps mesh↔gradient (cross-kind lift deferred) and mesh↔color', () => {
    const m = mesh([[0, 0, '#000'], [1, 1, '#fff']]);
    expect(paintType.lerp(m, radial(50), 0.4)).toBe(m);
    expect(paintType.lerp(m, radial(50), 1)).toEqual(radial(50));
    expect(paintType.lerp(m, { kind: 'color', color: '#fff' }, 0.4)).toBe(m);
  });

  it('equals: structural for matched meshes, false on differing points/interp/bg/kind', () => {
    const a = mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth', '#101010');
    expect(paintType.equals(a, mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth', '#101010'))).toBe(true);
    expect(paintType.equals(a, mesh([[0, 0, '#000000'], [1, 1, '#fffffe']], 'smooth', '#101010'))).toBe(false);
    expect(paintType.equals(a, mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'gaussian', '#101010'))).toBe(false);
    expect(paintType.equals(a, mesh([[0, 0, '#000000'], [1, 1, '#ffffff']], 'smooth', '#202020'))).toBe(false);
    expect(paintType.equals(a, radial(50))).toBe(false);
  });
});
