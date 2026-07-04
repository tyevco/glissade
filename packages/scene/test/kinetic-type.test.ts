/**
 * 0.56 kinetic type presets (@glissade/scene/type): typeOn / revealWords /
 * revealLines / emphasizeWords — the one-call sugar over the shipped primitives.
 * Pins the composed track shape, the fail-loud guards, and determinism (a preset
 * built twice emits byte-equal tracks).
 */

import { describe, expect, it } from 'vitest';
import { Text } from '../src/nodes.js';
import { Group } from '../src/nodes.js';
import { TextCursor } from '../src/textCursor.js';
import {
  typeOn,
  revealWords,
  revealLines,
  emphasizeWords,
  KineticTypeError,
} from '../src/type.js';
import type { TextMeasurer } from '../src/text.js';

/** 10px per char, ascent = font size — predictable geometry, silences the estimate warn. */
const fixed: TextMeasurer = {
  measureText: (text, font) => ({ width: text.length * 10, ascent: font.size, descent: 0 }),
};

describe('typeOn (one-call typewriter)', () => {
  it('DEFAULT emits a STRING hold-key track on <id>/text (Lottie-faithful), no cursor', () => {
    const r = typeOn(new Text({ id: 'p', text: 'hi there', fontFamily: 'x' }), { perChar: 0.1, start: 0.5 });
    expect(r.node).toBeInstanceOf(Text);
    expect(r.cursor).toBeUndefined();
    expect(r.track.target).toBe('p/text');
    expect(r.track.type).toBe('string');
    // types every grapheme once; first key empty, last key the full string
    expect(r.track.keys[0]!.value).toBe('');
    expect(r.track.keys.at(-1)!.value).toBe('hi there');
    expect(r.marks).toHaveLength('hi there'.length);
    expect(r.marks.every((m) => m.kind === 'insert')).toBe(true);
    // perChar honored: 8 graphemes at 0.1 from t=0.5 → duration 1.3
    expect(r.duration).toBeCloseTo(0.5 + 8 * 0.1, 6);
  });

  it('{ mask: true } swaps to a NUMBER <id>/reveal grapheme-mask track (render-only)', () => {
    const r = typeOn(new Text({ id: 'p', text: 'abcde', fontFamily: 'x' }), { mask: true, perChar: 0.1 });
    expect(r.track.target).toBe('p/reveal');
    expect(r.track.type).toBe('number');
    expect(r.track.keys[0]!.value).toBe(0);
    expect(r.track.keys.at(-1)!.value).toBe(5); // grapheme count
  });

  it('{ cursor: true } attaches a render-only TextCursor sibling with id <id>/cursor', () => {
    const r = typeOn(new Text({ id: 'p', text: 'yo', fontFamily: 'x' }), { cursor: true, cursorWidth: 3 });
    expect(r.cursor).toBeInstanceOf(TextCursor);
    expect(r.cursor!.id).toBe('p/cursor');
    // cursor is orthogonal — the default string track is still there
    expect(r.track.target).toBe('p/text');
  });

  it('{ cursorFill } forwards a contrasting caret color to the TextCursor sibling fill', () => {
    const r = typeOn(new Text({ id: 'p', text: 'yo', fontFamily: 'x', fill: '#ffffff' }), {
      cursor: true,
      cursorFill: '#ff0055',
    });
    expect(r.cursor!.fill()).toBe('#ff0055'); // the caret owns its own fill, not the text's
    expect(r.cursor!.id).toBe('p/cursor');
  });

  it('DEFAULT caret fill is empty (follows the text fill) when cursorFill is omitted', () => {
    const r = typeOn(new Text({ id: 'p', text: 'yo', fontFamily: 'x' }), { cursor: true });
    expect(r.cursor!.fill()).toBe(''); // '' = follow the Text's own fill (existing default preserved)
  });

  it('{ cursorProps } forwards other TextCursor props; explicit cursor* options win', () => {
    const r = typeOn(new Text({ id: 'p', text: 'yo', fontFamily: 'x' }), {
      cursor: true,
      cursorProps: { width: 9, blinkPeriod: 2, fill: '#00ff00' },
      cursorWidth: 4, // explicit option overrides cursorProps.width
    });
    expect(r.cursor!.caretWidth).toBe(4); // explicit cursorWidth wins over cursorProps.width
    expect(r.cursor!.blinkPeriod).toBe(2); // cursorProps passthrough (no explicit blinkPeriod)
    expect(r.cursor!.fill()).toBe('#00ff00'); // cursorProps.fill passthrough
    expect(r.cursor!.id).toBe('p/cursor'); // id is always fixed by typeOn
  });

  it('FAIL-LOUD: a source without an id throws KineticTypeError', () => {
    expect(() => typeOn(new Text({ text: 'no id', fontFamily: 'x' }))).toThrow(KineticTypeError);
    expect(() => typeOn({ text: 'no id', fontFamily: 'x' })).toThrow(/needs a stable id/);
  });
});

describe('revealWords / revealLines', () => {
  it('revealWords returns the split Group as .node (not the source) + real opacity tracks', () => {
    const r = revealWords(new Text({ id: 't', text: 'one two three', fontFamily: 'x' }), {
      from: 'fade',
      measurer: fixed,
    });
    expect(r.node).toBeInstanceOf(Group);
    // 3 words → 3 opacity tracks, each 0→1
    const opacity = r.tracks.filter((tr) => tr.target.endsWith('/opacity'));
    expect(opacity).toHaveLength(3);
    expect(opacity.every((tr) => tr.target.startsWith('t/'))).toBe(true);
    // fade → NO position tracks
    expect(r.tracks.some((tr) => tr.target.endsWith('/position'))).toBe(false);
  });

  it("from: 'below' adds position tracks that settle on each word's resting spot", () => {
    const src = new Text({ id: 't', text: 'a b', fontFamily: 'x', position: [0, 0] });
    const r = revealWords(src, { from: 'below', distance: 20, measurer: fixed });
    const pos = r.tracks.filter((tr) => tr.target.endsWith('/position'));
    expect(pos).toHaveLength(2);
    // last key of each position track == the child's resting position (0 dy)
    const restY = (r.node.children[0] as Text).position()[1];
    const firstPos = pos.find((tr) => tr.target === 't/0/position')!;
    expect((firstPos.keys.at(-1)!.value as [number, number])[1]).toBe(restY);
    // enters from below (resting y + distance)
    expect((firstPos.keys[0]!.value as [number, number])[1]).toBe(restY + 20);
  });

  it('revealLines splits by line', () => {
    const r = revealLines(new Text({ id: 'l', text: 'line one\nline two', fontFamily: 'x' }), { measurer: fixed });
    const opacity = r.tracks.filter((tr) => tr.target.endsWith('/opacity'));
    expect(opacity).toHaveLength(2);
  });

  it('DETERMINISM: building revealWords twice emits byte-equal tracks', () => {
    const build = () =>
      revealWords(new Text({ id: 't', text: 'alpha beta', fontFamily: 'x', position: [10, 20] }), {
        from: 'below',
        each: 0.1,
        at: 0.3,
        measurer: fixed,
      }).tracks;
    expect(build()).toEqual(build());
  });
});

describe('emphasizeWords', () => {
  it('pulses the indexed words with scale tracks (up-and-back)', () => {
    const r = emphasizeWords(new Text({ id: 't', text: 'a b c d', fontFamily: 'x' }), [1, 3], {
      scale: 1.2,
      measurer: fixed,
    });
    expect(r.node).toBeInstanceOf(Group);
    const scale = r.tracks.filter((tr) => tr.target.endsWith('/scale'));
    expect(scale.map((tr) => tr.target).sort()).toEqual(['t/1/scale', 't/3/scale']);
    // peak scale reached then returns to [1,1]
    const s1 = scale.find((tr) => tr.target === 't/1/scale')!;
    expect(s1.keys.some((k) => (k.value as [number, number])[0] === 1.2)).toBe(true);
    expect(s1.keys.at(-1)!.value).toEqual([1, 1]);
  });

  it('FAIL-LOUD: an out-of-range index throws KineticTypeError', () => {
    const src = () => new Text({ id: 't', text: 'a b c', fontFamily: 'x' });
    expect(() => emphasizeWords(src(), [5], { measurer: fixed })).toThrow(KineticTypeError);
    expect(() => emphasizeWords(src(), [5], { measurer: fixed })).toThrow(/out of range/);
    expect(() => emphasizeWords(src(), [-1], { measurer: fixed })).toThrow(KineticTypeError);
    // non-integer also throws (not silently floored)
    expect(() => emphasizeWords(src(), [1.5], { measurer: fixed })).toThrow(KineticTypeError);
  });
});
