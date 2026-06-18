import { describe, expect, it } from 'vitest';
import { breakLines, quantize, MEASURE_QUANTUM_PX, type TextMeasurer } from '../src/index.js';

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

describe('MEASURE_QUANTUM_PX (pre-measure quantum, §3.6)', () => {
  it('the named constant is the 0.5px grid', () => {
    expect(MEASURE_QUANTUM_PX).toBe(0.5);
  });

  it('quantize rounds onto the MEASURE_QUANTUM_PX grid — every output is a multiple', () => {
    // drive a recording measurer: the breaker quantizes each advance it pulls
    const recorded: number[] = [];
    const recording: TextMeasurer = {
      measureText: (text, font) => {
        // irrational-ish advances that are never already on the grid
        const w = text.length * Math.PI * 3.000123;
        recorded.push(w);
        return { width: w, ascent: font.size, descent: 0 };
      },
    };
    breakLines('alpha beta gamma delta epsilon', font, 40, recording);
    expect(recorded.length).toBeGreaterThan(0);
    // none of the raw advances land on the grid, but every quantized one does
    for (const w of recorded) {
      const q = quantize(w);
      expect(q % MEASURE_QUANTUM_PX).toBe(0);
    }
  });

  it('quantize is exactly round-to-MEASURE_QUANTUM_PX (byte-equivalent to the old 0.5 grid)', () => {
    for (const v of [0, 0.24, 0.25, 0.26, 10.26, 10.24, -3.3, 1234.7, Math.PI * 100]) {
      expect(quantize(v)).toBe(Math.round(v / MEASURE_QUANTUM_PX) * MEASURE_QUANTUM_PX);
      // and bit-identical to the legacy inline form it replaced
      expect(quantize(v)).toBe(Math.round(v * 2) / 2);
    }
  });
});

describe('CJK wrapping (Intl.Segmenter boundaries)', () => {
  it('Chinese text wraps without spaces', () => {
    // 12 CJK chars at 10px each, 60px max → must break into multiple lines
    const lines = breakLines('动画是数据时间的纯函数无需重放', font, 60, fixed);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(fixed.measureText(line, font).width).toBeLessThanOrEqual(60);
    }
    expect(lines.join('')).toBe('动画是数据时间的纯函数无需重放');
  });
});

describe('no break before punctuation', () => {
  it('a line never starts with punctuation', () => {
    const lines = breakLines('time needs no replay, so every frame is addressable.', font, 100, fixed);
    for (const line of lines) {
      expect(/^[^\p{L}\p{N}]/u.test(line), `line starts with punctuation: '${line}'`).toBe(false);
    }
  });
});
