/**
 * Hand-drawn sketch styles: the flatten/roughen geometry, validation, and the
 * Shape.draw integration (multi-pass roughened strokes, deterministic).
 */

import { describe, expect, it } from 'vitest';
import { random } from '@glissade/core';
import {
  arcLength,
  flatten,
  resolveSketch,
  roughen,
  SketchValidationError,
  validateSketch,
} from '../src/sketch.js';
import { Rect } from '../src/nodes.js';
import { estimatingMeasurer } from '../src/text.js';
import type { PathSeg } from '../src/displayList.js';
import type { DisplayListBuilder } from '../src/displayList.js';
import type { EvalContext, Node } from '../src/node.js';

describe('flatten', () => {
  it('passes M/L through as polyline points', () => {
    const poly = flatten([['M', 0, 0], ['L', 10, 0], ['L', 10, 10]]);
    expect(poly).toHaveLength(1);
    expect(poly[0]!.points).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(poly[0]!.closed).toBe(false);
  });

  it('samples a cubic into `steps` points and Z closes the loop', () => {
    const poly = flatten([['M', 0, 0], ['C', 0, 10, 10, 10, 10, 0], ['Z']], 8);
    expect(poly[0]!.points.length).toBe(1 + 8 + 1); // start + 8 samples + close
    expect(poly[0]!.closed).toBe(true);
    expect(poly[0]!.points[poly[0]!.points.length - 1]).toEqual([0, 0]); // closed back to start
  });

  it('samples an E ellipse arc (Circle / rounded-rect corners)', () => {
    // a full circle of radius 10 centered at origin
    const poly = flatten([['M', 10, 0], ['E', 0, 0, 10, 10, 0, 0, Math.PI * 2], ['Z']], 16);
    for (const [x, y] of poly[0]!.points) expect(Math.hypot(x, y)).toBeCloseTo(10, 6); // all on the circle
  });
});

describe('arcLength', () => {
  it('sums the polyline segment lengths', () => {
    expect(arcLength({ points: [[0, 0], [3, 0], [3, 4]], closed: false })).toBeCloseTo(7, 6); // 3 + 4
  });
});

describe('roughen', () => {
  const line: PathSeg[] = [['M', 0, 0], ['L', 10, 0]];

  it('roughness 0 follows the path exactly (a straight Q through the midpoint)', () => {
    const { strokes } = roughen(line, { kind: 'ink', roughness: 0 }, random(1));
    expect(strokes).toHaveLength(1); // ink = 1 pass
    expect(strokes[0]).toEqual([['M', 0, 0], ['Q', 5, 0, 10, 0]]);
  });

  it('is byte-deterministic for the same segs + style + seed', () => {
    const a = roughen(line, { kind: 'crayon' }, random(7));
    const b = roughen(line, { kind: 'crayon' }, random(7));
    expect(a.strokes).toEqual(b.strokes);
  });

  it('emits one stroke pass per the kind/passes default', () => {
    expect(roughen(line, { kind: 'marker' }, random(1)).strokes).toHaveLength(2);
    expect(roughen(line, { kind: 'crayon', passes: 4 }, random(1)).strokes).toHaveLength(4);
    expect(roughen(line, { kind: 'ink' }, random(1)).strokes).toHaveLength(1);
  });

  it('resolveSketch carries per-kind character (chalk dashes)', () => {
    expect(resolveSketch({ kind: 'chalk' }).dash).toEqual([6, 5]);
    expect(resolveSketch({ kind: 'pencil' }).passes).toBe(2);
  });
});

describe('validateSketch', () => {
  it('rejects unknown kinds and out-of-range params', () => {
    expect(() => validateSketch({ kind: 'glitter' } as never)).toThrow(SketchValidationError);
    expect(() => validateSketch({ kind: 'marker', width: 0 })).toThrow(/width must be > 0/);
    expect(() => validateSketch({ kind: 'ink', roughness: -1 })).toThrow(/roughness/);
    expect(() => validateSketch({ kind: 'crayon', passes: 0 })).toThrow(/passes/);
  });
  it('accepts valid styles', () => {
    expect(() => validateSketch({ kind: 'marker', width: 8, roughness: 1 })).not.toThrow();
  });
});

function emit(node: Node): { op: string; [k: string]: unknown }[] {
  const cmds: { op: string }[] = [];
  const out = {
    push: (c: unknown) => cmds.push(c as never),
    resource: (r: { kind: string }) => cmds.push({ op: '_res', ...(r as object) } as never) - 1 + cmds.length,
  } as unknown as DisplayListBuilder;
  const ctx: EvalContext = { time: 0, frame: -1, measurer: estimatingMeasurer };
  node.emit(out, ctx);
  return cmds as { op: string }[];
}
const strokes = (c: { op: string }[]) => c.filter((x) => x.op === 'strokePath');
const fills = (c: { op: string }[]) => c.filter((x) => x.op === 'fillPath');

describe('Shape.draw with sketch', () => {
  it('emits one roughened stroke pass per pass; no fill when unset', () => {
    const r = new Rect({ id: 'r', width: 80, height: 50, sketch: { kind: 'marker' } });
    const c = emit(r);
    expect(strokes(c)).toHaveLength(2); // marker = 2 passes
    expect(fills(c)).toHaveLength(0); // no fill set
    expect((strokes(c)[0] as unknown as { stroke: { width: number } }).stroke.width).toBe(8); // marker default width
  });

  it('a fill renders solid UNDER the rough strokes', () => {
    const r = new Rect({ id: 'r', width: 80, height: 50, fill: '#e33', sketch: { kind: 'pencil' } });
    const c = emit(r);
    expect(fills(c)).toHaveLength(1);
    expect(strokes(c)).toHaveLength(2); // pencil default passes
  });

  it('is deterministic across draws (seed reused, not a shared stream)', () => {
    const r = new Rect({ id: 'box', width: 80, height: 50, sketch: { kind: 'crayon' } });
    expect(emit(r)).toEqual(emit(r));
  });

  it('a shape without sketch is unchanged (single path, normal fill/stroke)', () => {
    const r = new Rect({ id: 'r', width: 80, height: 50, fill: '#fff', stroke: '#000', strokeWidth: 2 });
    const c = emit(r);
    expect(fills(c)).toHaveLength(1);
    expect(strokes(c)).toHaveLength(1);
  });
});
