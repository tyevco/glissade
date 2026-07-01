/**
 * Chart() + scales (0.32, the data-motion stack). Proves the build-time fan-out
 * is DETERMINISTIC (a fixed table → fixed bar positions/sizes), the scales map
 * exactly, bars are pinned to the axis + grown from their base (bottom-anchor),
 * and `targets()` yields the splitText-shaped bind ids. Pure — no play-time state.
 */

import { describe, expect, it } from 'vitest';
import {
  Chart,
  ChartError,
  linearScale,
  logScale,
  bandScale,
  colorRamp,
} from '../src/chart.js';

describe('scales', () => {
  it('linearScale maps domain → range and extrapolates', () => {
    const s = linearScale([0, 100], [0, 400]);
    expect(s.map(0)).toBe(0);
    expect(s.map(100)).toBe(400);
    expect(s.map(50)).toBe(200);
    expect(s.map(150)).toBe(600); // extrapolates (no clamp)
    expect(s.id).toBe('linear');
    expect(s.domain).toEqual([0, 100]);
  });

  it('linearScale with a zero-span domain pins to range start', () => {
    expect(linearScale([5, 5], [0, 400]).map(5)).toBe(0);
  });

  it('logScale maps a positive domain and throws on non-positive', () => {
    const s = logScale([1, 100], [0, 100]);
    expect(s.map(1)).toBe(0);
    expect(s.map(100)).toBe(100);
    expect(s.map(10)).toBeCloseTo(50, 9); // log10(10)=1 of 2 decades
    expect(() => logScale([0, 100], [0, 1])).toThrow(ChartError);
    expect(() => s.map(0)).toThrow(ChartError);
    expect(() => s.map(-3)).toThrow(ChartError);
  });

  it('bandScale gives N centers + a padded bandwidth', () => {
    const b = bandScale(3, [0, 600], 0.2);
    expect(b.count).toBe(3);
    expect(b.bandwidth).toBeCloseTo(160, 9); // step 200 × (1-0.2)
    expect(b.map(0)).toBe(100);
    expect(b.map(1)).toBe(300);
    expect(b.map(2)).toBe(500);
    expect(() => bandScale(0, [0, 1])).toThrow(ChartError);
    expect(() => bandScale(2.5, [0, 1])).toThrow(ChartError);
    expect(() => bandScale(3, [0, 1], 1)).toThrow(ChartError);
  });

  it('colorRamp interpolates hex stops in sRGB', () => {
    const r = colorRamp(['#000000', '#ffffff'], [0, 1]);
    expect(r.map(0)).toBe('#000000');
    expect(r.map(1)).toBe('#ffffff');
    expect(r.map(0.5)).toBe('#808080'); // 127.5 → 128 → 0x80
    // multi-stop: pick the right segment
    const g = colorRamp(['#ff0000', '#00ff00', '#0000ff']);
    expect(g.map(0)).toBe('#ff0000');
    expect(g.map(0.5)).toBe('#00ff00');
    expect(g.map(1)).toBe('#0000ff');
    expect(() => colorRamp(['#000000'])).toThrow(ChartError);
    expect(() => colorRamp(['#000000', 'nothex'])).toThrow(ChartError);
    // #rgb shorthand expands
    expect(colorRamp(['#f00', '#00f']).map(0)).toBe('#ff0000');
  });
});

describe('Chart', () => {
  const data = [
    { m: 'Jan', v: 120 },
    { m: 'Feb', v: 180 },
    { m: 'Mar', v: 90 },
  ];

  it('lays bars out deterministically: centered box, pinned base, value-scaled height', () => {
    const chart = Chart({ id: 'sales', data, xKey: 'm', yKey: 'v', width: 600, height: 360 });
    expect(chart.node.id).toBe('sales');
    expect(chart.bars).toHaveLength(3);
    // x: band centers 100/300/500 offset by -width/2 → -200/0/200; base y at +height/2
    expect(chart.bars[0]!.position()).toEqual([-200, 180]);
    expect(chart.bars[1]!.position()).toEqual([0, 180]);
    expect(chart.bars[2]!.position()).toEqual([200, 180]);
    // default yScale linear [0,max=180] → [0,360]: 120→240, 180→360, 90→180
    expect(chart.bars[0]!.height()).toBe(240);
    expect(chart.bars[1]!.height()).toBe(360);
    expect(chart.bars[2]!.height()).toBe(180);
    // padded bandwidth 160
    expect(chart.bars[0]!.width()).toBeCloseTo(160, 9);
  });

  it('bars are bottom-anchored so height grows from the axis, ids namespaced under the chart', () => {
    const chart = Chart({ id: 'q', data, xKey: 'm', yKey: 'v', width: 300, height: 200 });
    // bottom-center anchor, resolved to its [0.5, 1] Vec2 by the node
    expect(chart.bars[0]!.anchor).toEqual([0.5, 1]);
    expect(chart.bars[0]!.id).toBe('q/bars/0');
    expect(chart.bars[2]!.id).toBe('q/bars/2');
  });

  it('targets(prop) yields splitText-shaped bind ids in row order', () => {
    const chart = Chart({ id: 'sales', data, xKey: 'm', yKey: 'v', width: 600, height: 360 });
    expect(chart.targets('height')).toEqual([
      'sales/bars/0/height',
      'sales/bars/1/height',
      'sales/bars/2/height',
    ]);
    expect(chart.targets('fill')).toEqual(['sales/bars/0/fill', 'sales/bars/1/fill', 'sales/bars/2/fill']);
  });

  it('accepts an explicit yScale and a colorRamp fill', () => {
    const chart = Chart({
      id: 'c',
      data,
      xKey: 'm',
      yKey: 'v',
      width: 600,
      height: 300,
      yScale: linearScale([0, 200], [0, 300]),
      fill: colorRamp(['#000000', '#ffffff'], [0, 180]),
    });
    expect(chart.bars[1]!.height()).toBe(270); // 180/200 × 300
    expect(chart.bars[1]!.fill()).toBe('#ffffff'); // value 180 = ramp domain max
    expect(chart.bars[2]!.fill()).toBe('#808080'); // value 90 = midpoint
  });

  it('is a pure function of its inputs (same table → identical layout)', () => {
    const a = Chart({ id: 'x', data, xKey: 'm', yKey: 'v', width: 640, height: 360 });
    const b = Chart({ id: 'x', data, xKey: 'm', yKey: 'v', width: 640, height: 360 });
    expect(a.bars.map((bar) => [bar.position(), bar.width(), bar.height()])).toEqual(
      b.bars.map((bar) => [bar.position(), bar.width(), bar.height()]),
    );
  });

  it('fails loud on empty data, a non-finite value, a missing key, or bad dimensions', () => {
    expect(() => Chart({ id: 'e', data: [], xKey: 'm', yKey: 'v', width: 600, height: 360 })).toThrow(ChartError);
    expect(() =>
      Chart({ id: 'e', data: [{ m: 'A', v: 'oops' }], xKey: 'm', yKey: 'v', width: 600, height: 360 }),
    ).toThrow(/not a finite number/);
    expect(() =>
      Chart({ id: 'e', data: [{ v: 5 }], xKey: 'm', yKey: 'v', width: 600, height: 360 }),
    ).toThrow(/missing xKey/);
    expect(() => Chart({ id: 'e', data, xKey: 'm', yKey: 'v', width: 0, height: 360 })).toThrow(ChartError);
  });
});
