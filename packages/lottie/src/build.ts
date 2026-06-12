/**
 * Spec tree → real @glissade/scene nodes. Kept separate from conversion so
 * importLottie's data output stays plain JSON-able.
 */

import { Group, ImageNode, Path, Rect, type Node } from '@glissade/scene';
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
  }
}

export function buildNodes(specs: NodeSpec[]): Node[] {
  return specs.map(buildNode);
}
