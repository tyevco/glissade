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
// TYPE-ONLY (erased at build — zero bytes, never drags the diagnostics diff
// module onto the base scene graph): the located command-level delta shape.
import type { CommandDelta } from './displayDiff.js';

/**
 * The node-level localization a violation carries when a dev locator ran on the
 * throw branch: the first node whose isolated emit disagrees, plus (when a leaf
 * localized it) the first command-level delta of that emit.
 */
export interface ViolationDetail {
  readonly node?: string | undefined;
  readonly detail?: CommandDelta | undefined;
  /**
   * Why the locator could NOT name a node, when it ran but was defeated (e.g.
   * `createScene()` returned shared node instances, so the twice-eval probe
   * memoized an impure signal and couldn't localize). Present INSTEAD of `node`
   * — it makes the throw say out loud why click-to-line didn't fire, and how to
   * fix it, rather than silently degrading to a bare violation.
   */
  readonly reason?: string | undefined;
  /**
   * The message fragment appended to the thrown error, PREBUILT by the locator
   * (off the SACRED base embed) from `node`/`reason` — so the base
   * `DeterminismViolationError` constructor carries no per-branch message
   * literals, only the interpolation. `undefined` ⇒ nothing to append.
   */
  readonly where?: string | undefined;
}

/**
 * DEV-only callback invoked ONLY when a violation is about to be thrown, to name
 * the first node that disagrees. It runs AFTER the guarded globals are restored,
 * so it may freely re-evaluate the scene (its cold re-eval isn't re-trapped).
 * Returns `undefined` when it can't localize (then the bare throw stands). Wired
 * by callers that hold a scene factory (the CLI render path) via
 * `locateViolation(createScene, doc, t)`; never installed on the render hot path.
 */
export type ViolationLocator = () => ViolationDetail | undefined;

export class DeterminismViolationError extends Error {
  /** The banned API whose call tripped the guard (e.g. `'Math.random'`). */
  readonly api: string;
  /**
   * id of the FIRST node whose isolated emit disagrees across a cold re-eval —
   * the click-to-line culprit (§5.5). Set only when a dev locator ran on the
   * throw branch (the guarded CLI render path); `undefined` for a bare throw
   * with no locator wired.
   */
  readonly node?: string | undefined;
  /**
   * The first command-level delta (op + field changes) of the divergent node's
   * isolated emit, when a specific leaf localized it. A locator payload — never
   * produced on the render hot path.
   */
  readonly detail?: CommandDelta | undefined;
  /**
   * Why localization was unavailable, when the locator ran but couldn't name a
   * node (set INSTEAD of `node` — e.g. shared-instance builds defeated the cold
   * probe). `undefined` for a bare throw or a successfully-localized one.
   */
  readonly reason?: string | undefined;
  constructor(api: string, located?: ViolationDetail | undefined) {
    // The message fragment is PREBUILT off-base by the locator (locateViolation)
    // and passed as `where`, so the SACRED base embed carries no per-branch
    // message literals here — just the interpolation. A bare trap-throw passes
    // no `located`, so a browser embed's DVE message stays minimal.
    const where = located?.where ?? '';
    super(
      `'${api}' was called inside evaluate() — scene code must be a pure function of time (§5.5).${where} ` +
        'Use the seeded random(seed) from @glissade/core; resolve assets before rendering.',
    );
    this.name = 'DeterminismViolationError';
    this.api = api;
    // exactOptionalPropertyTypes: assign only when present (never write `undefined`).
    if (located?.node !== undefined) this.node = located.node;
    if (located?.detail !== undefined) this.detail = located.detail;
    if (located?.reason !== undefined) this.reason = located.reason;
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
 *
 * `locate` (DEV-only, `throw` mode) is invoked ONLY on the violation branch,
 * AFTER globals are restored, to enrich the thrown error with the first node
 * that disagrees (see {@link ViolationLocator}). It NEVER runs on the happy path
 * — a clean evaluate pays nothing for it. A locator failure is swallowed so it
 * can never mask the original violation.
 */
export function withDeterminismGuards<T>(mode: GuardMode, fn: () => T, locate?: ViolationLocator): T {
  if (mode === 'off') return fn();
  const slots = bannedSlots();
  const saved = slots.map((s) => s.target[s.key]);
  const restore = (): void => {
    slots.forEach((s, i) => {
      s.target[s.key] = saved[i];
    });
  };
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
  let out: T;
  try {
    out = fn();
  } catch (err) {
    // Restore BEFORE the locator runs so its cold re-eval isn't re-trapped by
    // the still-patched globals. Always restores exactly once before any throw
    // leaves this function (replacing the old try/finally).
    restore();
    if (
      mode === 'throw' &&
      locate !== undefined &&
      err instanceof DeterminismViolationError &&
      err.node === undefined &&
      err.reason === undefined
    ) {
      const located = safeLocate(locate);
      // Re-throw enriched whether the locator NAMED the node or only explained
      // (reason) why it couldn't — both beat a silent bare throw.
      if (located !== undefined && (located.node !== undefined || located.reason !== undefined)) {
        throw new DeterminismViolationError(err.api, located);
      }
    }
    throw err;
  }
  restore();
  return out;
}

/** Run the locator, swallowing any failure — it must never mask the violation. */
function safeLocate(locate: ViolationLocator): ViolationDetail | undefined {
  try {
    return locate();
  } catch {
    return undefined;
  }
}
