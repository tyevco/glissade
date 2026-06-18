/**
 * Pull-based reactive signals: lazy, cached, dependency-tracked (DESIGN.md §2.1).
 *
 * Staleness uses the two-flag scheme: a write marks direct dependents DIRTY and
 * transitive dependents CHECK. A CHECK node re-validates dependency versions on
 * read and only recomputes if one actually changed; a recompute that produces an
 * equal value keeps its version, so dirtiness stops propagating at that node.
 *
 * Subscriber NOTIFICATION (only) is routed through the ticker (`./ticker.ts`,
 * DESIGN.md §6.1): a write enqueues affected subscribers and the active
 * scheduler decides when to flush. The default scheduler is synchronous and
 * flushes at the end of the outermost write, reproducing the pre-ticker timing
 * byte-for-byte. The read path (get/peek/updateIfNecessary) is untouched and
 * stays fully synchronous.
 */

import { enqueueNotification, beginNotify, endNotify } from './ticker.js';

export type Equals<T> = (a: T, b: T) => boolean;

const enum State {
  Clean = 0,
  Check = 1,
  Dirty = 2,
}

let activeConsumer: SignalNode<unknown> | null = null;
let readPhaseDepth = 0;

export class WriteDuringEvaluationError extends Error {
  constructor() {
    super(
      'signal.set() during evaluation: the read phase is pure (DESIGN.md §2.1). ' +
        'Drivers write the playhead before evaluation begins; stateful animation belongs in bake().',
    );
    this.name = 'WriteDuringEvaluationError';
  }
}

export class CircularDependencyError extends Error {
  constructor() {
    super('circular signal dependency detected');
    this.name = 'CircularDependencyError';
  }
}

/** Begin the pure read phase; any signal write until {@link endReadPhase} throws. */
export function beginReadPhase(): void {
  readPhaseDepth++;
}

export function endReadPhase(): void {
  if (readPhaseDepth === 0) throw new Error('endReadPhase() without matching beginReadPhase()');
  readPhaseDepth--;
}

export function inReadPhase(): boolean {
  return readPhaseDepth > 0;
}

class SignalNode<T> {
  private value: T | undefined;
  /** Compute function; null for plain writable sources. Binding installs one. */
  private fn: (() => T) | null;
  private readonly equals: Equals<T>;
  version = 0;
  private state: State;
  private computing = false;

  private deps: SignalNode<unknown>[] = [];
  private depVersions: number[] = [];
  private readonly dependents = new Set<SignalNode<unknown>>();
  private readonly subscribers = new Set<() => void>();

  constructor(init: { value?: T; fn?: (() => T) | null; equals?: Equals<T> | undefined }) {
    this.fn = init.fn ?? null;
    this.value = init.value;
    this.equals = init.equals ?? Object.is;
    this.state = this.fn ? State.Dirty : State.Clean;
  }

  get(): T {
    if (activeConsumer) activeConsumer.addDep(this as SignalNode<unknown>);
    this.updateIfNecessary();
    return this.value as T;
  }

  peek(): T {
    this.updateIfNecessary();
    return this.value as T;
  }

  set(next: T): void {
    if (readPhaseDepth > 0) throw new WriteDuringEvaluationError();
    beginNotify();
    try {
      if (this.fn) this.detachFn();
      this.writeValue(next);
    } finally {
      endNotify();
    }
  }

  /**
   * Sanctioned entry write (the playhead at evaluate() entry, DESIGN.md §2.5).
   * Identical to set() but exempt from the phase guard; not part of the public
   * signal surface.
   */
  forceSet(next: T): void {
    beginNotify();
    try {
      if (this.fn) this.detachFn();
      this.writeValue(next);
    } finally {
      endNotify();
    }
  }

  /** Rewire this signal's source to a computation (timeline binding, §2.4). */
  bindSource(fn: () => T): void {
    if (readPhaseDepth > 0) throw new WriteDuringEvaluationError();
    beginNotify();
    try {
      this.fn = fn;
      this.state = State.Dirty;
      this.invalidateDependents(State.Dirty);
    } finally {
      endNotify();
    }
  }

  /** Remove a bound source, freezing the signal at its last value. */
  unbindSource(): void {
    if (readPhaseDepth > 0) throw new WriteDuringEvaluationError();
    if (!this.fn) return;
    this.updateIfNecessary();
    this.detachFn();
  }

  get isBound(): boolean {
    return this.fn !== null;
  }

  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  addDep(dep: SignalNode<unknown>): void {
    // De-dupe the common consecutive-read case; the rebuild on recompute
    // handles the rest.
    if (this.deps[this.deps.length - 1] !== dep) {
      this.deps.push(dep);
      this.depVersions.push(-1); // filled in after recompute completes
      dep.dependents.add(this as SignalNode<unknown>);
    }
  }

  private detachFn(): void {
    this.fn = null;
    this.clearDeps();
    this.state = State.Clean;
  }

  private writeValue(next: T): void {
    if (this.version > 0 || this.value !== undefined) {
      if (this.equals(this.value as T, next)) return;
    }
    this.value = next;
    this.version++;
    this.invalidateDependents(State.Dirty);
  }

  private invalidateDependents(level: State): void {
    // snapshot: a subscriber may synchronously re-read (useSyncExternalStore
    // does), recomputing dependents and mutating these sets mid-cascade
    for (const d of [...this.dependents]) d.markStale(level);
    if (this.subscribers.size > 0) {
      // Route through the ticker: enqueue now, flush at the write boundary
      // (default scheduler => synchronously, post-cascade — DESIGN.md §6.1).
      for (const cb of [...this.subscribers]) enqueueNotification(cb);
    }
  }

  markStale(level: State): void {
    if (this.state >= level) return;
    const wasClean = this.state === State.Clean;
    this.state = level;
    if (wasClean) this.invalidateDependents(State.Check);
  }

  private updateIfNecessary(): void {
    if (this.fn === null || this.state === State.Clean) return;
    if (this.computing) throw new CircularDependencyError();
    if (this.state === State.Check) {
      this.state = State.Clean; // unless a dep proves otherwise
      for (let i = 0; i < this.deps.length; i++) {
        const dep = this.deps[i]!;
        dep.updateIfNecessary();
        if (dep.version !== this.depVersions[i]) {
          this.state = State.Dirty;
          break;
        }
      }
    }
    if (this.state === State.Dirty) this.recompute();
    this.state = State.Clean;
  }

  private recompute(): void {
    this.clearDeps();
    const prevConsumer = activeConsumer;
    activeConsumer = this as SignalNode<unknown>;
    this.computing = true;
    let next: T;
    try {
      next = this.fn!();
    } finally {
      this.computing = false;
      activeConsumer = prevConsumer;
    }
    for (let i = 0; i < this.deps.length; i++) {
      this.depVersions[i] = this.deps[i]!.version;
    }
    const hadValue = this.version > 0 || this.value !== undefined;
    if (!hadValue || !this.equals(this.value as T, next)) {
      this.value = next;
      this.version++;
    }
  }

  private clearDeps(): void {
    for (const dep of this.deps) dep.dependents.delete(this as SignalNode<unknown>);
    this.deps = [];
    this.depVersions = [];
  }
}

export interface ReadonlySignal<T> {
  (): T;
  peek(): T;
  subscribe(cb: () => void): () => void;
}

export interface Signal<T> extends ReadonlySignal<T> {
  set(value: T): void;
}

/** Internal surface used by the evaluation driver and timeline binding. */
export interface BindableSignal<T> extends Signal<T> {
  bindSource(fn: () => T): void;
  unbindSource(): void;
  readonly isBound: boolean;
  /** Sanctioned entry write — exempt from the read-phase guard (§2.5). */
  forceSet(value: T): void;
}

export interface SignalOptions<T> {
  equals?: Equals<T>;
}

function makeCallable<T, S>(node: SignalNode<T>, extra: (sig: Record<string, unknown>) => void): S {
  const sig = (() => node.get()) as unknown as Record<string, unknown>;
  sig['peek'] = () => node.peek();
  sig['subscribe'] = (cb: () => void) => node.subscribe(cb);
  extra(sig);
  return sig as S;
}

export function signal<T>(initial: T, options?: SignalOptions<T>): BindableSignal<T> {
  const node = new SignalNode<T>({ value: initial, equals: options?.equals });
  return makeCallable<T, BindableSignal<T>>(node, (sig) => {
    sig['set'] = (v: T) => node.set(v);
    sig['forceSet'] = (v: T) => node.forceSet(v);
    sig['bindSource'] = (fn: () => T) => node.bindSource(fn);
    sig['unbindSource'] = () => node.unbindSource();
    Object.defineProperty(sig, 'isBound', { get: () => node.isBound });
  });
}

export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  const node = new SignalNode<T>({ fn, equals: options?.equals });
  return makeCallable<T, ReadonlySignal<T>>(node, () => {});
}

/** Run `fn` without registering dependencies on the active consumer. */
export function untracked<T>(fn: () => T): T {
  const prev = activeConsumer;
  activeConsumer = null;
  try {
    return fn();
  } finally {
    activeConsumer = prev;
  }
}
