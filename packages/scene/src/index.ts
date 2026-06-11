// @glissade/scene — node tree, transforms, DisplayList emission (DESIGN.md §3).
// Depends only on @glissade/core; zero DOM/Node dependencies.

export { IDENTITY, fromTRS, multiply, applyToPoint, matEquals, type Mat2x3 } from './matrix.js';

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
  type BlendMode,
  type Rect as RectShape,
} from './displayList.js';

export { Node, type EvalContext, type NodeProps, type PropInit, type BindablePropTarget } from './node.js';

export { Group, Rect, Circle, Text, type ShapeProps, type TextProps } from './nodes.js';

export {
  createScene,
  bindScene,
  evaluate,
  DuplicateNodeIdError,
  type Scene,
  type SceneInit,
} from './scene.js';
