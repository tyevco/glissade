/**
 * fitText / fitTextGroup (shrink-to-fit) + Text box-valign (0.35) — the
 * "text geometry the author shouldn't hand-roll" pieces. A deterministic stub
 * measurer (monospace: each glyph = fontSize wide, ascent 0.8 / descent 0.2)
 * makes the binary search + ink-metric offset exact without a backend.
 */

import { describe, expect, it } from 'vitest';
import { Text } from '../src/nodes.js';
import { fitText, fitTextSize, fitTextGroup } from '../src/type.js';
import type { TextMeasurer } from '../src/text.js';

// monospace stub: width = chars × size; ascent/descent proportional. Exact, no font.
const mono: TextMeasurer = {
  measureText: (t, font) => ({ width: t.length * font.size, ascent: font.size * 0.8, descent: font.size * 0.2 }),
};

describe('fitTextSize / fitText', () => {
  it('keeps the authored size when it already fits', () => {
    const t = new Text({ text: 'hi', fontSize: 20, fontFamily: 'x' });
    expect(fitTextSize(t, { maxW: 1000, maxLines: 1, measurer: mono })).toBe(20);
  });

  it('binary-searches the largest fitting size (single line)', () => {
    // 'wide word' = 9 chars; to fit maxW=90 on one line → size ≤ 10
    const t = new Text({ text: 'wide word', fontSize: 40, fontFamily: 'x' });
    expect(fitTextSize(t, { maxW: 90, maxLines: 1, measurer: mono })).toBe(10);
  });

  it('honors maxLines via the wrap (more lines allowed → bigger size)', () => {
    // 'aaa bbb ccc' (11ch) in maxW=150: one line needs 11·s ≤ 150 (s ≤ 13);
    // two lines wrap 'aaa bbb'(7ch)/'ccc' so s can be larger.
    const t = new Text({ text: 'aaa bbb ccc', fontSize: 30, fontFamily: 'x' });
    const oneLine = fitTextSize(t, { maxW: 150, maxLines: 1, measurer: mono });
    const twoLine = fitTextSize(t, { maxW: 150, maxLines: 2, measurer: mono });
    expect(oneLine).toBe(13);
    expect(twoLine).toBeGreaterThan(oneLine); // 2 lines allowed ⇒ can be bigger
  });

  it('fitText mutates fontSize + width and returns the node', () => {
    const t = new Text({ text: 'shrink me', fontSize: 50, fontFamily: 'x' });
    const r = fitText(t, { maxW: 90, maxLines: 1, measurer: mono });
    expect(r).toBe(t);
    expect(t.fontSize()).toBe(10);
    expect(t.width()).toBe(90);
  });

  it('fails loud when even minPx overflows; clamps with onOverflow', () => {
    const t = () => new Text({ text: 'unbreakableword', fontSize: 40, fontFamily: 'x' });
    expect(() => fitTextSize(t(), { maxW: 20, maxLines: 1, minPx: 10, measurer: mono })).toThrow(/does not fit/);
    expect(fitTextSize(t(), { maxW: 20, maxLines: 1, minPx: 10, onOverflow: 'clamp', measurer: mono })).toBe(10);
  });

  it('fitTextGroup fits all texts to ONE shared size (the ragged-headers fix)', () => {
    const texts = ['OK', 'a longer label', 'mid'].map((t) => new Text({ text: t, fontSize: 40, fontFamily: 'x' }));
    const shared = fitTextGroup(texts, { maxW: 140, maxLines: 1, measurer: mono });
    expect(texts.every((t) => t.fontSize() === shared)).toBe(true);
    // shared = min individual fit → pinned by the longest ('a longer label' = 14 chars → 10)
    expect(shared).toBe(10);
  });
});

describe('Text box-valign', () => {
  const inkBand = (t: Text): { top: number; bottom: number } => {
    const boxes = t.lineBoxes(mono);
    let top = Infinity;
    let bottom = -Infinity;
    for (const b of boxes) {
      top = Math.min(top, b.y);
      bottom = Math.max(bottom, b.y + b.h);
    }
    return { top, bottom };
  };

  it('default (no box) is baseline-anchored — first baseline at y=0', () => {
    const t = new Text({ text: 'Ay', fontSize: 100, fontFamily: 'x' }); // ascent 80, descent 20
    const b = inkBand(t);
    expect(b.top).toBe(-80); // baseline at 0, ascent up
    expect(b.bottom).toBe(20);
  });

  it("valign 'center' puts the ink CENTER on the node position (y=0)", () => {
    const t = new Text({ text: 'Ay', fontSize: 100, fontFamily: 'x', box: { valign: 'center' } });
    const b = inkBand(t);
    expect((b.top + b.bottom) / 2).toBeCloseTo(0, 6); // ink centered on the origin
  });

  it("valign 'top'/'bottom' frame the ink in an h-tall box centered on the position", () => {
    const top = new Text({ text: 'Ay', fontSize: 100, fontFamily: 'x', box: { valign: 'top', h: 200 } });
    expect(inkBand(top).top).toBeCloseTo(-100, 6); // ink top at -h/2
    const bot = new Text({ text: 'Ay', fontSize: 100, fontFamily: 'x', box: { valign: 'bottom', h: 200 } });
    expect(inkBand(bot).bottom).toBeCloseTo(100, 6); // ink bottom at +h/2
  });

  it('multi-line centering uses the FULL ink block, not the first line', () => {
    const t = new Text({ text: 'one\ntwo', fontSize: 100, fontFamily: 'x', lineHeight: 1, box: { valign: 'center' } });
    const b = inkBand(t);
    expect((b.top + b.bottom) / 2).toBeCloseTo(0, 6); // both lines centered together
    expect(b.bottom - b.top).toBeGreaterThan(100); // spans two lines
  });

  it('box is an accepted construction prop; unknown keys still reject', () => {
    expect(() => new Text({ text: 'x', box: { valign: 'center' } })).not.toThrow();
    expect(() => new Text({ text: 'x', vAlign: 'center' } as never)).toThrow(/vAlign/);
  });
});
