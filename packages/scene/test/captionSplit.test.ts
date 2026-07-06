/**
 * caption-split (card p5kMM6gH-ufh) — `splitToFit()`: the measured, band-aware
 * caption splitter. Covers: short text is a no-op; long text splits at the highest
 * boundary present (sentence → clause → word) with EVERY piece fitting the band;
 * an unsplittable word fails loud (TextFitError); the measure-consistency contract
 * (no real measurer → MeasurerRequiredError, {estimate:true} opts in); zh (spaceless)
 * splits without fabricating spaces; and the re-join preserves the original text.
 */
import { describe, expect, it } from 'vitest';
import { splitToFit, TextFitError, MeasurerRequiredError } from '../src/captionSplit.js';
import { breakLines, type TextMeasurer } from '../src/text.js';
import type { FontSpec } from '../src/displayList.js';

// deterministic monospace-ish measurer: width = chars × size × 0.6 (a real, non-
// estimating object, so the fail-loud gate lets it through).
const real: TextMeasurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.6, ascent: f.size * 0.8, descent: f.size * 0.2 }),
};

const font: FontSpec = { family: 'Test', size: 20, weight: 400 };
// at size 20, width=len×12 → a line fits maxWidth 240 iff len ≤ 20 chars.
const W = 240;

const linesOf = (s: string, maxWidth = W): number => breakLines(s, font, maxWidth, real).length;

describe('splitToFit', () => {
  it('short text that already fits is a single piece (no-op)', () => {
    const out = splitToFit('Hello world.', { maxWidth: W, font, maxLines: 2, measurer: real });
    expect(out).toEqual(['Hello world.']);
  });

  it('every returned piece fits within maxLines at the given font (the core guarantee)', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. A second sentence follows here, with a clause; and more. Then a third one arrives at the end.';
    const out = splitToFit(text, { maxWidth: W, font, maxLines: 2, measurer: real });
    expect(out.length).toBeGreaterThan(1);
    for (const piece of out) expect(linesOf(piece), `piece "${piece}" must fit ≤2 lines`).toBeLessThanOrEqual(2);
  });

  it('splits at SENTENCE boundaries when they yield fitting pieces', () => {
    // two short sentences that together exceed 2 lines but each fits alone
    const text = 'The quick brown fox jumps over. The lazy sleepy dog then rests.';
    const out = splitToFit(text, { maxWidth: W, font, maxLines: 2, measurer: real });
    expect(out.length).toBe(2);
    // each piece is one sentence (ends with its terminal punctuation)
    expect(out[0]!.endsWith('.')).toBe(true);
    for (const piece of out) expect(linesOf(piece)).toBeLessThanOrEqual(2);
  });

  it('falls to CLAUSE then WORD when there is no sentence boundary', () => {
    const text = 'alpha beta gamma delta, epsilon zeta eta theta, iota kappa lambda mu nu';
    const out = splitToFit(text, { maxWidth: W, font, maxLines: 1, measurer: real });
    expect(out.length).toBeGreaterThan(1);
    for (const piece of out) expect(linesOf(piece)).toBeLessThanOrEqual(1);
  });

  it('re-join concatenates back to the original (no fabricated/dropped whitespace)', () => {
    const text = 'The quick brown fox jumps over. The lazy sleepy dog then rests.';
    const out = splitToFit(text, { maxWidth: W, font, maxLines: 1, measurer: real });
    // pieces are trimmed slices; joining with a single space reconstructs the words
    expect(out.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
  });

  it('throws TextFitError naming the token when a single word cannot fit even alone', () => {
    // a 40-char unbreakable token needs 480px but the band is 240px at size 20
    const token = 'x'.repeat(40);
    let caught: unknown;
    try {
      splitToFit(`See ${token} now`, { maxWidth: W, font, maxLines: 1, measurer: real });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TextFitError);
    expect((caught as TextFitError).token).toContain('xxxx');
    expect((caught as Error).message).toMatch(/reword\/shorten/); // reword-first ordering
  });

  it('fails loud without a real measurer, unless { estimate: true }', () => {
    expect(() => splitToFit('some words here', { maxWidth: W, font, maxLines: 2 })).toThrow(MeasurerRequiredError);
    expect(() => splitToFit('some words here', { maxWidth: W, font, maxLines: 2, estimate: true })).not.toThrow();
  });

  it('splits spaceless zh at word boundaries without inserting spaces (Intl.Segmenter locale)', () => {
    // 24 han chars, no spaces; at size 20 each is 12px wide → 288px, exceeds 240 → must split
    const zh = '这是一个非常长的中文字幕需要在带内自动换行并且分割成多个片段显示';
    const out = splitToFit(zh, { maxWidth: W, font, maxLines: 1, measurer: real, locale: 'zh' });
    expect(out.length).toBeGreaterThan(1);
    for (const piece of out) {
      expect(linesOf(piece)).toBeLessThanOrEqual(1);
      expect(piece).not.toMatch(/ /); // no fabricated spaces in zh
    }
  });
});
