/**
 * 0.19 kinetic typography: `Text.revealFraction` (the count alias),
 * `Text.graphemeBoxes()` (the per-grapheme measurement mirroring wordBoxes),
 * and `splitText()` (build-time split-text sub-targets on @glissade/scene/type).
 */

import { describe, expect, it } from 'vitest';
import { Text } from '../src/nodes.js';
import { Group } from '../src/nodes.js';
import { splitText, SplitTextError } from '../src/type.js';
import type { DisplayListBuilder } from '../src/displayList.js';
import type { EvalContext, Node } from '../src/node.js';
import type { TextMeasurer } from '../src/text.js';

/** 10px per char, ascent = font size — predictable geometry. */
const fixed: TextMeasurer = {
  measureText: (text, font) => ({ width: text.length * 10, ascent: font.size, descent: 0 }),
};

interface Recorded {
  cmds: { op: string; [k: string]: unknown }[];
}

function emit(node: Node, time = 0, measurer: TextMeasurer = fixed): Recorded {
  const rec: Recorded = { cmds: [] };
  const out = {
    push: (c: unknown) => rec.cmds.push(c as never),
    resource: (r: { kind: string }) => rec.cmds.push(r as never) - 1,
  } as unknown as DisplayListBuilder;
  const ctx: EvalContext = { time, frame: -1, measurer };
  node.emit(out, ctx);
  return rec;
}

const texts = (rec: Recorded) => rec.cmds.filter((c) => c.op === 'fillText');

describe('Text.revealFraction (the count alias, §0.19)', () => {
  it('0.5 on a 10-grapheme string == reveal: 5 (identical emitted text)', () => {
    const s = 'abcdefghij'; // 10 graphemes
    const byFrac = emit(new Text({ text: s, fontSize: 10, revealFraction: 0.5 }));
    const byCount = emit(new Text({ text: s, fontSize: 10, reveal: 5 }));
    expect(texts(byFrac).map((c) => c.text)).toEqual(['abcde']);
    expect(texts(byFrac).map((c) => c.text)).toEqual(texts(byCount).map((c) => c.text));
  });

  it('1 = fully shown (the whole string)', () => {
    const rec = emit(new Text({ text: 'hello', fontSize: 10, revealFraction: 1 }));
    expect(texts(rec).map((c) => c.text)).toEqual(['hello']);
  });

  it('0 = hidden (no text emitted)', () => {
    const rec = emit(new Text({ text: 'hello', fontSize: 10, revealFraction: 0 }));
    expect(texts(rec)).toEqual([]);
  });

  it('rounds to the nearest grapheme (0.34 * 10 = 3.4 → 3)', () => {
    const byFrac = emit(new Text({ text: 'abcdefghij', fontSize: 10, revealFraction: 0.34 }));
    const byCount = emit(new Text({ text: 'abcdefghij', fontSize: 10, reveal: 3 }));
    expect(texts(byFrac).map((c) => c.text)).toEqual(['abc']);
    expect(texts(byFrac).map((c) => c.text)).toEqual(texts(byCount).map((c) => c.text));
  });

  it('clamps out-of-range fractions ([<0]=0 hidden, [>1]=1 full)', () => {
    expect(texts(emit(new Text({ text: 'hi', fontSize: 10, revealFraction: -0.5 })))).toEqual([]);
    expect(texts(emit(new Text({ text: 'hi', fontSize: 10, revealFraction: 2 }))).map((c) => c.text)).toEqual(['hi']);
  });

  it('overrides reveal when both are set (fraction wins)', () => {
    // reveal: 2 would show 'ab', but revealFraction 1 shows the whole string
    const rec = emit(new Text({ text: 'abcdef', fontSize: 10, reveal: 2, revealFraction: 1 }));
    expect(texts(rec).map((c) => c.text)).toEqual(['abcdef']);
  });

  it('default (unset) is byte-identical to a plain Text — full emit path, no masking', () => {
    const plain = emit(new Text({ text: 'identical', fontSize: 10 }));
    // a plain Text emits the WHOLE line with no per-grapheme masking
    expect(texts(plain).map((c) => c.text)).toEqual(['identical']);
    // and the emitted command shape matches (no 'reveal'/mask artifacts)
    expect(plain.cmds).toEqual(emit(new Text({ text: 'identical', fontSize: 10 })).cmds);
  });

  it('resolves against the SAME grapheme stream (emoji counts as one)', () => {
    // 'a👍b' is 3 graphemes; 1/3 ≈ 0.333 → round(0.333*3)=1 → 'a'
    const rec = emit(new Text({ text: 'a👍b', fontSize: 10, revealFraction: 1 / 3 }));
    expect(texts(rec).map((c) => c.text)).toEqual(['a']);
  });
});

describe('Text.graphemeBoxes() (per-grapheme measurement, §0.19)', () => {
  it('boxes every ink grapheme with cumulative kerning-exact advances', () => {
    const t = new Text({ text: 'abc', fontSize: 10 });
    const boxes = t.graphemeBoxes(fixed);
    expect(boxes.map((b) => b.text)).toEqual(['a', 'b', 'c']);
    // 10px/char, left-aligned at x=0: a@0, b@10, c@20, each 10 wide
    expect(boxes.map((b) => b.x)).toEqual([0, 10, 20]);
    expect(boxes.map((b) => b.w)).toEqual([10, 10, 10]);
    expect(boxes.every((b) => b.line === 0)).toBe(true);
  });

  it('drops whitespace graphemes (advance, no ink) — like wordBoxes', () => {
    const t = new Text({ text: 'a b', fontSize: 10 });
    const boxes = t.graphemeBoxes(fixed);
    expect(boxes.map((b) => b.text)).toEqual(['a', 'b']);
    // the space advances 10px, so 'b' sits at x=20
    expect(boxes.map((b) => b.x)).toEqual([0, 20]);
  });

  it('grapheme x-advances match the draw-path boundaries (sum to line width)', () => {
    const t = new Text({ text: 'word', fontSize: 10 });
    const boxes = t.graphemeBoxes(fixed);
    const last = boxes[boxes.length - 1]!;
    expect(last.x + last.w).toBe(40); // 4 chars * 10px
  });

  it('keeps an emoji/ZWJ sequence whole (one box)', () => {
    const t = new Text({ text: 'a👍b', fontSize: 10 });
    const boxes = t.graphemeBoxes(fixed);
    expect(boxes.map((b) => b.text)).toEqual(['a', '👍', 'b']);
  });
});

describe('splitText() (build-time sub-targets, §0.19)', () => {
  it('splits by word into a Group of ${id}/${i} child Texts', () => {
    const split = splitText(new Text({ id: 'title', text: 'one two', fontSize: 10 }), {
      by: 'word',
      measurer: fixed,
    });
    expect(split.node).toBeInstanceOf(Group);
    expect(split.node.id).toBe('title');
    expect(split.children.map((c) => c.id)).toEqual(['title/0', 'title/1']);
    expect(split.children.map((c) => c.text())).toEqual(['one', 'two']);
    expect(split.children.every((c) => c instanceof Text)).toBe(true);
  });

  it('splits by grapheme — one child per ink grapheme', () => {
    const split = splitText({ id: 'g', text: 'ab', fontSize: 10 }, { by: 'grapheme', measurer: fixed });
    expect(split.children.map((c) => c.text())).toEqual(['a', 'b']);
    expect(split.children.map((c) => c.id)).toEqual(['g/0', 'g/1']);
  });

  it('splits by line', () => {
    const split = splitText({ id: 'L', text: 'a\nb', fontSize: 10 }, { by: 'line', measurer: fixed });
    expect(split.children.map((c) => c.text())).toEqual(['a', 'b']);
  });

  it('defaults to by: word', () => {
    const split = splitText({ id: 'd', text: 'x y z', fontSize: 10 }, { measurer: fixed });
    expect(split.children.map((c) => c.text())).toEqual(['x', 'y', 'z']);
  });

  it('positions the group at the source position (replace-the-source)', () => {
    const split = splitText({ id: 'p', text: 'hi', fontSize: 10, position: [100, 50] }, { measurer: fixed });
    expect(split.node.position()).toEqual([100, 50]);
  });

  it('parts carry the source font props', () => {
    const split = splitText(
      new Text({ id: 'f', text: 'A B', fontSize: 24, fontFamily: 'Serif', fill: '#ff0000', fontWeight: 700 }),
      { by: 'word', measurer: fixed },
    );
    const c = split.children[0]!;
    expect(c.fontSize()).toBe(24);
    expect(c.fontFamily).toBe('Serif');
    expect(c.fill()).toBe('#ff0000');
    expect(c.fontWeight).toBe(700);
  });

  it('part children draw their text at the source line baseline (drawable, in order)', () => {
    const split = splitText({ id: 's', text: 'go now', fontSize: 10 }, { by: 'word', measurer: fixed });
    const rec = emit(split.node, 0, fixed);
    expect(texts(rec).map((c) => c.text)).toEqual(['go', 'now']);
  });

  it('grapheme parts are positioned at their graphemeBoxes x (independently addressable)', () => {
    const src = new Text({ id: 'pos', text: 'abc', fontSize: 10 });
    const split = splitText(src, { by: 'grapheme', measurer: fixed });
    const boxes = src.graphemeBoxes(fixed);
    split.children.forEach((c, i) => {
      expect(c.position()[0]).toBe(boxes[i]!.x);
    });
  });

  it('throws when neither opts.id nor a source id is given', () => {
    expect(() => splitText({ text: 'no id', fontSize: 10 }, { measurer: fixed })).toThrow(SplitTextError);
  });

  it('opts.id overrides the source id', () => {
    const split = splitText(new Text({ id: 'src', text: 'a b', fontSize: 10 }), { id: 'over', measurer: fixed });
    expect(split.node.id).toBe('over');
    expect(split.children.map((c) => c.id)).toEqual(['over/0', 'over/1']);
  });

  it('empty text yields an empty split (no parts)', () => {
    const split = splitText({ id: 'e', text: '', fontSize: 10 }, { measurer: fixed });
    expect(split.children).toEqual([]);
  });

  it('is a pure build-time expansion — two calls reconstruct the identical id set', () => {
    const a = splitText({ id: 'x', text: 'one two three', fontSize: 10 }, { measurer: fixed });
    const b = splitText({ id: 'x', text: 'one two three', fontSize: 10 }, { measurer: fixed });
    expect(a.children.map((c) => c.id)).toEqual(b.children.map((c) => c.id));
    expect(a.children.map((c) => c.position())).toEqual(b.children.map((c) => c.position()));
  });
});
