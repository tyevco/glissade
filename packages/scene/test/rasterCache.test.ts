/**
 * §3.5 cross-frame subtree raster cache — the IR contract and the LRU walk.
 *
 * Two halves:
 *  (1) emission — `cache:true` FORCES a cacheKey-stamped group even on an
 *      otherwise-ungrouped static subtree, and the key is a pure function of the
 *      draw slice (stable across times, distinct on content change). Without
 *      `cache:true`, NOTHING changes — the byte-identity guarantee for every
 *      pre-existing scene.
 *  (2) interpretation — the bitmap LRU HITs on a repeat (cacheKey + device
 *      transform), skipping the slice rasterization, and MISSES when the device
 *      transform differs (so a stale-CTM bitmap can never blit). A recording
 *      host counts fills (slice rasterization) and composites (blits).
 */

import { describe, expect, it } from 'vitest';
import {
  createDisplayListBuilder,
  evaluate,
  createScene,
  Group,
  Rect,
  Raster2D,
  type Ctx2DLike,
  type DisplayList,
  type DrawCommand,
  type EvalContext,
  type PathLike,
} from '../src/index.js';
import { timeline } from '@glissade/core';

const ctx: EvalContext = { time: 0, frame: -1, measurer: { measureText: () => ({ width: 0, ascent: 0, descent: 0 }) } };

function emit(node: Group): DisplayList {
  const out = createDisplayListBuilder({ w: 100, h: 100 });
  node.emit(out, ctx);
  return out.finish();
}

describe('§3.5 emission: cache:true forces a cacheKey-stamped group', () => {
  it('a static opacity-1 / source-over group with cache:true emits one keyed pushGroup', () => {
    const g = new Group({ cache: true, children: [new Rect({ width: 20, height: 20, fill: '#f00' })] });
    const dl = emit(g);
    const groups = dl.commands.filter((c) => c.op === 'pushGroup');
    expect(groups).toHaveLength(1);
    expect((groups[0] as { cacheKey?: string }).cacheKey).toBeTypeOf('string');
  });

  it('the SAME group WITHOUT cache:true emits no group at all (byte-identity guarantee)', () => {
    const g = new Group({ children: [new Rect({ width: 20, height: 20, fill: '#f00' })] });
    const dl = emit(g);
    expect(dl.commands.filter((c) => c.op === 'pushGroup')).toHaveLength(0);
  });

  it('the cacheKey is stable for identical content and changes with the content', () => {
    const a = emit(new Group({ cache: true, children: [new Rect({ width: 20, height: 20, fill: '#f00' })] }));
    const b = emit(new Group({ cache: true, children: [new Rect({ width: 20, height: 20, fill: '#f00' })] }));
    const c = emit(new Group({ cache: true, children: [new Rect({ width: 20, height: 20, fill: '#00f' })] }));
    const key = (dl: DisplayList) =>
      (dl.commands.find((x) => x.op === 'pushGroup') as { cacheKey?: string }).cacheKey;
    expect(key(a)).toBe(key(b));
    expect(key(a)).not.toBe(key(c));
  });

  it('cache:true on a group that ALSO needs a group (opacity<1) still stamps the key', () => {
    const g = new Group({ cache: true, opacity: 0.5, children: [new Rect({ width: 20, height: 20, fill: '#f00' })] });
    const groups = emit(g).commands.filter((c) => c.op === 'pushGroup');
    expect(groups).toHaveLength(1);
    expect((groups[0] as { cacheKey?: string }).cacheKey).toBeTypeOf('string');
    expect((groups[0] as { opacity: number }).opacity).toBe(0.5);
  });

  it('a cache:true scene re-evaluated at the same t is byte-identical (purity)', () => {
    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [new Group({ id: 'g', cache: true, position: [50, 50], children: [new Rect({ width: 30, height: 30, fill: '#0f0' })] })],
    });
    const doc = timeline({ duration: 1, fps: 60, tracks: [] });
    expect(JSON.stringify(evaluate(scene, doc, 0.3))).toBe(JSON.stringify(evaluate(scene, doc, 0.3)));
  });
});

// ── interpreter LRU: a recording host counting fills and composites ──────────

function makeHost() {
  let fills = 0;
  let composites = 0;
  const makeCtx = (): Ctx2DLike<PathLike, unknown> =>
    ({
      save() {}, restore() {}, transform() {}, resetTransform() {}, getTransform: () => ({}),
      setTransform() {}, clearRect() {}, clip() {}, fill() { fills++; }, stroke() {},
      fillText() {}, measureText: (t: string) => ({ width: t.length * 10 }), drawImage() { composites++; },
      setLineDash() {}, lineDashOffset: 0, fillStyle: '', strokeStyle: '', lineWidth: 0,
      lineCap: '', lineJoin: '', font: '', textBaseline: '', textAlign: '', globalAlpha: 1,
      globalCompositeOperation: '', filter: '', imageSmoothingEnabled: true,
    }) as unknown as Ctx2DLike<PathLike, unknown>;
  const newPath = (): PathLike => ({
    moveTo() {}, lineTo() {}, bezierCurveTo() {}, quadraticCurveTo() {}, ellipse() {}, closePath() {},
  });
  return {
    host: { context: () => makeCtx(), createCanvas: (w: number, h: number) => ({ width: w, height: h }), newPath },
    fills: () => fills,
    composites: () => composites,
  };
}

const RECT = { kind: 'path' as const, segs: [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']] as never };
const keyedGroup = (k: string): DrawCommand => ({ op: 'pushGroup', opacity: 1, blend: 'source-over', filters: [], cacheKey: k });
const fill: DrawCommand = { op: 'fillPath', path: 0, paint: { kind: 'color', color: '#fff' } };
const list = (cmds: DrawCommand[]): DisplayList => ({ commands: cmds, resources: [RECT], size: { w: 64, h: 64 } });

describe('§3.5 interpreter: the bitmap LRU', () => {
  it('a repeat (same cacheKey + device transform) HITs — skips the slice fill, still composites', () => {
    const h = makeHost();
    const r = new Raster2D(h.host as never);
    const cmds = [keyedGroup('K'), fill, { op: 'popGroup' } as DrawCommand];
    r.render({ width: 64, height: 64 } as never, list(cmds));
    expect(h.fills()).toBe(1); // miss rasterized the slice
    r.render({ width: 64, height: 64 } as never, list(cmds));
    expect(h.fills()).toBe(1); // HIT — no second fill
    expect(h.composites()).toBe(2); // both frames blitted the bitmap
  });

  it('a different inherited transform MISSES (no stale-CTM blit)', () => {
    const h = makeHost();
    const r = new Raster2D(h.host as never);
    r.render({ width: 64, height: 64 } as never, list([keyedGroup('K'), fill, { op: 'popGroup' } as DrawCommand]));
    r.render(
      { width: 64, height: 64 } as never,
      list([
        { op: 'save' } as DrawCommand,
        { op: 'transform', m: [1, 0, 0, 1, 5, 0] } as DrawCommand,
        keyedGroup('K'),
        fill,
        { op: 'popGroup' } as DrawCommand,
        { op: 'restore' } as DrawCommand,
      ]),
    );
    expect(h.fills()).toBe(2); // both missed → both rasterized
  });

  it('disabling the cache makes every render a MISS (pure-perf-layer escape hatch)', () => {
    const h = makeHost();
    const r = new Raster2D(h.host as never, 'warn', false);
    const cmds = [keyedGroup('K'), fill, { op: 'popGroup' } as DrawCommand];
    r.render({ width: 64, height: 64 } as never, list(cmds));
    r.render({ width: 64, height: 64 } as never, list(cmds));
    expect(h.fills()).toBe(2);
  });

  it('a HIT fast-forwards past nested groups (balanced push/pop depth)', () => {
    const h = makeHost();
    const r = new Raster2D(h.host as never);
    // outer cached group containing an inner (uncached) group + extra fill
    const nested = [
      keyedGroup('OUTER'),
      fill,
      { op: 'pushGroup', opacity: 0.5, blend: 'source-over', filters: [] } as DrawCommand,
      fill,
      { op: 'popGroup' } as DrawCommand,
      fill,
      { op: 'popGroup' } as DrawCommand,
    ];
    r.render({ width: 64, height: 64 } as never, list(nested));
    const fillsCold = h.fills(); // 3 fills rasterized on the miss
    r.render({ width: 64, height: 64 } as never, list(nested));
    expect(h.fills()).toBe(fillsCold); // HIT skipped ALL three — fast-forward held the nesting balance
  });
});
