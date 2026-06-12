import type { GroupSpec, NodeSpec, PathSpec } from '../src/index.js';
import type { LottieDocument, LottieLayer, LottieShapeItem } from '../src/types.js';

export const doc = (layers: LottieLayer[], extra: Partial<LottieDocument> = {}): LottieDocument => ({
  fr: 25,
  ip: 0,
  op: 50,
  w: 100,
  h: 100,
  layers,
  ...extra,
});

export const shapeLayer = (
  shapes: LottieShapeItem[],
  ks: LottieLayer['ks'] = {},
  extra: Partial<LottieLayer> = {},
): LottieLayer => ({
  ty: 4,
  nm: 'L',
  ind: 0,
  ip: 0,
  op: 50,
  st: 0,
  ks,
  shapes,
  ...extra,
});

const zeros = (n: number): number[][] => Array.from({ length: n }, () => [0, 0]);

export const triangleSh = (scale = 1): LottieShapeItem => ({
  ty: 'sh',
  ks: {
    k: {
      v: [
        [0, 0],
        [10 * scale, 0],
        [10 * scale, 10 * scale],
      ],
      i: zeros(3),
      o: zeros(3),
      c: true,
    },
  },
});

export const redFill: LottieShapeItem = { ty: 'fl', c: { k: [1, 0, 0, 1] }, o: { k: 100 } };

export function walk(nodes: NodeSpec[], visit: (n: NodeSpec) => void): void {
  for (const n of nodes) {
    visit(n);
    if (n.kind === 'group') walk(n.children, visit);
  }
}

export function findPaths(nodes: NodeSpec[]): PathSpec[] {
  const out: PathSpec[] = [];
  walk(nodes, (n) => {
    if (n.kind === 'path') out.push(n);
  });
  return out;
}

export function findGroup(nodes: NodeSpec[], id: string): GroupSpec | undefined {
  let found: GroupSpec | undefined;
  walk(nodes, (n) => {
    if (n.kind === 'group' && n.id === id) found = n;
  });
  return found;
}
