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
  NodeConstructionError,
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

// `collapseReplacer` — the byte-preserving §3.5 cacheKey serializer — lives on
// the render path (displayList.ts) so it stays on the base index. The heavier
// DEV/CLI diagnostic surface that used to ride alongside it (diffDisplayLists /
// serializeDisplayList / auditCacheCold) moved to the tree-shakeable
// `@glissade/scene/diagnostics` subpath in the 0.20 budget review, off the
// base-embed budget. The PRODUCTION token-highlight render component
// (`tokenHighlight`) is its OWN subpath `@glissade/scene/tokens` (the ai-training
// finding — it draws visible UI, not a debug surface). See scripts/check-size.mjs
// guards `base scene excludes diagnostics` / `base scene excludes tokens`.
export { collapseReplacer } from './collapseReplacer.js';
export {
  ALL_FILTER_KINDS,
  type RenderBackend,
  type BackendCaps,
  type FilterKind,
} from './renderBackend.js';

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
  measureWrappedText,
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
  type WrappedTextMetrics,
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
