/**
 * `@glissade/scene/chart` — `Chart()`: bind a table → a first-class, animatable
 * bar chart (0.32, the data-motion stack). Like `Grid()` / `splitText()`, it is a
 * PURE BUILD-TIME FAN-OUT — it resolves rows against serializable SCALES into
 * positioned + sized child `Rect` bars at CONSTRUCTION, stamps a stable id per
 * bar, and returns a `Group`. Nothing executes at play time, so `evaluate()`
 * stays a pure function of time and the goldens hold by construction.
 *
 * Each bar is anchored at its BASE (`anchor: 'bottom'`) and pinned to the axis
 * baseline, so its `height` grows UPWARD from the axis — a bar-chart race / grow-
 * in reveal is just a `height` track per bar (or a `fill` track for a colour
 * sweep). `chart.targets('height')` hands you the ready-to-bind target ids in row
 * order, exactly like `splitText().targets(...)`:
 *
 *   const chart = Chart({
 *     id: 'sales', width: 600, height: 360,
 *     data: [{ m: 'Jan', v: 120 }, { m: 'Feb', v: 180 }, { m: 'Mar', v: 90 }],
 *     xKey: 'm', yKey: 'v',
 *     fill: colorRamp(['#39e0ff', '#ffcf3f']),   // ramp over the value domain
 *   });
 *   // scene children: [chart.node]
 *   tl.stagger(chart.targets('height'), { from: 0 }, { each: 0.08 }); // bars rise in
 *
 * SEPARATE entry point with its own budget (mirrors `grid`/`type`/`motion`) — the
 * base embed never pays for it; re-exported onto the `@glissade/browser` IIFE so
 * `window.glissade.Chart` (+ the scale factories) survive for no-build consumers.
 */

import { Node, type NodeProps } from './node.js';
import { Group, Rect } from './nodes.js';

export class ChartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartError';
  }
}

/** One data row: a plain record. `xKey`/`yKey` name the label + numeric columns. */
export type DataRow = Readonly<Record<string, unknown>>;

/**
 * A continuous scale: a pure, serializable map from a numeric DOMAIN onto a pixel
 * (or unit) RANGE. `linearScale`/`logScale` produce these. Serializable by shape
 * (`{ id, domain, range }`) so an agent/tool can round-trip it, matching the
 * data-motion card's "scales are value-types" pitch.
 */
export interface Scale {
  readonly id: 'linear' | 'log';
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  /** Map a domain value onto the range (clamped-free — extrapolates linearly). */
  map(v: number): number;
}

/** A categorical BAND scale: N equal bands across a range, each with a `bandwidth`. */
export interface BandScale {
  readonly id: 'band';
  readonly count: number;
  readonly range: readonly [number, number];
  /** The width of one band's drawable area (after padding). */
  readonly bandwidth: number;
  /** The CENTER of band `i` (0-based) within the range. */
  map(i: number): number;
}

/** A colour-ramp scale: a numeric domain → an interpolated hex colour STRING. */
export interface ColorScale {
  readonly id: 'color-ramp';
  readonly stops: readonly string[];
  readonly domain: readonly [number, number];
  /** Map a domain value onto its interpolated colour (`#rrggbb`). */
  map(v: number): string;
}

/** A linear scale mapping `domain` → `range` (the workhorse for a value axis). */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return {
    id: 'linear',
    domain,
    range,
    map: (v) => (span === 0 ? r0 : r0 + ((v - d0) / span) * (r1 - r0)),
  };
}

/**
 * A base-10 logarithmic scale. Requires a strictly-positive domain (log of a
 * non-positive number is undefined) — throws otherwise, fail-loud.
 */
export function logScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 <= 0 || d1 <= 0) {
    throw new ChartError(`logScale needs a strictly-positive domain (got [${d0}, ${d1}])`);
  }
  const l0 = Math.log10(d0);
  const lspan = Math.log10(d1) - l0;
  return {
    id: 'log',
    domain,
    range,
    map: (v) => {
      if (v <= 0) throw new ChartError(`logScale cannot map a non-positive value (${v})`);
      return lspan === 0 ? r0 : r0 + ((Math.log10(v) - l0) / lspan) * (r1 - r0);
    },
  };
}

/**
 * A categorical band scale: `count` equal bands across `range`, separated by a
 * `padding` fraction (0..1) of each step. `map(i)` is band `i`'s center;
 * `bandwidth` is its drawable width.
 */
export function bandScale(
  count: number,
  range: readonly [number, number],
  padding = 0.2,
): BandScale {
  if (!Number.isInteger(count) || count < 1) {
    throw new ChartError(`bandScale needs a positive integer count (got ${count})`);
  }
  if (padding < 0 || padding >= 1) {
    throw new ChartError(`bandScale padding must be in [0, 1) (got ${padding})`);
  }
  const [r0, r1] = range;
  const step = (r1 - r0) / count;
  const bandwidth = step * (1 - padding);
  return {
    id: 'band',
    count,
    range,
    bandwidth,
    map: (i) => r0 + step * i + step / 2,
  };
}

/** Parse a `#rgb`/`#rrggbb` hex string to `[r, g, b]` bytes; throws on a bad format. */
function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new ChartError(`colorRamp stop '${hex}' is not a #rgb/#rrggbb hex colour`);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
}

/**
 * A colour ramp over `domain` (default `[0, 1]`): at least two hex stops,
 * interpolated in sRGB byte space. `map(v)` returns `#rrggbb`. Deterministic and
 * pure — the same v yields the same bytes, so a fill driven by a ramp is golden-
 * stable.
 */
export function colorRamp(
  stops: readonly string[],
  domain: readonly [number, number] = [0, 1],
): ColorScale {
  if (stops.length < 2) throw new ChartError('colorRamp needs at least two colour stops');
  const rgb = stops.map(parseHex);
  const [d0, d1] = domain;
  const span = d1 - d0;
  return {
    id: 'color-ramp',
    stops,
    domain,
    map: (v) => {
      const t = span === 0 ? 0 : Math.max(0, Math.min(1, (v - d0) / span));
      const seg = t * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(seg));
      const f = seg - i;
      const a = rgb[i]!;
      const b = rgb[i + 1]!;
      return `#${toHex(a[0] + (b[0] - a[0]) * f)}${toHex(a[1] + (b[1] - a[1]) * f)}${toHex(a[2] + (b[2] - a[2]) * f)}`;
    },
  };
}

export interface ChartSpec extends NodeProps {
  /** Stable id — REQUIRED; bars bind tracks against `${id}/bars/${i}`. */
  id: string;
  /** The rows to plot (each a plain record). */
  data: readonly DataRow[];
  /** The column naming each bar's category label (used for ordering / count). */
  xKey: string;
  /** The column naming each bar's numeric value. */
  yKey: string;
  /** Total chart width (px) the bands divide. */
  width: number;
  /** Total chart height (px) — a full-value bar fills it. */
  height: number;
  /**
   * The value → height scale. Defaults to `linearScale([0, max(y)], [0, height])`
   * (turnkey: bars are proportional to their value, tallest fills the box).
   */
  yScale?: Scale;
  /** Gap fraction between bars (0..1) passed to the internal band scale. Default 0.2. */
  bandPadding?: number;
  /**
   * Bar fill: a solid colour string, or a `ColorScale` evaluated at each bar's
   * VALUE (a colour ramp over the data). Default `'#4f8cff'`.
   */
  fill?: string | ColorScale;
}

export interface ChartResult {
  /** The wrapping group (center-anchored on its content box, like Grid). */
  readonly node: Group;
  /** The bar nodes in row order — `bars[i]` plots `data[i]`. */
  readonly bars: readonly Rect[];
  /** Ready-to-bind target ids in row order: `${id}/bars/${i}/${prop}`. */
  targets(prop: string): string[];
}

/** Coerce a row's numeric column, failing loud on a non-finite value. */
function numAt(row: DataRow, key: string, i: number): number {
  const raw = row[key];
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new ChartError(`Chart row ${i}: ${key}=${JSON.stringify(raw)} is not a finite number`);
  }
  return n;
}

/**
 * Build a bar chart from `data` and return a `Group` of bars, each pinned to the
 * axis at its base and sized to its value. Center-anchored (the group origin is
 * the center of the content box), matching every other glissade node's convention.
 *
 * The bars are freshly constructed nodes (never cloned from the caller); their
 * `height`/`fill` are plain signals, so a later track bind against
 * `chart.targets(prop)` wins and drives the reveal.
 */
export function Chart(spec: ChartSpec): ChartResult {
  const { id, data, xKey, yKey, width, height, bandPadding = 0.2, fill = '#4f8cff' } = spec;
  if (data.length === 0) throw new ChartError('Chart needs at least one data row');
  if (!(width > 0) || !(height > 0)) {
    throw new ChartError(`Chart needs positive width/height (got ${width}×${height})`);
  }

  const values = data.map((row, i) => numAt(row, yKey, i));
  // touch xKey so a missing label column fails loud too (ordering + count source)
  data.forEach((row, i) => {
    if (row[xKey] === undefined) {
      throw new ChartError(`Chart row ${i}: missing xKey '${xKey}'`);
    }
  });

  const yMax = Math.max(...values, 0);
  const yScale = spec.yScale ?? linearScale([0, yMax === 0 ? 1 : yMax], [0, height]);
  const bands = bandScale(data.length, [0, width], bandPadding);

  // center the content box on the group origin (like Grid): left edge at -w/2,
  // axis baseline at the bottom (+h/2). Bars are bottom-anchored, so a `height`
  // of H grows the bar UPWARD from the baseline.
  const ox = -width / 2;
  const baseline = height / 2;

  const bars: Rect[] = data.map((row, i) => {
    const h = yScale.map(values[i]!);
    const barFill = typeof fill === 'string' ? fill : fill.map(values[i]!);
    return new Rect({
      id: `${id}/bars/${i}`,
      anchor: 'bottom',
      position: [ox + bands.map(i), baseline],
      width: bands.bandwidth,
      height: h,
      fill: barFill,
    });
  });

  const node = new Group({ id, children: bars as Node[], ...stripChartOnly(spec) });
  const targets = (prop: string): string[] => {
    // fail loud rather than emit '<id>/bars/<i>/undefined' targets that surface
    // much later as a confusing UnboundTargetError (the no-build seat's nit).
    if (!prop) {
      throw new ChartError(
        "Chart.targets(prop) needs a prop name, e.g. targets('height') or targets('fill')",
      );
    }
    return bars.map((_, i) => `${id}/bars/${i}/${prop}`);
  };
  return { node, bars, targets };
}

/** Strip Chart's own props so the rest (position/opacity/anchor/…) pass to the Group. */
function stripChartOnly(spec: ChartSpec): NodeProps {
  const { id, data, xKey, yKey, width, height, yScale, bandPadding, fill, children, ...nodeProps } =
    spec as ChartSpec & { children?: unknown };
  void id;
  void data;
  void xKey;
  void yKey;
  void width;
  void height;
  void yScale;
  void bandPadding;
  void fill;
  void children;
  return nodeProps;
}
