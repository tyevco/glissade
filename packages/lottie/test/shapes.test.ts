import { describe, expect, it } from 'vitest';
import { getValueType, type Key, type PathValue, type Vec2 } from '@glissade/core';
import { colorPropIsBytes, ellipseContour, importLottie, lottieColor } from '../src/index.js';
import { doc, findPaths, redFill, shapeLayer, triangleSh } from './helpers.js';

describe('shape-layer denormalization', () => {
  it('style × geometry: one Path node per fill/stroke applied to the geometry above it', () => {
    const layer = shapeLayer([
      triangleSh(1),
      triangleSh(2),
      { ty: 'st', c: { k: [0, 0, 1, 1] }, o: { k: 100 }, w: { k: 2 } },
      redFill,
    ]);
    const result = importLottie(doc([layer]));
    const paths = findPaths(result.nodes);
    expect(paths).toHaveLength(4); // 2 styles × 2 geometries
    expect(paths.filter((p) => p.stroke !== undefined)).toHaveLength(2);
    expect(paths.filter((p) => p.fill !== undefined)).toHaveLength(2);
    // st is earlier in the array → paints ON TOP → must come later in children
    const fillIdx = paths.findIndex((p) => p.fill !== undefined);
    const strokeIdx = paths.findIndex((p) => p.stroke !== undefined);
    expect(strokeIdx).toBeGreaterThan(fillIdx);
  });

  it('animated sh.ks becomes an explicit path track, duplicated per style node', () => {
    const sh = {
      ty: 'sh',
      ks: {
        a: 1,
        k: [
          { t: 0, s: [{ v: [[0, 0], [10, 0], [10, 10]], i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], c: true }] },
          { t: 25, s: [{ v: [[0, 0], [20, 0], [20, 20]], i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], c: true }] },
        ],
      },
    };
    const layer = shapeLayer([
      sh,
      { ty: 'st', c: { k: [0, 0, 1, 1] }, o: { k: 100 }, w: { k: 2 } },
      redFill,
    ]);
    const result = importLottie(doc([layer]));
    const pathTracks = result.timeline.tracks.filter((t) => t.type === 'path');
    expect(pathTracks).toHaveLength(2); // duplicated per node, never shared
    for (const tr of pathTracks) {
      expect(tr.target.endsWith('/d')).toBe(true);
      const last = tr.keys[1] as Key<PathValue>;
      expect(last.value[0]!.v[1]).toEqual([20, 0]);
    }
  });

  it('el conversion is exact under animation: kappa is linear in size, so lerp commutes', () => {
    const center: Vec2 = [5, 5];
    const s0: Vec2 = [10, 20];
    const s1: Vec2 = [30, 60];
    const layer = shapeLayer([
      {
        ty: 'el',
        p: { k: center as unknown as number[] },
        s: { a: 1, k: [{ t: 0, s: s0 }, { t: 25, s: s1 }] },
      },
      redFill,
    ]);
    const result = importLottie(doc([layer]));
    const tr = result.timeline.tracks.find((t) => t.type === 'path')!;
    const keys = tr.keys as Key<PathValue>[];
    expect(keys).toHaveLength(2);
    const lerped = getValueType<PathValue>('path').lerp(keys[0]!.value, keys[1]!.value, 0.5);
    const direct: PathValue = [ellipseContour(center, [20, 40])]; // size lerped first
    expect(lerped).toHaveLength(direct.length);
    for (const part of ['v', 'in', 'out'] as const) {
      lerped[0]![part].forEach((pt, i) => {
        expect(pt[0]).toBeCloseTo(direct[0]![part][i]![0], 12);
        expect(pt[1]).toBeCloseTo(direct[0]![part][i]![1], 12);
      });
    }
  });

  it('mm mode 1 concatenates contours into one multi-contour Path', () => {
    const layer = shapeLayer([
      triangleSh(1),
      triangleSh(2),
      { ty: 'mm', mm: 1 },
      redFill,
    ]);
    const result = importLottie(doc([layer]));
    const paths = findPaths(result.nodes);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.data).toHaveLength(2); // both contours in one PathValue
    expect(paths[0]!.data[1]!.v[1]).toEqual([20, 0]);
  });

  it('group transforms become nested Groups (with their own anchor sandwich)', () => {
    const layer = shapeLayer([
      {
        ty: 'gr',
        nm: 'g1',
        it: [
          triangleSh(),
          redFill,
          { ty: 'tr', p: { k: [3, 4] }, a: { k: [1, 2] }, s: { k: [100, 100] }, r: { k: 0 }, o: { k: 100 } },
        ],
      },
    ]);
    const result = importLottie(doc([layer]));
    let gr: { position?: Vec2; children?: unknown[] } | undefined;
    const visit = (nodes: ReturnType<typeof importLottie>['nodes']): void => {
      for (const n of nodes) {
        if (n.kind === 'group' && n.id.includes('g1') && !n.id.includes('__a')) gr = n;
        if (n.kind === 'group') visit(n.children);
      }
    };
    visit(result.nodes);
    expect(gr).toBeDefined();
    expect(gr!.position).toEqual([3, 4]);
    const inner = (gr!.children as { id: string; position?: Vec2 }[])[0]!;
    expect(inner.position).toEqual([-1, -2]); // anchor sandwich inside the shape group
  });

  it('converts colors from both 0–1 floats and 0–255 byte arrays', () => {
    expect(lottieColor([1, 0, 0, 1], false)).toBe('#ff0000');
    expect(lottieColor([255, 238, 230, 255], true)).toBe('#ffeee6');
    expect(lottieColor([0.5, 0.5, 0.5], false)).toBe('#808080');
    // format is per PROP, never per key: [1,1,1] inside a byte-format track
    // is near-black rgb(1,1,1), not white
    const byteTrack = [[255, 128, 0], [1, 1, 1]];
    expect(colorPropIsBytes(byteTrack)).toBe(true);
    expect(lottieColor([1, 1, 1], colorPropIsBytes(byteTrack))).toBe('#010101');
    expect(colorPropIsBytes([[1, 1, 1], [0.5, 0, 0]])).toBe(false);
  });

  it('style opacity maps to node opacity (static and animated)', () => {
    const layer = shapeLayer([
      triangleSh(),
      { ty: 'fl', c: { k: [1, 0, 0, 1] }, o: { a: 1, k: [{ t: 0, s: [100] }, { t: 25, s: [0] }] } },
    ]);
    const result = importLottie(doc([layer]));
    const path = findPaths(result.nodes)[0]!;
    const tr = result.timeline.tracks.find((t) => t.target === `${path.id}/opacity`)!;
    expect((tr.keys[0] as Key<number>).value).toBe(1);
    expect((tr.keys[1] as Key<number>).value).toBe(0);
  });
});
