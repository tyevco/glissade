/**
 * Camera rig + shake driver (0.55). The camera applies the inverse camera pose as
 * a parent transform over depth layers (push-in/pan/roll/parallax); the shake
 * driver wobbles any node's pose with deterministic value noise. Determinism +
 * the composition contract (camera transforms the WORLD, nodes stay NODE-LOCAL, no
 * double-apply with anchors) are the load-bearing invariants tested here.
 */

import { describe, expect, it } from 'vitest';
import { key, timeline, track, valueNoise, type DisplayList } from '@glissade/core';
import { Circle, Rect, Text, createScene, evaluate } from '../src/index.js';
import { applyToPoint, multiply, type Mat2x3 } from '../src/matrix.js';
import { Camera, camera, CameraError, cameraLayerMatrix } from '../src/camera.js';
import { shake, shakeOffset } from '../src/shake.js';
import { fallbackMeasurer } from '../src/text.js';

const SIZE = { w: 640, h: 360 };
const emptyTl = timeline({ fps: 60, duration: 1, tracks: [] });
const transforms = (dl: DisplayList): Mat2x3[] =>
  dl.commands.flatMap((c) => (c.op === 'transform' ? [c.m] : []));

describe('cameraLayerMatrix — the pure pose math', () => {
  it('is identity at center [0.5,0.5], zoom 1, roll 0, depth 1', () => {
    const m = cameraLayerMatrix(SIZE, [0.5, 0.5], 1, 0, 1);
    const p = applyToPoint(m, [123, 45]);
    expect(p[0]).toBeCloseTo(123);
    expect(p[1]).toBeCloseTo(45);
  });

  it('push-in (zoom>1) keeps the FOCAL point fixed on screen and scales about it', () => {
    const m = cameraLayerMatrix(SIZE, [0.5, 0.5], 2, 0, 1);
    // focal point (screen center [320,180]) stays put
    const f = applyToPoint(m, [320, 180]);
    expect(f[0]).toBeCloseTo(320);
    expect(f[1]).toBeCloseTo(180);
    // a point 100px right of focal moves to 200px right (2× about the focal)
    const q = applyToPoint(m, [420, 180]);
    expect(q[0]).toBeCloseTo(520);
    expect(q[1]).toBeCloseTo(180);
  });

  it('pan maps the focal point to screen center (world slides under a fixed screen)', () => {
    const m = cameraLayerMatrix(SIZE, [0.6, 0.5], 1, 0, 1); // focal at [384,180]
    const f = applyToPoint(m, [384, 180]);
    expect(f[0]).toBeCloseTo(320);
    expect(f[1]).toBeCloseTo(180);
  });

  it('roll rotates about the screen center', () => {
    const m = cameraLayerMatrix(SIZE, [0.5, 0.5], 1, 90, 1);
    const p = applyToPoint(m, [420, 180]); // 100px right of center → rotates to 100px below
    expect(p[0]).toBeCloseTo(320);
    expect(p[1]).toBeCloseTo(280);
  });

  it('parallax: a far layer (depth<1) pans LESS than the focal plane', () => {
    const focal = cameraLayerMatrix(SIZE, [0.6, 0.5], 1, 0, 1); // pan −64
    const far = cameraLayerMatrix(SIZE, [0.6, 0.5], 1, 0, 0.3); // pan −19.2
    expect(focal[4]).toBeCloseTo(-64);
    expect(far[4]).toBeCloseTo(-19.2);
    // far translates less than the focal plane
    expect(Math.abs(far[4])).toBeLessThan(Math.abs(focal[4]));
  });
});

describe('Camera — emit + composition contract', () => {
  it('wraps each layer in save → transform(pose) → content → restore', () => {
    const dot = new Circle({ id: 'dot', radius: 10 }); // at origin ⇒ no own transform op
    const scene = createScene({ size: SIZE, children: [camera([{ content: dot, depth: 1 }], { id: 'cam' })] });
    const dl = evaluate(scene, emptyTl, 0);
    // exactly one transform op: the layer pose (identity at rest, dot has none)
    const ts = transforms(dl);
    expect(ts).toHaveLength(1);
  });

  it('a push-in over an anchor:"left" bar does NOT double-shift it (world-transform vs node-local anchor)', () => {
    // anchor:'left' ⇒ position is the bar's LEFT edge; its center is at position+[w/2,0]
    const bar = new Rect({ id: 'bar', anchor: 'left', position: [190, 260], width: 200, height: 22, fill: '#f5a623' });
    const scene = createScene({ size: SIZE, children: [camera([{ content: bar, depth: 1 }], { id: 'cam', zoom: 2 })] });
    const dl = evaluate(scene, emptyTl, 0);
    const ts = transforms(dl);
    // [pose, barLocal] — the anchor shift lives ONCE, inside barLocal
    expect(ts).toHaveLength(2);
    const [pose, barLocal] = ts as [Mat2x3, Mat2x3];
    // the bar's own (node-local) center, world space: left edge 190 + half width 100
    expect(applyToPoint(barLocal, [0, 0])).toEqual([290, 260]);
    // composed on-screen center under the 2× push-in about [320,180]:
    // 320 + 2·(290−320) = 260 ; 180 + 2·(260−180) = 340
    const composed = multiply(pose, barLocal);
    const screen = applyToPoint(composed, [0, 0]);
    expect(screen[0]).toBeCloseTo(260);
    expect(screen[1]).toBeCloseTo(340);
  });

  it('a caption SIBLING (outside the rig) is untouched by the camera transform', () => {
    const mk = (zoom: number): DisplayList => {
      const dot = new Circle({ id: 'dot', radius: 8 }); // origin ⇒ no transform
      const caption = new Text({ id: 'cap', text: 'PINNED', position: [320, 338], fontFamily: 'DejaVu Sans' });
      const scene = createScene({ size: SIZE, children: [camera([{ content: dot }], { id: 'cam', zoom }), caption] });
      return evaluate(scene, emptyTl, 0);
    };
    // [pose, captionLocal] — the caption's own transform must be identical at any zoom
    const a = transforms(mk(1));
    const b = transforms(mk(3));
    expect(a[1]).toEqual(b[1]); // caption transform invariant to the camera
  });

  it('parallax layers emit distinct poses under a pan', () => {
    const far = new Circle({ id: 'far', radius: 6 });
    const near = new Circle({ id: 'near', radius: 6 });
    const scene = createScene({
      size: SIZE,
      children: [camera([{ content: far, depth: 0.3 }, { content: near, depth: 1 }], { id: 'cam', center: [0.7, 0.5] })],
    });
    const [farPose, nearPose] = transforms(evaluate(scene, emptyTl, 0)) as [Mat2x3, Mat2x3];
    expect(Math.abs(farPose[4])).toBeLessThan(Math.abs(nearPose[4]));
  });

  it('keyframed pose (cam/zoom + cam/center) drives the push-in', () => {
    const dot = new Circle({ id: 'dot', radius: 8 });
    const scene = createScene({ size: SIZE, children: [camera([{ content: dot }], { id: 'cam' })] });
    const tl = timeline({
      fps: 60,
      duration: 1,
      tracks: [track('cam/zoom', 'number', [key(0, 1), key(1, 2)]), track('cam/center.x', 'number', [key(0, 0.5), key(1, 0.6)])],
    });
    const z0 = transforms(evaluate(scene, tl, 0))[0]!;
    const z1 = transforms(evaluate(scene, tl, 1))[0]!;
    expect(z0[0]).toBeCloseTo(1); // zoom scale at t0
    expect(z1[0]).toBeCloseTo(2); // zoom scale at t1
    expect(z0).not.toEqual(z1);
  });
});

describe('Camera — fail loud', () => {
  it('throws on empty / missing layers', () => {
    expect(() => camera([])).toThrow(CameraError);
    // @ts-expect-error — a layer with no content Node
    expect(() => camera([{ depth: 1 }])).toThrow(CameraError);
  });

  it('throws on a center resolved OUTSIDE the safe area [0,1]²', () => {
    const dot = new Circle({ id: 'dot', radius: 8 });
    const scene = createScene({ size: SIZE, children: [camera([{ content: dot }], { id: 'cam', center: [1.5, 0.5] })] });
    expect(() => evaluate(scene, emptyTl, 0)).toThrow(CameraError);
  });

  it('throws when the viewport size is unavailable (a bare ctx without size)', () => {
    const dot = new Circle({ id: 'dot', radius: 8 });
    const cam = camera([{ content: dot }], { id: 'cam' });
    const out = { push: (): void => {}, resource: (): number => 0 };
    expect(() =>
      cam.emit(out, { time: 0, frame: -1, measurer: fallbackMeasurer() }),
    ).toThrow(CameraError);
  });

  it('an invalid depth throws', () => {
    const dot = new Circle({ id: 'dot', radius: 8 });
    expect(() => camera([{ content: dot, depth: -1 }])).toThrow(CameraError);
  });
});

describe('valueNoise + shake — determinism', () => {
  it('valueNoise is a PURE function of (seed, t) — byte-identical, in range [0,1)', () => {
    for (const [s, t] of [[7, 0], [7, 1.234], [3, 12.9], [99, -4.5]] as const) {
      const a = valueNoise(s, t);
      const b = valueNoise(s, t);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
    // varies over time and seed
    expect(valueNoise(7, 1)).not.toBe(valueNoise(7, 2));
    expect(valueNoise(7, 1.3)).not.toBe(valueNoise(8, 1.3));
  });

  it('shakeOffset is deterministic and bounded by the amplitudes', () => {
    const spec = { seed: 7, translate: 3, rotate: 2, frequency: 6 };
    const a = shakeOffset(spec, 0.4);
    const b = shakeOffset(spec, 0.4);
    expect(a).toEqual(b);
    expect(Math.abs(a.dx)).toBeLessThanOrEqual(3);
    expect(Math.abs(a.dy)).toBeLessThanOrEqual(3);
    expect(Math.abs(a.dr)).toBeLessThanOrEqual(2);
    // omitted amplitudes contribute nothing
    expect(shakeOffset({ seed: 1, rotate: 5 }, 0.5).dx).toBe(0);
    expect(shakeOffset({ seed: 1, translate: 5 }, 0.5).dr).toBe(0);
  });

  it('shake(node) jitters at emit, byte-identically across two evaluate passes', () => {
    const mk = (): DisplayList => {
      const dot = new Rect({ id: 'dot', width: 8, height: 8, position: [100, 100], fill: '#fff' });
      const scene = createScene({ size: { w: 200, h: 200 }, children: [shake(dot, { seed: 5, translate: 4, rotate: 1, frequency: 5 })] });
      return evaluate(scene, timeline({ fps: 60, duration: 1, tracks: [] }), 0.37);
    };
    expect(JSON.stringify(mk())).toBe(JSON.stringify(mk()));
    // and it actually moves over time (animated)
    const at = (t: number): DisplayList => {
      const dot = new Rect({ id: 'dot', width: 8, height: 8, position: [100, 100], fill: '#fff' });
      const scene = createScene({ size: { w: 200, h: 200 }, children: [shake(dot, { seed: 5, translate: 4, frequency: 5 })] });
      return evaluate(scene, timeline({ fps: 60, duration: 1, tracks: [] }), t);
    };
    expect(JSON.stringify(at(0.1))).not.toBe(JSON.stringify(at(0.6)));
  });

  it('shake() with no amplitude fails loud', () => {
    const dot = new Rect({ id: 'dot', width: 8, height: 8 });
    expect(() => shake(dot, { seed: 1 })).toThrow(/nonzero/);
  });
});

describe('Camera — construction', () => {
  it('camera() is a factory returning a Camera whose describeType is "Camera"', () => {
    const cam = camera([{ content: new Circle({ radius: 4 }) }]);
    expect(cam).toBeInstanceOf(Camera);
    expect(cam.describeType).toBe('Camera');
  });
});
