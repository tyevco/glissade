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

export { vec2Signal, type Vec2Signal, type Vec2Component } from './vec2Signal.js';

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
  listValueTypes,
  reprOf,
  numberType,
  vec2Type,
  colorType,
  stringType,
  booleanType,
  paintType,
  type Paint,
  type ColorStop,
  type GradientInterpolation,
  type MeshPaint,
  type MeshPoint,
  type MeshInterpolation,
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
  type StaggerSpec,
  type StaggerOpts,
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
  BindTypeMismatchError,
  type Playhead,
  type BindTarget,
  type BindOptions,
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

// The editor sidecar (§6.2) is STUDIO-only — it never appears on the
// evaluate/embed path. 0.20 budget review relocated it OFF the base index onto
// the tree-shakeable `@glissade/core/sidecar` subpath so its ~15.6 kB raw
// (merge/migrate/orphan machinery) can't sit in the base-embed budget. Studio,
// vite-plugin, and the studio-host entry import from `@glissade/core/sidecar`
// (or the package-internal `./sidecar.js`); see scripts/check-size.mjs metafile
// guard `base core excludes sidecar`.
