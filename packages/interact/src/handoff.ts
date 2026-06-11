/**
 * Transition execution (§B.1/§B.2): every handoff is offset decay over the
 * live destination — the inertialization shape. (x₀, v₀) are read analytically
 * from the outgoing closed-form curve at switch time, never finite-differenced
 * from rendered frames; the offset y(τ) decays to zero in closed form.
 */

import { resolveEase, resolveEaseDerivative, spring, type EaseSpec, type SpringConfig, type ValueType } from '@glissade/core';

/** Analytic value + derivative of a live source w.r.t. the machine clock (§B.2). */
export interface MachineSampler<T = unknown> {
  value(t: number): T;
  /** null when the source's type lacks operators (lerp-only). */
  velocity(t: number): T | null;
}

export type HandoffPolicy =
  | { kind: 'decay'; ease: EaseSpec | undefined; duration: number }
  | { kind: 'spring'; cfg: SpringConfig };

/** §B.3's decided default: critically-damped-ish, never derived from the declared duration. */
export const DEFAULT_HANDOFF_SPRING: SpringConfig = { stiffness: 170, damping: 26, mass: 1 };

const componentsOf = (v: unknown): readonly number[] | null =>
  typeof v === 'number'
    ? [v]
    : Array.isArray(v) && v.every((x) => typeof x === 'number')
      ? (v as number[])
      : null;

export interface OffsetCurve<T> {
  at(tau: number): T;
  vel(tau: number): T;
  /** τ after which the offset is dropped; dest alone is exact within the settle tolerance. */
  settle: number;
}

/**
 * Closed-form offset y(τ) → 0 with y(0)=x₀ (§B.2's solveOffset). Requires the
 * type's add/sub/scale operators (callers degrade lerp-only types upstream).
 */
export function solveOffset<T>(policy: HandoffPolicy, vt: ValueType<T>, x0: T, v0: T): OffsetCurve<T> {
  const scale = vt.scale!.bind(vt);
  const add = vt.add!.bind(vt);
  if (policy.kind === 'spring') {
    const cfg = policy.cfg;
    // The oscillator solution is linear in its initial conditions:
    // y(τ) = a(τ)·x₀ + b(τ)·v₀ with a = retarget(1, 0), b = retarget(0, 1) —
    // exact per component, so one pair of scalar springs serves any operator type.
    const a = spring.retarget(cfg, 1, 0);
    const b = spring.retarget(cfg, 0, 1);
    const xc = componentsOf(x0);
    const vc = componentsOf(v0);
    let settle: number;
    if (xc && vc) {
      const tol = 1e-3 * (1 + Math.max(...xc.map(Math.abs))) ;
      settle = 0;
      for (let i = 0; i < xc.length; i++) {
        settle = Math.max(settle, spring.retarget(cfg, xc[i]!, vc[i]!).settleTime(tol));
      }
    } else {
      // custom operator types without numeric components: unit-normalized estimate
      settle = spring.retarget(cfg, 1, 1).settleTime(1e-3);
    }
    return {
      at: (tau) => add(scale(x0, a.value(tau)), scale(v0, b.value(tau))),
      vel: (tau) => add(scale(x0, a.velocity(tau)), scale(v0, b.velocity(tau))),
      settle,
    };
  }
  // decay: y(τ) = (1 − ease(τ/d′))·x₀; v₀ feeds only the overshoot clamp (§B.1).
  const ease = resolveEase(policy.ease);
  const dEase = resolveEaseDerivative(policy.ease);
  let d = policy.duration;
  // Bollo's clamp on the dominant component: when v₀ already points at the
  // target, compensate the duration — d′ = min(d, −5x₀/v₀) — so a quick
  // reversal never crawls.
  const xc = componentsOf(x0);
  const vc = componentsOf(v0);
  if (xc && vc && xc.length > 0) {
    let k = 0;
    for (let i = 1; i < xc.length; i++) if (Math.abs(xc[i]!) > Math.abs(xc[k]!)) k = i;
    if (xc[k]! * vc[k]! < 0) d = Math.min(d, (-5 * xc[k]!) / vc[k]!);
  }
  const zero = scale(x0, 0);
  if (d <= 0) return { at: () => zero, vel: () => zero, settle: 0 };
  return {
    at: (tau) => (tau >= d ? zero : scale(x0, 1 - ease(tau / d))),
    vel: (tau) => (tau >= d ? zero : scale(x0, -dEase(tau / d) / d)),
    settle: d,
  };
}
