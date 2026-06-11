import { describe, expect, it, vi } from 'vitest';
import {
  beginReadPhase,
  computed,
  endReadPhase,
  signal,
  untracked,
  vec2Signal,
  CircularDependencyError,
  WriteDuringEvaluationError,
} from '../src/index.js';

describe('signal basics', () => {
  it('reads, writes, peeks', () => {
    const s = signal(1);
    expect(s()).toBe(1);
    s.set(2);
    expect(s.peek()).toBe(2);
  });

  it('computed derives and updates', () => {
    const radius = signal(50);
    const area = computed(() => Math.PI * radius() ** 2);
    expect(area()).toBeCloseTo(Math.PI * 2500);
    radius.set(60);
    expect(area()).toBeCloseTo(Math.PI * 3600);
  });
});

describe('laziness and caching', () => {
  it('does not compute until read', () => {
    const fn = vi.fn(() => 42);
    computed(fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it('caches until a dependency invalidates', () => {
    const s = signal(1);
    const fn = vi.fn(() => s() * 2);
    const c = computed(fn);
    c();
    c();
    c();
    expect(fn).toHaveBeenCalledTimes(1);
    s.set(2);
    expect(fn).toHaveBeenCalledTimes(1); // write alone does not recompute
    c();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('equal-value writes do not invalidate', () => {
    const s = signal(5);
    const fn = vi.fn(() => s() + 1);
    const c = computed(fn);
    c();
    s.set(5);
    c();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('equal-value recomputes do not propagate (dirtiness stops at the node)', () => {
    const s = signal(1);
    const parity = computed(() => s() % 2);
    const fn = vi.fn(() => (parity() === 0 ? 'even' : 'odd'));
    const label = computed(fn);
    expect(label()).toBe('odd');
    s.set(3); // parity recomputes to the same value
    expect(label()).toBe('odd');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('diamond dependencies compute each node once per change', () => {
    const s = signal(1);
    const left = vi.fn(() => s() + 1);
    const right = vi.fn(() => s() * 10);
    const l = computed(left);
    const r = computed(right);
    const joinFn = vi.fn(() => l() + r());
    const join = computed(joinFn);
    expect(join()).toBe(12);
    s.set(2);
    expect(join()).toBe(23);
    expect(left).toHaveBeenCalledTimes(2);
    expect(right).toHaveBeenCalledTimes(2);
    expect(joinFn).toHaveBeenCalledTimes(2);
  });

  it('re-tracks dynamic dependencies', () => {
    const flag = signal(true);
    const a = signal('a');
    const b = signal('b');
    const fn = vi.fn(() => (flag() ? a() : b()));
    const c = computed(fn);
    expect(c()).toBe('a');
    b.set('b2'); // currently untracked branch
    c();
    expect(fn).toHaveBeenCalledTimes(1);
    flag.set(false);
    expect(c()).toBe('b2');
    a.set('a2'); // now untracked
    c();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('subscribe', () => {
  it('fires on invalidation, not on read', () => {
    const s = signal(1);
    const c = computed(() => s() * 2);
    const cb = vi.fn();
    c.subscribe(cb);
    c();
    expect(cb).not.toHaveBeenCalled();
    c(); // ensure clean state so invalidation propagates
    s.set(2);
    expect(cb).toHaveBeenCalledTimes(1);
    c();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes', () => {
    const s = signal(1);
    const cb = vi.fn();
    const off = s.subscribe(cb);
    s.set(2);
    off();
    s.set(3);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('phase guard (§2.1)', () => {
  it('set() during the read phase throws', () => {
    const s = signal(1);
    beginReadPhase();
    try {
      expect(() => s.set(2)).toThrow(WriteDuringEvaluationError);
    } finally {
      endReadPhase();
    }
    s.set(2); // fine outside
    expect(s()).toBe(2);
  });

  it('forceSet (sanctioned entry write) is exempt', () => {
    const s = signal(1);
    beginReadPhase();
    try {
      expect(() => s.forceSet(2)).not.toThrow();
    } finally {
      endReadPhase();
    }
    expect(s()).toBe(2);
  });
});

describe('binding (source rewiring, §2.4)', () => {
  it('bindSource drives the signal from a computation', () => {
    const t = signal(0);
    const prop = signal(99);
    prop.bindSource(() => t() * 2);
    expect(prop()).toBe(0);
    t.set(5);
    expect(prop()).toBe(10);
    expect(prop.isBound).toBe(true);
  });

  it('unbindSource freezes at the last value', () => {
    const t = signal(3);
    const prop = signal(0);
    prop.bindSource(() => t() * 2);
    expect(prop()).toBe(6);
    prop.unbindSource();
    t.set(100);
    expect(prop()).toBe(6);
    expect(prop.isBound).toBe(false);
  });

  it('set() on a bound signal detaches the binding', () => {
    const t = signal(1);
    const prop = signal(0);
    prop.bindSource(() => t());
    expect(prop()).toBe(1);
    prop.set(42);
    expect(prop()).toBe(42);
    t.set(7);
    expect(prop()).toBe(42);
  });
});

describe('misc', () => {
  it('untracked reads do not register dependencies', () => {
    const s = signal(1);
    const fn = vi.fn(() => untracked(() => s()));
    const c = computed(fn);
    expect(c()).toBe(1);
    s.set(2);
    c();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('detects circular dependencies', () => {
    const a = computed((): number => b() + 1);
    const b: () => number = computed((): number => a() + 1);
    expect(() => a()).toThrow(CircularDependencyError);
  });
});

describe('vec2Signal (§2.1 compound)', () => {
  it('reads compound and component levels', () => {
    const p = vec2Signal({ x: 1, y: 2 });
    expect(p()).toEqual([1, 2]);
    expect(p.x()).toBe(1);
    expect(p.y()).toBe(2);
  });

  it('compound set updates components', () => {
    const p = vec2Signal([0, 0]);
    p.set([3, 4]);
    expect(p.x()).toBe(3);
    expect(p()).toEqual([3, 4]);
  });

  it('compound binding drives both lanes; component binding overrides its lane (§2.2)', () => {
    const t = signal(0);
    const p = vec2Signal([0, 0]);
    p.bindSource(() => [t(), t() * 2]);
    t.set(10);
    expect(p()).toEqual([10, 20]);
    p.x.bindSource(() => 999); // sub-signal track takes precedence for its component
    expect(p()).toEqual([999, 20]);
  });
});

describe('reentrant subscribers (useSyncExternalStore pattern)', () => {
  it('a subscriber that synchronously re-reads during invalidation terminates', () => {
    const t = signal(0);
    const derived = computed(() => t() * 2);
    let reads = 0;
    derived(); // establish dependency edges
    derived.subscribe(() => {
      reads++;
      derived(); // synchronous re-read mid-cascade, like React's store check
    });
    t.set(1);
    t.set(2);
    expect(derived()).toBe(4);
    expect(reads).toBeLessThan(10); // explosion would loop unbounded
  });
});
