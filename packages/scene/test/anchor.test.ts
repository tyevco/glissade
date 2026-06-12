/**
 * Anchors (placement + pivot), measured text, and the marker highlight.
 * The contract under test: NO anchor → the legacy origin, byte-stable
 * (goldens prove the pixels); an explicit anchor pins `position` to that
 * fraction of the intrinsic box AND pivots rotation/scale there.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { setDevWarning } from '@glissade/core';
import { applyToPoint, fromTRS, matEquals } from '../src/matrix.js';
import { Group, Rect, Text, type LineBox } from '../src/nodes.js';
import { createScene } from '../src/scene.js';
import { highlight, Highlight } from '../src/highlight.js';
import { estimatingMeasurer, setDefaultMeasurer } from '../src/text.js';
import type { DisplayListBuilder } from '../src/displayList.js';
import type { EvalContext } from '../src/node.js';

afterEach(() => setDevWarning(() => {}));

describe('anchor: placement', () => {
  it('no anchor → localMatrix is exactly TRS (the legacy origin)', () => {
    const r = new Rect({ position: [100, 50], rotation: 30, width: 40, height: 20 });
    expect(matEquals(r.localMatrix(), fromTRS([100, 50], 30, [1, 1]))).toBe(true);
  });

  it("anchor 'left' pins position to the left edge — width grows rightward", () => {
    const r = new Rect({ anchor: 'left', position: [100, 50], width: 40, height: 20 });
    // geometry left-center (−w/2, 0) lands ON position
    expect(applyToPoint(r.localMatrix(), [-20, 0])).toEqual([100, 50]);
    r.width.set(80);
    expect(applyToPoint(r.localMatrix(), [-40, 0])).toEqual([100, 50]); // edge stays pinned
    expect(applyToPoint(r.localMatrix(), [40, 0])).toEqual([180, 50]); // growth went rightward
  });

  it('fractional pairs work; [0,1] pins the bottom-left (bars grow upward)', () => {
    const r = new Rect({ anchor: [0, 1], position: [10, 200], width: 30, height: 50 });
    expect(applyToPoint(r.localMatrix(), [-15, 25])).toEqual([10, 200]);
    r.height.set(100);
    expect(applyToPoint(r.localMatrix(), [-15, 50])).toEqual([10, 200]);
  });

  it("explicit anchor 'center' on a shape is a no-op (identical to legacy)", () => {
    const a = new Rect({ anchor: 'center', position: [5, 5], width: 40, height: 20 });
    const b = new Rect({ position: [5, 5], width: 40, height: 20 });
    expect(matEquals(a.localMatrix(), b.localMatrix())).toBe(true);
  });

  it('unknown preset throws', () => {
    expect(() => new Rect({ anchor: 'middle' as never })).toThrow(/unknown anchor 'middle'/);
  });
});

describe('anchor: pivot', () => {
  it('rotation pivots around the anchor point, not the center', () => {
    const r = new Rect({ anchor: 'left', position: [100, 50], width: 40, height: 20, rotation: 90 });
    // the anchored point is invariant under rotation
    const [x, y] = applyToPoint(r.localMatrix(), [-20, 0]);
    expect(x).toBeCloseTo(100, 9);
    expect(y).toBeCloseTo(50, 9);
    // the right edge swings to directly below (90° clockwise)
    const [ex, ey] = applyToPoint(r.localMatrix(), [20, 0]);
    expect(ex).toBeCloseTo(100, 9);
    expect(ey).toBeCloseTo(90, 9);
  });

  it('scale grows away from the anchor', () => {
    const r = new Rect({ anchor: 'top-left', position: [0, 0], width: 10, height: 10, scale: [2, 2] });
    expect(applyToPoint(r.localMatrix(), [-5, -5])).toEqual([0, 0]); // top-left pinned
    expect(applyToPoint(r.localMatrix(), [5, 5])).toEqual([20, 20]); // box doubled rightward/down
  });
});

describe('anchor: flow + warnings', () => {
  it('flowOffset is −anchor·size; default matches the center legacy', () => {
    const plain = new Rect({ width: 40, height: 20 });
    expect(plain.flowOffset(estimatingMeasurer)).toEqual({ x: -20, y: -10 });
    const tl = new Rect({ anchor: 'top-left', width: 40, height: 20 });
    expect(tl.flowOffset(estimatingMeasurer)).toEqual({ x: 0, y: 0 });
    const br = new Rect({ anchor: 'bottom-right', width: 40, height: 20 });
    expect(br.flowOffset(estimatingMeasurer)).toEqual({ x: -40, y: -20 });
  });

  it('drawOffset stays anchor-independent (hit testing runs post-matrix)', () => {
    const tl = new Rect({ anchor: 'top-left', width: 40, height: 20 });
    expect(tl.drawOffset(estimatingMeasurer)).toEqual({ x: -20, y: -10 });
  });

  it("anchored Text pins to its wrapped box (anchor 'top-left' → position is the box corner)", () => {
    const t = new Text({ anchor: 'top-left', text: 'hello', fontSize: 10, position: [30, 40] });
    // estimating: w = 5·10·0.52 = 26, ascent 8 → draw origin (baseline-left)
    // sits ascent below the box top: box corner must land on position
    expect(t.flowOffset(estimatingMeasurer)).toEqual({ x: 0, y: 0 });
    expect(applyToPoint(t.localMatrix(), [0, -8])).toEqual([30, 40]);
  });

  it('anchor on a boxless node (Group) warns once and is ignored', () => {
    const warnings: string[] = [];
    setDevWarning((msg) => warnings.push(msg));
    const g = new Group({ anchor: 'top-left', position: [10, 10] });
    g.localMatrix();
    g.localMatrix();
    expect(matEquals(g.localMatrix(), fromTRS([10, 10], 0, [1, 1]))).toBe(true);
    expect(warnings.filter((w) => w.includes('anchor'))).toHaveLength(1);
  });
});

describe('Text.measuredSize / lineBoxes', () => {
  it('measuredSize matches the flow numbers, no hand math', () => {
    const t = new Text({ text: 'hello', fontSize: 10 });
    expect(t.measuredSize(estimatingMeasurer)).toEqual({ w: 26, h: 12.5 });
  });

  it('lineBoxes: one ink box per line, baseline-relative, align-aware', () => {
    const t = new Text({ text: 'ab\ncd', fontSize: 10, align: 'center' });
    const boxes = t.lineBoxes(estimatingMeasurer);
    expect(boxes).toHaveLength(2);
    // estimating: w = 2·10·0.52 = 10.4 → quantized 10.5; ascent 8, descent 2
    expect(boxes[0]).toEqual({ text: 'ab', x: -5.25, y: -8, w: 10.5, h: 10 });
    expect(boxes[1]!.y).toBe(12.5 - 8); // second baseline at one line-step
  });

  it('blank lines produce no box', () => {
    const t = new Text({ text: 'ab\n\ncd', fontSize: 10 });
    const boxes = t.lineBoxes(estimatingMeasurer);
    expect(boxes.map((b) => b.text)).toEqual(['ab', 'cd']);
    expect(boxes[1]!.y).toBe(25 - 8); // line index 2, not 1
  });
});

interface Recorded {
  cmds: unknown[];
  resources: { kind: string; segs?: unknown[] }[];
}

function emitOnce(node: Highlight): Recorded {
  const rec: Recorded = { cmds: [], resources: [] };
  const out = {
    push: (c: unknown) => rec.cmds.push(c),
    resource: (r: { kind: string }) => rec.resources.push(r as never) - 1,
  } as unknown as DisplayListBuilder;
  const ctx: EvalContext = { time: 0, frame: -1, measurer: estimatingMeasurer };
  node.emit(out, ctx);
  return rec;
}

describe('Highlight: the marker sweep', () => {
  const makeText = () => new Text({ text: 'hello\nworld', fontSize: 10, position: [10, 20] });
  const fills = (rec: Recorded) => rec.cmds.filter((c) => (c as { op: string }).op === 'fillPath');

  it('progress 1 covers every line; rects follow the text transform', () => {
    const t = makeText();
    const rec = emitOnce(highlight(t, { padding: [0, 0], cornerRadius: 0 }));
    expect(fills(rec)).toHaveLength(2);
    const transform = rec.cmds.find((c) => (c as { op: string }).op === 'transform') as { m: number[] };
    expect(transform.m).toEqual([1, 0, 0, 1, 10, 20]); // the TEXT's local matrix
  });

  it('progress sweeps in reading order at constant speed (width-weighted)', () => {
    const t = makeText(); // two 26-wide lines, total 52
    const half = emitOnce(highlight(t, { progress: 0.5, padding: [0, 0], cornerRadius: 0 }));
    expect(fills(half)).toHaveLength(1); // exactly line one, fully covered
    const r1 = emitOnce(highlight(t, { progress: 0.75, padding: [0, 0], cornerRadius: 0 }));
    expect(fills(r1)).toHaveLength(2);
    // second line filled to 13 of 26: its rect's right edge sits at x + 13
    const segs = r1.resources[1]!.segs as [string, number, number][];
    expect(segs[1]![1]! - segs[0]![1]!).toBe(13); // M x,y → L x+fill,y
  });

  it('progress 0 draws nothing; progress is a track target', () => {
    const t = makeText();
    const h = highlight(t, { progress: 0 });
    expect(emitOnce(h).cmds).toHaveLength(2); // save/restore only
    expect(h.resolveTarget('progress')).toBeDefined();
    expect(h.resolveTarget('color')).toBeDefined();
  });

  it('padding expands each line box; the sweep covers the padded width', () => {
    const t = new Text({ text: 'hello', fontSize: 10 });
    const rec = emitOnce(highlight(t, { padding: [4, 2], cornerRadius: 0, progress: 1 }));
    const segs = rec.resources[0]!.segs as [string, number, number][];
    expect(segs[1]![1]! - segs[0]![1]!).toBe(26 + 8); // ink 26 + 2·4 overhang
  });

  it('re-flows when the text changes — boxes are pulled per frame', () => {
    const t = makeText();
    const h = highlight(t, { padding: [0, 0], cornerRadius: 0 });
    expect(fills(emitOnce(h))).toHaveLength(2);
    t.text.set('one\ntwo\nsix');
    expect(fills(emitOnce(h))).toHaveLength(3);
  });
});

describe('lineBoxes ↔ highlight integration shape', () => {
  it('a LineBox is the documented shape', () => {
    const box: LineBox = new Text({ text: 'x', fontSize: 10 }).lineBoxes(estimatingMeasurer)[0]!;
    expect(Object.keys(box).sort()).toEqual(['h', 'text', 'w', 'x', 'y']);
  });
});

describe('Text.wordBoxes', () => {
  it('one box per word, positioned by prefix advance; whitespace advances boxlessly', () => {
    const t = new Text({ text: 'ab cd', fontSize: 10 });
    const boxes = t.wordBoxes(estimatingMeasurer);
    // estimating: 5.2/char. 'ab' [0, 10.4); space advances 5.2; 'cd' at 15.6
    expect(boxes.map((b) => b.text)).toEqual(['ab', 'cd']);
    expect(boxes[0]).toEqual({ text: 'ab', line: 0, x: 0, y: -8, w: 10.4, h: 10 });
    expect(boxes[1]!.x).toBeCloseTo(15.6, 9);
    expect(boxes[1]!.w).toBeCloseTo(10.4, 9);
  });

  it('word advances span exactly the line box (the acceptance sum)', () => {
    const t = new Text({ text: 'one two three', fontSize: 10 });
    const line = t.lineBoxes(estimatingMeasurer)[0]!;
    const words = t.wordBoxes(estimatingMeasurer);
    const last = words[words.length - 1]!;
    expect(words[0]!.x).toBe(line.x);
    expect(last.x + last.w).toBeCloseTo(line.x + line.w, 0.5); // within quantization
  });

  it('punctuation glues to its word — the draw segmentation, not naive splitting', () => {
    const t = new Text({ text: 'no replay, ever.', fontSize: 10 });
    expect(t.wordBoxes(estimatingMeasurer).map((b) => b.text)).toEqual(['no', 'replay,', 'ever.']);
  });

  it('wrapped lines carry their line index; align offsets the whole line', () => {
    const t = new Text({ text: 'aaaa bbbb', fontSize: 10, width: 25, align: 'center' });
    const boxes = t.wordBoxes(estimatingMeasurer);
    // 'aaaa bbbb' at 5.2/char exceeds 25 → one word per line
    expect(boxes.map((b) => [b.text, b.line])).toEqual([
      ['aaaa', 0],
      ['bbbb', 1],
    ]);
    // centered: each line's first word starts at −quantize(lineW)/2
    expect(boxes[0]!.x).toBe(-21 / 2); // 4·5.2 = 20.8 → quantized 21
    expect(boxes[1]!.y).toBe(12.5 - 8);
  });

  it('blank lines keep their slot in the numbering', () => {
    const t = new Text({ text: 'ab\n\ncd', fontSize: 10 });
    expect(t.wordBoxes(estimatingMeasurer).map((b) => b.line)).toEqual([0, 2]);
  });
});

describe('wordBoxes: whitespace glue trim (downstream report #3)', () => {
  it("'$48,200' boxes start at the '$', not the preceding space", () => {
    const t = new Text({ text: 'Budget approved: $48,200 per year', fontSize: 10 });
    const boxes = t.wordBoxes(estimatingMeasurer);
    const dollar = boxes.find((b) => b.text.startsWith('$'))!;
    expect(dollar.text).toBe('$'); // no leading space in the text either
    // 'Budget approved: ' = 17 chars → 88.4 at 5.2/char
    expect(dollar.x).toBeCloseTo(17 * 5.2, 9);
    for (const b of boxes) expect(b.text).toBe(b.text.trim());
  });
});

describe('setDefaultMeasurer: factory-time measurement', () => {
  afterEach(() => setDefaultMeasurer(null));

  it('Text pulls use the default before any scene exists; estimator only as last resort', () => {
    const tenPerChar = { measureText: (s: string) => ({ width: s.length * 10, ascent: 9, descent: 1 }) };
    setDefaultMeasurer(tenPerChar);
    const t = new Text({ text: 'hello', fontSize: 10 });
    expect(t.measuredSize().w).toBe(50);
    setDefaultMeasurer(null);
    expect(t.measuredSize().w).toBe(26); // estimating fallback
  });

  it('un-injected scenes resolve through the default; injected backends still win', () => {
    const tenPerChar = { measureText: (s: string) => ({ width: s.length * 10, ascent: 9, descent: 1 }) };
    setDefaultMeasurer(tenPerChar);
    const t = new Text({ id: 'label', text: 'hello', fontSize: 10 });
    const scene = createScene({ size: { w: 100, h: 100 }, children: [t] });
    expect(scene.textMeasurer.measureText('hello', { family: 'x', size: 10 }).width).toBe(50);
    expect(t.measuredSize().w).toBe(50); // measurerSource chain sees it too
    scene.setTextMeasurer(estimatingMeasurer);
    expect(t.measuredSize().w).toBe(26); // the injected measurer wins
  });
});
