import { describe, expect, it, vi } from 'vitest';
import {
  bindTimeline,
  compileTimeline,
  computed,
  createPlayhead,
  evaluateAt,
  key,
  signal,
  timeline,
  track,
  type Vec2,
  vec2Signal,
  UnboundTargetError,
  WriteDuringEvaluationError,
  type BindTarget,
} from '../src/index.js';

const demoDoc = () =>
  timeline({
    tracks: [
      track('circle/opacity', 'number', [
        key(0, 0),
        key(1, 1, 'easeInOutCubic'),
        key(2, 1, { interp: 'hold' }),
        key(2.5, 0, 'easeOutQuad'),
      ]),
      track('circle/position.x', 'number', [key(1, 0), key(2, 300, 'easeInOutCubic')]),
      track('circle/scale', 'vec2', [key<Vec2>(1, [1, 1]), key<Vec2>(2, [2, 2])]),
    ],
  });

function demoScene() {
  const opacity = signal(0);
  const position = vec2Signal([0, 0]);
  const scale = vec2Signal([1, 1]);
  const props: Record<string, BindTarget> = {
    'circle/opacity': opacity,
    'circle/position.x': position.x,
    'circle/scale': scale,
  };
  return { opacity, position, scale, resolve: (target: string) => props[target] };
}

describe('bindTimeline (§2.4)', () => {
  it('drives property signals from the playhead', () => {
    const scene = demoScene();
    const playhead = createPlayhead();
    bindTimeline(compileTimeline(demoDoc()), scene.resolve, playhead);

    playhead.set(0.5);
    expect(scene.opacity()).toBeCloseTo(0.5, 9);
    expect(scene.position()).toEqual([0, 0]);

    playhead.set(1.5);
    expect(scene.opacity()).toBe(1);
    expect(scene.position.x()).toBeCloseTo(150, 9);
    expect(scene.scale()).toEqual([1.5, 1.5]);
  });

  it('seeking is random-access: any order, same values', () => {
    const sceneA = demoScene();
    const sceneB = demoScene();
    const phA = createPlayhead();
    const phB = createPlayhead();
    bindTimeline(compileTimeline(demoDoc()), sceneA.resolve, phA);
    bindTimeline(compileTimeline(demoDoc()), sceneB.resolve, phB);

    const ts = [2.5, 0.1, 1.9, 0.6, 2.2, 1.0, 0.0, 1.5];
    const forward = [...ts].sort((a, b) => a - b);
    const snapA = ts.map((t) => {
      phA.set(t);
      return [sceneA.opacity(), sceneA.position.x(), ...sceneA.scale()];
    });
    const snapB = forward.map((t) => {
      phB.set(t);
      return [sceneB.opacity(), sceneB.position.x(), ...sceneB.scale()];
    });
    for (let i = 0; i < ts.length; i++) {
      const j = forward.indexOf(ts[i]!);
      expect(snapA[i]).toEqual(snapB[j]);
    }
  });

  it('unchanged samples do not propagate dirtiness (§2.4 partial invalidation)', () => {
    const scene = demoScene();
    const playhead = createPlayhead();
    bindTimeline(compileTimeline(demoDoc()), scene.resolve, playhead);

    const render = vi.fn(() => scene.opacity());
    const view = computed(render);
    playhead.set(1.2);
    expect(view()).toBe(1);
    expect(render).toHaveBeenCalledTimes(1);
    // opacity is in its hold plateau between 1 and 2 — scrubbing there samples
    // the same value, so the downstream computed must not recompute
    playhead.set(1.5);
    view();
    playhead.set(1.8);
    view();
    expect(render).toHaveBeenCalledTimes(1);
    playhead.set(2.3); // fade-out region — now it must
    view();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('throws on unbound targets', () => {
    const doc = timeline({ tracks: [track('ghost/x', 'number', [key(0, 0)])] });
    expect(() => bindTimeline(compileTimeline(doc), () => undefined)).toThrow(UnboundTargetError);
  });

  it('unbind freezes values', () => {
    const scene = demoScene();
    const playhead = createPlayhead();
    const bound = bindTimeline(compileTimeline(demoDoc()), scene.resolve, playhead);
    playhead.set(1.5);
    expect(scene.opacity()).toBe(1);
    bound.unbind();
    playhead.set(0);
    expect(scene.opacity()).toBe(1);
  });
});

describe('evaluateAt (§2.5 entry discipline)', () => {
  it('playhead write is sanctioned; reads inside are pure', () => {
    const scene = demoScene();
    const playhead = createPlayhead();
    bindTimeline(compileTimeline(demoDoc()), scene.resolve, playhead);

    const value = evaluateAt(playhead, 0.5, () => scene.opacity());
    expect(value).toBeCloseTo(0.5, 9);
  });

  it('rejects writes during evaluation', () => {
    const rogue = signal(0);
    const playhead = createPlayhead();
    expect(() => evaluateAt(playhead, 1, () => rogue.set(5))).toThrow(WriteDuringEvaluationError);
  });

  it('evaluating twice ≡ once (purity property)', () => {
    const scene = demoScene();
    const playhead = createPlayhead();
    bindTimeline(compileTimeline(demoDoc()), scene.resolve, playhead);
    const sample = (t: number) =>
      evaluateAt(playhead, t, () => [scene.opacity(), scene.position.x(), ...scene.scale()]);
    for (const t of [0, 0.7, 1.3, 2.1, 2.5]) {
      expect(sample(t)).toEqual(sample(t));
    }
  });
});
