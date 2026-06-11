// @glissade/core — signals, tracks, timeline document, evaluation, easing,
// springs, seeded RNG. Zero DOM/Node dependencies (DESIGN.md §7.1).

export {
  signal,
  computed,
  untracked,
  beginReadPhase,
  endReadPhase,
  inReadPhase,
  WriteDuringEvaluationError,
  CircularDependencyError,
  type Signal,
  type ReadonlySignal,
  type BindableSignal,
  type SignalOptions,
  type Equals,
} from './signal.js';

export { vec2Signal, type Vec2Signal } from './vec2Signal.js';

export {
  easings,
  cubicBezier,
  namedEasing,
  DEFAULT_EASE,
  UnknownEasingError,
  type EasingFn,
  type EaseSpec,
} from './easing.js';

export { spring, springEasing, type SpringConfig, type SpringEase } from './spring.js';

export {
  parseColor,
  formatColor,
  lerpColor,
  rgbaToOklab,
  oklabToRgba,
  ColorParseError,
  type Rgba,
  type OkLab,
} from './color.js';

export {
  registerValueType,
  getValueType,
  numberType,
  vec2Type,
  colorType,
  stringType,
  booleanType,
  vec2Equals,
  inferValueType,
  UnknownValueTypeError,
  ValueTypeInferenceError,
  type ValueType,
  type ValueTypeId,
  type Vec2,
} from './valueTypes.js';

export {
  key,
  track,
  sampleTrack,
  validateTrack,
  resolveEase,
  TrackValidationError,
  type Key,
  type KeyOpts,
  type Track,
} from './track.js';

export {
  compileTimeline,
  setDevWarning,
  TimelineValidationError,
  type Timeline,
  type TimelineInit,
  type CompiledTimeline,
  type ChildEntry,
  type Marker,
  type AssetRef,
  type AudioClip,
  type Json,
  type DevWarning,
} from './timeline.js';

export {
  timeline,
  buildTimeline,
  getTimelineCallbacks,
  PositionError,
  type TimelineBuilder,
  type TweenOpts,
  type Position,
} from './builder.js';

export {
  TARGET_PATH,
  resolveTweenTarget,
  UnresolvableTargetError,
  type TweenTarget,
  type TargetCarrier,
} from './targetRef.js';

export {
  createPlayhead,
  bindTimeline,
  evaluateAt,
  UnboundTargetError,
  type Playhead,
  type BindTarget,
  type BoundTimeline,
} from './binding.js';

export { random, type Rng } from './rng.js';

export {
  bake,
  bakeCheckpointed,
  BakeError,
  type BakeConfig,
  type CheckpointedBakeConfig,
  type CheckpointedSim,
} from './bake.js';

export { mergeSidecar, emptySidecar, normalizeEditedKeys, SidecarVersionError, type SidecarDoc } from './sidecar.js';
