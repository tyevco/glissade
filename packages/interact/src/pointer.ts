/**
 * Pointer input (§C.1/§C.2): an InputDriver<Vec2> with rAF-coalesced writes
 * and optional driver-resident spring smoothing. Filter state lives in the
 * driver closure — never in a signal; the smoothed value is a sequence of
 * closed-form spring segments (§B.3 velocity-matched retargets per write), so
 * sampling at arbitrary wall-clock t is exact with no fixed-Δt stepping, and
 * replaying the same retarget times reproduces the output bit-for-bit (§C.5).
 */

import { spring, type RetargetSpring, type SpringConfig, type Vec2 } from '@glissade/core';
import type { Scene } from '@glissade/scene';
import type { InputDriver } from '@glissade/player';

/** vec2 is not a machine input type in v2.0 (§A.2): fan out to two number writes. */
export const splitVec2 =
  (x: (v: number) => void, y: (v: number) => void) =>
  (v: Vec2): void => {
    x(v[0]);
    y(v[1]);
  };

/** One scalar smoothing filter: closed-form spring segments, retargeted per write. */
export interface SpringFilter {
  /** Aim at a new target at time t (seconds); velocity-matched (§B.3). First call snaps. */
  retarget(t: number, target: number): void;
  sample(t: number): number;
  velocity(t: number): number;
  /** True once the current segment's offset has decayed within tolerance. */
  settled(t: number): boolean;
}

export function springFilter(cfg: SpringConfig): SpringFilter {
  let primed = false;
  let target = 0;
  let segStart = 0;
  let seg: RetargetSpring | null = null;
  let settleTime = 0;
  const sample = (t: number): number => target + (seg ? seg.value(t - segStart) : 0);
  const velocity = (t: number): number => (seg ? seg.velocity(t - segStart) : 0);
  return {
    sample,
    velocity,
    settled: (t) => !seg || t - segStart >= settleTime,
    retarget(t, next) {
      if (!primed) {
        // the first write defines the rest position — no fly-in from 0
        primed = true;
        target = next;
        return;
      }
      const x0 = sample(t) - next;
      const v0 = velocity(t);
      target = next;
      if (x0 === 0 && v0 === 0) {
        seg = null;
        return;
      }
      seg = spring.retarget(cfg, x0, v0);
      segStart = t;
      settleTime = seg.settleTime(1e-3 * (1 + Math.abs(x0)));
    },
  };
}

export interface PointerDriverOptions {
  /** Event source — usually the canvas element. */
  target: Element;
  /** Scale element-local CSS px into scene units via scene.size; default 1:1. */
  scene?: Scene;
  /** Optional driver-resident smoothing (§C.2). */
  smooth?: SpringConfig;
}

/**
 * Position only — buttons are listeners (§C.3). Intermediate pointermove
 * events coalesce; one write lands per animation frame (§C.1).
 */
export function pointerDriver(opts: PointerDriverOptions): InputDriver<Vec2> {
  let teardown: (() => void) | null = null;
  return {
    start(write) {
      const el = opts.target;
      const toLocal = (ev: PointerEvent): Vec2 => {
        const rect = el.getBoundingClientRect();
        const sx = opts.scene && rect.width > 0 ? opts.scene.size.w / rect.width : 1;
        const sy = opts.scene && rect.height > 0 ? opts.scene.size.h / rect.height : 1;
        return [(ev.clientX - rect.left) * sx, (ev.clientY - rect.top) * sy];
      };
      let raf = 0;
      let scheduled = false;
      let onMove: (ev: PointerEvent) => void;

      if (opts.smooth) {
        const fx = springFilter(opts.smooth);
        const fy = springFilter(opts.smooth);
        const nowS = () => performance.now() / 1000;
        const tick = () => {
          const t = nowS();
          write([fx.sample(t), fy.sample(t)]);
          if (fx.settled(t) && fy.settled(t)) {
            scheduled = false;
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        onMove = (ev) => {
          const [x, y] = toLocal(ev);
          const t = nowS();
          fx.retarget(t, x);
          fy.retarget(t, y);
          if (!scheduled) {
            scheduled = true;
            raf = requestAnimationFrame(tick);
          }
        };
      } else {
        let pending: Vec2 | null = null;
        const flush = () => {
          scheduled = false;
          if (pending) {
            write(pending);
            pending = null;
          }
        };
        onMove = (ev) => {
          pending = toLocal(ev);
          if (!scheduled) {
            scheduled = true;
            raf = requestAnimationFrame(flush);
          }
        };
      }

      el.addEventListener('pointermove', onMove as EventListener);
      teardown = () => {
        el.removeEventListener('pointermove', onMove as EventListener);
        cancelAnimationFrame(raf);
        scheduled = false;
      };
    },
    stop() {
      teardown?.();
      teardown = null;
    },
  };
}
