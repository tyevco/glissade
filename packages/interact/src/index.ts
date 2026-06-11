/**
 * @glissade/interact — state machines over timelines (v2 addendum). An opt-in
 * layer on the Driver seam: never imported by core, scene, player, or element.
 */

export {
  hashMachine,
  MachineValidationError,
  validateMachineDoc,
  type Condition,
  type HandoffName,
  type InputDecl,
  type StateDoc,
  type StateId,
  type StateMachineDoc,
  type TransitionDoc,
} from './doc.js';
export { createMachine, UnknownInputError, type Machine, type MachineOptions } from './machine.js';
export {
  DEFAULT_HANDOFF_SPRING,
  solveOffset,
  type HandoffPolicy,
  type MachineSampler,
  type OffsetCurve,
} from './handoff.js';
export { pointerDriver, splitVec2, springFilter, type PointerDriverOptions, type SpringFilter } from './pointer.js';
export {
  bakeTrace,
  recordTrace,
  TraceHashMismatchError,
  type BakeTraceOptions,
  type InputTrace,
  type MachineSpec,
  type RecordOptions,
  type TraceEvent,
  type TraceRecorder,
} from './trace.js';
export {
  containsPoint,
  createListeners,
  hitTest,
  type BoolSink,
  type Listeners,
  type ListenersOptions,
} from './listeners.js';
