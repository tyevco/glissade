/**
 * `shake` (0.55) — a standalone jitter driver that wobbles ANY node's pose with
 * deterministic value noise. It subsumes the hand-rolled per-element jitters
 * (desk-cursor jitterX/Y, glitch shakeAmp, typewriter jitterRate) behind one
 * primitive with SEPARATE translate / rotate / frequency amplitudes.
 *
 * The jitter is realized AT EMIT (the Echo/MotionBlur idiom): `shake` overrides
 * the node's `emit` to wrap it in a save → shake-transform → emit → restore, where
 * the transform is a pure function of `ctx.time` via `valueNoise` — so it composes
 * on top of WHATEVER already drives the node (keyframes, layout, followPath) as a
 * parent-space offset, and stays byte-identical across two `evaluate()` passes (no
 * cross-frame state, no `Date.now`/`Math.random`). The camera whole-frame shake
 * reuses {@link shakeOffset} directly on its pose.
 *
 * Lives on `@glissade/scene/motion` (off the base embed). Note (like Echo/
 * MotionBlur, both emit-time re-eval): the offset is not a Timeline TRACK, so it
 * is a runtime/render effect — it is NOT emitted as animated Lottie keyframes.
 */

import { valueNoise, type Vec2 } from '@glissade/core';
import { fromTRS, multiply, type Mat2x3 } from './matrix.js';
import { type EvalContext, type Node } from './node.js';

/** Default temporal frequency (noise cycles per second) when `frequency` is unset. */
const DEFAULT_FREQUENCY = 8;
// Channel seed offsets so x / y / rotation draw DECORRELATED noise from one seed.
const K_Y = 101;
const K_ROT = 211;

export interface ShakeSpec {
  /** Seed for the deterministic noise — same seed ⇒ same wobble, every run. */
  seed: number;
  /** Peak translation amplitude in px (±); default 0 (no positional jitter). */
  translate?: number;
  /** Peak rotation amplitude in degrees (±); default 0 (no rotational jitter). */
  rotate?: number;
  /** Noise cycles per second (higher = twitchier); default 8. */
  frequency?: number;
}

/** Signed value noise in [-1, 1) — the bipolar form a shake offset needs. */
function snoise(seed: number, t: number): number {
  return valueNoise(seed, t) * 2 - 1;
}

/**
 * Render-INVISIBLE marker: which nodes a {@link shake} driver is applied to, and
 * with what spec. The render path NEVER reads this (shake works purely by wrapping
 * `emit`), so it is byte-neutral for goldens — it exists ONLY so an EXPORTER
 * (which reads signals, not `emit`) can detect the render-only jitter and warn
 * honestly instead of silently dropping it. A WeakMap keeps it off the Node type.
 */
const SHAKEN = new WeakMap<Node, ShakeSpec>();

/** The shake spec applied to `node` via {@link shake}, or undefined — the seam an
 *  exporter uses to emit an honest "shake is render-only" warn (never a silent drop). */
export function shakenSpec(node: Node): ShakeSpec | undefined {
  return SHAKEN.get(node);
}

/**
 * The pure per-time shake offset for a spec: `{ dx, dy }` px + `dr` degrees, each
 * a deterministic function of `(seed, t)`. Both the {@link shake} node driver and
 * the Camera whole-frame shake fold this in.
 */
export function shakeOffset(spec: ShakeSpec, t: number): { dx: number; dy: number; dr: number } {
  const tr = spec.translate ?? 0;
  const rot = spec.rotate ?? 0;
  const tf = t * (spec.frequency ?? DEFAULT_FREQUENCY);
  return {
    dx: tr === 0 ? 0 : tr * snoise(spec.seed, tf),
    dy: tr === 0 ? 0 : tr * snoise(spec.seed + K_Y, tf),
    dr: rot === 0 ? 0 : rot * snoise(spec.seed + K_ROT, tf),
  };
}

/**
 * A shake transform about the point `p` (parent space): translate by `(dx, dy)`
 * then rotate `dr` degrees about `p`, so a rotational jitter spins the node around
 * its own origin rather than the parent's.
 */
export function shakeMatrix(p: Vec2, dx: number, dy: number, dr: number): Mat2x3 {
  const translate: Mat2x3 = [1, 0, 0, 1, dx, dy];
  if (dr === 0) return translate;
  const toP: Mat2x3 = [1, 0, 0, 1, p[0], p[1]];
  const fromP: Mat2x3 = [1, 0, 0, 1, -p[0], -p[1]];
  const rot = fromTRS([0, 0], dr, [1, 1]);
  return multiply(translate, multiply(toP, multiply(rot, fromP)));
}

/**
 * Jitter `node`'s pose with deterministic value noise, then return it (mutate-and-
 * return, like Grid/orientToPath). SEPARATE `translate` (px) / `rotate` (deg) /
 * `frequency` (Hz) amplitudes; pass at least one nonzero amplitude. The jitter is
 * a parent-space offset applied at emit, so it composes with any existing driver.
 *
 * `children: [shake(cursor, { seed: 7, translate: 3 })]` — the cursor wobbles ±3px
 * around wherever else it is (its position track, a followPath, …).
 */
export function shake(node: Node, spec: ShakeSpec): Node {
  const tr = spec.translate ?? 0;
  const rot = spec.rotate ?? 0;
  if (tr === 0 && rot === 0) {
    throw new Error(
      "shake(): pass a nonzero `translate` (px) or `rotate` (deg) amplitude — both are 0/omitted, so nothing would move.",
    );
  }
  SHAKEN.set(node, spec); // render-invisible export marker (see shakenSpec)
  const origEmit = node.emit.bind(node);
  node.emit = (out, ctx: EvalContext): void => {
    const { dx, dy, dr } = shakeOffset(spec, ctx.time);
    if (dx === 0 && dy === 0 && dr === 0) {
      origEmit(out, ctx);
      return;
    }
    out.push({ op: 'save' });
    out.push({ op: 'transform', m: shakeMatrix(node.position(), dx, dy, dr) });
    origEmit(out, ctx);
    out.push({ op: 'restore' });
  };
  return node;
}
