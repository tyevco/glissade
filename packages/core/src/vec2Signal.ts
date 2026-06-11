/**
 * Compound Vec2 signal (DESIGN.md §2.1): sub-signals are real signals, the
 * parent read derives from them, and tracks may target either level — a
 * sub-signal binding takes precedence for its component (§2.2).
 */

import { computed, signal, type BindableSignal, type ReadonlySignal } from './signal.js';
import { type Vec2 } from './valueTypes.js';

export interface Vec2Signal extends ReadonlySignal<Vec2> {
  readonly x: BindableSignal<number>;
  readonly y: BindableSignal<number>;
  set(value: Vec2): void;
  /** Bind the compound level; component bindings on .x/.y override per component. */
  bindSource(fn: () => Vec2): void;
  unbindSource(): void;
}

export function vec2Signal(initial: Vec2 | { x: number; y: number }): Vec2Signal {
  const [ix, iy] = Array.isArray(initial)
    ? (initial as Vec2)
    : ([(initial as { x: number; y: number }).x, (initial as { x: number; y: number }).y] as const);

  const x = signal(ix);
  const y = signal(iy);
  // Compound binding lives one level below the components: when bound, an
  // unbound component pulls its lane from here; a bound component wins.
  const compound = signal<Vec2 | null>(null, {
    equals: (a, b) => (a === null || b === null ? a === b : a[0] === b[0] && a[1] === b[1]),
  });

  const baseX = signal(ix);
  const baseY = signal(iy);
  x.bindSource(() => {
    const c = compound();
    return c === null ? baseX() : c[0];
  });
  y.bindSource(() => {
    const c = compound();
    return c === null ? baseY() : c[1];
  });

  const value = computed<Vec2>(() => [x(), y()], {
    equals: (a, b) => a[0] === b[0] && a[1] === b[1],
  });

  const sig = (() => value()) as unknown as Record<string, unknown>;
  sig['peek'] = () => value.peek();
  sig['subscribe'] = (cb: () => void) => value.subscribe(cb);
  sig['set'] = (v: Vec2) => {
    compound.set(null);
    baseX.set(v[0]);
    baseY.set(v[1]);
  };
  sig['bindSource'] = (fn: () => Vec2) => compound.bindSource(() => fn());
  sig['unbindSource'] = () => {
    compound.unbindSource();
    compound.set(null);
  };
  Object.defineProperty(sig, 'x', { value: x, enumerable: true });
  Object.defineProperty(sig, 'y', { value: y, enumerable: true });
  return sig as unknown as Vec2Signal;
}
