/**
 * createMachine (§A.5): a Driver-layer peer of the Player. Mutable state is
 * exactly four things — current state + entry anchor, the in-flight transition
 * record, input values + the trigger queue, per-state local playheads — all
 * written only in the sanctioned pre-read-phase step. Within any frame every
 * property signal is still a pure pull; clocks are anchored, never accumulated.
 */

import {
  compileTimeline,
  computed,
  getValueType,
  inReadPhase,
  resolveEase,
  sampleTrack,
  signal,
  UnboundTargetError,
  WriteDuringEvaluationError,
  emitDevWarning,
  type BindableSignal,
  type BindTarget,
  type CompiledTimeline,
  type HandoffKind,
  type ReadonlySignal,
  type Signal,
  type Track,
  type Timeline,
  type ValueType,
  velocityAt,
} from '@glissade/core';
import {
  hashMachine,
  MachineValidationError,
  validateMachineDoc,
  type StateId,
  type StateMachineDoc,
  type TransitionDoc,
} from './doc.js';
import { DEFAULT_HANDOFF_SPRING, solveOffset, type MachineSampler } from './handoff.js';

export class UnknownInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownInputError';
  }
}

export interface MachineOptions {
  /** Target resolution — the bindTimeline seam (§2.2: unbound targets are hard errors). */
  resolve: (target: string) => BindTarget | undefined;
  /** Resolved timeline documents for `{ ref }` states, keyed by asset id. */
  timelines?: Record<string, Timeline>;
  /** Applied before the first step — conditional entry settles via normal transitions (§A.1). */
  initialInputs?: Record<string, boolean | number>;
}

export interface Machine {
  readonly id: string;
  /** The validated source document — recordTrace/bakeTrace read inputs and identity from it. */
  readonly doc: StateMachineDoc;
  /** Trace identity (§C.5): doc + referenced timeline documents. */
  readonly hash: string;
  /** Observable, NOT writable (§A.2). */
  readonly current: ReadonlySignal<StateId>;
  /** Machine-clock signal; every composite transition binding depends on it. */
  readonly clock: ReadonlySignal<number>;
  /** Union of every state's track targets — the §A.1 disjointness set. */
  readonly targets: ReadonlySet<string>;
  /** True once step() has run — bakeTrace requires a fresh machine (§A.6). */
  readonly hasStepped: boolean;
  input<T extends boolean | number = boolean | number>(name: string): Signal<T>;
  /** Enqueue a trigger; consumed during the next step (§A.2: triggers are not signals). */
  fire(name: string): void;
  /** Host tick (§A.5): drain triggers, take at most one transition, advance clocks. */
  step(now: number): void;
  /**
   * Analytic sample of every machine-bound target at machine time t — the
   * per-frame sampling surface bakeTrace consumes (§A.6). Valid at the
   * current step's time; reads the live binding samplers, never the signals.
   */
  sampleTargets(t: number): Map<string, { value: unknown; type: string }>;
  dispose(): void;
}

interface StateRec {
  id: StateId;
  compiled: CompiledTimeline;
  loop: boolean;
  rate: number;
  onEnter: 'restart' | 'resume';
  playhead: BindableSignal<number>;
}

interface LiveBinding {
  vt: ValueType<unknown>;
  sampler: MachineSampler;
}

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  emitDevWarning(message);
}

export function createMachine(doc: StateMachineDoc, opts: MachineOptions): Machine {
  validateMachineDoc(doc);

  const states = new Map<StateId, StateRec>();
  const refTimelines: Record<string, Timeline> = {};
  for (const [id, s] of Object.entries(doc.states)) {
    const tl = 'ref' in s.timeline ? opts.timelines?.[s.timeline.ref] : s.timeline;
    if (!tl) {
      throw new MachineValidationError(
        `state '${id}' references timeline '${(s.timeline as { ref: string }).ref}' but no document was provided in options.timelines`,
      );
    }
    if ('ref' in s.timeline) refTimelines[s.timeline.ref] = tl;
    states.set(id, {
      id,
      compiled: compileTimeline(tl),
      loop: s.loop ?? false,
      rate: s.rate ?? 1,
      onEnter: s.onEnter ?? 'restart',
      playhead: signal(0),
    });
  }

  // resolve every target once; the union set is the §A.1 disjointness surface
  const targets = new Set<string>();
  for (const st of states.values()) for (const t of st.compiled.tracks.keys()) targets.add(t);
  const sigs = new Map<string, BindTarget>();
  for (const t of targets) {
    const sig = opts.resolve(t);
    if (!sig) throw new UnboundTargetError(t);
    sigs.set(t, sig);
  }

  // inputs: boolean/number are writable signals; triggers are queued events (§A.2)
  const inputSigs = new Map<string, BindableSignal<boolean | number>>();
  const triggers = new Set<string>();
  for (const [name, decl] of Object.entries(doc.inputs ?? {})) {
    if (decl.type === 'trigger') triggers.add(name);
    else inputSigs.set(name, signal<boolean | number>(decl.default ?? (decl.type === 'boolean' ? false : 0)));
  }
  for (const [name, v] of Object.entries(opts.initialInputs ?? {})) {
    const sig = inputSigs.get(name);
    if (!sig) throw new MachineValidationError(`initialInputs: unknown input '${name}'`);
    sig.set(v);
  }

  // the four pieces of machine state (§A.5)
  const clock = signal(0);
  const currentSig = signal<StateId>(doc.initial);
  let current = states.get(doc.initial)!;
  let currentAnchor = 0;
  const savedLocal = new Map<StateId, number>(); // onEnter: 'resume'
  const queue: string[] = [];
  let inflight: { tSwitch: number; settle: number; interruptible: boolean; rebind: () => void } | null = null;
  const bindings = new Map<string, LiveBinding>();
  let stepped = false;
  let disposed = false;

  function localAt(st: StateRec, anchor: number, t: number): number {
    const d = st.compiled.duration;
    const local = Math.max(0, (t - anchor) * st.rate);
    if (d <= 0) return 0;
    return st.loop ? local % d : Math.min(local, d); // looping: the exit-time window reopens each loop (§A.3)
  }

  /** Pure analytic (value, velocity) of one state track w.r.t. the machine clock (§B.3). */
  function destSamplerFor(st: StateRec, anchor: number, tr: Track): MachineSampler {
    const vt = getValueType(tr.type);
    return {
      value: (t) => sampleTrack(tr, localAt(st, anchor, t)),
      velocity: (t) => {
        const v = velocityAt(tr, localAt(st, anchor, t));
        return v === null ? null : vt.scale!(v, st.rate); // state rate → machine-clock units
      },
    };
  }

  function bindSteady(st: StateRec, anchor: number, target: string, tr: Track): void {
    sigs.get(target)!.bindSource(() => sampleTrack(tr, st.playhead()));
    bindings.set(target, { vt: getValueType(tr.type), sampler: destSamplerFor(st, anchor, tr) });
  }

  // initial binding: the §2.4 form, local playhead 0 until the first step anchors it
  for (const [target, tr] of current.compiled.tracks) {
    const st = current;
    sigs.get(target)!.bindSource(() => sampleTrack(tr as Track, st.playhead()));
  }

  function eligible(td: TransitionDoc, local: number): boolean {
    if (td.exitTime !== undefined && local < td.exitTime * current.compiled.duration) return false;
    for (const c of td.conditions) {
      if ('trigger' in c) {
        if (!queue.includes(c.trigger)) return false;
      } else if ('is' in c) {
        if (inputSigs.get(c.input)!.peek() !== c.is) return false;
      } else {
        const v = inputSigs.get(c.input)!.peek() as number;
        const ok = c.op === '<' ? v < c.value : c.op === '<=' ? v <= c.value : c.op === '>' ? v > c.value : v >= c.value;
        if (!ok) return false;
      }
    }
    return true;
  }

  /** Priority = document order, first-match-wins; any-state edges after explicit edges (§A.3). */
  function pickTransition(local: number): TransitionDoc | null {
    for (const td of doc.transitions) {
      if (td.from === current.id && eligible(td, local)) return td;
    }
    for (const td of doc.transitions) {
      if (td.from !== '*') continue;
      if (td.to === current.id && !td.allowSelf) continue; // §A.1
      if (eligible(td, local)) return td;
    }
    return null;
  }

  function takeTransition(td: TransitionDoc, now: number): void {
    // consume this transition's triggers — one instance each (§A.3)
    for (const c of td.conditions) {
      if ('trigger' in c) {
        const i = queue.indexOf(c.trigger);
        if (i >= 0) queue.splice(i, 1);
      }
    }
    savedLocal.set(current.id, localAt(current, currentAnchor, now));
    const to = states.get(td.to)!;
    let anchor = now;
    if (to.onEnter === 'resume') {
      const saved = savedLocal.get(to.id);
      if (saved !== undefined) anchor = now - saved / to.rate;
    }
    to.playhead.set(localAt(to, anchor, now));

    const dur = td.duration ?? 0;
    let maxSettle = 0;
    const composites: Array<() => void> = [];
    const affected = new Set([...bindings.keys(), ...to.compiled.tracks.keys()]);

    for (const target of affected) {
      const destTrack = to.compiled.tracks.get(target) as Track | undefined;
      const sig = sigs.get(target)!;
      const outgoing = bindings.get(target);
      const vt = destTrack ? getValueType(destTrack.type) : outgoing!.vt;

      // policy resolution (§B.1): explicit, else type-class default when dur > 0, else cut —
      // never inferred from the destination timeline's content
      let kind: HandoffKind = td.handoff ?? (dur > 0 ? (vt.defaultHandoff ?? 'cut') : 'cut');
      if (!outgoing) kind = 'cut'; // never-bound target: nothing to hand off from
      if ((kind === 'spring' || kind === 'decay') && !(vt.add && vt.sub && vt.scale)) {
        const degraded: HandoffKind = vt.defaultHandoff === 'cut' ? 'cut' : 'blend-from-frozen';
        warnOnce(
          `${vt.id}:${kind}`,
          `value type '${vt.id}' lacks add/sub/scale: '${kind}' degrades to '${degraded}' for '${target}' (§B.6)`,
        );
        kind = degraded;
      }
      if (kind === 'decay' && dur <= 0) kind = 'cut';
      if (kind === 'blend-from-frozen' && (dur <= 0 || !destTrack)) kind = 'cut';

      if (kind === 'cut') {
        if (destTrack) {
          bindSteady(to, anchor, target, destTrack);
        } else {
          const frozen = outgoing!.sampler.value(now);
          sig.unbindSource(); // freeze at the switch value
          bindings.set(target, { vt, sampler: { value: () => frozen, velocity: () => null } });
        }
        continue;
      }

      if (kind === 'blend-from-frozen') {
        // snapshot blend with exactly one frozen value (§B.1) — nothing stacks
        const frozen = outgoing!.sampler.value(now);
        const dest = destSamplerFor(to, anchor, destTrack!);
        const ease = resolveEase(td.ease);
        const ts = now;
        const value = (t: number): unknown => {
          const u = (t - ts) / dur;
          return u >= 1 ? dest.value(t) : vt.lerp(frozen, dest.value(t), ease(Math.max(0, u)));
        };
        sig.bindSource(() => value(clock()));
        bindings.set(target, { vt, sampler: { value, velocity: () => null } });
        maxSettle = Math.max(maxSettle, dur);
        composites.push(() => bindSteady(to, anchor, target, destTrack!));
        continue;
      }

      // spring | decay: offset decay over the live destination (§B.2). A target
      // absent from the entering state inertializes against its frozen switch value.
      const frozenDest = destTrack ? null : outgoing!.sampler.value(now);
      const dest: MachineSampler = destTrack
        ? destSamplerFor(to, anchor, destTrack)
        : { value: () => frozenDest, velocity: () => null };
      const zero = vt.scale!(outgoing!.sampler.value(now), 0);
      const x0 = vt.sub!(outgoing!.sampler.value(now), dest.value(now));
      const v0 = vt.sub!(outgoing!.sampler.velocity(now) ?? zero, dest.velocity(now) ?? zero);
      const y = solveOffset(
        kind === 'spring'
          ? { kind: 'spring', cfg: td.spring ?? DEFAULT_HANDOFF_SPRING }
          : { kind: 'decay', ease: td.ease, duration: dur },
        vt,
        x0,
        v0,
      );
      const ts = now;
      const value = (t: number): unknown => {
        const tau = t - ts;
        return tau >= y.settle ? dest.value(t) : vt.add!(dest.value(t), y.at(tau));
      };
      const velocity = (t: number): unknown => {
        const tau = t - ts;
        const dv = dest.velocity(t) ?? zero;
        return tau >= y.settle ? dv : vt.add!(dv, y.vel(tau));
      };
      sig.bindSource(() => value(clock()));
      bindings.set(target, { vt, sampler: { value, velocity } });
      maxSettle = Math.max(maxSettle, y.settle);
      composites.push(
        destTrack
          ? () => bindSteady(to, anchor, target, destTrack)
          : () => {
              sigs.get(target)!.unbindSource();
              bindings.set(target, { vt, sampler: { value: () => frozenDest, velocity: () => null } });
            },
      );
    }

    current = to;
    currentAnchor = anchor;
    currentSig.set(to.id);
    inflight =
      maxSettle > 0
        ? {
            tSwitch: now,
            settle: maxSettle,
            interruptible: td.interruptible ?? true,
            // steady state carries zero transition overhead (§B.2)
            rebind: () => composites.forEach((f) => f()),
          }
        : null;
  }

  function step(now: number): void {
    if (disposed) return;
    if (inReadPhase()) throw new WriteDuringEvaluationError();
    clock.set(now);
    if (!stepped) {
      stepped = true;
      currentAnchor = now; // clocks are anchored on the first step, never accumulated (§A.5)
      for (const [target, tr] of current.compiled.tracks) {
        bindings.set(target, {
          vt: getValueType((tr as Track).type),
          sampler: destSamplerFor(current, currentAnchor, tr as Track),
        });
      }
    }
    current.playhead.set(localAt(current, currentAnchor, now));
    if (inflight && now - inflight.tSwitch >= inflight.settle) {
      inflight.rebind();
      inflight = null;
    }
    if (inflight && !inflight.interruptible) return; // §B.4: evaluation skipped, queue held
    const td = pickTransition(localAt(current, currentAnchor, now));
    if (td) takeTransition(td, now);
    queue.length = 0; // momentary semantics: unconsumed triggers drop at end of an evaluated step (§A.3)
  }

  const machine: Machine = {
    id: doc.id,
    doc,
    hash: hashMachine(doc, refTimelines),
    current: computed(() => currentSig()),
    clock: computed(() => clock()),
    targets,
    get hasStepped() {
      return stepped;
    },
    sampleTargets(t) {
      const out = new Map<string, { value: unknown; type: string }>();
      for (const [target, b] of bindings) out.set(target, { value: b.sampler.value(t), type: b.vt.id });
      return out;
    },
    input<T extends boolean | number>(name: string): Signal<T> {
      const sig = inputSigs.get(name);
      if (!sig) {
        throw new UnknownInputError(
          triggers.has(name) ? `'${name}' is a trigger input; use fire()` : `unknown input '${name}'`,
        );
      }
      return sig as unknown as Signal<T>;
    },
    fire(name) {
      if (inReadPhase()) throw new WriteDuringEvaluationError();
      if (!triggers.has(name)) {
        throw new UnknownInputError(
          inputSigs.has(name) ? `'${name}' is not a trigger; use input('${name}').set()` : `unknown input '${name}'`,
        );
      }
      if (!disposed) queue.push(name);
    },
    step,
    dispose() {
      if (inReadPhase()) throw new WriteDuringEvaluationError();
      disposed = true;
      for (const sig of sigs.values()) sig.unbindSource();
      queue.length = 0;
      inflight = null;
    },
  };

  // dev-mode escape hatch for studio preview (§A.2); never part of the public type
  if (typeof process === 'undefined' || process.env['NODE_ENV'] !== 'production') {
    (machine as unknown as Record<string, unknown>)['__forceState'] = (id: StateId) => {
      const st = states.get(id);
      if (!st) throw new UnknownInputError(`unknown state '${id}'`);
      if (st !== current) takeTransition({ id: '__forceState', from: current.id, to: id, conditions: [] }, clock.peek());
    };
  }

  return machine;
}
