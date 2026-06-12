import { describe, expect, it } from 'vitest';
import type { Key, Vec2 } from '@glissade/core';
import { importLottie, type GroupSpec } from '../src/index.js';
import { doc, findGroup, findPaths, redFill, shapeLayer, triangleSh, walk } from './helpers.js';

describe('structural mapping', () => {
  it('builds the anchor sandwich: outer carries p/r/s, inner child offset by −a', () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      p: { k: [100, 50] },
      r: { k: 30 },
      s: { k: [200, 200] },
      a: { k: [10, 20] },
    });
    const result = importLottie(doc([layer]));
    const outer = result.nodes[0] as GroupSpec;
    expect(outer.kind).toBe('group');
    expect(outer.position).toEqual([100, 50]);
    expect(outer.rotation).toBe(30);
    expect(outer.scale).toEqual([2, 2]);
    const inner = outer.children[0] as GroupSpec;
    expect(inner.kind).toBe('group');
    expect(inner.position).toEqual([-10, -20]);
    expect(findPaths(inner.children)).toHaveLength(1); // content nests under the anchor
  });

  it('an animated anchor becomes a NEGATED position track on the inner group (exact: negation commutes with lerp)', () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      a: {
        a: 1,
        k: [
          { t: 0, s: [10, 20] },
          { t: 25, s: [30, 40] },
        ],
      },
    });
    const result = importLottie(doc([layer]));
    const tr = result.timeline.tracks.find((t) => t.target === 'L__a/position');
    expect(tr).toBeDefined();
    const keys = tr!.keys as Key<Vec2>[];
    expect(keys[0]!.value).toEqual([-10, -20]);
    expect(keys[1]!.value).toEqual([-30, -40]);
  });

  it('a zero static anchor skips the inner group', () => {
    const layer = shapeLayer([triangleSh(), redFill], { a: { k: [0, 0] }, p: { k: [5, 5] } });
    const result = importLottie(doc([layer]));
    const outer = result.nodes[0] as GroupSpec;
    const ids: string[] = [];
    walk([outer], (n) => ids.push(n.id));
    expect(ids.some((id) => id.includes('__a'))).toBe(false);
  });

  it('nests parented layers into the parent anchor group, with opacity on a content sibling', () => {
    const parent = shapeLayer([triangleSh(), redFill], { a: { k: [10, 10] }, o: { k: 50 } }, { ind: 1, nm: 'parent' });
    const child = shapeLayer([triangleSh(), redFill], {}, { ind: 0, nm: 'child', parent: 1 });
    const result = importLottie(doc([child, parent]));
    expect(result.nodes).toHaveLength(1); // child nests under the parent
    const anchor = findGroup(result.nodes, 'parent__a')!;
    const childIds = anchor.children.map((c) => c.id);
    expect(childIds).toContain('child');
    // the parent's 50% opacity lives on its OWN content group, so the child
    // layer never inherits it (Lottie parenting is transform-only)
    const content = findGroup(result.nodes, 'parent__c')!;
    expect(content.opacity).toBeCloseTo(0.5);
    const childOuter = findGroup(result.nodes, 'child')!;
    expect(childOuter.opacity).toBeUndefined();
  });

  it('maps Lottie top-layer-first stacking to zIndex = −ind', () => {
    const top = shapeLayer([triangleSh(), redFill], {}, { ind: 0, nm: 'top' });
    const bottom = shapeLayer([triangleSh(), redFill], {}, { ind: 1, nm: 'bottom' });
    const result = importLottie(doc([top, bottom]));
    expect(findGroup(result.nodes, 'top')!.zIndex).toBe(-0);
    expect(findGroup(result.nodes, 'bottom')!.zIndex).toBe(-1);
  });

  it('ip/op crops become a wrapper with hold opacity keys', () => {
    const layer = shapeLayer([triangleSh(), redFill], {}, { ip: 10, op: 40 });
    const result = importLottie(doc([layer]));
    const tr = result.timeline.tracks.find((t) => t.target === 'L__v/opacity');
    expect(tr).toBeDefined();
    const keys = tr!.keys as Key<number>[];
    expect(keys.map((k) => [k.t, k.value])).toEqual([
      [0, 0],
      [10 / 25, 1],
      [40 / 25, 0],
    ]);
    expect(keys[1]!.interp).toBe('hold');
    expect(keys[2]!.interp).toBe('hold');
    const vis = findGroup(result.nodes, 'L__v')!;
    expect(vis.opacity).toBe(0); // not yet visible at t = 0
  });

  it('solid layers become a centered Rect covering [0,0]–[sw,sh]', () => {
    const solid = { ty: 1, nm: 'bg', ind: 0, ip: 0, op: 50, st: 0, ks: {}, sw: 100, sh: 80, sc: '#ffeee6' };
    const result = importLottie(doc([solid]));
    let rect: { width: number; height: number; fill?: string; position?: Vec2 } | undefined;
    walk(result.nodes, (n) => {
      if (n.kind === 'rect') rect = n;
    });
    expect(rect).toBeDefined();
    expect(rect!.width).toBe(100);
    expect(rect!.height).toBe(80);
    expect(rect!.fill).toBe('#ffeee6');
    expect(rect!.position).toEqual([50, 40]);
  });

  it('image layers register the asset manifest entry and offset the centered ImageNode', () => {
    const layer = { ty: 2, nm: 'img', ind: 0, ip: 0, op: 50, st: 0, ks: {}, refId: 'blep' };
    const result = importLottie(doc([layer], { assets: [{ id: 'blep', w: 512, h: 256, p: 'blep.png', u: 'images/' }] }));
    expect(result.timeline.assets).toEqual({ blep: { kind: 'image', url: 'images/blep.png' } });
    let img: { assetId: string; width: number; height: number; position?: Vec2 } | undefined;
    walk(result.nodes, (n) => {
      if (n.kind === 'image') img = n;
    });
    expect(img!.assetId).toBe('blep');
    expect(img!.position).toEqual([256, 128]);
  });

  it('split position {s:true} maps to component position tracks', () => {
    const layer = shapeLayer([triangleSh(), redFill], {
      p: {
        s: true,
        x: { a: 1, k: [{ t: 0, s: [0] }, { t: 25, s: [50] }] },
        y: { k: 7 },
      } as never,
    });
    const result = importLottie(doc([layer]));
    const px = result.timeline.tracks.find((t) => t.target === 'L/position.x');
    expect(px).toBeDefined();
    expect((px!.keys[1] as Key<number>).value).toBe(50);
    const outer = findGroup(result.nodes, 'L')!;
    expect(outer.position).toEqual([0, 7]);
  });
});
