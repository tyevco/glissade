/**
 * Render-mode determinism guards (DESIGN.md §5.5). During export the banned
 * globals are patched — for the synchronous scope of a single evaluate() call —
 * to throw (CLI/CI) or warn-once-then-delegate (browser/dev), then restored.
 * Scoped to evaluate() re-entry, never installed globally, so timers and clocks
 * outside the read phase are untouched. This backstops the static eslint rules
 * (`@glissade/eslint-plugin`) for the cases lint can't see (closures, indirect
 * calls, third-party code reachable from a node's emit()).
 */

import { emitDevWarning } from '@glissade/core';

export class DeterminismViolationError extends Error {
  constructor(api: string) {
    super(
      `'${api}' was called inside evaluate() — scene code must be a pure function of time (§5.5). ` +
        'Read ctx.time/frame, use the seeded random(seed) from @glissade/core, and resolve assets before rendering.',
    );
    this.name = 'DeterminismViolationError';
  }
}

export type GuardMode = 'throw' | 'warn' | 'off';

interface Slot {
  target: Record<string, unknown>;
  key: string;
  label: string;
}

function bannedSlots(): Slot[] {
  const g = globalThis as unknown as Record<string, unknown>;
  const slots: Slot[] = [
    { target: Math as unknown as Record<string, unknown>, key: 'random', label: 'Math.random' },
    { target: Date as unknown as Record<string, unknown>, key: 'now', label: 'Date.now' },
    { target: g, key: 'setTimeout', label: 'setTimeout' },
    { target: g, key: 'setInterval', label: 'setInterval' },
  ];
  if (typeof performance !== 'undefined') {
    slots.push({ target: performance as unknown as Record<string, unknown>, key: 'now', label: 'performance.now' });
  }
  if (typeof g['requestAnimationFrame'] === 'function') {
    slots.push({ target: g, key: 'requestAnimationFrame', label: 'requestAnimationFrame' });
  }
  return slots;
}

/**
 * Run `fn` (a single synchronous evaluate()) with the banned globals guarded.
 * `throw` rejects any call (CLI/CI); `warn` warns once per API then delegates
 * to the real implementation (browser/dev); `off` is a no-op. Globals are
 * always restored, even if `fn` throws. `fn` MUST be synchronous — patching is
 * only valid for the sync read phase, never across an await.
 */
export function withDeterminismGuards<T>(mode: GuardMode, fn: () => T): T {
  if (mode === 'off') return fn();
  const slots = bannedSlots();
  const saved = slots.map((s) => s.target[s.key]);
  const warned = new Set<string>();
  slots.forEach((s, i) => {
    s.target[s.key] = (...args: unknown[]): unknown => {
      if (mode === 'throw') throw new DeterminismViolationError(s.label);
      if (!warned.has(s.label)) {
        warned.add(s.label);
        emitDevWarning(`${s.label} called inside evaluate() — nondeterministic, not reproducible on export (§5.5)`);
      }
      return (saved[i] as (...a: unknown[]) => unknown).apply(s.target, args);
    };
  });
  try {
    return fn();
  } finally {
    slots.forEach((s, i) => {
      s.target[s.key] = saved[i];
    });
  }
}
