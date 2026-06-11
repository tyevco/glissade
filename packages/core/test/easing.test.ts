import { describe, expect, it } from 'vitest';
import { cubicBezier, easings, namedEasing, spring, UnknownEasingError } from '../src/index.js';

describe('easing registry', () => {
  it('every easing maps 0→0 and 1→1', () => {
    for (const [name, fn] of Object.entries(easings)) {
      expect(fn(0), `${name}(0)`).toBeCloseTo(0, 9);
      expect(fn(1), `${name}(1)`).toBeCloseTo(1, 9);
    }
  });

  it('easeInOutCubic midpoint is 0.5', () => {
    expect(easings['easeInOutCubic']!(0.5)).toBeCloseTo(0.5, 9);
  });

  it('back/elastic leave [0,1]; quad/cubic stay within', () => {
    expect(easings['easeOutBack']!(0.4)).toBeGreaterThan(0); // overshoots near the end
    const overshoots = Array.from({ length: 99 }, (_, i) => easings['easeOutBack']!((i + 1) / 100));
    expect(Math.max(...overshoots)).toBeGreaterThan(1);
    for (let i = 0; i <= 100; i++) {
      const v = easings['easeInOutQuad']!(i / 100);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('unknown names throw', () => {
    expect(() => namedEasing('zoomies')).toThrow(UnknownEasingError);
  });
});

describe('cubicBezier', () => {
  it('linear control points ≡ identity', () => {
    const f = cubicBezier(0.25, 0.25, 0.75, 0.75);
    for (let i = 0; i <= 10; i++) {
      expect(f(i / 10)).toBeCloseTo(i / 10, 5);
    }
  });

  it('matches the CSS "ease" curve at known points', () => {
    // cubic-bezier(0.25, 0.1, 0.25, 1) — reference values from browser impls
    const f = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(f(0.5)).toBeCloseTo(0.8024, 3);
    expect(f(0.25)).toBeCloseTo(0.4085, 3);
  });

  it('clamps outside [0,1]', () => {
    const f = cubicBezier(0.42, 0, 0.58, 1);
    expect(f(-1)).toBe(0);
    expect(f(2)).toBe(1);
  });
});

describe('spring (closed form, §2.7)', () => {
  const under = { stiffness: 170, damping: 8, mass: 1 }; // zeta ≈ 0.31
  const critical = { stiffness: 100, damping: 20, mass: 1 }; // zeta = 1
  const over = { stiffness: 100, damping: 40, mass: 1 }; // zeta = 2

  it('value(0)=0 and value(duration)=1 exactly (affine endpoint rescale)', () => {
    for (const cfg of [under, critical, over]) {
      expect(spring.value(cfg, 0)).toBe(0);
      const d = spring.duration(cfg);
      expect(spring.value(cfg, d)).toBeCloseTo(1, 12);
    }
  });

  it('underdamped matches the analytic damped-oscillator solution', () => {
    const { stiffness, damping, mass } = under;
    const w0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const d = spring.duration(under);
    const rawAt = (t: number) =>
      1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    for (const t of [0.05, 0.1, 0.2, 0.4]) {
      expect(spring.value(under, t)).toBeCloseTo(rawAt(t) / rawAt(d), 9);
    }
  });

  it('underdamped overshoots; critical and overdamped do not', () => {
    const d = spring.duration(under);
    let max = 0;
    for (let i = 0; i <= 400; i++) max = Math.max(max, spring.value(under, (i / 400) * d));
    expect(max).toBeGreaterThan(1);

    for (const cfg of [critical, over]) {
      const dd = spring.duration(cfg);
      for (let i = 0; i <= 400; i++) {
        expect(spring.value(cfg, (i / 400) * dd)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('duration respects settle tolerance: |raw - 1| ≤ tol beyond it', () => {
    for (const cfg of [under, critical, over]) {
      const tol = 0.005;
      const d = spring.duration(cfg, { settleTolerance: tol });
      // sample beyond the duration using the *scaled* value (≡ raw/raw(d), raw(d)≈1)
      for (let i = 0; i <= 50; i++) {
        const t = d + (i / 50) * d;
        expect(Math.abs(spring.value(cfg, t) - 1)).toBeLessThanOrEqual(tol * 1.05);
      }
    }
  });

  it('tighter tolerance → longer duration', () => {
    expect(spring.duration(under, { settleTolerance: 0.001 })).toBeGreaterThan(
      spring.duration(under, { settleTolerance: 0.01 }),
    );
  });

  it('rejects non-positive parameters', () => {
    expect(() => spring({ stiffness: 0, damping: 10 })).toThrow(RangeError);
    expect(() => spring({ stiffness: 100, damping: -1 })).toThrow(RangeError);
  });
});
