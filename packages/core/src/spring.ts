/**
 * Closed-form springs (DESIGN.md §2.7): the damped-harmonic-oscillator solution
 * with x(0)=0, x'(0)=0, target 1. Never an integrator — pure in t, seek-safe,
 * serializable as an Ease variant.
 */

import type { EasingFn } from './easing.js';

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
}

export interface SpringEase {
  kind: 'spring';
  stiffness: number;
  damping: number;
  mass: number;
}

const DEFAULT_SETTLE_TOLERANCE = 0.005;

function params(cfg: SpringConfig): { w0: number; zeta: number } {
  const mass = cfg.mass ?? 1;
  if (!(cfg.stiffness > 0) || !(cfg.damping > 0) || !(mass > 0)) {
    throw new RangeError('spring stiffness, damping, and mass must all be > 0');
  }
  const w0 = Math.sqrt(cfg.stiffness / mass);
  const zeta = cfg.damping / (2 * Math.sqrt(cfg.stiffness * mass));
  return { w0, zeta };
}

/** Raw closed-form spring velocity at time t — d/dt of rawValue's three branches. */
function rawDerivative(cfg: SpringConfig, t: number): number {
  if (t <= 0) return 0;
  const { w0, zeta } = params(cfg);
  if (Math.abs(zeta - 1) < 1e-9) {
    return w0 * w0 * t * Math.exp(-w0 * t);
  }
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return Math.exp(-zeta * w0 * t) * ((w0 * w0) / wd) * Math.sin(wd * t);
  }
  const s = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - s);
  const r2 = -w0 * (zeta + s);
  return (r1 * r2 * (Math.exp(r1 * t) - Math.exp(r2 * t))) / (r1 - r2);
}

/** Raw closed-form spring position at time t (seconds). Approaches 1, may overshoot. */
function rawValue(cfg: SpringConfig, t: number): number {
  if (t <= 0) return 0;
  const { w0, zeta } = params(cfg);
  if (Math.abs(zeta - 1) < 1e-9) {
    // critically damped: x = 1 - e^(-w0 t)(1 + w0 t)
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }
  if (zeta < 1) {
    // underdamped: x = 1 - e^(-z w0 t)(cos(wd t) + (z w0 / wd) sin(wd t))
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  // overdamped: x = 1 + (r2 e^(r1 t) - r1 e^(r2 t)) / (r1 - r2)
  const s = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - s);
  const r2 = -w0 * (zeta + s);
  return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2);
}

/**
 * Settle duration: the earliest time after which |x - 1| stays within
 * settleTolerance. Closed-form via the decay envelope for the underdamped
 * case; bisection on the monotone tail otherwise. Deterministic.
 */
function duration(cfg: SpringConfig, opts?: { settleTolerance?: number }): number {
  const tol = opts?.settleTolerance ?? DEFAULT_SETTLE_TOLERANCE;
  const { w0, zeta } = params(cfg);
  if (zeta < 1) {
    // |x - 1| <= e^(-z w0 t) * sqrt(1 + (z w0/wd)^2); solve envelope = tol
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const amp = Math.sqrt(1 + ((zeta * w0) / wd) ** 2);
    return Math.log(amp / tol) / (zeta * w0);
  }
  // Critically/overdamped: |1 - x| decreases monotonically; bisect.
  let hi = 1 / w0;
  while (1 - rawValue(cfg, hi) > tol) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 64 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (1 - rawValue(cfg, mid) > tol) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Spring progress at local time t, affinely rescaled so value(duration) = 1
 * exactly — the raw form only approaches 1, and an unscaled curve would snap
 * at the key (§2.7 "endpoint continuity"). May exceed 1 (overshoot).
 */
function value(cfg: SpringConfig, t: number, opts?: { settleTolerance?: number }): number {
  const d = duration(cfg, opts);
  return rawValue(cfg, Math.min(t, d)) / rawValue(cfg, d);
}

/**
 * Velocity-matched retarget oscillator (v2 addendum §B.3): the same damped
 * harmonic oscillator on an OFFSET in value units with nonzero initial
 * velocity — y(0)=x0, y'(0)=v0, decaying to 0. No affine rescale (the target
 * is exactly 0). Pure closed forms; seek-safe at any τ.
 */
export interface RetargetSpring {
  value(tau: number): number;
  velocity(tau: number): number;
  /** Earliest τ after which |value| stays within tol (default 0.005·|x0|+1e-6 floor). */
  settleTime(tol?: number): number;
}

function retarget(cfg: SpringConfig, x0: number, v0: number): RetargetSpring {
  const { w0, zeta } = params(cfg);

  let value0: (tau: number) => number;
  let velocity0: (tau: number) => number;
  let envelope: (tau: number) => number;

  if (Math.abs(zeta - 1) < 1e-9) {
    const b = v0 + w0 * x0;
    value0 = (tau) => (tau <= 0 ? x0 : Math.exp(-w0 * tau) * (x0 + b * tau));
    velocity0 = (tau) => (tau <= 0 ? v0 : Math.exp(-w0 * tau) * (v0 - w0 * b * tau));
    envelope = (tau) => Math.exp(-w0 * tau) * (Math.abs(x0) + Math.abs(b) * tau);
  } else if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const c2v = (v0 + zeta * w0 * x0) / wd;
    const amp = Math.hypot(x0, c2v);
    value0 = (tau) =>
      tau <= 0 ? x0 : Math.exp(-zeta * w0 * tau) * (x0 * Math.cos(wd * tau) + c2v * Math.sin(wd * tau));
    velocity0 = (tau) =>
      tau <= 0
        ? v0
        : Math.exp(-zeta * w0 * tau) *
          (v0 * Math.cos(wd * tau) - ((w0 * w0 * x0 + zeta * w0 * v0) / wd) * Math.sin(wd * tau));
    envelope = (tau) => Math.exp(-zeta * w0 * tau) * amp;
  } else {
    const s = Math.sqrt(zeta * zeta - 1);
    const rp = w0 * (-zeta + s);
    const rm = w0 * (-zeta - s);
    const cp = (v0 - rm * x0) / (rp - rm);
    const cm = (rp * x0 - v0) / (rp - rm);
    value0 = (tau) => (tau <= 0 ? x0 : cp * Math.exp(rp * tau) + cm * Math.exp(rm * tau));
    velocity0 = (tau) => (tau <= 0 ? v0 : cp * rp * Math.exp(rp * tau) + cm * rm * Math.exp(rm * tau));
    // both rates negative: |y| ≤ |cp|e^(rp τ) + |cm|e^(rm τ), monotone ↓
    envelope = (tau) => Math.abs(cp) * Math.exp(rp * tau) + Math.abs(cm) * Math.exp(rm * tau);
  }

  const settleTime = (tol?: number): number => {
    const eps = tol ?? Math.abs(x0) * 0.005 + 1e-6;
    if (envelope(0) <= eps && Math.abs(v0) < 1e-12) return 0;
    // envelopes are eventually monotone decreasing; find a bracket then bisect
    let hi = 1 / w0;
    let guard = 0;
    while (envelope(hi) > eps && guard++ < 64) hi *= 2;
    let lo = 0;
    for (let i = 0; i < 64 && hi - lo > 1e-9; i++) {
      const mid = (lo + hi) / 2;
      // envelope may rise briefly (critical case peak): test a short forward scan
      const v = Math.max(envelope(mid), envelope(mid * 1.05 + 1e-6));
      if (v > eps) lo = mid;
      else hi = mid;
    }
    return hi;
  };

  return { value: value0, velocity: velocity0, settleTime };
}

interface SpringFactory {
  (cfg: SpringConfig): SpringEase;
  duration: typeof duration;
  value: typeof value;
  retarget: typeof retarget;
}

export const spring: SpringFactory = Object.assign(
  (cfg: SpringConfig): SpringEase => {
    params(cfg); // validate eagerly
    return { kind: 'spring', stiffness: cfg.stiffness, damping: cfg.damping, mass: cfg.mass ?? 1 };
  },
  { duration, value, retarget },
);

/**
 * The spring as a normalized easing over a segment whose length must equal
 * spring.duration(cfg) (validated at the document layer, §2.7).
 */
export function springEasing(cfg: SpringConfig): EasingFn {
  const d = duration(cfg);
  return (p) => value(cfg, p * d);
}

/**
 * Analytic d/dp of springEasing (§B.6): oscillator derivative × the affine
 * rescale factor × duration (chain rule p → t = p·D). Flat past p=1,
 * matching value()'s clamp (right-derivative convention).
 */
export function springEasingDerivative(cfg: SpringConfig): EasingFn {
  const d = duration(cfg);
  const scale = d / rawValue(cfg, d);
  return (p) => (p >= 1 ? 0 : rawDerivative(cfg, p * d) * scale);
}
