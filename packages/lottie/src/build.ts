/**
 * Spec tree → real @glissade/scene nodes. Kept separate from conversion so
 * importLottie's data output stays plain JSON-able.
 */

import { Group, ImageNode, Path, Rect, Text, type Node } from '@glissade/scene';
import type { NodeSpec } from './spec.js';

export function buildNode(spec: NodeSpec): Node {
  const base = {
    id: spec.id,
    ...(spec.position !== undefined ? { position: spec.position } : {}),
    ...(spec.rotation !== undefined ? { rotation: spec.rotation } : {}),
    ...(spec.scale !== undefined ? { scale: spec.scale } : {}),
    ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
    ...(spec.zIndex !== undefined ? { zIndex: spec.zIndex } : {}),
  };
  switch (spec.kind) {
    case 'group':
      return new Group({ ...base, children: spec.children.map(buildNode) });
    case 'path':
      return new Path({
        ...base,
        data: spec.data,
        ...(spec.fill !== undefined ? { fill: spec.fill } : {}),
        ...(spec.stroke !== undefined ? { stroke: spec.stroke } : {}),
        ...(spec.strokeWidth !== undefined ? { strokeWidth: spec.strokeWidth } : {}),
      });
    case 'rect':
      return new Rect({
        ...base,
        width: spec.width,
        height: spec.height,
        ...(spec.fill !== undefined ? { fill: spec.fill } : {}),
      });
    case 'image':
      return new ImageNode({ ...base, assetId: spec.assetId, width: spec.width, height: spec.height });
    case 'text':
      return new Text({
        ...base,
        text: spec.text,
        fill: spec.fill,
        fontSize: spec.fontSize,
        fontFamily: spec.fontFamily,
        ...(spec.fontWeight !== undefined ? { fontWeight: spec.fontWeight } : {}),
        ...(spec.fontStyle !== undefined ? { fontStyle: spec.fontStyle } : {}),
        ...(spec.align !== undefined ? { align: spec.align } : {}),
        ...(spec.letterSpacing !== undefined ? { letterSpacing: spec.letterSpacing } : {}),
        ...(spec.lineHeight !== undefined ? { lineHeight: spec.lineHeight } : {}),
      });
  }
}

export function buildNodes(specs: NodeSpec[]): Node[] {
  return specs.map(buildNode);
}
