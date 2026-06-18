import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  batch,
  computed,
  setScheduler,
  signal,
  synchronousScheduler,
  type Scheduler,
} from '../src/index.js';

afterEach(() => {
  // Always restore the eager default so one test cannot leak a scheduler.
  setScheduler();
});

describe('batch() coalesces notifications (DESIGN.md §6.1)', () => {
  it('N writes inside batch() => exactly one subscriber notification', () => {
    const s = signal(0);
    const cb = vi.fn();
    s.subscribe(cb);
    batch(() => {
      for (let i = 1; i <= 50; i++) s.set(i);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(s()).toBe(50);
  });

  it('coalesces across multiple distinct signals into one pass per subscriber', () => {
    const a = signal(0);
    const b = signal(0);
    const cbA = vi.fn();
    const cbB = vi.fn();
    a.subscribe(cbA);
    b.subscribe(cbB);
    batch(() => {
      a.set(1);
      a.set(2);
      b.set(1);
    });
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).toHaveBeenCalledTimes(1);
  });

  it('a downstream computed subscriber fires once for many upstream writes', () => {
    const s = signal(0);
    const derived = computed(() => s() * 2);
    const cb = vi.fn();
    derived.subscribe(cb);
    derived(); // clean
    batch(() => {
      s.set(1);
      s.set(2);
      s.set(3);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(derived()).toBe(6);
  });

  it('nested batches flush once at the outermost exit', () => {
    const s = signal(0);
    const cb = vi.fn();
    s.subscribe(cb);
    batch(() => {
      s.set(1);
      batch(() => {
        s.set(2);
        s.set(3);
      });
      expect(cb).not.toHaveBeenCalled(); // still inside the outer batch
      s.set(4);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(s()).toBe(4);
  });

  it('returns the value fn returns', () => {
    expect(batch(() => 42)).toBe(42);
  });

  it('flushes even when fn throws (finally path)', () => {
    const s = signal(0);
    const cb = vi.fn();
    s.subscribe(cb);
    expect(() =>
      batch(() => {
        s.set(1);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing subscriber — others coalesced into the same flush still fire', () => {
    const a = signal(0);
    const b = signal(0);
    const cbA = vi.fn(() => {
      throw new Error('boom');
    });
    const cbB = vi.fn();
    a.subscribe(cbA);
    b.subscribe(cbB);
    // a's subscriber throwing must NOT starve b's subscriber (both coalesced)
    expect(() => batch(() => { a.set(1); b.set(1); })).toThrow('boom');
    expect(cbB).toHaveBeenCalledTimes(1);
    // and a later write to b still notifies normally
    b.set(2);
    expect(cbB).toHaveBeenCalledTimes(2);
  });
});

describe('reads stay synchronous inside batch (determinism gate)', () => {
  it('peek() after set() inside batch returns the new value immediately', () => {
    const s = signal(1);
    batch(() => {
      s.set(2);
      expect(s.peek()).toBe(2);
      s.set(3);
      expect(s.peek()).toBe(3);
    });
    expect(s.peek()).toBe(3);
  });

  it('computed staleness cascade stays synchronous inside batch', () => {
    const s = signal(1);
    const derived = computed(() => s() * 10);
    expect(derived()).toBe(10);
    batch(() => {
      s.set(5);
      expect(derived()).toBe(50); // recompute is synchronous, not deferred
      s.set(7);
      expect(derived.peek()).toBe(70);
    });
    expect(derived()).toBe(70);
  });

  it('the notification is deferred but the value is not', () => {
    const s = signal(0);
    let seenInsideCb = -1;
    s.subscribe(() => {
      seenInsideCb = s.peek();
    });
    batch(() => {
      s.set(1);
      s.set(2);
      s.set(3);
    });
    expect(seenInsideCb).toBe(3); // subscriber sees the final coalesced value
  });
});

describe('write-during-flush drains bounded', () => {
  it('a subscriber that writes another signal is drained in the same flush', () => {
    const a = signal(0);
    const b = signal(0);
    const log: number[] = [];
    // a's subscriber writes b; b's subscriber records — both settle in one flush.
    a.subscribe(() => {
      if (a.peek() < 3) b.set(b.peek() + 1);
    });
    b.subscribe(() => log.push(b.peek()));
    a.set(1);
    expect(b.peek()).toBe(1);
    expect(log).toEqual([1]);
  });

  it('a self-feeding subscriber settles and does not loop unbounded', () => {
    const s = signal(0);
    let passes = 0;
    s.subscribe(() => {
      passes++;
      if (s.peek() < 5) s.set(s.peek() + 1); // re-arms until 5
    });
    s.set(1);
    expect(s.peek()).toBe(5);
    expect(passes).toBeLessThan(20); // bounded, no explosion
  });

  it('throws if a subscriber writes a signal it observes unbounded', () => {
    const s = signal(0);
    s.subscribe(() => {
      s.set(s.peek() + 1); // never stops re-arming
    });
    expect(() => s.set(1)).toThrow(/did not settle/);
  });
});

describe('setScheduler installs a deferred flush', () => {
  it('an injected scheduler flushes once for many writes', () => {
    let pendingFlush: (() => void) | null = null;
    const deferred: Scheduler = (flush) => {
      pendingFlush = flush;
    };
    setScheduler(deferred);

    const s = signal(0);
    const cb = vi.fn();
    s.subscribe(cb);

    s.set(1);
    s.set(2);
    s.set(3);
    // Nothing flushed yet: the scheduler is holding the flush.
    expect(cb).not.toHaveBeenCalled();
    expect(s.peek()).toBe(3); // but reads are still synchronous

    expect(pendingFlush).not.toBeNull();
    pendingFlush!();
    expect(cb).toHaveBeenCalledTimes(1); // one coalesced notification
  });

  it('setScheduler returns the previous scheduler and can be restored', () => {
    const noop: Scheduler = () => {};
    const prev = setScheduler(noop);
    expect(prev).toBe(synchronousScheduler);
    const back = setScheduler();
    expect(back).toBe(noop);
  });

  it('a microtask-style scheduler defers to the queue but coalesces', async () => {
    const queue: (() => void)[] = [];
    setScheduler((flush) => queue.push(flush));

    const s = signal(0);
    const cb = vi.fn();
    s.subscribe(cb);

    s.set(1);
    s.set(2);
    expect(cb).not.toHaveBeenCalled();

    // drain the "microtask" queue
    expect(queue.length).toBe(1); // one flush requested for the burst
    queue.shift()!();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('restoring the synchronous default re-arms swallowed work and makes writes eager', () => {
    setScheduler(() => {}); // swallow flushes
    const s = signal(0);
    const cb = vi.fn();
    s.subscribe(cb);
    s.set(1);
    expect(cb).not.toHaveBeenCalled();

    // Restoring the default takes ownership of the swallowed flush and runs it.
    setScheduler();
    expect(cb).toHaveBeenCalledTimes(1);

    // and subsequent writes are eager again.
    s.set(2);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe('default (no batch, no scheduler) preserves eager timing', () => {
  it('a top-level write notifies synchronously and inline', () => {
    const s = signal(0);
    const order: string[] = [];
    s.subscribe(() => order.push('notified'));
    order.push('before');
    s.set(1);
    order.push('after');
    expect(order).toEqual(['before', 'notified', 'after']);
  });
});
