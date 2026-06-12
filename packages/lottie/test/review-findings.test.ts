/**
 * Regressions for the adversarial-review findings on the S1 importer —
 * each test names the failure mode it pins down.
 */

import { describe, expect, it } from 'vitest';
import { importLottie, LottieImportError, reverseContour } from '../src/index.js';
import type { GroupSpec, NodeSpec } from '../src/spec.js';

const doc = (layers: unknown[], over: Record<string, unknown> = {}) => ({
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 60,
  w: 100,
  h: 100,
  layers,
  ...over,
});

const nullLayer = (ind: number, over: Record<string, unknown> = {}) => ({
  ty: 3,
  ind,
  nm: `null${ind}`,
  ip: 0,
  op: 60,
  ks: { p: { k: [10, 20] } },
  ...over,
});

const solidLayer = (ind: number, over: Record<string, unknown> = {}) => ({
  ty: 1,
  ind,
  nm: `solid${ind}`,
  ip: 0,
  op: 60,
  sw: 10,
  sh: 10,
  sc: '#ff0000',
  ks: {},
  ...over,
});

const findGroup = (nodes: NodeSpec[], pred: (g: GroupSpec) => boolean): GroupSpec | null => {
  for (const n of nodes) {
    if (n.kind === 'group') {
      if (pred(n)) return n;
      const inner = findGroup(n.children, pred);
      if (inner) return inner;
    }
  }
  return null;
};

describe('review findings stay fixed', () => {
  it('[critical] an ip/op-trimmed parent keeps its paint order: the wrapper carries zIndex', () => {
    // parent (ind 1) trimmed to start at frame 10; child (ind 2) parented to it
    const r = importLottie(doc([solidLayer(1, { ip: 10, parent: undefined }), solidLayer(2, { parent: 1 })]));
    const wrapper = findGroup(r.nodes, (g) => g.id.endsWith('__v'));
    expect(wrapper).not.toBeNull();
    expect(wrapper!.zIndex).toBe(-1); // replaces the content sibling, must sort like it
  });

  it('[major] a hidden layer is still a valid transform parent', () => {
    const r = importLottie(doc([nullLayer(1, { hd: true }), solidLayer(2, { parent: 1 })]));
    // the child must be NESTED under the hidden parent's group, not re-rooted
    expect(r.nodes.length).toBe(1);
    const parent = r.nodes[0]! as GroupSpec;
    expect(findGroup([parent], (g) => g.id.startsWith('solid2'))).not.toBeNull();
    // and the hidden parent renders nothing of its own (no content sibling)
    expect(findGroup([parent], (g) => g.id.includes('__c') && g.id.startsWith('null1'))).toBeNull();
  });

  it('[major] layer time stretch (sr ≠ 1) rejects — properties never silently stretch', () => {
    expect(() => importLottie(doc([solidLayer(1, { sr: 2 })]))).toThrow(LottieImportError);
    expect(() => importLottie(doc([solidLayer(1, { sr: 2 })]))).toThrow(/time stretch/);
  });

  it('[major] geometry-modifying shape items reject by name, never pass silently', () => {
    const shapeLayer = {
      ty: 4,
      ind: 1,
      nm: 'shapes',
      ip: 0,
      op: 60,
      ks: {},
      shapes: [
        { ty: 'el', p: { k: [50, 50] }, s: { k: [40, 40] } },
        { ty: 'zz', nm: 'ZigZag 1' },
        { ty: 'fl', c: { k: [1, 0, 0] }, o: { k: 100 } },
      ],
    };
    expect(() => importLottie(doc([shapeLayer]))).toThrow(/zig-zag/);
    const dashed = {
      ...shapeLayer,
      shapes: [
        { ty: 'el', p: { k: [50, 50] }, s: { k: [40, 40] } },
        { ty: 'st', c: { k: [1, 0, 0] }, o: { k: 100 }, w: { k: 2 }, d: [{ n: 'd', v: { k: 4 } }] },
      ],
    };
    expect(() => importLottie(doc([dashed]))).toThrow(/stroke dashes/);
  });

  it('[major] el direction d:3 reverses winding so nonzero merges keep holes', () => {
    const donut = {
      ty: 4,
      ind: 1,
      nm: 'donut',
      ip: 0,
      op: 60,
      ks: {},
      shapes: [
        { ty: 'el', p: { k: [50, 50] }, s: { k: [80, 80] } },
        { ty: 'el', p: { k: [50, 50] }, s: { k: [40, 40] }, d: 3 },
        { ty: 'mm', mm: 1 },
        { ty: 'fl', c: { k: [1, 0, 0] }, o: { k: 100 } },
      ],
    };
    const r = importLottie(doc([donut]));
    const findPath = (nodes: NodeSpec[]): Extract<NodeSpec, { kind: 'path' }> | null => {
      for (const n of nodes) {
        if (n.kind === 'path') return n;
        if (n.kind === 'group') {
          const inner = findPath(n.children);
          if (inner) return inner;
        }
      }
      return null;
    };
    const path = findPath(r.nodes)!;
    expect(path.data.length).toBe(2); // merged multi-contour
    // winding via shoelace signed area over the anchors: the reversed inner
    // contour must wind opposite to the outer, or the nonzero fill loses the hole
    const signedArea = (c: { v: [number, number][] }) => {
      let a = 0;
      for (let i = 0; i < c.v.length; i++) {
        const p0 = c.v[i]!;
        const p1 = c.v[(i + 1) % c.v.length]!;
        a += p0[0] * p1[1] - p1[0] * p0[1];
      }
      return a;
    };
    const outer = signedArea(path.data[0]! as never);
    const inner = signedArea(path.data[1]! as never);
    expect(outer * inner).toBeLessThan(0); // opposite windings
    // sanity: reverseContour is an involution
    expect(reverseContour(reverseContour(path.data[1]!))).toEqual(path.data[1]!);
  });

  it('[minor] a layer that ends before the document starts never flashes', () => {
    const r = importLottie(doc([solidLayer(1, { ip: -30, op: -10 })], { ip: 0 }));
    const wrapper = findGroup(r.nodes, (g) => g.id.endsWith('__v'))!;
    expect(wrapper.opacity).toBe(0); // statically invisible
    const visTrack = r.timeline.tracks.find((t) => t.target === `${wrapper.id}/opacity`);
    expect(visTrack).toBeUndefined(); // no 1ms-nudged key to flash at t=0
  });

  it('[minor] differing eases on co-keyed el params warn instead of silently diverging', () => {
    const eased = {
      ty: 4,
      ind: 1,
      nm: 'eased',
      ip: 0,
      op: 60,
      ks: {},
      shapes: [
        {
          ty: 'el',
          p: { k: [{ t: 0, s: [10, 10], o: { x: 0.1, y: 0 }, i: { x: 0.9, y: 1 } }, { t: 30, s: [50, 50] }] },
          s: { k: [{ t: 0, s: [40, 40], o: { x: 0.7, y: 0 }, i: { x: 0.3, y: 1 } }, { t: 30, s: [80, 80] }] },
        },
        { ty: 'fl', c: { k: [1, 0, 0] }, o: { k: 100 } },
      ],
    };
    const r = importLottie(doc([eased]));
    expect(r.warnings.some((w) => w.includes('differing eases'))).toBe(true);
  });
});
