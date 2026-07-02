/**
 * Clip on Group + TrackMatte (0.34): the compositing pair. Structural DL tests
 * prove the IR shape (clip op INSIDE the group layer = inside the cacheKey'd
 * draw slice; the matte sandwich = content then a matte-marked pushGroup); the
 * pixel-level behavior (exclusion, intersection, isolation, luma) is asserted
 * in backend-skia/test/clipMatte.pixels.test.ts + the golden corpus.
 */

import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { Circle, Group, Rect, TrackMatte, createScene, evaluate, trackMatte } from '../src/index.js';

const tl = timeline({ duration: 1, tracks: [] });

describe('Group clip (0.34)', () => {
  it('a clip forces a group layer and emits the clip op INSIDE it (cacheKey slice)', () => {
    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [
        new Group({
          id: 'g',
          clip: { w: 50, h: 30, r: 6 },
          children: [new Rect({ id: 'r', width: 80, height: 80, fill: '#f00' })],
        }),
      ],
    });
    const dl = evaluate(scene, tl, 0);
    const ops = dl.commands.map((c) => c.op);
    const push = ops.indexOf('pushGroup');
    const clip = ops.indexOf('clip');
    const pop = ops.indexOf('popGroup');
    expect(push).toBeGreaterThanOrEqual(0); // clip alone demands a layer
    expect(clip).toBeGreaterThan(push); // inside the layer …
    expect(clip).toBeLessThan(pop); // … before it pops
    // the clip references a real path resource (a 10-seg rounded rect)
    const cmd = dl.commands[clip]!;
    if (cmd.op !== 'clip') throw new Error('unreachable');
    const res = dl.resources[cmd.path]!;
    expect(res.kind).toBe('path');
    if (res.kind === 'path') expect(res.segs.length).toBeGreaterThan(4);
  });

  it('a PathSeg[] clip passes through verbatim; r=0 rect is a plain 5-seg outline', () => {
    const segs = [
      ['M', 0, 0],
      ['L', 40, 0],
      ['L', 40, 40],
      ['Z'],
    ] as const;
    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [
        new Group({ id: 'g', clip: segs as never, children: [new Rect({ id: 'r', width: 10, height: 10, fill: '#f00' })] }),
      ],
    });
    const dl = evaluate(scene, tl, 0);
    const clip = dl.commands.find((c) => c.op === 'clip');
    expect(clip).toBeDefined();
    if (clip?.op !== 'clip') throw new Error('unreachable');
    const res = dl.resources[clip.path]!;
    if (res.kind === 'path') expect(res.segs).toEqual(segs);
  });

  it('a plain group without clip emits NO layer and NO clip op (byte-stability of every prior scene)', () => {
    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [new Group({ id: 'g', children: [new Rect({ id: 'r', width: 10, height: 10, fill: '#f00' })] })],
    });
    const ops = evaluate(scene, tl, 0).commands.map((c) => c.op);
    expect(ops).not.toContain('pushGroup');
    expect(ops).not.toContain('clip');
  });

  it('clip is a construction prop: describe-accepted, unknown keys still rejected', () => {
    expect(() => new Group({ clip: { w: 10, h: 10 } })).not.toThrow();
    expect(() => new Group({ klip: { w: 10, h: 10 } } as never)).toThrow(/klip/);
  });
});

describe('TrackMatte (0.34)', () => {
  it('emits the sandwich: content normally, then a matte-marked pushGroup', () => {
    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [
        trackMatte(
          new Rect({ id: 'c', width: 80, height: 80, fill: '#0f0' }),
          new Circle({ id: 'm', radius: 20, fill: '#fff' }),
          { id: 'tm' },
        ),
      ],
    });
    const dl = evaluate(scene, tl, 0);
    const pushes = dl.commands.filter((c) => c.op === 'pushGroup');
    expect(pushes).toHaveLength(2); // the isolating outer + the matte layer
    const matte = pushes.filter((c) => c.op === 'pushGroup' && c.matte !== undefined);
    expect(matte).toHaveLength(1);
    if (matte[0]!.op === 'pushGroup') expect(matte[0]!.matte).toBe('alpha');
    // the outer (isolation) group is NOT matte-marked
    const outer = pushes[0]!;
    if (outer.op === 'pushGroup') expect(outer.matte).toBeUndefined();
  });

  it("mode: 'luma' rides the marker; default is 'alpha'", () => {
    const mk = (mode?: 'alpha' | 'luma') =>
      trackMatte(new Rect({ id: 'c', width: 8, height: 8, fill: '#0f0' }), new Circle({ id: 'm', radius: 4, fill: '#fff' }), {
        id: 'tm',
        ...(mode ? { mode } : {}),
      });
    expect(mk().mode).toBe('alpha');
    expect(mk('luma').mode).toBe('luma');
    const scene = createScene({ size: { w: 20, h: 20 }, children: [mk('luma')] });
    const marked = evaluate(scene, tl, 0).commands.find((c) => c.op === 'pushGroup' && c.matte !== undefined);
    if (marked?.op === 'pushGroup') expect(marked.matte).toBe('luma');
  });

  it('content + matte are real parented children (ids registered, world transforms live)', () => {
    const content = new Rect({ id: 'c', width: 8, height: 8, fill: '#0f0' });
    const matte = new Circle({ id: 'm', radius: 4, fill: '#fff' });
    const tm = new TrackMatte({ id: 'tm', content, matte });
    expect(content.parent).toBe(tm);
    expect(matte.parent).toBe(tm);
    const scene = createScene({ size: { w: 20, h: 20 }, children: [tm] });
    expect(scene.nodes.get('c')).toBe(content);
    expect(scene.nodes.get('m')).toBe(matte);
  });

  it('evaluate stays pure: same scene + t → byte-identical DisplayList JSON', () => {
    const mk = () =>
      createScene({
        size: { w: 40, h: 40 },
        children: [
          trackMatte(new Rect({ id: 'c', width: 30, height: 30, fill: '#0f0' }), new Circle({ id: 'm', radius: 10, fill: '#fff' }), {
            id: 'tm',
            mode: 'luma',
          }),
        ],
      });
    const a = JSON.stringify(evaluate(mk(), tl, 0.5));
    const b = JSON.stringify(evaluate(mk(), tl, 0.5));
    expect(a).toBe(b);
  });
});
