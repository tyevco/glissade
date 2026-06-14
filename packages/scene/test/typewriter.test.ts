/**
 * Typewriter reveal primitive — the 0.5.0 keystone. Covers every seam:
 *  - graphemes(): the laid-out grapheme stream (incl. emoji as one unit)
 *  - draw() masking: byte-identical when fully revealed (golden guarantee),
 *    prefix-only when partial, no re-centering under align
 *  - revealHead(): the caret position the cursor rides
 *  - revealSchedule(): the pure RevealMark[] SFX keystroke-sync consumes
 *  - TextCursor: solid-while-typing then blink, follows the head
 */

import { describe, expect, it } from 'vitest';
import { key, type Track } from '@glissade/core';
import { Text, revealSchedule } from '../src/nodes.js';
import { textCursor } from '../src/textCursor.js';
import { typewriter } from '../src/typewriter.js';
import type { DisplayListBuilder } from '../src/displayList.js';
import type { EvalContext, Node } from '../src/node.js';
import type { TextMeasurer } from '../src/text.js';

/** 10px per char, ascent = font size — predictable geometry. */
const fixed: TextMeasurer = {
  measureText: (text, font) => ({ width: text.length * 10, ascent: font.size, descent: 0 }),
};

interface Recorded {
  cmds: { op: string; [k: string]: unknown }[];
  resources: { kind: string; segs?: [string, ...number[]][] }[];
}

function emit(node: Node, time = 0, measurer: TextMeasurer = fixed): Recorded {
  const rec: Recorded = { cmds: [], resources: [] };
  const out = {
    push: (c: unknown) => rec.cmds.push(c as never),
    resource: (r: { kind: string }) => rec.resources.push(r as never) - 1,
  } as unknown as DisplayListBuilder;
  const ctx: EvalContext = { time, frame: -1, measurer };
  node.emit(out, ctx);
  return rec;
}

const texts = (rec: Recorded) => rec.cmds.filter((c) => c.op === 'fillText');
const fills = (rec: Recorded) => rec.cmds.filter((c) => c.op === 'fillPath');

const numberTrack = (...keys: ReturnType<typeof key<number>>[]): Track<number> => ({
  target: 'title/reveal',
  type: 'number',
  keys,
});

describe('Text.graphemes()', () => {
  it('returns the laid-out grapheme stream in reading order', () => {
    const t = new Text({ text: 'abc', fontSize: 10 });
    expect(t.graphemes(fixed)).toEqual(['a', 'b', 'c']);
  });

  it('counts an emoji / combining sequence as ONE grapheme', () => {
    const t = new Text({ text: 'a👍b', fontSize: 10 });
    const g = t.graphemes(fixed);
    expect(g).toEqual(['a', '👍', 'b']);
    expect(g.length).toBe(3); // not 4 (the emoji is a surrogate pair)
  });

  it('flattens wrapped lines, dropping soft-wrap whitespace (as drawn)', () => {
    // 'aa bb' wraps at 20px into ['aa','bb']; the wrap space is gone
    const t = new Text({ text: 'aa bb', fontSize: 10, width: 20 });
    expect(t.graphemes(fixed)).toEqual(['a', 'a', 'b', 'b']);
  });

  it('empty text has no graphemes', () => {
    expect(new Text({ text: '', fontSize: 10 }).graphemes(fixed)).toEqual([]);
  });
});

describe('Text.draw() reveal masking', () => {
  it('default (Infinity) is byte-identical to a finite reveal past the end', () => {
    const full = new Text({ id: 'a', text: 'hello world', fontSize: 10 });
    const over = new Text({ id: 'b', text: 'hello world', fontSize: 10, reveal: 1000 });
    // strip ids out of comparison — the emit content must match exactly
    expect(texts(emit(over))).toEqual(texts(emit(full)));
  });

  it('reveals only the first N graphemes of a single line', () => {
    const t = new Text({ text: 'hello world', fontSize: 10, reveal: 3 });
    const out = texts(emit(t));
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('hel');
  });

  it('reveal 0 draws nothing; partial line never re-centers under align', () => {
    expect(texts(emit(new Text({ text: 'hello', fontSize: 10, reveal: 0 })))).toHaveLength(0);

    // center align: full line width 50 → lineX = -25; the prefix is anchored
    // there with no align op, so 'he' starts at the same left edge as 'hello'
    const partial = texts(emit(new Text({ text: 'hello', fontSize: 10, align: 'center', reveal: 2 })));
    expect(partial[0]!.text).toBe('he');
    expect(partial[0]!.x).toBe(-25);
    expect(partial[0]!.align).toBeUndefined();
  });

  it('reveal spans wrapped lines: full earlier line + prefix of the next', () => {
    // 'aaaa bbbb' wraps at 40px → ['aaaa','bbbb']; reveal 6 = 'aaaa' + 'bb'
    const t = new Text({ text: 'aaaa bbbb', fontSize: 10, width: 40, reveal: 6 });
    const out = texts(emit(t));
    expect(out.map((c) => c.text)).toEqual(['aaaa', 'bb']);
  });
});

describe('Text.revealHead()', () => {
  const make = (reveal: number) => new Text({ text: 'hello', fontSize: 10, reveal });

  it('reveal 0 sits at the start of line 0', () => {
    const h = make(0).revealHead(fixed);
    expect(h.x).toBe(0);
    expect(h.line).toBe(0);
    expect(h.index).toBe(0);
  });

  it('advances the caret x with each grapheme', () => {
    expect(make(2).revealHead(fixed).x).toBe(20); // width('he')
    expect(make(4).revealHead(fixed).x).toBe(40); // width('hell')
  });

  it('lands on the second line once the first is consumed', () => {
    const t = new Text({ text: 'aaaa bbbb', fontSize: 10, width: 40, reveal: 6 });
    const h = t.revealHead(fixed);
    expect(h.line).toBe(1);
    expect(h.x).toBe(20); // width('bb')
  });
});

describe('revealSchedule() — the keystroke-sync contract', () => {
  it('maps each grapheme to its reveal time + caret geometry', () => {
    const t = new Text({ id: 'title', text: 'ab\ncd', fontSize: 10 });
    const track = numberTrack(
      key(0.0, 1, { interp: 'hold' }),
      key(0.1, 2, { interp: 'hold' }),
      key(0.2, 3, { interp: 'hold' }),
      key(0.3, 4, { interp: 'hold' }),
    );
    const marks = revealSchedule(t, track, fixed);
    expect(marks.map((m) => [m.charIndex, m.grapheme, m.time, m.x, m.line])).toEqual([
      [0, 'a', 0.0, 10, 0],
      [1, 'b', 0.1, 20, 0],
      [2, 'c', 0.2, 10, 1],
      [3, 'd', 0.3, 20, 1],
    ]);
  });

  it('omits graphemes the track never reveals', () => {
    const t = new Text({ id: 'title', text: 'abcd', fontSize: 10 });
    // only ever reaches count 2 → graphemes 2 and 3 are never shown
    const marks = revealSchedule(t, numberTrack(key(0, 2, { interp: 'hold' })), fixed);
    expect(marks.map((m) => m.grapheme)).toEqual(['a', 'b']);
  });

  it('empty text yields no marks', () => {
    const t = new Text({ id: 'title', text: '', fontSize: 10 });
    expect(revealSchedule(t, numberTrack(key(0, 5)), fixed)).toEqual([]);
  });
});

describe('TextCursor', () => {
  it('draws a solid caret at the reveal head while still typing', () => {
    const t = new Text({ id: 'title', text: 'hello', fontSize: 10, reveal: 2 });
    const cur = textCursor(t, { width: 2 });
    const f = fills(emit(cur, 0));
    expect(f).toHaveLength(1);
    // caret box starts at the head x (width('he') = 20)
    const seg = emit(cur, 0).resources[0]!.segs![0]!;
    expect(seg[0]).toBe('M');
    expect(seg[1]).toBe(20); // x of the rounded-rect move-to
  });

  it('blinks once fully revealed: on in the first half-period, off in the second', () => {
    const t = new Text({ id: 'title', text: 'hi', fontSize: 10 }); // reveal default Infinity = full
    const cur = textCursor(t, { blinkPeriod: 1.0 });
    expect(fills(emit(cur, 0.0))).toHaveLength(1); // on
    expect(fills(emit(cur, 0.6))).toHaveLength(0); // off (past half)
    expect(fills(emit(cur, 1.0))).toHaveLength(1); // on again (next period)
  });

  it('solidWhileTyping=false blinks even mid-type', () => {
    const t = new Text({ id: 'title', text: 'hello', fontSize: 10, reveal: 2 });
    const cur = textCursor(t, { blinkPeriod: 1.0, solidWhileTyping: false });
    expect(fills(emit(cur, 0.6))).toHaveLength(0); // would be solid if solidWhileTyping
  });

  it('caret falls back to the text fill when its own fill is unset', () => {
    const t = new Text({ id: 'title', text: 'x', fill: '#ff0000', fontSize: 10, reveal: 1 });
    const cur = textCursor(t);
    const f = fills(emit(cur, 0))[0]!;
    expect((f.paint as { color: string }).color).toBe('#ff0000');
  });
});

describe('typewriter() — edit-event-aware (type / delete / retype)', () => {
  it('type-only compiles to a hold-key string staircase + insert marks', () => {
    const tw = typewriter('title/text', [{ type: 'ab' }], { perChar: 1 });
    expect(tw.track.target).toBe('title/text');
    expect(tw.track.keys.map((k) => [k.t, k.value])).toEqual([
      [0, ''],
      [1, 'a'],
      [2, 'ab'],
    ]);
    expect(tw.track.keys.every((k) => k.interp === 'hold')).toBe(true);
    expect(tw.marks).toEqual([
      { time: 1, kind: 'insert', grapheme: 'a', value: 'a' },
      { time: 2, kind: 'insert', grapheme: 'b', value: 'ab' },
    ]);
    expect(tw.duration).toBe(2);
  });

  it('the cold-open: type → delete → retype DIFFERENT text (not just reveal-count)', () => {
    const tw = typewriter('p/text', [{ type: 'pop' }, { delete: 3 }, { type: 'sing' }], { perChar: 1 });
    // ends on a string the monotonic reveal could never reach
    expect(tw.track.keys[tw.track.keys.length - 1]!.value).toBe('sing');
    expect(tw.marks).toHaveLength(10); // 3 insert + 3 delete + 4 insert
    // backspaces remove last-first, carrying the removed grapheme for SFX
    expect(tw.marks.slice(3, 6)).toEqual([
      { time: 4, kind: 'delete', grapheme: 'p', value: 'po' },
      { time: 5, kind: 'delete', grapheme: 'o', value: 'p' },
      { time: 6, kind: 'delete', grapheme: 'p', value: '' },
    ]);
    expect(tw.marks[6]).toEqual({ time: 7, kind: 'insert', grapheme: 's', value: 's' });
  });

  it('hold advances time without a keystroke; per-step perChar overrides', () => {
    const tw = typewriter('t/text', [{ type: 'hi', perChar: 0.1 }, { hold: 0.5 }, { type: 'x' }], { perChar: 1 });
    const times = tw.marks.map((m) => m.time);
    expect(times[0]).toBeCloseTo(0.1, 9); // step perChar 0.1
    expect(times[1]).toBeCloseTo(0.2, 9);
    expect(times[2]).toBeCloseTo(0.2 + 0.5 + 1, 9); // + hold + global perChar
  });

  it('deleting past the start clamps (no negative-length text)', () => {
    const tw = typewriter('t/text', [{ type: 'ab' }, { delete: 5 }], { perChar: 1 });
    expect(tw.track.keys[tw.track.keys.length - 1]!.value).toBe('');
    expect(tw.marks.filter((m) => m.kind === 'delete')).toHaveLength(2); // only 2 to remove
  });

  it('treats an emoji as one keystroke', () => {
    const tw = typewriter('t/text', [{ type: 'a👍' }], { perChar: 1 });
    expect(tw.marks.map((m) => m.grapheme)).toEqual(['a', '👍']);
  });

  it('keys are strictly time-ordered and start empty', () => {
    const tw = typewriter('t/text', [{ type: 'abc' }, { delete: 1 }, { type: 'd' }], { perChar: 1 });
    expect(tw.track.keys[0]).toEqual({ t: 0, value: '', interp: 'hold' });
    for (let i = 1; i < tw.track.keys.length; i++) {
      expect(tw.track.keys[i]!.t).toBeGreaterThan(tw.track.keys[i - 1]!.t);
    }
  });
});
