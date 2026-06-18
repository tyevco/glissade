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

export {
  batch,
  setScheduler,
  synchronousScheduler,
  type Scheduler,
} from './ticker.js';

export { vec2Signal, type Vec2Signal } from './vec2Signal.js';

export {
  easings,
  easingDerivatives,
  cubicBezier,
  cubicBezierDerivative,
  namedEasing,
  DEFAULT_EASE,
  UnknownEasingError,
  type EasingFn,
  type EaseSpec,
} from './easing.js';

export {
  spring,
  springPresets,
  springEasing,
  springEasingDerivative,
  type SpringConfig,
  type SpringEase,
  type RetargetSpring,
} from './spring.js';

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
  vec2ArcType,
  getValueType,
  numberType,
  vec2Type,
  colorType,
  stringType,
  booleanType,
  paintType,
  type Paint,
  type ColorStop,
  vec2Equals,
  inferValueType,
  UnknownValueTypeError,
  ValueTypeInferenceError,
  type HandoffKind,
  type PathContour,
  type PathValue,
  pathType,
  type ValueType,
  type ValueTypeId,
  type Vec2,
} from './valueTypes.js';

export {
  key,
  track,
  springTo,
  stagger,
  sampleTrack,
  velocityAt,
  validateTrack,
  resolveEase,
  resolveEaseDerivative,
  TrackValidationError,
  type Key,
  type KeyOpts,
  type Track,
} from './track.js';

export {
  compileTimeline,
  isDurationEditable,
  audioOffsetSamples,
  setDevWarning,
  emitDevWarning,
  TimelineValidationError,
  type Timeline,
  type TimelineInit,
  type CompiledTimeline,
  type ChildEntry,
  type Marker,
  type AssetRef,
  type FontFaceRef,
  type GainEnvelope,
  type AudioClip,
  type Json,
  type DevWarning,
} from './timeline.js';

export {
  buildFontRegistry,
  type FontRegistry,
  type ResolvedFace,
} from './fontRegistry.js';

export { parseCmap } from './cmap.js';

export {
  validateFonts,
  isExemptFamily,
  FontValidationError,
  type FontMode,
  type FontUsage,
  type CoverageReport,
  type MissingGlyphs,
  type ValidateFontsOptions,
} from './fontValidation.js';

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
  isEditableNodeId,
  targetNodeId,
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
  type CurveSampler,
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

export {
  mergeSidecar,
  mergeSidecarDetailed,
  migrateSidecar,
  setSidecarTrack,
  deleteSidecarTrack,
  hashKeys,
  assignKeyIds,
  emptySidecar,
  normalizeEditedKeys,
  SidecarVersionError,
  type SidecarDoc,
  type SidecarDocV1,
  type SidecarTimelineEntry,
  type SidecarTrackEntry,
  type SidecarOrphan,
  type OrphanReason,
  type MergeResult,
} from './sidecar.js';
