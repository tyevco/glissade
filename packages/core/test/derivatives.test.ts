import { describe, expect, it } from 'vitest';
import {
  bindTimeline,
  compileTimeline,
  createPlayhead,
  cubicBezier,
  cubicBezierDerivative,
  easings,
  easingDerivatives,
  key,
  resolveEaseDerivative,
  sampleTrack,
  setDevWarning,
  spring,
  springEasing,
  springEasingDerivative,
  timeline,
  track,
  velocityAt,
  type Track,
  type Vec2,
} from '../src/index.js';

const POINTS = [0.04, 0.11, 0.19, 0.26, 0.33, 0.41, 0.47, 0.53, 0.61, 0.68, 0.76, 0.84, 0.92, 0.97];
const H = 1e-6;

function centralDiff(fn: (t: number) => number, p: number, h = H): number {
  return (fn(p + h) - fn(p - h)) / (2 * h);
}

/** Kink detector: skip points where the numeric derivative jumps nearby. */
function nearKink(fn: (t: number) => number, p: number): boolean {
  const left = centralDiff(fn, p - 5e-4);
  const right = centralDiff(fn, p + 5e-4);
  return Math.abs(left - right) > 0.5;
}

describe('easing derivative registry (§B.6): analytic ≡ numeric', () => {
  it('covers every named ease', () => {
    expect(Object.keys(easingDerivatives).sort()).toEqual(Object.keys(easings).sort());
  });

  for (const name of Object.keys(easings)) {
    it(`d(${name}) matches central differences at interior points`, () => {
      const fn = easings[name]!;
      const d = easingDerivatives[name]!;
      let checked = 0;
      for (const p of POINTS) {
        if (nearKink(fn, p)) continue;
        const numeric = centralDiff(fn, p);
        expect(
          Math.abs(d(p) - numeric),
          `${name}'(${p}): analytic ${d(p)} vs numeric ${numeric}`,
        ).toBeLessThan(1e-3 * (1 + Math.abs(numeric)));
        checked++;
      }
      expect(checked).toBeGreaterThan(POINTS.length / 2); // kink-skips must not gut the test
    });
  }

  it('cubic bézier derivative is y\'(s)/x\'(s) at the solved parameter', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    const d = cubicBezierDerivative(0.25, 0.1, 0.25, 1);
    for (const p of POINTS) {
      const numeric = centralDiff(ease, p);
      expect(Math.abs(d(p) - numeric)).toBeLessThan(1e-3 * (1 + Math.abs(numeric)));
    }
  });

  it('spring easing derivative matches numeric for all damping regimes', () => {
    for (const cfg of [
      { stiffness: 170, damping: 8, mass: 1 }, // under
      { stiffness: 100, damping: 20, mass: 1 }, // critical
      { stiffness: 100, damping: 40, mass: 1 }, // over
    ]) {
      const ease = springEasing(cfg);
      const d = springEasingDerivative(cfg);
      for (const p of POINTS) {
        if (p > 0.98) continue; // clamp boundary at p=1
        const numeric = centralDiff(ease, p);
        expect(
          Math.abs(d(p) - numeric),
          `spring(${cfg.damping})'(${p})`,
        ).toBeLessThan(1e-3 * (1 + Math.abs(numeric)));
      }
    }
  });

  it('resolveEaseDerivative dispatches all spec shapes; custom names warn once and fall back', () => {
    expect(resolveEaseDerivative('easeInOutCubic')(0.5)).toBeCloseTo(3, 9);
    expect(resolveEaseDerivative(undefined)(0.3)).toBe(1); // linear
    const warnings: string[] = [];
    setDevWarning((m) => warnings.push(m));
    easings['customWiggle'] = (t) => t * t * (3 - 2 * t); // registered without derivative
    const d = resolveEaseDerivative('customWiggle');
    expect(d(0.5)).toBeCloseTo(1.5, 3); // numeric fallback: 6t(1-t) at 0.5
    resolveEaseDerivative('customWiggle');
    expect(warnings.filter((w) => w.includes('customWiggle'))).toHaveLength(1); // once
    delete easings['customWiggle'];
    setDevWarning(() => {});
  });

  it('the numeric fallback uses the §B.5-pinned step h=1/1024 (cross-engine reproducible)', () => {
    setDevWarning(() => {});
    easings['cubePin'] = (u) => u ** 3; // no registered derivative → numeric fallback
    // central difference of u^3 at 0.5 is exactly 3·0.5² + h² = 0.75 + h²
    const d = resolveEaseDerivative('cubePin')(0.5);
    expect(d).toBeCloseTo(0.75 + (1 / 1024) ** 2, 12); // pins h=1/1024
    expect(d).not.toBeCloseTo(0.75 + 1e-5 ** 2, 12); // not the old h=1e-5
    delete easings['cubePin'];
  });
});

describe('spring.retarget (§B.3): the velocity-matched offset oscillator', () => {
  const REGIMES = [
    { stiffness: 170, damping: 8, mass: 1 },
    { stiffness: 100, damping: 20, mass: 1 },
    { stiffness: 100, damping: 40, mass: 1 },
  ];

  it('honors initial conditions exactly: y(0)=x0, y\'(0)=v0', () => {
    for (const cfg of REGIMES) {
      for (const [x0, v0] of [[120, 0], [120, -400], [-50, 900], [0, 250]] as const) {
        const r = spring.retarget(cfg, x0, v0);
        expect(r.value(0)).toBe(x0);
        expect(r.velocity(0)).toBe(v0);
        // numeric agreement just after 0 (right derivative)
        const numeric = (r.value(2 * H) - r.value(H)) / H;
        expect(Math.abs(numeric - r.velocity(1.5 * H))).toBeLessThan(1e-2 * (1 + Math.abs(v0)));
      }
    }
  });

  it('velocity is the analytic derivative of value across the curve', () => {
    for (const cfg of REGIMES) {
      const r = spring.retarget(cfg, 100, -350);
      for (const tau of [0.01, 0.05, 0.1, 0.2, 0.4, 0.8]) {
        const numeric = centralDiff(r.value, tau);
        expect(
          Math.abs(r.velocity(tau) - numeric),
          `velocity(${tau}) damping=${cfg.damping}`,
        ).toBeLessThan(1e-2 * (1 + Math.abs(numeric)));
      }
    }
  });

  it('decays: |y| within tolerance at and beyond settleTime', () => {
    for (const cfg of REGIMES) {
      const r = spring.retarget(cfg, 100, 500);
      const tol = 0.5;
      const ts = r.settleTime(tol);
      expect(ts).toBeGreaterThan(0);
      for (let i = 0; i <= 20; i++) {
        expect(Math.abs(r.value(ts + (i / 20) * ts))).toBeLessThanOrEqual(tol * 1.05);
      }
    }
  });

  it('handoff continuity: dest + offset is C1 at the switch (the §B.2 composite)', () => {
    // outgoing tween mid-flight at tSwitch
    const outgoing = track('n/x', 'number', [key(0, 0), key(1, 300, 'easeInOutCubic')]);
    const tSwitch = 0.4;
    const xOut = sampleTrack(outgoing, tSwitch);
    const vOut = velocityAt(outgoing, tSwitch)!;
    // destination: a live tween already running toward 500
    const dest = track('n/x', 'number', [key(0, 100), key(2, 500, 'easeOutQuad')]);
    const xDest = sampleTrack(dest, tSwitch);
    const vDest = velocityAt(dest, tSwitch)!;
    // offset initial conditions per §B.2: x0 = out - dest, v0 = vOut - vDest
    const r = spring.retarget({ stiffness: 170, damping: 26, mass: 1 }, xOut - xDest, vOut - vDest);
    const composite = (t: number) => sampleTrack(dest, t) + r.value(t - tSwitch);
    expect(composite(tSwitch)).toBeCloseTo(xOut, 9); // C0 exact
    const numericV = (composite(tSwitch + 1e-5) - composite(tSwitch + 1e-9)) / (1e-5 - 1e-9);
    // forward-difference truncation is O(h·|y''|) and the offset spring's
    // curvature is ~ω₀²·x₀; compare relative to the (large) velocity
    expect(Math.abs(numericV - vOut)).toBeLessThan(1e-3 * (1 + Math.abs(vOut))); // C1 at the switch
    // and the composite settles onto the live destination
    expect(composite(2)).toBeCloseTo(sampleTrack(dest, 2), 1);
  });
});

describe('velocityAt (§B.3 conventions, pinned)', () => {
  it('linear segments: exactly (b-a)/duration', () => {
    const tr = track('n/x', 'number', [key(0, 0), key(2, 100)]);
    expect(velocityAt(tr, 1)).toBeCloseTo(50, 9);
  });

  it('eased segments match numeric differentiation of sampleTrack', () => {
    const tr = track('n/x', 'number', [key(0, 0), key(1.5, 300, 'easeInOutCubic'), key(3, 50, 'easeOutBack')]);
    for (const t of [0.2, 0.7, 1.1, 1.8, 2.3, 2.8]) {
      const numeric = centralDiff((x) => sampleTrack(tr, x), t);
      expect(Math.abs(velocityAt(tr, t)! - numeric), `v(${t})`).toBeLessThan(
        1e-2 * (1 + Math.abs(numeric)),
      );
    }
  });

  it('right derivative at key boundaries (convention a)', () => {
    const tr = track('n/x', 'number', [key(0, 0), key(1, 100), key(2, 100, 'easeInQuad')]);
    // at t=1 exactly: left segment slope 100, right segment starts flat (easeInQuad'(0)=0, Δ=0)
    expect(velocityAt(tr, 1)).toBeCloseTo(0, 9);
  });

  it('holds and clamped regions are zero (convention b)', () => {
    const tr = track('n/x', 'number', [key(0, 0), key(1, 5, { interp: 'hold' }), key(2, 9)]);
    expect(velocityAt(tr, 0.5)).toBe(0); // hold segment
    expect(velocityAt(tr, -1)).toBe(0); // before first
    expect(velocityAt(tr, 99)).toBe(0); // after last
  });

  it('vec2 velocity is per-component via the type operators', () => {
    const tr = track('n/p', 'vec2', [key<Vec2>(0, [0, 0]), key<Vec2>(2, [100, -40])]);
    const v = velocityAt(tr, 1)!;
    expect(v[0]).toBeCloseTo(50, 9);
    expect(v[1]).toBeCloseTo(-20, 9);
  });

  it('types without operators return null (convention c)', () => {
    const tr = track('n/fill', 'color', [key(0, '#000000'), key(1, '#ffffff')]);
    expect(velocityAt(tr, 0.5)).toBeNull();
  });
});

describe('per-target samplers from bindTimeline (§B.6, additive)', () => {
  it('exposes value/velocity per target; existing surface unchanged', () => {
    const doc = timeline({
      tracks: [
        track('a/x', 'number', [key(0, 0), key(2, 100, 'easeInOutCubic')]),
        track('a/fill', 'color', [key(0, '#000000'), key(2, '#ffffff')]),
      ],
    });
    const playhead = createPlayhead();
    const targets = new Map<string, { bindSource(fn: () => unknown): void; unbindSource(): void }>([
      ['a/x', { bindSource: () => {}, unbindSource: () => {} }],
      ['a/fill', { bindSource: () => {}, unbindSource: () => {} }],
    ]);
    const bound = bindTimeline(compileTimeline(doc), (t) => targets.get(t), playhead);

    expect(bound.playhead).toBe(playhead); // pre-existing surface intact
    expect(typeof bound.unbind).toBe('function');

    const x = bound.samplers.get('a/x')!;
    expect(x.value(1)).toBe(sampleTrack(x.track as Track<number>, 1));
    expect(x.velocity(1)).toBeCloseTo(velocityAt(x.track as Track<number>, 1)!, 12);
    expect(bound.samplers.get('a/fill')!.velocity(1)).toBeNull();
  });
});
