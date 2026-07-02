/**
 * Gauge() / Meter() (0.38) — radial data-viz as a pure build-time fan-out. Proves
 * the zone/tick/needle/label fan-out, the stable sub-ids, value→angle (Meter) vs
 * authored-angle (scripted) needle, the INDEPENDENT-CHANNELS invariant (labels are
 * separate nodes drawn z-above the zones, so a zone dim can't crush a label),
 * purity, and the fail-loud guards.
 */

import { describe, expect, it } from 'vitest';
import { timeline, track, key, signal } from '@glissade/core';
import { Group, Path, Rect, Text, createScene, evaluate } from '../src/index.js';
import { Gauge, Meter, GaugeError } from '../src/gauge.js';

const ZONES = [
  { extent: [-90, -30] as const, color: '#e6a700', label: 'BLIND TRUST' },
  { extent: [-30, 30] as const, color: '#3ddc97', label: 'VERIFY' },
  { extent: [30, 90] as const, color: '#ff5d73', label: 'RAGE-QUIT' },
];

const byId = (g: Group, id: string): unknown => g.children.find((c) => c.id === id);

describe('Gauge fan-out', () => {
  it('builds a Group with zone Paths, tick Rects, a needle Path, and label Texts', () => {
    const g = Gauge({ id: 'tr', radius: 100, zones: ZONES, gap: 2.5 });
    expect(g.node).toBeInstanceOf(Group);
    expect(g.node.id).toBe('tr');
    // one stroked Path per zone, coloured, no fill
    for (let i = 0; i < 3; i++) {
      const z = byId(g.node, `tr/zone-${i}`);
      expect(z).toBeInstanceOf(Path);
      expect((z as Path).stroke()).toBe(ZONES[i]!.color);
      expect((z as Path).strokeWidth()).toBeGreaterThan(0);
      expect((z as Path).fill()).toBe(''); // stroked-only arc, no chord fill
    }
    // needle present, a filled Path
    expect(byId(g.node, 'tr/needle')).toBeInstanceOf(Path);
    // 4 distinct zone edges (-90,-30,30,90) → 4 tick Rects
    const ticks = g.node.children.filter((c) => c.id?.startsWith('tr/tick-'));
    expect(ticks.length).toBe(4);
    expect(ticks.every((t) => t instanceof Rect)).toBe(true);
    // 3 labels, Texts
    const labels = g.node.children.filter((c) => c.id?.startsWith('tr/label-'));
    expect(labels.length).toBe(3);
    expect(labels.every((l) => l instanceof Text)).toBe(true);
  });

  it('exposes stable sub-ids via childId / targets', () => {
    const g = Gauge({ id: 'tr', radius: 100, zones: ZONES });
    expect(g.childId('needle')).toBe('tr/needle');
    expect(g.childId()).toBe('tr');
    expect(g.targets('needle', 'rotation')).toEqual(['tr/needle/rotation']);
    expect(g.targets('zone-0', 'opacity')).toEqual(['tr/zone-0/opacity']);
  });

  it('INDEPENDENT CHANNELS: labels are their own nodes, drawn z-above every zone', () => {
    const g = Gauge({ id: 'tr', radius: 100, zones: ZONES });
    const kids = g.node.children;
    const lastZoneIdx = Math.max(...kids.map((c, i) => (c.id?.startsWith('tr/zone-') ? i : -1)));
    const firstLabelIdx = kids.findIndex((c) => c.id?.startsWith('tr/label-'));
    // every label comes AFTER every zone in the child array → higher z (drawn last),
    // and is a SIBLING of the zones (not nested), so its opacity is independent.
    expect(firstLabelIdx).toBeGreaterThan(lastZoneIdx);
    for (const l of kids.filter((c) => c.id?.startsWith('tr/label-'))) {
      expect((l as Text).parent).toBe(g.node); // sibling of zones, not a child of one
    }
  });

  it('the apex zone (straddling 0) gets a size-up bold label', () => {
    const g = Gauge({ id: 'tr', radius: 100, zones: ZONES });
    const mid = byId(g.node, 'tr/label-1') as Text; // VERIFY, extent [-30,30] straddles 0
    const side = byId(g.node, 'tr/label-0') as Text;
    expect(mid.fontSize()).toBeGreaterThan(side.fontSize());
    expect(mid.fontWeight).toBe(700);
    expect(side.fontWeight).toBe(400);
  });
});

describe('label styling escape hatches (0.38.0-pre.1, ai-training consumer)', () => {
  it('apexEmphasis:false disables the size-up (portrait-safe): apex == sides', () => {
    const g = Gauge({ id: 'tr', radius: 100, zones: ZONES, apexEmphasis: false });
    const mid = byId(g.node, 'tr/label-1') as Text;
    const side = byId(g.node, 'tr/label-0') as Text;
    expect(mid.fontSize()).toBe(side.fontSize());
    expect(mid.fontWeight).toBe(400);
  });

  it('apexEmphasis:<number> sets a custom apex size scale', () => {
    const g = Gauge({ id: 'tr', radius: 100, zones: ZONES, labelSize: 20, apexEmphasis: 1.5 });
    expect((byId(g.node, 'tr/label-1') as Text).fontSize()).toBeCloseTo(30, 6); // 20 * 1.5
  });

  it('per-zone labelStyle overrides family/size/fill/weight (text override keeps working)', () => {
    const g = Gauge({
      id: 'tr',
      radius: 100,
      zones: [
        { extent: [-90, -30], color: '#e6a700', label: 'BLIND', labelStyle: { fill: '#ff0000', size: 33, weight: 600, family: 'Serif' } },
        { extent: [-30, 30], color: '#3ddc97', label: 'CALIBRATED' },
        { extent: [30, 90], color: '#ff5d73', label: 'REJECT' }, // per-episode text override
      ],
    });
    const overridden = byId(g.node, 'tr/label-0') as Text;
    expect(overridden.fill()).toBe('#ff0000');
    expect(overridden.fontSize()).toBe(33);
    expect(overridden.fontWeight).toBe(600);
    expect(overridden.fontFamily).toBe('Serif');
    // the per-episode text override lands on its own node
    expect((byId(g.node, 'tr/label-2') as Text).text()).toBe('REJECT');
  });
});

describe('needle angle', () => {
  it('authored mode: needleAngle sets the needle rotation directly (0 = up)', () => {
    const g = Gauge({ id: 'tr', radius: 100, zones: ZONES, needleAngle: -70 });
    expect((byId(g.node, 'tr/needle') as Path).rotation()).toBe(-70);
  });

  it('Meter mode: value maps through domain across the sweep → needle angle', () => {
    // domain [0,1] across sweep [-90,90]: value 0.5 → 0°, value 1 → +90°
    const half = Meter({ id: 'm', radius: 100, zones: ZONES, value: 0.5, domain: [0, 1] });
    expect((byId(half.node, 'm/needle') as Path).rotation()).toBeCloseTo(0, 6);
    const full = Meter({ id: 'm2', radius: 100, zones: ZONES, value: 1, domain: [0, 1] });
    expect((byId(full.node, 'm2/needle') as Path).rotation()).toBeCloseTo(90, 6);
  });

  it('Meter mode: a value signal binds the needle live (follows the source)', () => {
    const v = signal(0);
    const g = Meter({ id: 'm', radius: 100, zones: ZONES, value: () => v(), domain: [0, 1], sweep: [-90, 90] });
    const needle = byId(g.node, 'm/needle') as Path;
    expect(needle.rotation()).toBeCloseTo(-90, 6);
    v.set(1); // a real signal dep → the bound needle rotation recomputes (pull-based)
    expect(needle.rotation()).toBeCloseTo(90, 6);
  });
});

describe('animation integration', () => {
  it('a track on the needle rotation + a zone opacity resolves and evaluates', () => {
    const g = Gauge({ id: 'tr', radius: 100, zones: ZONES });
    const scene = createScene({ size: { w: 300, h: 200 }, children: [g.node] });
    const tl = timeline({
      duration: 1,
      tracks: [
        track('tr/needle/rotation', 'number', [key(0, 0), key(1, -70)]),
        track('tr/zone-0/opacity', 'number', [key(0, 1), key(1, 0.35)]),
      ],
    });
    expect(() => evaluate(scene, tl, 1)).not.toThrow();
    expect((byId(g.node, 'tr/needle') as Path).rotation()).toBe(-70);
    expect((byId(g.node, 'tr/zone-0') as Path).opacity()).toBeCloseTo(0.35, 6);
  });

  it('is a pure function of time: same spec → byte-identical DisplayList', () => {
    const mk = (): ReturnType<typeof createScene> =>
      createScene({ size: { w: 300, h: 200 }, children: [Gauge({ id: 'tr', radius: 100, zones: ZONES, needleAngle: -20 }).node] });
    const tl = timeline({ duration: 1, tracks: [] });
    expect(JSON.stringify(evaluate(mk(), tl, 0.4))).toBe(JSON.stringify(evaluate(mk(), tl, 0.4)));
  });

  it('an optional glow renders behind (lowest z) at opacity 0 by default', () => {
    const g = Gauge({ id: 'tr', radius: 100, zones: ZONES, glow: true });
    const glow = byId(g.node, 'tr/glow');
    expect(glow).toBeDefined();
    expect(g.node.children[0]!.id).toBe('tr/glow'); // first child = lowest z
    expect((glow as { opacity(): number }).opacity()).toBe(0);
  });
});

describe('fail-loud guards', () => {
  it('rejects a missing id, non-positive radius, empty zones, and a bad extent', () => {
    // @ts-expect-error — id required
    expect(() => Gauge({ radius: 100, zones: ZONES })).toThrow(/stable id/);
    expect(() => Gauge({ id: 'x', radius: 0, zones: ZONES })).toThrow(GaugeError);
    expect(() => Gauge({ id: 'x', radius: 100, zones: [] })).toThrow(/at least one zone/);
    expect(() => Gauge({ id: 'x', radius: 100, zones: [{ extent: [30, -30], color: '#fff' }] })).toThrow(/start < end/);
  });
});
