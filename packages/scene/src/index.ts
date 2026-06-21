// @glissade/scene — node tree, transforms, DisplayList emission (DESIGN.md §3).
// Depends only on @glissade/core; zero DOM/Node dependencies.

export { IDENTITY, fromTRS, multiply, invert, applyToPoint, matEquals, type Mat2x3 } from './matrix.js';

export {
  createDisplayListBuilder,
  type DisplayList,
  type DisplayListBuilder,
  type DrawCommand,
  type Resource,
  type ResourceId,
  type PathSeg,
  type Paint,
  type MeshPaint,
  type MeshPoint,
  type MeshInterpolation,
  type StrokeStyle,
  type FontSpec,
  type FilterSpec,
  FilterValidationError,
  validateFilters,
  filtersToCanvasFilter,
  glow,
  type ShaderRef,
  type BlendMode,
  type Rect as RectShape,
} from './displayList.js';

export {
  Node,
  resolveAnchor,
  type AnchorSpec,
  type EvalContext,
  type NodeProps,
  type PropInit,
  type BindablePropTarget,
  type HitArea,
} from './node.js';

export {
  Group,
  Rect,
  Circle,
  Path,
  Text,
  ImageNode,
  // §3.1 public name (DESIGN names it `Image`); `ImageNode` stays exported for back-compat.
  ImageNode as Image,
  Video,
  Custom,
  roundedRectSegs,
  pathFromSegs,
  coercePathData,
  revealSchedule,
  type LineBox,
  type WordBox,
  type GraphemeBox,
  type RevealMark,
  type ShapeProps,
  type PathProps,
  type TextProps,
  type ImageProps,
  type VideoProps,
} from './nodes.js';

// §3.1: the closed, enumerated node taxonomy (the lock + its name type).
export { NODE_TAXONOMY, type NodeTypeName } from './taxonomy.js';

export {
  roughen,
  flatten,
  arcLength,
  sketchStrokes,
  hachureLines,
  validateSketch,
  validateHachure,
  resolveSketch,
  SketchValidationError,
  type SketchStyle,
  type HachureSpec,
  type Polyline,
  type ResolvedSketch,
} from './sketch.js';

export { Highlight, highlight, type HighlightProps } from './highlight.js';
export { TextCursor, textCursor, type TextCursorProps } from './textCursor.js';
export { typewriter, type TypeEdit, type EditMark, type StepMark, type TypewriterResult } from './typewriter.js';
export {
  each,
  EachError,
  type Place,
  type EachLayout,
  type EachDistribute,
  type EachMotion,
  type EachBox,
  type EachOpts,
  type EachContext,
  type EachResult,
} from './each.js';
export { drawOn, drawOnEach, type DrawOnOptions, type DrawOnEachOptions } from './drawOn.js';
export { withDeterminismGuards, DeterminismViolationError, type GuardMode } from './guards.js';
export { auditCacheCold, type CacheColdResult } from './cacheColdAudit.js';

// DEV / CLI diagnostic — DisplayList diff + serializable IR snapshots (§3.3).
// Side-effect-free, never reached by evaluate(); tree-shakes out of the embed.
export {
  diffDisplayLists,
  formatDisplayDiff,
  serializeDisplayList,
  parseDisplaySnapshot,
  collapseReplacer,
  DL_SNAPSHOT_VERSION,
  DlSnapshotError,
  type DisplayDiff,
  type CommandDelta,
  type FieldChange,
  type DlSnapshot,
} from './displayDiff.js';
export {
  ALL_FILTER_KINDS,
  type RenderBackend,
  type BackendCaps,
  type FilterKind,
} from './renderBackend.js';
export {
  FollowPath,
  followPath,
  motionPath,
  pointAtLength,
  pathLength,
  type FollowPathProps,
  type PathSampler,
} from './motionPath.js';
export {
  TokenHighlight,
  tokenHighlight,
  matchTokenRun,
  TokenMatchError,
  type TokenHighlightProps,
  type TokenRange,
} from './tokenHighlight.js';

export {
  collectTextUsages,
  collectLocalizedTextUsages,
  validateSceneFonts,
  type FontByteLoader,
  type ValidateSceneFontsOptions,
} from './fontUsage.js';

export { ColdAssetError, type VideoFrameSource, type ImageHandle } from './assets.js';
export { ShaderEffect, type ShaderEffectProps } from './shaderEffect.js';
export {
  Raster2D,
  fontString,
  type CanvasLike,
  type Ctx2DLike,
  type ImageDataLike,
  type PathLike,
  type Raster2DHost,
  type ShaderCaps,
} from './raster2d.js';

export {
  rasterizeMesh,
  meshRasterSize,
  MESH_DOWNSCALE,
  MESH_SHEPARD_POWER,
  MESH_SIGMA,
} from './meshGradient.js';

export {
  breakLines,
  segmentWords,
  segmentGraphemes,
  quantize,
  MEASURE_QUANTUM_PX,
  estimatingMeasurer,
  isEstimatingMeasurer,
  setDefaultMeasurer,
  __resetEstimateWarnings,
  type TextMeasurer,
  type TextMetricsLite,
} from './text.js';

export {
  createScene,
  bindScene,
  evaluate,
  DuplicateNodeIdError,
  ReservedNodeIdError,
  type Scene,
  type SceneInit,
  type SceneModule,
} from './scene.js';

// the LayoutEngine seam lives in the base entry; the Yoga implementation and
// Layout node are the separately-budgeted './layout' entry (§3.2)
export {
  setLayoutEngine,
  getLayoutEngine,
  requireLayoutEngine,
  LayoutEngineMissingError,
  type LayoutEngine,
  type LayoutBox,
  type LayoutChildSpec,
  type LayoutContainerSpec,
} from './layoutEngine.js';
