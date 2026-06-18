---
'@glissade/core': minor
---

Add the §6.1 per-tick subscriber-notification coalescer (CULV).

New `@glissade/core` exports: `batch(fn)`, `setScheduler(scheduler)`,
`synchronousScheduler`, and the `Scheduler` type. `batch()` coalesces every
signal write inside `fn` into a single subscriber notification; `setScheduler()`
lets a consumer defer that notification to a microtask/rAF flush (Theatre's
`dataverse` Ticker pattern) so a scrub frame that dirties N signals produces one
observer pass.

The scheduler times subscriber **notification only**. Reads stay synchronous:
`peek()`/`get()`/`evaluate()` return the new value immediately after `set()`,
the DIRTY/CHECK staleness cascade is untouched, and a write during a flush is
drained by a bounded loop. The default scheduler is synchronous and flushes at
the end of the outermost write, preserving the prior notification timing
byte-for-byte — existing behavior (and all Skia goldens) is unchanged. The
existing rAF coalescers in player/element are intentionally left as-is this
cycle.
