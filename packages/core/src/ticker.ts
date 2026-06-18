/**
 * Per-tick subscriber-notification coalescer (DESIGN.md §6.1).
 *
 * Signals stay pull-based and synchronous on the READ path: peek/get/evaluate
 * return the new value immediately after set() — the DIRTY/CHECK staleness
 * cascade is untouched (§2.1). This module times only *subscriber notification*:
 * a write enqueues each affected subscriber, and a scheduler decides when the
 * queue is flushed.
 *
 * The default scheduler is **synchronous**: it flushes at the end of the
 * outermost write (or batch), so a single set() outside any batch notifies its
 * subscribers inline — byte-for-byte the timing the framework had before this
 * module existed. `batch(fn)` coalesces every write inside `fn` into one flush;
 * `setScheduler` lets a consumer defer the flush to a microtask / rAF so that a
 * scrub frame dirtying N signals produces one observer pass (Theatre's
 * `dataverse` Ticker pattern).
 *
 * Determinism: nothing here is reachable from evaluate(). No Date.now /
 * performance.now / Math.random / setTimeout lives on this path; the default
 * scheduler is pure and synchronous, and a write *during* a flush is drained by
 * a bounded loop rather than recursion.
 */

/**
 * A scheduler receives the coalesced `flush` and decides when to run it. It must
 * call `flush` exactly once per request (calling it synchronously reproduces the
 * default, eager behavior). A microtask/rAF scheduler defers the call.
 */
export type Scheduler = (flush: () => void) => void;

/** The default scheduler: flush synchronously, preserving pre-ticker timing. */
const synchronousScheduler: Scheduler = (flush) => flush();

let scheduler: Scheduler = synchronousScheduler;

/** Pending subscriber callbacks for the current tick (deduped, insertion-ordered). */
const pending = new Set<() => void>();

/**
 * Depth of active `batch()` calls *plus* in-flight top-level writes; >0
 * suppresses flushing so a write's whole staleness cascade completes before any
 * subscriber runs, and `batch()` coalesces across writes.
 */
let batchDepth = 0;

/** True while a flush is in progress, so writes mid-flush enqueue, not re-flush. */
let flushing = false;

/** True once a flush has been requested from the scheduler but not yet run. */
let flushScheduled = false;

/** Guard against an unbounded write-during-flush cascade. */
const MAX_FLUSH_PASSES = 1000;

/**
 * Install a notification scheduler. Pass the synchronous default back (or call
 * with no argument) to restore eager flushing. Returns the previous scheduler.
 */
export function setScheduler(next?: Scheduler): Scheduler {
  const prev = scheduler;
  scheduler = next ?? synchronousScheduler;
  // A previously-installed scheduler may have been handed a flush it never ran
  // (it swallowed it, or is still holding it). Re-arm so the new scheduler owns
  // any pending work rather than inheriting a stuck request from the old one.
  if (flushScheduled && !flushing) {
    flushScheduled = false;
    if (pending.size > 0) requestFlush();
  }
  return prev;
}

/** The synchronous default scheduler, exported so callers can restore it. */
export { synchronousScheduler };

/**
 * Enqueue a subscriber notification. Called by the signal layer in place of
 * invoking the callback directly. Honors the active batch and scheduler.
 */
export function enqueueNotification(cb: () => void): void {
  pending.add(cb);
  requestFlush();
}

function requestFlush(): void {
  // Inside a batch, or already mid-flush, the existing drain loop / batch exit
  // will pick this up — do not ask the scheduler again.
  if (batchDepth > 0 || flushing || flushScheduled) return;
  flushScheduled = true;
  scheduler(runFlush);
}

function runFlush(): void {
  flushScheduled = false;
  if (flushing) return; // re-entrant scheduler call; the active loop owns the queue
  drain();
}

/**
 * Drain the pending queue. A subscriber may write synchronously (e.g.
 * useSyncExternalStore re-reads and a derived store updates), enqueuing more
 * callbacks; the bounded loop catches those in subsequent passes within the
 * same flush so each tick settles in one synchronous burst.
 */
function drain(): void {
  if (flushing) return;
  flushing = true;
  try {
    let passes = 0;
    while (pending.size > 0) {
      if (++passes > MAX_FLUSH_PASSES) {
        pending.clear();
        throw new Error(
          'signal notification flush did not settle within ' +
            MAX_FLUSH_PASSES +
            ' passes: a subscriber is writing to a signal it observes (DESIGN.md §6.1).',
        );
      }
      const batchCbs = [...pending];
      pending.clear();
      for (const cb of batchCbs) cb();
    }
  } finally {
    flushing = false;
  }
}

/**
 * Bracket a single top-level write (the signal layer calls this around each
 * set/forceSet/bindSource cascade). While open, enqueued notifications are
 * held; on the outermost close — when no `batch()` and no other write is in
 * flight — the queue is flushed exactly as before this module existed.
 *
 * Nesting these (a write whose flush triggers another write) or wrapping them in
 * `batch()` defers the flush to the outermost boundary, the coalescing the
 * ticker exists to provide.
 */
export function beginNotify(): void {
  batchDepth++;
}

export function endNotify(): void {
  batchDepth--;
  if (batchDepth === 0 && pending.size > 0) requestFlush();
}

/**
 * Coalesce every signal write inside `fn` into a single subscriber-notification
 * pass. Reads inside `fn` stay synchronous and see each write immediately; only
 * the *notification* is deferred to the end. Nested batches flush once, at the
 * outermost exit. Returns whatever `fn` returns.
 */
export function batch<T>(fn: () => T): T {
  beginNotify();
  try {
    return fn();
  } finally {
    endNotify();
  }
}
