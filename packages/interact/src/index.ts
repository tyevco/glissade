/**
 * @glissade/interact — state machines over timelines (v2 addendum). An opt-in
 * layer on the Driver seam: never imported by core, scene, player, or element.
 */

export {
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
