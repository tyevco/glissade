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
  type StrokeStyle,
  type FontSpec,
  type FilterSpec,
  FilterValidationError,
  validateFilters,
  filtersToCanvasFilter,
  type BlendMode,
  type Rect as RectShape,
} from './displayList.js';

export { Node, type EvalContext, type NodeProps, type PropInit, type BindablePropTarget, type HitArea } from './node.js';

export {
  Group,
  Rect,
  Circle,
  Path,
  Text,
  ImageNode,
  Video,
  type ShapeProps,
  type PathProps,
  type TextProps,
  type ImageProps,
  type VideoProps,
} from './nodes.js';

export { ColdAssetError, type VideoFrameSource, type ImageHandle } from './assets.js';
export {
  Raster2D,
  fontString,
  type CanvasLike,
  type Ctx2DLike,
  type PathLike,
  type Raster2DHost,
} from './raster2d.js';

export {
  breakLines,
  quantize,
  estimatingMeasurer,
  type TextMeasurer,
  type TextMetricsLite,
} from './text.js';

export {
  createScene,
  bindScene,
  evaluate,
  DuplicateNodeIdError,
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
