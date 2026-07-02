/**
 * `@glissade/scene/gauge` — `Gauge()` / `Meter()` (0.38): radial arc gauges as a
 * pure build-time fan-out, the data-viz companion to `Chart()`. Binds either a
 * VALUE (through a scale → needle angle, the "Meter" mode) or an AUTHORED needle
 * angle (scripted keyframes on `<id>/needle/rotation`, the teaching-device mode),
 * and fans a spec into ordinary positioned nodes so `evaluate()` stays pure and
 * goldens hold by construction.
 *
 *   const g = Gauge({
 *     id: 'trust', radius: 120,
 *     zones: [
 *       { extent: [-90, -30], color: '#e6a700', label: 'BLIND TRUST' },
 *       { extent: [-30,  30], color: '#3ddc97', label: 'VERIFY, THEN TRUST' },
 *       { extent: [ 30,  90], color: '#ff5d73', label: 'RAGE-QUIT' },
 *     ],
 *     gap: 2.5,
 *   });
 *   // scene children: [g.node]
 *   // scripted needle:  tl.to(g.targets('needle','rotation'), -70, { from: 0 })  // 0 = straight up
 *   // dim a zone:       tl.to(g.targets('zone-0','opacity'), 0.35)               // labels stay full-bright
 *
 * ANGLE CONVENTION: degrees, 0 = straight up (12 o'clock), + = clockwise / right,
 * − = counter-clockwise / left — matching a node's `rotation` (so the needle's
 * rotation IS its gauge angle).
 *
 * INDEPENDENT CHANNELS (the constraint that lets a real labeled gauge dim its
 * zones without crushing label contrast): zone arcs, ticks, needle, and labels
 * are each their OWN addressable child. Labels are drawn LAST (z-above zone
 * decoration) and their opacity is independent of any zone's. Stable sub-ids:
 * `zone-{i}`, `tick-{i}`, `needle`, `label-{i}`, `glow` — target them via
 * `g.targets(sub, prop)` or `g.childId(sub) + '/' + prop`.
 *
 * On its own tree-shakeable subpath (off the base embed), re-exported onto the
 * `@glissade/browser` IIFE. Value→angle (Meter mode) is a plain linear remap
 * (inlined, so the gauge bundle stays free of the whole chart.ts module).
 */

import type { PathValue, Vec2 } from '@glissade/core';
import { Circle, Group, Path, Rect, Text } from './nodes.js';

export class GaugeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GaugeError';
  }
}

/** One categorical zone: an angular `extent` (degrees), a color, an optional label. */
export interface GaugeZone {
  /** `[start, end]` in degrees (0 = up, + = clockwise). start < end. */
  readonly extent: readonly [number, number];
  /** the zone arc's stroke color. */
  readonly color: string;
  /** optional label drawn at the zone's mid-angle (its own addressable node). */
  readonly label?: string;
  /**
   * per-label style override (family / size / fill / weight) — layered OVER the
   * computed default (uniform size/fill + the apex size-up). Lets a consumer keep
   * a per-episode text override AND restyle any single `label-{i}`.
   */
  readonly labelStyle?: {
    readonly family?: string;
    readonly size?: number;
    readonly fill?: string;
    readonly weight?: number;
  };
}

export interface GaugeSpec {
  /** stable id — every child is namespaced under it. */
  id: string;
  /** arc radius (px), measured to the centerline of the zone band. */
  radius: number;
  /** the categorical zones, in angular order. At least one. */
  zones: readonly GaugeZone[];
  /** zone-arc stroke width (px). Default `radius * 0.14`. */
  thickness?: number;
  /** degrees trimmed off EACH side of every zone boundary (a visual gap). Default 0. */
  gap?: number;
  /** draw a needle (default true). Object form overrides its geometry. */
  needle?: boolean | { length?: number; width?: number; color?: string };
  /** authored initial needle angle (deg, 0 = up). Ignored when `value` is set. */
  needleAngle?: number;
  /**
   * Meter mode: a value (or `() => value` signal) mapped through `domain` across
   * the gauge's total sweep → the needle angle. A function binds live (the needle
   * follows the signal); a number sets the initial angle. Omit for authored mode.
   */
  value?: number | (() => number);
  /** value domain for Meter mode (default `[0, 1]`). */
  domain?: readonly [number, number];
  /** total angular sweep `[start, end]` the value maps across. Default = zone union. */
  sweep?: readonly [number, number];
  /** draw boundary ticks at each distinct zone edge (default true). */
  ticks?: boolean;
  /** label font size (px). Default `radius * 0.13`. The mid zone's label is a size up. */
  labelSize?: number;
  /** label color. Default `#eaf1ff`. */
  labelFill?: string;
  /** label font family. Default `sans-serif`. */
  fontFamily?: string;
  /**
   * emphasize the apex zone's label (the one straddling straight-up): `true`
   * (default) = ×1.18 size + bold; `false` = no size-up (portrait-safe — the
   * narrower stage can't afford the bump); a number = a custom size scale + bold.
   * Gauge is a build-time factory and can't see the stage aspect, so gate this on
   * your own `isPortrait(size)`.
   */
  apexEmphasis?: boolean | number;
  /** add a center glow Circle (`glow` sub-id, opacity 0 — author animates it). */
  glow?: boolean | { color?: string; radius?: number };
  /** where to place the gauge center in the parent (default the parent origin). */
  position?: readonly [number, number];
}

export interface GaugeResult {
  /** the built subtree (a Group whose id === the gauge id). */
  readonly node: Group;
  readonly id: string;
  /** namespace a child id: `childId('needle')` → `'<id>/needle'`; no arg → the root id. */
  childId(sub?: string): string;
  /** ready-to-bind track targets: `targets('needle','rotation')` → `['<id>/needle/rotation']`. */
  targets(sub: string, prop: string): string[];
}

const DEG = Math.PI / 180;

/** Linear remap of `v` from `domain` onto `range` (the value→angle map, Meter mode). */
function mapLinear(v: number, domain: readonly [number, number], range: readonly [number, number]): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

/** A point on the gauge circle at angle `g` (deg, 0 = up, + = clockwise). */
function pointAt(radius: number, g: number): Vec2 {
  const r = g * DEG;
  return [radius * Math.sin(r), -radius * Math.cos(r)];
}

/** An open polyline contour tracing the arc `a→b` at `radius`, sampled ≤ `step` deg. */
function arcContour(radius: number, a: number, b: number, step = 2): PathValue {
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
  const v: Vec2[] = [];
  for (let k = 0; k <= n; k++) v.push(pointAt(radius, a + ((b - a) * k) / n));
  const zero: Vec2[] = v.map(() => [0, 0] as Vec2);
  return [{ closed: false, v, in: zero, out: zero }];
}

/** A closed triangle pointing up (−y), tip at `(0,-len)`, base width `w`. */
function needleContour(len: number, w: number): PathValue {
  const v: Vec2[] = [
    [0, -len],
    [-w / 2, 0],
    [w / 2, 0],
  ];
  const zero: Vec2[] = v.map(() => [0, 0] as Vec2);
  return [{ closed: true, v, in: zero, out: zero }];
}

/**
 * Build a radial arc gauge. Returns the subtree + the child-id/target helpers.
 * Pure: runs once at construction, emits ordinary nodes, nothing at play time.
 */
export function Gauge(spec: GaugeSpec): GaugeResult {
  const { id } = spec;
  if (!id) throw new GaugeError('Gauge needs a stable id (every child is namespaced under it)');
  if (!(spec.radius > 0)) throw new GaugeError(`Gauge '${id}': radius must be > 0 (got ${spec.radius})`);
  if (!spec.zones || spec.zones.length === 0) throw new GaugeError(`Gauge '${id}': needs at least one zone`);

  const radius = spec.radius;
  const thickness = spec.thickness ?? radius * 0.14;
  const gap = spec.gap ?? 0;
  const cid = (sub?: string): string => (sub === undefined || sub === '' ? id : `${id}/${sub}`);

  let lo = Infinity;
  let hi = -Infinity;
  spec.zones.forEach((z, i) => {
    const [a, b] = z.extent;
    if (!(a < b)) throw new GaugeError(`Gauge '${id}': zone ${i} extent must be [start < end] (got [${a}, ${b}])`);
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  });

  const children: (Group | Path | Rect | Text | Circle)[] = [];

  // 0) optional center glow — lowest z, opacity 0 by default (author animates it)
  if (spec.glow) {
    const g = typeof spec.glow === 'object' ? spec.glow : {};
    children.push(
      new Circle({ id: cid('glow'), radius: g.radius ?? radius * 0.5, fill: g.color ?? '#ffffff', opacity: 0 }),
    );
  }

  // 1) zone arcs — each an independently-addressable stroked Path
  spec.zones.forEach((z, i) => {
    const [a, b] = z.extent;
    children.push(
      new Path({ id: cid(`zone-${i}`), data: arcContour(radius, a + gap / 2, b - gap / 2), stroke: z.color, strokeWidth: thickness }),
    );
  });

  // 2) boundary ticks at each distinct zone edge (thin radial Rects)
  if (spec.ticks !== false) {
    const edges = new Set<number>();
    spec.zones.forEach((z) => {
      edges.add(z.extent[0]);
      edges.add(z.extent[1]);
    });
    let t = 0;
    for (const g of [...edges].sort((x, y) => x - y)) {
      const [x, y] = pointAt(radius, g);
      children.push(
        new Rect({ id: cid(`tick-${t++}`), anchor: 'center', position: [x, y], width: Math.max(1, thickness * 0.12), height: thickness * 1.4, rotation: g, fill: '#ffffff' }),
      );
    }
  }

  // 3) needle — a filled triangle whose rotation IS the gauge angle
  if (spec.needle !== false) {
    const n = typeof spec.needle === 'object' ? spec.needle : {};
    const len = n.length ?? radius * 0.92;
    const w = n.width ?? Math.max(4, radius * 0.05);
    // angle source: value→scale (Meter) or an authored constant
    let rotation: number | (() => number);
    if (spec.value !== undefined) {
      const sweep: readonly [number, number] = spec.sweep ?? [lo, hi];
      const domain = spec.domain ?? [0, 1];
      rotation =
        typeof spec.value === 'function'
          ? ((): number => mapLinear((spec.value as () => number)(), domain, sweep))
          : mapLinear(spec.value, domain, sweep);
    } else {
      rotation = spec.needleAngle ?? 0;
    }
    children.push(new Path({ id: cid('needle'), data: needleContour(len, w), fill: n.color ?? '#eaf1ff', rotation }));
  }

  // 4) labels — LAST (z-above zone decoration), each its OWN node so its opacity is
  //    independent of any zone's dim/tint. The zone straddling 0 (the apex) is a size up.
  const labelSize = spec.labelSize ?? radius * 0.13;
  const labelFill = spec.labelFill ?? '#eaf1ff';
  const fontFamily = spec.fontFamily ?? 'sans-serif';
  // apex emphasis: true → ×1.18 + bold; false → none (portrait-safe); number → custom scale + bold
  const apex = spec.apexEmphasis ?? true;
  const apexScale = apex === false ? 1 : apex === true ? 1.18 : apex;
  const apexWeight = apex === false ? 400 : 700;
  spec.zones.forEach((z, i) => {
    if (z.label === undefined) return;
    const mid = (z.extent[0] + z.extent[1]) / 2;
    // offset uses the BASE labelSize (not the per-label size) so the apex size-up
    // and per-label overrides don't shift label placement.
    const [x, y] = pointAt(radius + thickness / 2 + labelSize * 0.9, mid);
    const isApex = z.extent[0] < 0 && z.extent[1] > 0; // straddles straight-up
    const st = z.labelStyle ?? {};
    children.push(
      new Text({
        id: cid(`label-${i}`),
        text: z.label,
        position: [x, y],
        anchor: 'center',
        align: 'center',
        fill: st.fill ?? labelFill,
        fontFamily: st.family ?? fontFamily,
        fontSize: st.size ?? (isApex ? labelSize * apexScale : labelSize),
        fontWeight: st.weight ?? (isApex ? apexWeight : 400),
        box: { valign: 'center' },
      }),
    );
  });

  const node = new Group({ id, children, ...(spec.position ? { position: [spec.position[0], spec.position[1]] as Vec2 } : {}) });
  return {
    node,
    id,
    childId: cid,
    targets: (sub, prop) => [`${cid(sub)}/${prop}`],
  };
}

/**
 * `Meter()` — the Gauge value preset: a single value (or signal) mapped through a
 * domain to the needle across a colored track. Convenience over
 * `Gauge({ value, domain, zones })`; the same result shape + sub-ids.
 */
export function Meter(spec: Omit<GaugeSpec, 'value'> & { value: number | (() => number) }): GaugeResult {
  return Gauge(spec);
}
