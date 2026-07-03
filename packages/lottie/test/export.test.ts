/**
 * Track → Lottie EXPORT unit tests: channel mapping, the ease-shift INVERSION
 * (glissade arriving-key ease → Lottie departing-key handles), hold, opacity
 * ×100 / scale ×100, color → 0-1 floats, and byte-for-byte determinism.
 */

import { describe, expect, it } from 'vitest';
import { key, sampleTrack, track, type Timeline } from '@glissade/core';
import { createScene, Circle, Group, Rect, type SceneModule } from '@glissade/scene';
import { exportLottie, importLottie } from '../src/index.js';
import { decimateLinearKeys } from '../src/sampleFallback.js';
import type { LottieKeyframe, LottieLayer, LottieProp } from '../src/types.js';

/** A Rect with position (cubicBezier + hold), opacity, and fill (color) tracks. */
function rectModule(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 2,
    fps: 60,
    tracks: [
      track('box/position', 'vec2', [
        key(0, [0, 0]),
        key(1, [100, 50], { kind: 'cubicBezier', pts: [0.4, 0.1, 0.6, 0.9] }),
        key(2, [100, 100], { interp: 'hold' }),
      ]),
      track('box/opacity', 'number', [key(0, 1), key(1, 0)]),
      track('box/fill', 'color', [key(0, '#ff0000'), key(2, '#0000ff')]),
    ],
  };
  return {
    createScene: () =>
      createScene({ size: { w: 200, h: 200 }, children: [new Rect({ id: 'box', width: 40, height: 40, fill: '#ff0000' })] }),
    timeline,
  };
}

const kf = (p: LottieProp): LottieKeyframe[] => p.k as LottieKeyframe[];

describe('exportLottie', () => {
  it('emits document metadata from the scene + timeline', () => {
    const doc = exportLottie(rectModule(), { width: 200, height: 200, fps: 60 });
    expect(doc.v).toBe('5.7.0'); // bodymovin schema version — strict players require it
    expect(doc.fr).toBe(60);
    expect(doc.ip).toBe(0);
    expect(doc.op).toBe(120); // duration 2s * 60fps
    expect(doc.w).toBe(200);
    expect(doc.h).toBe(200);
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0]!.ty).toBe(4); // shape layer
  });

  it('inverts the ease shift: arriving-key ease → the DEPARTING Lottie key', () => {
    const doc = exportLottie(rectModule(), { width: 200, height: 200, fps: 60 });
    const p = doc.layers[0]!.ks!.p as LottieProp;
    expect(p.a).toBe(1);
    const keys = kf(p);
    expect(keys.map((k) => k.t)).toEqual([0, 60, 120]);
    expect(keys.map((k) => k.s)).toEqual([[0, 0], [100, 50], [100, 100]]);
    // glissade key1's cubicBezier lands on Lottie key0's departing handles
    expect(keys[0]!.o).toEqual({ x: 0.4, y: 0.1 });
    expect(keys[0]!.i).toEqual({ x: 0.6, y: 0.9 });
    // glissade key2's hold → Lottie key1 h:1
    expect(keys[1]!.h).toBe(1);
    expect(keys[2]!.h).toBeUndefined();
  });

  it('scales opacity by 100', () => {
    const doc = exportLottie(rectModule(), { width: 200, height: 200, fps: 60 });
    const o = doc.layers[0]!.ks!.o as LottieProp;
    expect(o.a).toBe(1);
    expect(kf(o).map((k) => k.s)).toEqual([[100], [0]]);
  });

  it('emits solid fill as a 0-1 float color', () => {
    const doc = exportLottie(rectModule(), { width: 200, height: 200, fps: 60 });
    const shapes = doc.layers[0]!.shapes!;
    const fl = shapes.find((s) => s.ty === 'fl')!;
    const c = fl.c as LottieProp;
    expect(c.a).toBe(1);
    expect(kf(c).map((k) => k.s)).toEqual([[1, 0, 0], [0, 0, 1]]);
    // fill opacity stays 100 — node opacity lives on the layer transform
    expect(fl.o).toEqual({ a: 0, k: 100 });
  });

  it('exports a static prop as {a:0,k}', () => {
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Circle({ id: 'dot', radius: 10, fill: '#00ff00' })] }),
      timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const layer = doc.layers[0]!;
    expect((layer.ks!.p as LottieProp).a).toBe(0);
    expect((layer.ks!.o as LottieProp)).toEqual({ a: 0, k: 100 });
    const fl = layer.shapes!.find((s) => s.ty === 'fl')!;
    expect(fl.c).toEqual({ a: 0, k: [0, 1, 0] });
  });

  it('parents a group child via ind/parent (null layer for the group)', () => {
    const child = new Rect({ id: 'child', width: 10, height: 10, fill: '#ffffff' });
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Group({ id: 'g', children: [child] })] }),
      timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const g = doc.layers.find((l: LottieLayer) => l.nm === 'g')!;
    const c = doc.layers.find((l: LottieLayer) => l.nm === 'child')!;
    expect(g.ty).toBe(3); // null transform parent
    expect(c.ty).toBe(4);
    expect(c.parent).toBe(g.ind); // child references the group's ind
    expect(g.parent).toBeUndefined(); // group is a root layer
  });

  it('bakes a static group opacity into the child (child ks.o.k === 50, null o stays 100)', () => {
    const child = new Rect({ id: 'child', width: 10, height: 10, fill: '#ffffff' });
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Group({ id: 'g', opacity: 0.5, children: [child] })] }),
      timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const g = doc.layers.find((l: LottieLayer) => l.nm === 'g')!;
    const c = doc.layers.find((l: LottieLayer) => l.nm === 'child')!;
    expect(g.ks!.o).toEqual({ a: 0, k: 100 }); // the null carries no opacity — it's pushed down
    expect((c.ks!.o as LottieProp)).toEqual({ a: 0, k: 50 }); // 1 (leaf) × 0.5 (group) × 100
  });

  it('multiplies NESTED group opacities into the leaf (0.5 inside 0.5 → 25)', () => {
    const leaf = new Rect({ id: 'leaf', width: 10, height: 10, fill: '#fff' });
    const mod: SceneModule = {
      createScene: () =>
        createScene({
          size: { w: 100, h: 100 },
          children: [new Group({ id: 'outer', opacity: 0.5, children: [new Group({ id: 'inner', opacity: 0.5, children: [leaf] })] })],
        }),
      timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const leafLayer = doc.layers.find((l: LottieLayer) => l.nm === 'leaf')!;
    const outer = doc.layers.find((l: LottieLayer) => l.nm === 'outer')!;
    const inner = doc.layers.find((l: LottieLayer) => l.nm === 'inner')!;
    expect((leafLayer.ks!.o as LottieProp)).toEqual({ a: 0, k: 25 }); // 0.5 × 0.5 × 100
    expect(outer.ks!.o).toEqual({ a: 0, k: 100 }); // every null stays 100
    expect(inner.ks!.o).toEqual({ a: 0, k: 100 });
  });

  it('animates a leaf ks.o from an animated GROUP opacity (a:1, decimated)', () => {
    const child = new Rect({ id: 'child', width: 10, height: 10, fill: '#fff' });
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Group({ id: 'g', children: [child] })] }),
      timeline: { version: 1, duration: 2, fps: 60, tracks: [track('g/opacity', 'number', [key(0, 0), key(2, 1)])] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const g = doc.layers.find((l: LottieLayer) => l.nm === 'g')!;
    const c = doc.layers.find((l: LottieLayer) => l.nm === 'child')!;
    expect(g.ks!.o).toEqual({ a: 0, k: 100 }); // group opacity moved onto the child
    const o = c.ks!.o as LottieProp;
    expect(o.a).toBe(1); // child opacity is now animated
    const keys = kf(o);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys.length).toBeLessThan(30); // a linear ramp decimates hard
    expect(keys[0]!.s).toEqual([0]); // 0 × 100
    expect(keys[keys.length - 1]!.s).toEqual([100]); // 1 × 100
  });

  it('a group at opacity 1 with no track leaves the child ks.o byte-identical (accumulator identity)', () => {
    const build = (groupOpacity: number): string => {
      const mod: SceneModule = {
        createScene: () =>
          createScene({
            size: { w: 100, h: 100 },
            children: groupOpacity === 1
              ? [new Group({ id: 'g', opacity: 1, children: [new Rect({ id: 'child', width: 10, height: 10, fill: '#fff' })] })]
              : [new Group({ id: 'g', children: [new Rect({ id: 'child', width: 10, height: 10, fill: '#fff' })] })],
        }),
        timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
      };
      const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
      const c = doc.layers.find((l: LottieLayer) => l.nm === 'child')!;
      return JSON.stringify(c.ks!.o);
    };
    // group@opacity-1 (explicit or default) → child o is the plain {a:0,k:100} path
    expect(build(1)).toBe(JSON.stringify({ a: 0, k: 100 }));
  });

  it('COALESCES multiple tracks on one channel (fade-in + fade-out both export, not last-wins)', () => {
    // Two separate track() calls drive box/opacity: a fade-IN (t0→0.5) and a
    // fade-OUT (t1.5→2). The runtime coalesces same-target tracks (timeline.ts),
    // so the export must too — a raw last-write-wins group would drop the fade-in
    // and export ONLY the fade-out, leaking the entrance (ai-training e04 bug).
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: 'box', width: 10, height: 10, fill: '#fff' })] }),
      timeline: {
        version: 1,
        duration: 2,
        fps: 60,
        tracks: [
          track('box/opacity', 'number', [key(0, 0), key(0.5, 1)]), // fade IN
          track('box/opacity', 'number', [key(1.5, 1), key(2, 0)]), // fade OUT
        ],
      },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const o = doc.layers[0]!.ks!.o as LottieProp;
    expect(o.a).toBe(1);
    const keys = kf(o);
    // BOTH runs present: rise 0→100 at frames 0/30 AND fall 100→0 at frames 90/120
    expect(keys.map((k) => k.t)).toEqual([0, 30, 90, 120]);
    expect(keys.map((k) => k.s)).toEqual([[0], [100], [100], [0]]);
  });

  it('COALESCES a multi-track POSITION channel too (the fix is general, not opacity-only)', () => {
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: 'box', width: 10, height: 10, fill: '#fff' })] }),
      timeline: {
        version: 1,
        duration: 2,
        fps: 60,
        tracks: [
          track('box/position', 'vec2', [key(0, [0, 0]), key(0.5, [50, 50])]), // move A
          track('box/position', 'vec2', [key(1.5, [50, 50]), key(2, [100, 100])]), // move B
        ],
      },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const p = doc.layers[0]!.ks!.p as LottieProp;
    expect(p.a).toBe(1);
    const keys = kf(p);
    // all four keys from both tracks survive — not just move B
    expect(keys.map((k) => k.t)).toEqual([0, 30, 90, 120]);
    expect(keys.map((k) => k.s)).toEqual([[0, 0], [50, 50], [50, 50], [100, 100]]);
  });

  it('COALESCES a multi-track GROUP opacity for the bake accumulator (both runs reach the child)', () => {
    const child = new Rect({ id: 'child', width: 10, height: 10, fill: '#fff' });
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Group({ id: 'g', children: [child] })] }),
      timeline: {
        version: 1,
        duration: 2,
        fps: 60,
        tracks: [
          track('g/opacity', 'number', [key(0, 0), key(0.5, 1)]), // group fade IN
          track('g/opacity', 'number', [key(1.5, 1), key(2, 0)]), // group fade OUT
        ],
      },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const c = doc.layers.find((l: LottieLayer) => l.nm === 'child')!;
    const o = c.ks!.o as LottieProp;
    expect(o.a).toBe(1);
    const keys = kf(o);
    // the baked child opacity carries BOTH the group's fade-in AND fade-out
    expect(keys[0]!.s).toEqual([0]); // hidden at t=0 (fade-in start)
    expect(keys[keys.length - 1]!.s).toEqual([0]); // hidden again at t=2 (fade-out end)
    expect(keys.some((k) => (k.s as number[])[0]! >= 99)).toBe(true); // fully visible mid-run
  });

  it('anchors a SAMPLED group fade-in starting mid-timeline — leaf HIDDEN (o=0) at ip, not ghosting at the first sample', () => {
    // Fractional start t=1.009 → round(60.54)=frame 61, PAST the key, so the first
    // sampled value is already ~7% (easeOutBack, a NAMED ease → the group opacity
    // bakes via combineOpacity's sampled path). Without the boundary anchor that
    // ~7% is the first exported keyframe, held BACKWARD to t=0 → the leaf ghosts
    // across its whole dormant window (ai-training e04 hc-bg residual).
    const child = new Rect({ id: 'child', width: 10, height: 10, fill: '#fff' });
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Group({ id: 'g', children: [child] })] }),
      timeline: { version: 1, duration: 4, fps: 60, tracks: [track('g/opacity', 'number', [key(1.009, 0), key(1.5, 1, 'easeOutBack')])] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const o = doc.layers.find((l: LottieLayer) => l.nm === 'child')!.ks!.o as LottieProp;
    expect(o.a).toBe(1);
    const keys = kf(o);
    expect(keys[0]!.t).toBe(0); // a boundary keyframe AT ip, not the first sample at frame 61
    expect(keys[0]!.s).toEqual([0]); // held base 0 — the leaf is HIDDEN before the fade
    expect(keys[0]!.h).toBe(1); // HELD across the dormant run (not linearly ramped up)
  });

  it('anchors a SAMPLED leaf channel starting mid-timeline (sampleToLottieKeys path) — base held at ip', () => {
    // A direct leaf opacity named-ease track (identity accumulator → scalarKeys →
    // sampleToLottieKeys): same boundary bug, same fix. Pre-fade value held at base.
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: 'box', width: 10, height: 10, fill: '#fff' })] }),
      timeline: { version: 1, duration: 4, fps: 60, tracks: [track('box/opacity', 'number', [key(1.009, 0), key(1.5, 1, 'easeOutBack')])] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const keys = kf(doc.layers[0]!.ks!.o as LottieProp);
    expect(keys[0]!.t).toBe(0);
    expect(keys[0]!.s).toEqual([0]);
    expect(keys[0]!.h).toBe(1);
  });

  it('a SAMPLED channel that already covers [ip,op] gets NO boundary keys (byte-identical to before)', () => {
    // named-ease opacity keyed at t=0 and t=duration → span == [ip,op] → unchanged.
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: 'box', width: 10, height: 10, fill: '#fff' })] }),
      timeline: { version: 1, duration: 2, fps: 60, tracks: [track('box/opacity', 'number', [key(0, 0), key(2, 1, 'easeInOutQuad')])] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60 });
    const keys = kf(doc.layers[0]!.ks!.o as LottieProp);
    expect(keys[0]!.t).toBe(0); // the real sampled start, already at ip
    expect(keys[0]!.h).toBeUndefined(); // NOT a boundary hold
    expect(keys[keys.length - 1]!.t).toBe(120); // last key already at op — no appended boundary
  });

  it('is deterministic: same input → byte-identical JSON', () => {
    const a = JSON.stringify(exportLottie(rectModule(), { width: 200, height: 200, fps: 60 }));
    const b = JSON.stringify(exportLottie(rectModule(), { width: 200, height: 200, fps: 60 }));
    expect(a).toBe(b);
  });

  it('decimates the per-axis scale combined channel (a linear ramp → 2 keys, not 61)', () => {
    // Lottie has no split-scale form, so per-axis scale.x/.y sample to a dense
    // combined channel — this MUST decimate too (video-canary's minimal repro of
    // the e04 bd-orb bloat: 61 dense keys on a dead-linear ramp).
    const src: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: 'orb', width: 10, height: 10, fill: '#fff' })] }),
      timeline: {
        version: 1,
        duration: 1,
        fps: 60,
        tracks: [
          track('orb/scale.x', 'number', [key(0, 1), key(1, 2)]),
          track('orb/scale.y', 'number', [key(0, 1), key(1, 2)]),
        ],
      },
    };
    const doc = exportLottie(src, { width: 100, height: 100, fps: 60 });
    const s = doc.layers[0]!.ks!.s as LottieProp;
    expect(s.a).toBe(1);
    const keys = kf(s);
    expect(keys).toHaveLength(2); // a constant-velocity ramp collapses to its endpoints
    expect(keys[0]!.s).toEqual([100, 100]); // scale ×100
    expect(keys[1]!.s).toEqual([200, 200]);
  });

  it('decimates a dense sampled channel (named ease) yet stays faithful under linear playback', () => {
    // easeInOutQuad is a NAMED ease → not a single Lottie bezier → dense-sampled.
    const src: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: 'box', width: 10, height: 10, fill: '#fff' })] }),
      timeline: {
        version: 1,
        duration: 2,
        fps: 60,
        tracks: [track('box/opacity', 'number', [key(0, 0), key(2, 1, 'easeInOutQuad')])],
      },
    };
    const doc = exportLottie(src, { width: 100, height: 100, fps: 60 });
    const o = doc.layers[0]!.ks!.o as LottieProp;
    const keys = kf(o);
    // dense would be 121 frames; decimation cuts it hard but keeps the curve shape
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys.length).toBeLessThan(60);
    // endpoints exact (×100)
    expect(keys[0]!.t).toBe(0);
    expect(keys[0]!.s).toEqual([0]);
    expect(keys[keys.length - 1]!.t).toBe(120);
    expect(keys[keys.length - 1]!.s).toEqual([100]);
    // FIDELITY: linear playback of the kept keys reproduces the true sample at every frame
    const tr = track('box/opacity', 'number', [key(0, 0), key(2, 1, 'easeInOutQuad')]);
    const lerpAt = (f: number): number => {
      let j = 0;
      while (j < keys.length - 1 && keys[j + 1]!.t <= f) j++;
      const a = keys[j]!;
      const b = keys[Math.min(j + 1, keys.length - 1)]!;
      const span = b.t - a.t;
      const u = span > 0 ? (f - a.t) / span : 0;
      const av = (a.s as number[])[0]!;
      const bv = (b.s as number[])[0]!;
      return av + (bv - av) * u;
    };
    for (let f = 0; f <= 120; f++) {
      expect(Math.abs(lerpAt(f) - sampleTrack(tr, f / 60) * 100)).toBeLessThan(0.5); // < 0.5 on the 0-100 scale
    }
  });
});

describe('exportLottie gradient fill (gf)', () => {
  const gfOf = (mod: SceneModule) => {
    const doc = exportLottie(mod, { width: 200, height: 200, fps: 60 });
    const shapes = doc.layers[0]!.shapes!;
    return shapes.find((s) => s.ty === 'gf')!;
  };
  const staticRect = (fill: unknown): SceneModule => ({
    createScene: () => createScene({ size: { w: 200, h: 200 }, children: [new Rect({ id: 'box', width: 100, height: 60, fill: fill as string })] }),
    timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
  });

  it('emits a LINEAR gradient as gf t=1 with explicit s/e and a flattened g ramp', () => {
    const gf = gfOf(staticRect({ kind: 'linear', from: [-50, -30], to: [50, 30], stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] }));
    expect(gf.t).toBe(1);
    expect(gf.s).toEqual({ a: 0, k: [-50, -30] });
    expect(gf.e).toEqual({ a: 0, k: [50, 30] });
    expect(gf.g!.p).toBe(2);
    // [offset,r,g,b, offset,r,g,b] — 0-1 floats, no alpha stops (all opaque)
    expect(gf.g!.k).toEqual({ a: 0, k: [0, 1, 0, 0, 1, 0, 0, 1] });
    expect(gf.o).toEqual({ a: 0, k: 100 });
  });

  it('defaults omitted linear geometry to the fill bounds (vertical sweep, centre-x)', () => {
    // Rect 100×60 centred at origin → bounds [-50,-30]..[50,30]; linear default = [0,-30]→[0,30]
    const gf = gfOf(staticRect({ kind: 'linear', stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] }));
    expect(gf.s).toEqual({ a: 0, k: [0, -30] });
    expect(gf.e).toEqual({ a: 0, k: [0, 30] });
  });

  it('emits a RADIAL gradient as gf t=2 with e = centre + [radius,0] and zero highlight', () => {
    const gf = gfOf(staticRect({ kind: 'radial', center: [10, 20], radius: 40, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] }));
    expect(gf.t).toBe(2);
    expect(gf.s).toEqual({ a: 0, k: [10, 20] });
    expect(gf.e).toEqual({ a: 0, k: [50, 20] }); // centre + [radius, 0]
    expect(gf.h).toEqual({ a: 0, k: 0 });
    expect(gf.a).toEqual({ a: 0, k: 0 });
    expect(gf.g!.p).toBe(2);
  });

  it('defaults omitted radial geometry to bounds centre + half-diagonal', () => {
    // bounds [-50,-30]..[50,30]: centre [0,0], radius = hypot(100,60)/2
    const gf = gfOf(staticRect({ kind: 'radial', stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] }));
    const r = Math.hypot(100, 60) / 2;
    expect(gf.s).toEqual({ a: 0, k: [0, 0] });
    expect(gf.e).toEqual({ a: 0, k: [r, 0] });
  });

  it('flattens a MULTI-STOP ramp and sets g.p to the stop count', () => {
    const gf = gfOf(staticRect({ kind: 'linear', from: [0, 0], to: [1, 1], stops: [
      { offset: 0, color: '#ff0000' },
      { offset: 0.5, color: '#00ff00' },
      { offset: 1, color: '#0000ff' },
    ] }));
    expect(gf.g!.p).toBe(3);
    expect(gf.g!.k).toEqual({ a: 0, k: [0, 1, 0, 0, 0.5, 0, 1, 0, 1, 0, 0, 1] });
  });

  it('appends per-stop OPACITY stops when any stop is translucent', () => {
    const gf = gfOf(staticRect({ kind: 'linear', from: [0, 0], to: [1, 1], stops: [
      { offset: 0, color: 'rgba(255,0,0,0.5)' },
      { offset: 1, color: '#0000ff' },
    ] }));
    // colors first (p*4=8 entries), then alpha stops [offset,a, offset,a]
    expect(gf.g!.k).toEqual({ a: 0, k: [0, 1, 0, 0, 1, 0, 0, 1, /* alpha */ 0, 0.5, 1, 1] });
    expect(gf.g!.p).toBe(2);
  });

  it('exports an ANIMATED linear gradient with keyframed s/e/g (a:1)', () => {
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 200, h: 200 }, children: [new Rect({ id: 'box', width: 100, height: 60, fill: '#ff0000' })] }),
      timeline: {
        version: 1,
        duration: 1,
        fps: 60,
        tracks: [track('box/fill', 'paint', [
          key(0, { kind: 'linear', from: [-50, 0], to: [50, 0], stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] }),
          key(1, { kind: 'linear', from: [-50, 0], to: [50, 0], stops: [{ offset: 0, color: '#00ff00' }, { offset: 1, color: '#ffff00' }] }),
        ])],
      },
    };
    const gf = gfOf(mod);
    expect(gf.t).toBe(1);
    const g = gf.g!;
    expect(g.p).toBe(2);
    expect((g.k as LottieProp).a).toBe(1);
    const gKeys = (g.k as LottieProp).k as LottieKeyframe[];
    expect(gKeys.map((k) => k.t)).toEqual([0, 60]);
    expect((gf.s as LottieProp).a).toBe(1);
  });

  it('still WARN-DROPS a mesh fill (linear/radial only)', () => {
    const warnings: string[] = [];
    const mod: SceneModule = {
      createScene: () => createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: 'box', width: 40, height: 40, fill: { kind: 'mesh', points: [{ pos: [0, 0], color: '#f00' }, { pos: [1, 1], color: '#00f' }] } as unknown as string })] }),
      timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
    };
    const doc = exportLottie(mod, { width: 100, height: 100, fps: 60, onWarn: (m) => warnings.push(m) });
    expect(doc.layers[0]!.shapes!.some((s) => s.ty === 'gf' || s.ty === 'fl')).toBe(false);
    expect(warnings.some((w) => /mesh fill/.test(w))).toBe(true);
  });
});

describe('decimateLinearKeys', () => {
  const mk = (pts: [number, number[]][]): LottieKeyframe[] =>
    pts.map(([t, s], i) => (i < pts.length - 1 ? { t, s, o: { x: 0, y: 0 }, i: { x: 1, y: 1 } } : { t, s }));

  it('collapses a constant run to its endpoints', () => {
    const keys = mk([[0, [5]], [1, [5]], [2, [5]], [3, [5]]]);
    expect(decimateLinearKeys(keys).map((k) => k.t)).toEqual([0, 3]);
  });

  it('collapses a constant-velocity ramp to its endpoints', () => {
    const keys = mk([[0, [0]], [1, [10]], [2, [20]], [3, [30]]]);
    expect(decimateLinearKeys(keys).map((k) => k.t)).toEqual([0, 3]);
  });

  it('keeps the interior key at a slope change', () => {
    const keys = mk([[0, [0]], [1, [10]], [2, [10]], [3, [10]]]);
    // the corner at t=1 (ramp → flat) is not linearly reproducible → kept
    expect(decimateLinearKeys(keys).map((k) => k.t)).toEqual([0, 1, 3]);
  });

  it('leaves non-flat (path sh) payloads untouched', () => {
    const shData = [{ v: [[0, 0]], i: [[0, 0]], o: [[0, 0]], c: true }];
    const keys: LottieKeyframe[] = [
      { t: 0, s: shData, o: { x: 0, y: 0 }, i: { x: 1, y: 1 } },
      { t: 1, s: shData, o: { x: 0, y: 0 }, i: { x: 1, y: 1 } },
      { t: 2, s: shData },
    ];
    expect(decimateLinearKeys(keys)).toHaveLength(3);
  });
});

describe('exportLottie: non-center anchor → ks.a', () => {
  // A node with an EXPLICIT anchor must emit that anchor point as ks.a so Lottie's
  // (content − a) + p places the box top-left at P − (ax·w, ay·h), matching the
  // scene. Pre-fix ks.a was hard-coded [0,0], mispositioning a non-center node by
  // (ax·w, ay·h) — half its size for a top-left full-canvas background (SSIM ~0.28).
  function anchoredRect(anchor: 'top-left' | 'center', pos: [number, number]): SceneModule {
    return {
      timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
      createScene: () =>
        createScene({
          size: { w: 400, h: 300 },
          children: [new Rect({ id: 'box', width: 200, height: 100, position: pos, anchor, fill: '#3366cc' })],
        }),
    };
  }

  it('emits ks.a at the content-space anchor point for a top-left anchor', () => {
    const doc = exportLottie(anchoredRect('top-left', [30, 40]), { width: 400, height: 300, fps: 60 });
    const ks = doc.layers[0]!.ks!;
    // drawOffset [-w/2,-h/2] = [-100,-50] plus anchor·size [0,0] → [-100,-50].
    expect((ks.a as LottieProp).k).toEqual([-100, -50]);
    // ks.p stays the node position (unchanged by the fix).
    expect((ks.p as LottieProp).k).toEqual([30, 40]);
  });

  it('a center anchor is byte-identical to legacy: ks.a stays [0,0]', () => {
    const doc = exportLottie(anchoredRect('center', [30, 40]), { width: 400, height: 300, fps: 60 });
    const ks = doc.layers[0]!.ks!;
    // drawOffset [-100,-50] + 0.5·size [100,50] = [0,0] — the no-op guard.
    expect((ks.a as LottieProp).k).toEqual([0, 0]);
    expect((ks.p as LottieProp).k).toEqual([30, 40]);
  });

  it('an UNSET anchor (legacy origin) also emits ks.a [0,0]', () => {
    // hasAnchor === false → the gate returns [0,0] before any measurer/size read.
    const mod: SceneModule = {
      timeline: { version: 1, duration: 1, fps: 60, tracks: [] },
      createScene: () =>
        createScene({ size: { w: 400, h: 300 }, children: [new Rect({ id: 'box', width: 200, height: 100, fill: '#3366cc' })] }),
    };
    const doc = exportLottie(mod, { width: 400, height: 300, fps: 60 });
    expect((doc.layers[0]!.ks!.a as LottieProp).k).toEqual([0, 0]);
  });
});

describe('exportLottie: fill:transparent (the stroke-only-shape idiom)', () => {
  // Regression: `fill:'transparent'` hard-threw ColorParseError in exportLottie
  // (colorToLottie→parseColor rejected the CSS keyword) — exit-1, breaking export
  // for any scene with a transparent-filled/stroke-only shape. parseColor now
  // honors `transparent`→rgba(0,0,0,0); the existing 4-element-alpha color path
  // carries it round-trip to an invisible fill (NOT opaque black).
  function transparentModule(): SceneModule {
    return {
      timeline: { version: 1, duration: 1, fps: 30, tracks: [] },
      createScene: () =>
        createScene({
          size: { w: 100, h: 100 },
          children: [new Rect({ id: 'ring', width: 50, height: 50, fill: 'transparent', stroke: '#ff0000', strokeWidth: 2 })],
        }),
    };
  }

  it('exports without throwing and emits a 0-alpha fill (not opaque black)', () => {
    // pre-fix this threw ColorParseError; now it exports.
    const doc = exportLottie(transparentModule(), { width: 100, height: 100, fps: 30 });
    // shapes is a flat item array ([sh, st, fl]); find the fill item.
    const items = (doc.layers as { shapes?: { ty: string; c?: { k: number[] } }[] }[]).flatMap((l) => l.shapes ?? []);
    const fl = items.find((it) => it.ty === 'fl');
    expect(fl).toBeDefined();
    // 4-element [r,g,b,a] with a=0 — carries transparency, does NOT collapse to opaque [0,0,0].
    // The importer's lottieColor reads the 4th element as alpha (convert.ts) → #00000000, so the
    // round-trip renders invisible, not black.
    expect(fl!.c!.k).toEqual([0, 0, 0, 0]);
    // the visible stroke still exports (the shape isn't dropped).
    expect(items.some((it) => it.ty === 'st')).toBe(true);
  });

  it('the full round-trip completes (import does not throw on the transparent fill)', () => {
    const doc = exportLottie(transparentModule(), { width: 100, height: 100, fps: 30 });
    expect(() => importLottie(doc).toSceneModule().createScene()).not.toThrow();
  });
});
