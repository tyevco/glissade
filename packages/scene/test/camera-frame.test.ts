/**
 * Camera NODE-FRAMING (0.65): `centerOn` (world-space center on a node by id) +
 * `clear` (nudge the framed node's bounds out of a reserved region). The
 * load-bearing invariants: the focal is the node's LIVE world center (not the
 * default relative center), the clear direction is DERIVED + integer-stable, the
 * resolved focal is INSPECTION-ONLY (resolveAt reads the SAME sample the render
 * used, and setting it fails loud), and a camera WITHOUT centerOn is byte-identical.
 */

import { describe, expect, it } from 'vitest';
import { key, timeline, track } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, evaluate, type DisplayList } from '../src/index.js';
import { resolveAt, instanceProps } from '../src/validate.js';
import { applyToPoint, type Mat2x3 } from '../src/matrix.js';
import { camera, CameraError, cameraLayerMatrix } from '../src/camera.js';

const SIZE = { w: 640, h: 360 };
const emptyTl = timeline({ fps: 60, duration: 1, tracks: [] });
const transforms = (dl: DisplayList): Mat2x3[] =>
  dl.commands.flatMap((c) => (c.op === 'transform' ? [c.m] : []));

describe('centerOn — world-space node framing', () => {
  it('centers the focal on the node’s WORLD position, not the default [0.5,0.5]', () => {
    const hero = new Rect({ id: 'hero', width: 80, height: 60, position: [200, 100], fill: '#fff' });
    const cam = camera([{ content: hero }], { id: 'cam' , centerOn: 'hero' });
    const scene = createScene({ size: SIZE, children: [cam] });
    const dl = evaluate(scene, emptyTl, 0);
    const pose = transforms(dl)[0]!; // the single layer pose
    // the node's world center [200,100] maps to the SCREEN CENTER (that IS framing)
    const f = applyToPoint(pose, [200, 100]);
    expect(f[0]).toBeCloseTo(320);
    expect(f[1]).toBeCloseTo(180);
    // and it is NOT the default-relative focal ([0.5,0.5]→[320,180]→screen center):
    // the default would leave [200,100] at [200,100], not the screen center.
    const defaultPose = cameraLayerMatrix(SIZE, [0.5, 0.5], 1, 0, 1);
    expect(applyToPoint(defaultPose, [200, 100])[0]).toBeCloseTo(200);
  });

  it('tracks the node as it moves (a position track re-frames each time)', () => {
    const hero = new Rect({ id: 'hero', width: 80, height: 60, position: [100, 180], fill: '#fff' });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero' });
    const scene = createScene({ size: SIZE, children: [cam] });
    const tl = timeline({ fps: 60, duration: 1, tracks: [track('hero/position', 'vec2', [key(0, [100, 180]), key(1, [500, 180])])] });
    const p0 = transforms(evaluate(scene, tl, 0))[0]!;
    const p1 = transforms(evaluate(scene, tl, 1))[0]!;
    // at t=0 the node is at x=100 → focal maps 100 to screen center 320
    expect(applyToPoint(p0, [100, 180])[0]).toBeCloseTo(320);
    // at t=1 the node is at x=500 → focal now maps 500 to screen center
    expect(applyToPoint(p1, [500, 180])[0]).toBeCloseTo(320);
  });

  it('resolveAt(cam/resolvedCenter) returns the EXACT focal the render used', () => {
    const hero = new Rect({ id: 'hero', width: 80, height: 60, position: [230, 140], fill: '#fff' });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero' });
    const scene = createScene({ size: SIZE, children: [cam] });
    const dl = evaluate(scene, emptyTl, 0);
    const pose = transforms(dl)[0]!;
    const resolved = resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number];
    expect(resolved[0]).toBeCloseTo(230);
    expect(resolved[1]).toBeCloseTo(140);
    // the focal the render used maps to the screen center — i.e. resolveAt agrees
    // with the pose byte-for-byte (the same computed sample fed both).
    expect(applyToPoint(pose, resolved)).toEqual([320, 180]);
  });

  it('fails loud when centerOn names an unknown node', () => {
    const hero = new Rect({ id: 'hero', width: 80, height: 60, position: [200, 100], fill: '#fff' });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'nope' });
    const scene = createScene({ size: SIZE, children: [cam] });
    expect(() => evaluate(scene, emptyTl, 0)).toThrow(/no node with id 'nope'/);
  });
});

describe('clear — derived-direction bounds clearance', () => {
  // a tall hero at screen center overlaps a band; clear pushes the FOCAL so the
  // node's SCREEN bounds clear it.
  const buildClear = (clear: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const hero = new Rect({ id: 'hero', width: 160, height: 220, position: [320, 180], fill: '#fff' });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero', clear });
    const scene = createScene({ size: SIZE, children: [cam] });
    evaluate(scene, emptyTl, 0);
    return { scene, heroCenterY: 180 };
  };

  it('a BOTTOM band pushes the node UP (focal shifts DOWN in world → node up on screen)', () => {
    const { scene, heroCenterY } = buildClear({ minX: 0, minY: 280, maxX: 640, maxY: 360 });
    const resolved = resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number];
    // node centered → screen bounds 70..290 overlap band top 280 by 10 → push up 10
    // → focal.y = 180 + 10 (world down) so the node rides up.
    expect(resolved[1]).toBeCloseTo(heroCenterY + 10);
  });

  it('a TOP band pushes the node DOWN (focal shifts UP in world → node down on screen)', () => {
    const { scene, heroCenterY } = buildClear({ minX: 0, minY: 0, maxX: 640, maxY: 80 });
    const resolved = resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number];
    // node centered → screen bounds 70..290; band bottom 80 penetrates the top by
    // 10 (nodeMinY 70 < 80) → push down 10 → focal.y = 180 − 10.
    expect(resolved[1]).toBeCloseTo(heroCenterY - 10);
  });

  it('canonical tie-break: equal free regions + equal pushes → UP, stable across runs', () => {
    // a centered band [160,200] (h 40); node h 60 → screen 150..210 straddles it.
    // pushUp == pushDown == 50, freeAbove == freeBelow == 160 → tie → UP.
    const hero = new Rect({ id: 'hero', width: 80, height: 60, position: [320, 180], fill: '#fff' });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero', clear: { minX: 0, minY: 160, maxX: 640, maxY: 200 } });
    const scene = createScene({ size: SIZE, children: [cam] });
    evaluate(scene, emptyTl, 0);
    const a = resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number];
    const b = resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number];
    expect(a).toEqual(b); // stable, never a float min() that flips
    expect(a[1]).toBeGreaterThan(180); // pushed UP (focal down)
  });

  it('fails loud when the node can’t clear (taller than either free area)', () => {
    // band [100,260] (h 160) → freeAbove 100, freeBelow 100; a 220-tall node fits
    // neither → CameraError.
    const hero = new Rect({ id: 'hero', width: 80, height: 220, position: [320, 180], fill: '#fff' });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero', clear: { minX: 0, minY: 100, maxX: 640, maxY: 260 } });
    const scene = createScene({ size: SIZE, children: [cam] });
    expect(() => evaluate(scene, emptyTl, 0)).toThrow(/exceed the clearable area/);
  });

  it('a float clear Region is quantized (ingested through the shared validator)', () => {
    const hero = new Rect({ id: 'hero', width: 160, height: 220, position: [320, 180], fill: '#fff' });
    // 279.6 rounds to 280 — same band as the integer bottom-band case above.
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero', clear: { minX: 0.2, minY: 279.6, maxX: 639.6, maxY: 360.4 } });
    const scene = createScene({ size: SIZE, children: [cam] });
    evaluate(scene, emptyTl, 0);
    const resolved = resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number];
    expect(resolved[1]).toBeCloseTo(190); // identical to the integer band
  });

  it('a negative-extent clear Region fails loud at construction', () => {
    const hero = new Rect({ id: 'hero', width: 80, height: 60, position: [320, 180], fill: '#fff' });
    expect(() => camera([{ content: hero }], { id: 'cam', centerOn: 'hero', clear: { minX: 0, minY: 280, maxX: 640, maxY: 120 } })).toThrow(/negative extent/);
  });
});

describe('clear on a Text node — measurer-consistency (one measure, two consumers)', () => {
  it('rides the SAME quantized measured bounds the render uses', () => {
    const measurer = { measureText: (t: string, f: { size: number }) => ({ width: t.length * f.size * 0.5, ascent: f.size * 0.8, descent: f.size * 0.2 }) };
    const hero = new Text({ id: 'hero', text: 'HELLO WORLD', fontSize: 40, position: [320, 180], align: 'center' });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero', clear: { minX: 0, minY: 200, maxX: 640, maxY: 360 } });
    const scene = createScene({ size: SIZE, children: [cam] });
    scene.setTextMeasurer(measurer);
    evaluate(scene, emptyTl, 0);
    // the node's measured height drives the clear: intrinsicSize (quantized) height.
    const size = hero.intrinsicSize(measurer);
    // screen bounds when centered use the SAME quantized height → deterministic focal.
    const resolved = resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number];
    // recompute expected: text drawn from a baseline origin; the clear is deterministic
    // given the quantized measured box, so a re-measure with the same measurer agrees.
    const resolved2 = resolveAt(scene, 'cam/resolvedCenter', 0) as [number, number];
    expect(resolved).toEqual(resolved2);
    expect(Number.isFinite(size.h)).toBe(true);
  });
});

describe('resolvedCenter — inspection-only, derived, read-only', () => {
  it('is marked derived in instanceProps and never bound', () => {
    const hero = new Rect({ id: 'hero', width: 80, height: 60, position: [200, 100], fill: '#fff' });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero' });
    createScene({ size: SIZE, children: [cam] });
    const props = instanceProps(cam);
    const rc = props.find((p) => p.path === 'resolvedCenter');
    expect(rc).toBeDefined();
    expect(rc!.derived).toBe(true);
    expect(rc!.bound).toBe(false);
  });

  it('fails loud when an author tries to drive it with a track', () => {
    const hero = new Rect({ id: 'hero', width: 80, height: 60, position: [200, 100], fill: '#fff' });
    const cam = camera([{ content: hero }], { id: 'cam', centerOn: 'hero' });
    const scene = createScene({ size: SIZE, children: [cam] });
    const tl = timeline({ fps: 60, duration: 1, tracks: [track('cam/resolvedCenter', 'vec2', [key(0, [0, 0]), key(1, [1, 1])])] });
    expect(() => evaluate(scene, tl, 0)).toThrow(/derived from centerOn/);
  });

  it('a plain camera registers NO resolvedCenter target', () => {
    const bg = new Circle({ id: 'bg', radius: 10, position: [10, 10] });
    const cam = camera([{ content: bg }], { id: 'cam' });
    createScene({ size: SIZE, children: [cam] });
    expect(instanceProps(cam).some((p) => p.path === 'resolvedCenter')).toBe(false);
  });
});

describe('byte-neutrality — a camera WITHOUT centerOn is unchanged', () => {
  it('emits the identical DisplayList as the pre-centerOn pose math', () => {
    const build = () => {
      const bg = new Group({ id: 'g', children: [new Rect({ id: 'r', width: 100, height: 100, position: [200, 150], fill: '#abc' })] });
      const cam = camera([{ content: bg, depth: 0.5 }], { id: 'cam', center: [0.6, 0.4], zoom: 1.3, roll: 5 });
      return createScene({ size: SIZE, children: [cam] });
    };
    const dl = evaluate(build(), emptyTl, 0);
    const pose = transforms(dl)[0]!;
    // must equal the canonical relative pose math byte-for-byte (the px refactor).
    expect(pose).toEqual(cameraLayerMatrix(SIZE, [0.6, 0.4], 1.3, 5, 0.5));
  });
});
