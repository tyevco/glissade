/**
 * StateMachineDoc (v2 addendum §A.3/§A.4): a sibling, versioned document —
 * never embedded in a Timeline. States bind Timelines; transitions carry
 * closed condition data so a no-code editor and trace replay stay possible.
 */

import { emitDevWarning, type AssetRef, type EaseSpec, type SpringConfig, type Timeline } from '@glissade/core';

export type StateId = string;

export type InputDecl =
  | { type: 'boolean'; default?: boolean }
  | { type: 'number'; default?: number }
  | { type: 'trigger' };

/** Flat AND per transition; multiple transitions = OR (§A.3). No number ==/!= — use hysteresis. */
export type Condition =
  | { input: string; is: boolean }
  | { input: string; op: '<' | '<=' | '>' | '>='; value: number }
  | { trigger: string };

/** Defined identically here and in §B.1; 'crossfade' is reserved-not-valid in version 1. */
export type HandoffName = 'cut' | 'decay' | 'spring';

export interface StateDoc {
  /** Referenced as an asset ({ ref }) or inlined (§A.1). */
  timeline: { ref: string } | Timeline;
  loop?: boolean;
  /** Local playback rate; must be > 0. */
  rate?: number;
  /** Re-entry playhead policy (§A.1); default 'restart'. */
  onEnter?: 'restart' | 'resume';
}

export interface TransitionDoc {
  id: string;
  from: StateId | '*';
  to: StateId;
  /** A '*' edge never matches the current state unless allowSelf (§A.1). */
  allowSelf?: boolean;
  conditions: Condition[];
  /** Window-guard, not a trigger: fraction of the SOURCE timeline's duration [0..1] (§A.3). */
  exitTime?: number;
  /** The transition's own clock, seconds; default 0 = hard cut (§A.3). */
  duration?: number;
  /** Shapes the 'decay' ramp / 'blend-from-frozen' blend (§B.1). */
  ease?: EaseSpec;
  handoff?: HandoffName;
  /** Offset-oscillator config when handoff resolves to 'spring'; default §B.3's {170, 26, 1}. */
  spring?: SpringConfig;
  /** Default true; false skips evaluation and holds the trigger queue while in flight (§B.4). */
  interruptible?: boolean;
}

export interface StateMachineDoc {
  version: 1;
  id: string;
  inputs?: Record<string, InputDecl>;
  initial: StateId;
  states: Record<StateId, StateDoc>;
  transitions: TransitionDoc[];
  assets?: Record<string, AssetRef>;
}

export class MachineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MachineValidationError';
  }
}

const HANDOFFS: readonly string[] = ['cut', 'decay', 'spring'];

export function validateMachineDoc(doc: StateMachineDoc): void {
  if (doc.version !== 1) {
    throw new MachineValidationError(`unsupported machine document version ${String(doc.version)}`);
  }
  const states = doc.states ?? {};
  const inputs = doc.inputs ?? {};
  if (!states[doc.initial]) {
    throw new MachineValidationError(`initial state '${doc.initial}' is not declared`);
  }
  for (const [name, decl] of Object.entries(inputs)) {
    if (decl.type === 'trigger') {
      if ('default' in decl) throw new MachineValidationError(`trigger '${name}' cannot have a default`);
    } else if (decl.default !== undefined && typeof decl.default !== decl.type) {
      throw new MachineValidationError(`input '${name}': default does not match type '${decl.type}'`);
    }
  }
  for (const [id, s] of Object.entries(states)) {
    if (s.rate !== undefined && s.rate <= 0) {
      throw new MachineValidationError(`state '${id}': rate must be > 0`);
    }
  }
  const ids = new Set<string>();
  for (const tr of doc.transitions) {
    if (ids.has(tr.id)) throw new MachineValidationError(`duplicate transition id '${tr.id}'`);
    ids.add(tr.id);
    if (tr.from !== '*' && !states[tr.from]) {
      throw new MachineValidationError(`transition '${tr.id}': unknown source state '${tr.from}'`);
    }
    if (!states[tr.to]) {
      throw new MachineValidationError(`transition '${tr.id}': unknown destination state '${tr.to}'`);
    }
    if (tr.handoff !== undefined && !HANDOFFS.includes(tr.handoff)) {
      throw new MachineValidationError(
        (tr.handoff as string) === 'crossfade'
          ? `transition '${tr.id}': handoff 'crossfade' is reserved, not valid in version 1 (§A.4)`
          : `transition '${tr.id}': unknown handoff '${String(tr.handoff)}'`,
      );
    }
    if (tr.exitTime !== undefined && (tr.exitTime < 0 || tr.exitTime > 1)) {
      throw new MachineValidationError(`transition '${tr.id}': exitTime must be in [0, 1]`);
    }
    if (tr.duration !== undefined && tr.duration < 0) {
      throw new MachineValidationError(`transition '${tr.id}': duration must be >= 0`);
    }
    if (tr.allowSelf && tr.from !== '*') {
      emitDevWarning(`transition '${tr.id}': allowSelf is only meaningful with from: '*' (§A.1)`);
    }
    if (tr.conditions.length === 0 && tr.exitTime === undefined) {
      emitDevWarning(
        `transition '${tr.id}' has no conditions and no exitTime: it takes on every step (a per-frame oscillator is almost always an authoring mistake, §A.3)`,
      );
    }
    if (tr.interruptible === false && tr.handoff === 'spring') {
      emitDevWarning(
        `transition '${tr.id}': interruptible: false with a spring handoff blocks for an emergent, potentially long settle (§B.4); prefer short fixed-duration transitions`,
      );
    }
    for (const c of tr.conditions) {
      if ('trigger' in c) {
        if (inputs[c.trigger]?.type !== 'trigger') {
          throw new MachineValidationError(`transition '${tr.id}': '${c.trigger}' is not a declared trigger`);
        }
      } else {
        const decl = inputs[c.input];
        if (!decl) throw new MachineValidationError(`transition '${tr.id}': unknown input '${c.input}'`);
        const want = 'is' in c ? 'boolean' : 'number';
        if (decl.type !== want) {
          throw new MachineValidationError(
            `transition '${tr.id}': condition on '${c.input}' expects a ${want} input, declared '${decl.type}'`,
          );
        }
      }
    }
  }
}
