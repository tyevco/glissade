/**
 * kenBurns (0.71): the per-node photo pan/zoom preset. A PURE track-emitter that
 * bakes `<id>/scale` (+ optional `<id>/position`) keyframes onto an EXISTING node
 * and returns { tracks, end }. The load-bearing pin: a DEFAULTED `from` reads the
 * node's STATIC constructed prop (never the animated state at `at`), so the emitted
 * tracks are order-independent — a pure function of (static props, args).
 */

import { describe, expect, it } from 'vitest';
import { timeline, track, key, type Track } from '@glissade/core';
import { Rect, createScene, evaluate } from '../src/index.js';
import { kenBurns, KenBurnsError } from '../src/kenBurns.js';

/** find a track by its target id within an emitted set. */
function byTarget(tracks: Track[], target: string): Track {
  const t = tracks.find((tr) => tr.target === target);
  if (t === undefined) throw new Error(`no track targeting ${target}`);
  return t;
}

describe('kenBurns', () => {
  it('emits a `<id>/scale` vec2 track; default zoom is [1,1] → [1.1,1.1] over [at,at+duration]', () => {
    const photo = new Rect({ id: 'photo', width: 100, height: 100 });
    const { tracks, end } = kenBurns(photo);
    expect(tracks).toHaveLength(1); // zoom-only, no pan
    const s = byTarget(tracks, 'photo/scale');
    expect(s.type).toBe('vec2');
    expect(s.keys[0]).toMatchObject({ t: 0, value: [1, 1] });
    expect(s.keys[1]).toMatchObject({ t: 5, value: [1.1, 1.1] }); // default duration 5
    expect(end).toBe(5);
  });

  it('zoom as a bare number N → [staticCurrentScale, [N,N]]', () => {
    const photo = new Rect({ id: 'photo', width: 100, height: 100 }); // rest scale [1,1]
    const { tracks } = kenBurns(photo, { zoom: 1.15 });
    const s = byTarget(tracks, 'photo/scale');
    expect(s.keys[0]!.value).toEqual([1, 1]); // static current scale
    expect(s.keys[1]!.value).toEqual([1.15, 1.15]);
  });

  it('zoom as a tuple [from,to] → explicit uniform both ends (pull-out too)', () => {
    const photo = new Rect({ id: 'photo', width: 100, height: 100 });
    const { tracks } = kenBurns(photo, { zoom: [1.1, 1] }); // pull-out
    const s = byTarget(tracks, 'photo/scale');
    expect(s.keys[0]!.value).toEqual([1.1, 1.1]);
    expect(s.keys[1]!.value).toEqual([1, 1]);
  });

  it('no pan by default (zoom-only is valid) — only the scale track is emitted', () => {
    const photo = new Rect({ id: 'photo', width: 100, height: 100 });
    const { tracks } = kenBurns(photo, { zoom: [1, 1.2] });
    expect(tracks.map((t) => t.target)).toEqual(['photo/scale']);
  });

  it('pan offset [dx,dy] → from = static position, to = from + offset', () => {
    const photo = new Rect({ id: 'photo', width: 100, height: 100, position: [320, 180] });
    const { tracks } = kenBurns(photo, { pan: [-40, 20] });
    const p = byTarget(tracks, 'photo/position');
    expect(p.type).toBe('vec2');
    expect(p.keys[0]!.value).toEqual([320, 180]); // static current position
    expect(p.keys[1]!.value).toEqual([280, 200]); // from + [-40, 20]
  });

  it('pan { from, to } → explicit endpoints', () => {
    const photo = new Rect({ id: 'photo', width: 100, height: 100, position: [320, 180] });
    const { tracks } = kenBurns(photo, { pan: { from: [0, 0], to: [100, 50] } });
    const p = byTarget(tracks, 'photo/position');
    expect(p.keys[0]!.value).toEqual([0, 0]);
    expect(p.keys[1]!.value).toEqual([100, 50]); // explicit, ignores static position
  });

  it('ease default is easeInOutSine on the ARRIVAL key; at/duration set the key times', () => {
    const photo = new Rect({ id: 'photo', width: 100, height: 100, position: [0, 0] });
    const { tracks, end } = kenBurns(photo, { pan: [10, 0], at: 2, duration: 3 });
    const s = byTarget(tracks, 'photo/scale');
    const p = byTarget(tracks, 'photo/position');
    for (const tr of [s, p]) {
      expect(tr.keys[0]!.t).toBe(2); // at
      expect(tr.keys[1]!.t).toBe(5); // at + duration
      expect(tr.keys[0]!.ease).toBeUndefined(); // launch key has no ease
      expect(tr.keys[1]!.ease).toBe('easeInOutSine'); // arrival key eases
    }
    expect(end).toBe(5);
  });

  it('a custom ease flows onto the arrival keys', () => {
    const photo = new Rect({ id: 'photo', width: 100, height: 100 });
    const { tracks } = kenBurns(photo, { pan: [10, 0], ease: 'easeOutCubic' });
    expect(byTarget(tracks, 'photo/scale').keys[1]!.ease).toBe('easeOutCubic');
    expect(byTarget(tracks, 'photo/position').keys[1]!.ease).toBe('easeOutCubic');
  });

  it('THE STATIC-FROM PIN: a defaulted `from` reads the node STATIC constructed scale/position, not [1,1]/[0,0]', () => {
    // node built with NON-default scale + position
    const photo = new Rect({ id: 'photo', width: 100, height: 100, position: [50, 60], scale: [1.3, 1.3] });
    const { tracks } = kenBurns(photo, { zoom: 1.6, pan: [10, -10] });
    // zoom `from` == the static constructed scale (1.3), NOT 1
    expect(byTarget(tracks, 'photo/scale').keys[0]!.value).toEqual([1.3, 1.3]);
    // pan `from` == the static constructed position, NOT [0,0]
    expect(byTarget(tracks, 'photo/position').keys[0]!.value).toEqual([50, 60]);
    expect(byTarget(tracks, 'photo/position').keys[1]!.value).toEqual([60, 50]);
  });

  it('EMISSION DETERMINISM: same (target, opts) → structurally identical tracks', () => {
    const mk = (): Track[] => {
      const photo = new Rect({ id: 'photo', width: 100, height: 100, position: [320, 180] });
      return kenBurns(photo, { zoom: [1, 1.1], pan: [-40, 20], duration: 4, at: 1 }).tracks;
    };
    expect(JSON.stringify(mk())).toBe(JSON.stringify(mk()));
  });

  it('ORDER-INDEPENDENCE: emitting kenBurns before vs after other tracks on the node yields identical kenBurns tracks (reads static props, not other tracks)', () => {
    // Build the node, and separately author a scale/position track on it in a timeline.
    // kenBurns must NOT read that authored motion — its `from` is the static rest value
    // regardless of what other tracks exist or the order they were built.
    const node = new Rect({ id: 'photo', width: 100, height: 100, position: [10, 10], scale: [1, 1] });

    // "after": pretend other tracks already exist for this node in the doc
    const other = [
      track('photo/scale', 'vec2', [key(0, [2, 2]), key(1, [3, 3])]),
      track('photo/position', 'vec2', [key(0, [999, 999]), key(1, [888, 888])]),
    ];
    void other; // they live in the doc; kenBurns must ignore them
    const afterOther = kenBurns(node, { zoom: 1.2, pan: [5, 5] }).tracks;

    // "before": a fresh identical node, emit kenBurns with no other tracks around
    const fresh = new Rect({ id: 'photo', width: 100, height: 100, position: [10, 10], scale: [1, 1] });
    const beforeOther = kenBurns(fresh, { zoom: 1.2, pan: [5, 5] }).tracks;

    expect(JSON.stringify(afterOther)).toBe(JSON.stringify(beforeOther));
    // and specifically: the `from` is the STATIC rest [1,1]/[10,10], not the other track's [2,2]/[999,999]
    expect(byTarget(afterOther, 'photo/scale').keys[0]!.value).toEqual([1, 1]);
    expect(byTarget(afterOther, 'photo/position').keys[0]!.value).toEqual([10, 10]);
  });

  it('the emitted tracks are REAL keyframe tracks that drive the node under evaluate() (a pure function of time)', () => {
    const photo = new Rect({ id: 'photo', width: 100, height: 100, position: [100, 100], fill: '#888' });
    const { tracks } = kenBurns(photo, { zoom: [1, 2], pan: [50, 0], duration: 2 });
    const scene = createScene({ size: { w: 200, h: 200 }, children: [photo] });
    const tl = timeline({ duration: 2, fps: 30, tracks });

    // scrub OUT OF ORDER — evaluate is a pure function of time
    evaluate(scene, tl, 2);
    evaluate(scene, tl, 0);
    evaluate(scene, tl, 1);
    // at the end pose: scale doubled, position panned by +50 in x
    evaluate(scene, tl, 2);
    expect(photo.scale()).toEqual([2, 2]);
    expect(photo.position()).toEqual([150, 100]);
    // back at the start pose
    evaluate(scene, tl, 0);
    expect(photo.scale()).toEqual([1, 1]);
    expect(photo.position()).toEqual([100, 100]);
  });

  it('fails loud when the target has no id (the track targets need `<id>/…`)', () => {
    const anon = new Rect({ width: 10, height: 10 });
    expect(() => kenBurns(anon)).toThrow(KenBurnsError);
    expect(() => kenBurns(anon)).toThrow(/needs a target with an `id`/);
  });

  it('end === at + duration', () => {
    const photo = new Rect({ id: 'photo', width: 10, height: 10 });
    expect(kenBurns(photo, { at: 1.5, duration: 4 }).end).toBe(5.5);
  });
});
