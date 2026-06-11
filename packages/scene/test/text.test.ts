import { describe, expect, it } from 'vitest';
import { breakLines, quantize, type TextMeasurer } from '../src/index.js';

/** 10px per character — predictable wrapping math. */
const fixed: TextMeasurer = {
  measureText: (text, font) => ({ width: text.length * 10, ascent: font.size, descent: 0 }),
};
const font = { family: 'x', size: 16 };

describe('line breaking (§3.6)', () => {
  it('no maxWidth: only explicit \\n breaks', () => {
    expect(breakLines('one two\nthree', font, undefined, fixed)).toEqual(['one two', 'three']);
  });

  it('greedy wrap at maxWidth', () => {
    // 'aaa bbb ccc' at 10px/char with 80px: 'aaa bbb'(7ch=70) fits, +' ccc' (11ch=110) breaks
    expect(breakLines('aaa bbb ccc', font, 80, fixed)).toEqual(['aaa bbb', 'ccc']);
  });

  it('a word wider than maxWidth gets its own line, never broken intra-word', () => {
    expect(breakLines('hi supercalifragilistic yo', font, 60, fixed)).toEqual([
      'hi',
      'supercalifragilistic',
      'yo',
    ]);
  });

  it('\\n and wrapping compose', () => {
    expect(breakLines('aaa bbb\nccc ddd eee', font, 80, fixed)).toEqual(['aaa bbb', 'ccc ddd', 'eee']);
  });

  it('measurements quantize to the 0.5px grid', () => {
    expect(quantize(10.26)).toBe(10.5);
    expect(quantize(10.24)).toBe(10);
  });
});
