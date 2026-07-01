/**
 * Easing registry + cubic bézier (DESIGN.md §2.2). All functions map [0,1]→ℝ
 * with f(0)=0 and f(1)=1; back/elastic intentionally leave [0,1].
 */

export type EasingFn = (t: number) => number;

export type EaseSpec =
  | string
  | { kind: 'cubicBezier'; pts: [number, number, number, number] }
  | { kind: 'spring'; stiffness: number; damping: number; mass: number };

/**
 * Time-mirror of an ease, so a segment played BACKWARD eases identically to the
 * forward segment (used by `retime`'s reverse/pingpong). The built-in eases pair
 * exactly — `easeInX ↔ easeOutX`, and `easeInOutX`/`linear` self-mirror — and a
 * `cubicBezier` mirrors by point reflection (`[x1,y1,x2,y2] → [1−x2,1−y2,1−x1,1−y1]`,
 * the analytic reverse of a bézier ease). Springs are causal and a custom-named
 * ease has no known inverse, so both throw fail-loud rather than mis-animate.
 */
export function mirrorEase(spec: EaseSpec | undefined): EaseSpec | undefined {
  if (spec === undefined) return undefined; // linear self-mirror
  if (typeof spec === 'string') {
    if (spec === 'linear') return 'linear';
    if (spec.startsWith('easeInOut')) return spec;
    if (spec.startsWith('easeIn')) return `easeOut${spec.slice('easeIn'.length)}`;
    if (spec.startsWith('easeOut')) return `easeIn${spec.slice('easeOut'.length)}`;
    throw new Error(
      `retime: cannot time-mirror the custom ease '${spec}' for reverse/pingpong — ` +
        'reverse only the built-in eases or a cubicBezier, or retime with { speed } / { shift }',
    );
  }
  if (spec.kind === 'cubicBezier') {
    const [x1, y1, x2, y2] = spec.pts;
    return { kind: 'cubicBezier', pts: [1 - x2, 1 - y2, 1 - x1, 1 - y1] };
  }
  throw new Error(
    'retime: cannot reverse/pingpong a spring ease (springs are causal) — ' +
      'retime the spring segment with { speed } / { shift }, or author the reverse explicitly',
  );
}

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;
const c5 = (2 * Math.PI) / 4.5;

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

export const easings: Record<string, EasingFn> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeInCubic: (t) => t ** 3,
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  easeInQuart: (t) => t ** 4,
  easeOutQuart: (t) => 1 - (1 - t) ** 4,
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  easeInQuint: (t) => t ** 5,
  easeOutQuint: (t) => 1 - (1 - t) ** 5,
  easeInOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2),
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  easeInOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
  easeOutCirc: (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
  easeInOutCirc: (t) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
      : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2,
  easeInBack: (t) => c3 * t ** 3 - c1 * t * t,
  easeOutBack: (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  easeInOutBack: (t) =>
    t < 0.5
      ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2
      : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
  easeInElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * c4),
  easeOutElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1,
  easeInOutElastic: (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
          : (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1,
  easeInBounce: (t) => 1 - bounceOut(1 - t),
  easeOutBounce: bounceOut,
  easeInOutBounce: (t) =>
    t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2,
};


function bounceOutD(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return 2 * n1 * t;
  if (t < 2 / d1) return 2 * n1 * (t - 1.5 / d1);
  if (t < 2.5 / d1) return 2 * n1 * (t - 2.25 / d1);
  return 2 * n1 * (t - 2.625 / d1);
}

const LN2 = Math.LN2;

/**
 * Analytic derivatives d(u) of every named ease (§B.6) — closed-form, used
 * for reading velocity off in-flight curves at interruption time. Property-
 * tested against central differences at interior points.
 */
export const easingDerivatives: Record<string, EasingFn> = {
  linear: () => 1,
  easeInQuad: (t) => 2 * t,
  easeOutQuad: (t) => 2 * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 4 * t : 4 * (1 - t)),
  easeInCubic: (t) => 3 * t ** 2,
  easeOutCubic: (t) => 3 * (1 - t) ** 2,
  easeInOutCubic: (t) => (t < 0.5 ? 12 * t ** 2 : 12 * (1 - t) ** 2),
  easeInQuart: (t) => 4 * t ** 3,
  easeOutQuart: (t) => 4 * (1 - t) ** 3,
  easeInOutQuart: (t) => (t < 0.5 ? 32 * t ** 3 : 32 * (1 - t) ** 3),
  easeInQuint: (t) => 5 * t ** 4,
  easeOutQuint: (t) => 5 * (1 - t) ** 4,
  easeInOutQuint: (t) => (t < 0.5 ? 80 * t ** 4 : 80 * (1 - t) ** 4),
  easeInSine: (t) => (Math.PI / 2) * Math.sin((t * Math.PI) / 2),
  easeOutSine: (t) => (Math.PI / 2) * Math.cos((t * Math.PI) / 2),
  easeInOutSine: (t) => (Math.PI / 2) * Math.sin(Math.PI * t),
  easeInExpo: (t) => (t === 0 ? 0 : 10 * LN2 * 2 ** (10 * t - 10)),
  easeOutExpo: (t) => (t === 1 ? 0 : 10 * LN2 * 2 ** (-10 * t)),
  easeInOutExpo: (t) =>
    t === 0 || t === 1
      ? 0
      : t < 0.5
        ? 10 * LN2 * 2 ** (20 * t - 10)
        : 10 * LN2 * 2 ** (-20 * t + 10),
  easeInCirc: (t) => t / Math.sqrt(1 - t * t),
  easeOutCirc: (t) => (1 - t) / Math.sqrt(1 - (t - 1) * (t - 1)),
  easeInOutCirc: (t) =>
    t < 0.5
      ? (2 * t) / Math.sqrt(1 - 4 * t * t)
      : (2 - 2 * t) / Math.sqrt(1 - (-2 * t + 2) ** 2),
  easeInBack: (t) => 3 * c3 * t ** 2 - 2 * c1 * t,
  easeOutBack: (t) => 3 * c3 * (t - 1) ** 2 + 2 * c1 * (t - 1),
  easeInOutBack: (t) =>
    t < 0.5
      ? 12 * (c2 + 1) * t ** 2 - 4 * c2 * t
      : 3 * (c2 + 1) * (2 * t - 2) ** 2 + 2 * c2 * (2 * t - 2),
  easeInElastic: (t) => {
    if (t === 0 || t === 1) return 0;
    const theta = (t * 10 - 10.75) * c4;
    const amp = 2 ** (10 * t - 10);
    return -(10 * LN2 * amp * Math.sin(theta) + amp * 10 * c4 * Math.cos(theta));
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return 0;
    const phi = (t * 10 - 0.75) * c4;
    const amp = 2 ** (-10 * t);
    return -10 * LN2 * amp * Math.sin(phi) + amp * 10 * c4 * Math.cos(phi);
  },
  easeInOutElastic: (t) => {
    if (t === 0 || t === 1) return 0;
    const psi = (20 * t - 11.125) * c5;
    if (t < 0.5) {
      const amp = 2 ** (20 * t - 10);
      return -(20 * LN2 * amp * Math.sin(psi) + amp * 20 * c5 * Math.cos(psi)) / 2;
    }
    const amp = 2 ** (-20 * t + 10);
    return (-20 * LN2 * amp * Math.sin(psi) + amp * 20 * c5 * Math.cos(psi)) / 2;
  },
  easeInBounce: (t) => bounceOutD(1 - t),
  easeOutBounce: bounceOutD,
  easeInOutBounce: (t) => (t < 0.5 ? bounceOutD(1 - 2 * t) : bounceOutD(2 * t - 1)),
};

/** Default property-tween ease (Motion Canvas precedent). */
export const DEFAULT_EASE = 'easeInOutCubic';

interface BezierKernel {
  sampleY(u: number): number;
  sampleDX(u: number): number;
  sampleDY(u: number): number;
  solveU(x: number): number;
}

function bezierKernel(p1x: number, p1y: number, p2x: number, p2y: number): BezierKernel {
  const ax = 3 * p1x - 3 * p2x + 1;
  const bx = 3 * p2x - 6 * p1x;
  const cx = 3 * p1x;
  const ay = 3 * p1y - 3 * p2y + 1;
  const by = 3 * p2y - 6 * p1y;
  const cy = 3 * p1y;

  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  const sampleDX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const sampleDY = (u: number) => (3 * ay * u + 2 * by) * u + cy;

  const solveU = (x: number): number => {
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(u) - x;
      if (Math.abs(err) < 1e-7) return u;
      const d = sampleDX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    while (hi - lo > 1e-7) {
      if (sampleX(u) < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };

  return { sampleY, sampleDX, sampleDY, solveU };
}

/**
 * CSS-style cubic bézier where x is time and y is progress. Newton's method
 * with a bisection fallback for the flat-derivative regions.
 */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): EasingFn {
  const k = bezierKernel(p1x, p1y, p2x, p2y);
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return k.sampleY(k.solveU(t));
  };
}

/** Analytic dy/dx of a cubic bézier ease: y'(s)/x'(s) at the solved parameter (§B.6). */
export function cubicBezierDerivative(p1x: number, p1y: number, p2x: number, p2y: number): EasingFn {
  const k = bezierKernel(p1x, p1y, p2x, p2y);
  return (t) => {
    const u = k.solveU(Math.min(1, Math.max(0, t)));
    const dx = k.sampleDX(u);
    if (Math.abs(dx) < 1e-9) return 0; // vertical tangent; consumers treat as stationary
    return k.sampleDY(u) / dx;
  };
}

export class UnknownEasingError extends Error {
  constructor(name: string) {
    super(`unknown easing '${name}'; register it via easings or use cubicBezier/spring`);
    this.name = 'UnknownEasingError';
  }
}

export function namedEasing(name: string): EasingFn {
  const fn = easings[name];
  if (!fn) throw new UnknownEasingError(name);
  return fn;
}
