/**
 * 0.19 kinetic typography: `Text.revealFraction` (the count alias),
 * `Text.graphemeBoxes()` (the per-grapheme measurement mirroring wordBoxes),
 * and `splitText()` (build-time split-text sub-targets on @glissade/scene/type).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text } from '../src/nodes.js';
import { Group } from '../src/nodes.js';
import { splitText, SplitTextError } from '../src/type.js';
import type { DisplayListBuilder } from '../src/displayList.js';
import type { EvalContext, Node } from '../src/node.js';
import { __resetEstimateWarnings, estimatingMeasurer, isEstimatingMeasurer } from '../src/text.js';
import type { TextMeasurer } from '../src/text.js';
import { setDevWarning, timeline } from '@glissade/core';
import { createScene, evaluate } from '../src/index.js';

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

  it('parts carry the child node id (parts[i].id === `${id}/${i}`)', () => {
    const split = splitText({ id: 'h', text: 'one two three', fontSize: 10 }, { by: 'word', measurer: fixed });
    expect(split.parts.map((p) => p.id)).toEqual(['h/0', 'h/1', 'h/2']);
    // the advertised recipe works verbatim — no more "undefined/revealFraction"
    expect(split.parts.map((p) => `${p.id}/revealFraction`)).toEqual([
      'h/0/revealFraction',
      'h/1/revealFraction',
      'h/2/revealFraction',
    ]);
    // and parts[i].id === the child node's registered id
    expect(split.parts.map((p) => p.id)).toEqual(split.children.map((c) => c.id));
    expect(split.parts.map((p) => p.node.id)).toEqual(['h/0', 'h/1', 'h/2']);
  });

  it('targets(prop) returns ready-to-bind ids in reading order', () => {
    const split = splitText({ id: 'h', text: 'one two', fontSize: 10 }, { by: 'word', measurer: fixed });
    expect(split.targets('revealFraction')).toEqual(['h/0/revealFraction', 'h/1/revealFraction']);
    expect(split.targets('opacity')).toEqual(['h/0/opacity', 'h/1/opacity']);
  });

  it('the full kinetic-typography recipe binds (no "no property signal resolves" throw)', () => {
    const split = splitText({ id: 'h', text: 'one two three', fontSize: 10 }, { by: 'word', measurer: fixed });
    const scene = createScene({ size: { w: 200, h: 50 }, children: [split.node] });
    // the blessed one-liner — must not throw at build OR at evaluate (bind)
    const doc = timeline((tl) => {
      tl.stagger(split.targets('revealFraction'), { to: 1, from: 0 }, { each: 0.1 });
    });
    expect(() => evaluate(scene, doc, 0)).not.toThrow();

    // per-word revealed grapheme count over time, in reading order. A word's
    // revealFraction rises 0→1 over [d_i, d_i+1]; with each=0.1 the words start
    // staggered, so the reveal sweeps word-by-word (monotonic per word).
    const revealedFor = (t: number): number[] => {
      const list = evaluate(scene, doc, t);
      // group fillText texts back into the 3 words by reading order
      const drawn = (list.commands as { op: string; text?: string }[])
        .filter((c) => c.op === 'fillText')
        .map((c) => c.text ?? '');
      // map drawn texts onto the 3 source words ['one','two','three']
      const words = ['one', 'two', 'three'];
      return words.map((w) => {
        const hit = drawn.find((d) => w.startsWith(d) && d.length > 0);
        return hit ? hit.length : 0;
      });
    };

    // sample a sweep — each word's revealed length is non-decreasing in t
    const samples = [0, 0.25, 0.5, 0.75, 1, 1.25].map(revealedFor);
    for (let w = 0; w < 3; w++) {
      for (let s = 1; s < samples.length; s++) {
        expect(samples[s]![w]!).toBeGreaterThanOrEqual(samples[s - 1]![w]!);
      }
    }
    // word 0 leads word 2: at the moment word 0 is full, word 2 is not yet ahead
    const last = samples[samples.length - 1]!;
    expect(last[0]).toBe(3); // 'one' fully revealed by the end
    expect(last[2]).toBe(5); // 'three' fully revealed by the end
    // staggered start: word 0 reveals before word 2 (it leads)
    const early = revealedFor(0.35);
    expect(early[0]!).toBeGreaterThanOrEqual(early[2]!);
  });

  it('is a pure build-time expansion — two calls reconstruct the identical id set', () => {
    const a = splitText({ id: 'x', text: 'one two three', fontSize: 10 }, { measurer: fixed });
    const b = splitText({ id: 'x', text: 'one two three', fontSize: 10 }, { measurer: fixed });
    expect(a.children.map((c) => c.id)).toEqual(b.children.map((c) => c.id));
    expect(a.children.map((c) => c.position())).toEqual(b.children.map((c) => c.position()));
  });
});

describe('splitText() estimate-fallback dev warning (o_aLYFFPjFDf)', () => {
  // capture/restore the dev-warn channel + reset the one-shot de-dupe per test
  let warnings: string[];
  const restore = () => setDevWarning((m) => (globalThis.console?.warn(m), undefined));
  beforeEach(() => {
    warnings = [];
    __resetEstimateWarnings();
    setDevWarning((m) => void warnings.push(m));
  });
  afterEach(restore);

  it('identity-detects the estimating singleton (and NOT a real measurer)', () => {
    expect(isEstimatingMeasurer(estimatingMeasurer)).toBe(true);
    expect(isEstimatingMeasurer(fixed)).toBe(false);
  });

  it('warns ONCE when splitText falls back to the per-character estimate (no measurer, no scene)', () => {
    // a bare Text props (no scene injected, no { measurer }, no setDefaultMeasurer)
    // resolves to estimatingMeasurer → the silent-drift footgun, now told
    splitText({ id: 'w', text: 'split the text', fontSize: 40 });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/splitText: no text measurer available/);
    expect(warnings[0]).toMatch(/rough per-character estimate/);
    // one-shot: a second call does NOT re-warn
    splitText({ id: 'w2', text: 'again', fontSize: 40 });
    expect(warnings.length).toBe(1);
  });

  it('does NOT warn when a real { measurer } is passed (the exact-layout path)', () => {
    splitText({ id: 'ok', text: 'split the text', fontSize: 40 }, { measurer: fixed });
    expect(warnings).toEqual([]);
  });
});

// 0.20.1 (browser-canary finding): an unknown `by` was SILENTLY treated as
// grapheme (the ternary's fall-through), so the manifest's bogus `'char'` and a
// typo `'zzz'` both "worked" by accident. Fail loud — the splitText sibling of
// the node-constructor guard.
describe('splitText by-guard (0.20.1)', () => {
  it('throws SplitTextError on an unknown `by` instead of falling through to grapheme', () => {
    expect(() => splitText({ id: 't', text: 'a b c', fontSize: 10 }, { by: 'zzz' as never, measurer: fixed })).toThrow(
      SplitTextError,
    );
    // The manifest's old bogus value is rejected too (it only ever "worked" via the silent fallback).
    expect(() => splitText({ id: 't', text: 'a b c', fontSize: 10 }, { by: 'char' as never, measurer: fixed })).toThrow(
      /unknown .*by/i,
    );
  });

  it('still accepts the three real granularities', () => {
    for (const by of ['word', 'line', 'grapheme'] as const) {
      expect(() => splitText({ id: 't', text: 'a b c', fontSize: 10 }, { by, measurer: fixed })).not.toThrow();
    }
  });
});
