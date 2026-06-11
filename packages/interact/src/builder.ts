/**
 * Code-first machine authoring (§C.7): two authoring surfaces, one document.
 * The builder's output IS a StateMachineDoc — same serialization, the studio
 * round-trips it — and the accumulated type parameters make input/state names
 * compile-time-checked at the call sites.
 */

import { inferValueType, key, timeline, track, type EaseSpec, type SpringConfig, type Timeline, type Track } from '@glissade/core';
import {
  validateMachineDoc,
  type Condition,
  type HandoffName,
  type InputDecl,
  type StateDoc,
  type StateMachineDoc,
} from './doc.js';

/**
 * A pose state (§C.7): just values, keyed by full target path — compiled to a
 * one-key timeline, no separate file. Covers "two looks, one toggle".
 */
export function pose(values: Record<string, unknown>): Timeline {
  const tracks: Track[] = [];
  for (const [target, v] of Object.entries(values)) {
    tracks.push(track(target, inferValueType(v), [key(0, v)]));
  }
  return timeline({ tracks });
}

type Cond<B extends string, N extends string, G extends string> =
  | { input: B; is: boolean }
  | { input: N; op: '<' | '<=' | '>' | '>='; value: number }
  | { trigger: G };

export interface TransitionOpts<B extends string, N extends string, G extends string> {
  /** Flat AND (§A.3); a single condition or a list. Omit for always-eligible (pair with exitTime). */
  when?: Cond<B, N, G> | Cond<B, N, G>[];
  exitTime?: number;
  duration?: number;
  ease?: EaseSpec;
  handoff?: HandoffName;
  spring?: SpringConfig;
  interruptible?: boolean;
  /** Stable id; default '<from>-><to>#<n>'. */
  id?: string;
}

interface StateInput {
  timeline: StateDoc['timeline'];
  loop?: boolean;
  rate?: number;
  onEnter?: 'restart' | 'resume';
}

const isTimeline = (v: Timeline | StateInput): v is Timeline => 'version' in v;

export class MachineBuilder<
  B extends string = never, // boolean inputs
  N extends string = never, // number inputs
  G extends string = never, // triggers
  S extends string = never, // states
> {
  private readonly inputs: Record<string, InputDecl> = {};
  private readonly states: Record<string, StateDoc> = {};
  private readonly transitions: StateMachineDoc['transitions'] = [];
  private first: string | null = null;
  private initialState: string | null = null;

  constructor(private readonly id: string) {}

  input<K extends string>(name: K, type: 'boolean', dflt?: boolean): MachineBuilder<B | K, N, G, S>;
  input<K extends string>(name: K, type: 'number', dflt?: number): MachineBuilder<B, N | K, G, S>;
  input(name: string, type: 'boolean' | 'number', dflt?: boolean | number): this {
    this.inputs[name] =
      type === 'boolean'
        ? { type, ...(dflt !== undefined ? { default: dflt as boolean } : {}) }
        : { type, ...(dflt !== undefined ? { default: dflt as number } : {}) };
    return this;
  }

  trigger<K extends string>(name: K): MachineBuilder<B, N, G | K, S> {
    this.inputs[name] = { type: 'trigger' };
    return this as unknown as MachineBuilder<B, N, G | K, S>;
  }

  state<K extends string>(name: K, state: Timeline | StateInput): MachineBuilder<B, N, G, S | K> {
    this.states[name] = isTimeline(state) ? { timeline: state } : state;
    this.first ??= name;
    return this as unknown as MachineBuilder<B, N, G, S | K>;
  }

  initial(name: S): this {
    this.initialState = name;
    return this;
  }

  transition(from: S | '*', to: S, opts: TransitionOpts<B, N, G> = {}): this {
    const conditions: Condition[] = opts.when === undefined ? [] : Array.isArray(opts.when) ? opts.when : [opts.when];
    this.transitions.push({
      id: opts.id ?? `${from}->${to}#${this.transitions.length}`,
      from,
      to,
      conditions,
      ...(opts.exitTime !== undefined ? { exitTime: opts.exitTime } : {}),
      ...(opts.duration !== undefined ? { duration: opts.duration } : {}),
      ...(opts.ease !== undefined ? { ease: opts.ease } : {}),
      ...(opts.handoff !== undefined ? { handoff: opts.handoff } : {}),
      ...(opts.spring !== undefined ? { spring: opts.spring } : {}),
      ...(opts.interruptible !== undefined ? { interruptible: opts.interruptible } : {}),
    });
    return this;
  }

  /** Assemble and validate; the result is the same document JSON authoring produces. */
  build(): StateMachineDoc {
    const doc: StateMachineDoc = {
      version: 1,
      id: this.id,
      ...(Object.keys(this.inputs).length > 0 ? { inputs: this.inputs } : {}),
      initial: this.initialState ?? this.first ?? '',
      states: this.states,
      transitions: this.transitions,
    };
    validateMachineDoc(doc);
    return doc;
  }
}

export function machineBuilder(id: string): MachineBuilder {
  return new MachineBuilder(id);
}
