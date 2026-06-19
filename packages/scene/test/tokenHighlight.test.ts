/**
 * Multi-range token highlight — the downstream-spec'd behaviors: boundary-
 * exact run matching, the load-bearing drift throw, per-line sub-rects across
 * wraps, and independent per-range animatable targets.
 */

import { describe, expect, it } from 'vitest';
import { key, timeline, track } from '@glissade/core';
import { Text } from '../src/nodes.js';
import { matchTokenRun, tokenHighlight, TokenMatchError } from '../src/tokenHighlight.js';
import { estimatingMeasurer } from '../src/text.js';
import { createScene, bindScene, evaluate } from '../src/scene.js';
import type { DisplayListBuilder } from '../src/displayList.js';
import type { EvalContext } from '../src/node.js';
import type { Node } from '../src/node.js';

interface Recorded {
  cmds: { op: string; [k: string]: unknown }[];
  resources: { kind: string; segs?: [string, ...number[]][] }[];
}

function emitOnce(node: Node): Recorded {
  const rec: Recorded = { cmds: [], resources: [] };
  const out = {
    push: (c: unknown) => rec.cmds.push(c as never),
    resource: (r: { kind: string }) => rec.resources.push(r as never) - 1,
  } as unknown as DisplayListBuilder;
  const ctx: EvalContext = { time: 0, frame: -1, measurer: estimatingMeasurer };
  node.emit(out, ctx);
  return rec;
}

const fills = (rec: Recorded) => rec.cmds.filter((c) => c.op === 'fillPath');

// FIX 2 (0.13 canary): TokenHighlight registers SLASH-BEARING prop paths
// ('<rangeId>/fill'), so its track targets are 'hl/money/fill' (TWO slashes).
// A last-slash resolver split that into node 'hl/money' (nonexistent) and threw
// UnboundTargetError on the normal mount path. The scene's longest-registered-
// prefix resolver must bind 'hl/money/fill' to node 'hl', prop 'money/fill'.
describe('TokenHighlight slash-bearing range props bind through bindScene (no UnboundTargetError)', () => {
  it('animates a TokenHighlight range fill/opacity bound by a timeline', () => {
    const text = new Text({ id: 'para', text: 'Budget approved: $48,200 per year', fontSize: 10 });
    const hl = tokenHighlight(text, {
      id: 'hl',
      ranges: [{ match: '$48,200', id: 'money', fill: '#ffe066', opacity: 1 }],
    });
    const scene = createScene({ size: { w: 400, h: 100 }, children: [text, hl] });
    const doc = timeline({
      duration: 1,
      tracks: [
        track('hl/money/fill', 'color', [key(0, '#ff0000'), key(1, '#00ff00')]),
        track('hl/money/opacity', 'number', [key(0, 0.2), key(1, 1)]),
      ],
    });
    // the regression: this must NOT throw UnboundTargetError
    expect(() => bindScene(scene, doc)).not.toThrow();
    // and the bound signals actually drive the range props
    evaluate(scene, doc, 0);
    expect(scene.resolveTarget('hl/money/opacity')).toBeDefined();
    expect(scene.resolveTarget('hl/money/fill')).toBeDefined();
  });
});

describe('matchTokenRun', () => {
  const boxes = (text: string) => new Text({ text, fontSize: 10 }).wordBoxes(estimatingMeasurer);

  it('matches single boxes and multi-box runs, whitespace-insensitively', () => {
    const b = boxes('Budget approved: $48,200 per year');
    expect(matchTokenRun(b, 'approved:')).toEqual([1, 1]);
    expect(matchTokenRun(b, '$48,200')).toEqual([2, 3]); // '$' + '48,200'
    expect(matchTokenRun(b, '$48,200 per')).toEqual([2, 4]); // spaces live between boxes
  });

  it('occurrence selects the Nth match', () => {
    const b = boxes('go go gadget go');
    expect(matchTokenRun(b, 'go')).toEqual([0, 0]);
    expect(matchTokenRun(b, 'go', 3)).toEqual([3, 3]);
  });

  it('mid-segment ends fail with the actual segment list (boundary-exact)', () => {
    const b = boxes('July 9, 2026');
    // '9,' is one glued segment — a token ending at '9' cannot end on a boundary
    expect(() => matchTokenRun(b, 'July 9')).toThrow(TokenMatchError);
    expect(() => matchTokenRun(b, 'July 9')).toThrow(/segments are \['July', '9,', '2026'\]/);
  });

  it('copy drift fails loudly', () => {
    const b = boxes('Maya Chen presents');
    expect(() => matchTokenRun(b, 'Maya Chan')).toThrow(/no match for token 'Maya Chan'/);
  });
});

describe('TokenHighlight', () => {
  const makeText = () => new Text({ id: 'para', text: 'Budget approved: $48,200 per year', fontSize: 10 });

  it('validates every range at construction', () => {
    expect(() => tokenHighlight(makeText(), { ranges: [{ match: '$99,999' }] })).toThrow(TokenMatchError);
    expect(() => tokenHighlight(makeText(), { ranges: [{ match: [4, 99] }] })).toThrow(/out of bounds/);
  });

  it('draws one rect per range with its own fill; rects cover the padded run', () => {
    const t = makeText();
    const hl = tokenHighlight(t, {
      padding: [0, 0],
      cornerRadius: 0,
      ranges: [
        { match: '$48,200', fill: '#e6a700' },
        { match: 'year', fill: '#4ea1ff' },
      ],
    });
    const rec = emitOnce(hl);
    expect(fills(rec)).toHaveLength(2);
    expect((fills(rec)[0]!.paint as { color: string }).color).toBe('#e6a700');
    expect((fills(rec)[1]!.paint as { color: string }).color).toBe('#4ea1ff');
    // '$48,200' run: '$' starts after 'Budget approved: ' (17 chars · 5.2)
    const segs = rec.resources[0]!.segs!;
    expect(segs[0]![1]).toBeCloseTo(17 * 5.2, 9);
  });

  it('per-range targets resolve: <id>/fill|opacity|progress|scale (custom ids too)', () => {
    const hl = tokenHighlight(makeText(), {
      id: 'hl',
      ranges: [{ match: '$48,200', id: 'money' }, { match: 'year' }],
    });
    for (const path of ['money/fill', 'money/opacity', 'money/progress', 'money/scale', 'r1/fill']) {
      expect(hl.resolveTarget(path), path).toBeDefined();
    }
  });

  it('the drift throw: bound copy changes → loud failure naming the fix', () => {
    const t = makeText();
    const hl = tokenHighlight(t, { ranges: [{ match: '$48,200' }] });
    emitOnce(hl); // fine
    t.text.set('Budget approved: $52,750 per year');
    expect(() => emitOnce(hl)).toThrow(/no longer matches .* rematch: true/s);
  });

  it('rematch: true re-resolves against the new copy instead of throwing', () => {
    const t = makeText();
    const hl = tokenHighlight(t, { rematch: true, ranges: [{ match: 'per' }] });
    emitOnce(hl);
    t.text.set('per diem only');
    expect(fills(emitOnce(hl))).toHaveLength(1);
  });

  it('a range spanning a wrap produces one rect per line segment', () => {
    // width 40 at 5.2/char wraps after each word
    const t = new Text({ text: 'alpha beta gamma', fontSize: 10, width: 40 });
    const hl = tokenHighlight(t, { padding: [0, 0], cornerRadius: 0, ranges: [{ match: 'alpha beta' }] });
    const rec = emitOnce(hl);
    expect(fills(rec)).toHaveLength(2); // 'alpha' on line 0, 'beta' on line 1
  });

  it('progress reveals left-to-right across the range; opacity groups; zero skips', () => {
    const t = makeText();
    const half = tokenHighlight(t, {
      padding: [0, 0],
      cornerRadius: 0,
      ranges: [{ match: '$48,200', progress: 0.5 }],
    });
    const rec = emitOnce(half);
    const full = tokenHighlight(t, { padding: [0, 0], cornerRadius: 0, ranges: [{ match: '$48,200' }] });
    const fullW = full ? widthOf(emitOnce(full).resources[0]!.segs!) : 0;
    expect(widthOf(rec.resources[0]!.segs!)).toBeCloseTo(fullW / 2, 9);

    const faded = tokenHighlight(t, { ranges: [{ match: 'year', opacity: 0.5 }] });
    const fadedRec = emitOnce(faded);
    expect(fadedRec.cmds.some((c) => c.op === 'pushGroup' && c.opacity === 0.5)).toBe(true);

    const off = tokenHighlight(t, { ranges: [{ match: 'year', opacity: 0 }] });
    expect(fills(emitOnce(off))).toHaveLength(0);
  });

  it('scale grows the rect about its center', () => {
    const t = makeText();
    const big = tokenHighlight(t, {
      padding: [0, 0],
      cornerRadius: 0,
      ranges: [{ match: 'year', scale: 2 }],
    });
    const base = tokenHighlight(t, { padding: [0, 0], cornerRadius: 0, ranges: [{ match: 'year' }] });
    const bigSegs = emitOnce(big).resources[0]!.segs!;
    const baseSegs = emitOnce(base).resources[0]!.segs!;
    expect(widthOf(bigSegs)).toBeCloseTo(widthOf(baseSegs) * 2, 9);
    // centers coincide
    expect(bigSegs[0]![1]! + widthOf(bigSegs) / 2).toBeCloseTo(baseSegs[0]![1]! + widthOf(baseSegs) / 2, 9);
  });
});

function widthOf(segs: [string, ...number[]][]): number {
  return segs[1]![1]! - segs[0]![1]!; // M x,y → L x+w,y
}

describe('per-range offset (the shake gap)', () => {
  it('offset translates a range independently; targets resolve incl. components', () => {
    const t = new Text({ id: 'para', text: 'Budget approved: $48,200 per year', fontSize: 10 });
    const hl = tokenHighlight(t, {
      padding: [0, 0],
      cornerRadius: 0,
      ranges: [
        { match: '$48,200', id: 'money', offset: [3, -2] },
        { match: 'year' },
      ],
    });
    for (const path of ['money/offset', 'money/offset.x', 'money/offset.y']) {
      expect(hl.resolveTarget(path), path).toBeDefined();
    }
    const rec = emitOnce(hl);
    const base = tokenHighlight(t, { padding: [0, 0], cornerRadius: 0, ranges: [{ match: '$48,200' }, { match: 'year' }] });
    const baseRec = emitOnce(base);
    // the money rect moved by [3, −2]; the year rect did not
    expect(rec.resources[0]!.segs![0]![1]).toBeCloseTo(baseRec.resources[0]!.segs![0]![1]! + 3, 9);
    expect(rec.resources[0]!.segs![0]![2]).toBeCloseTo(baseRec.resources[0]!.segs![0]![2]! - 2, 9);
    expect(rec.resources[1]!.segs![0]![1]).toBeCloseTo(baseRec.resources[1]!.segs![0]![1]!, 9);
  });
});
