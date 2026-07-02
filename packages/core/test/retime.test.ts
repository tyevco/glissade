/**
 * retime() (0.26): a pure build-time key-time transform — speed / shift /
 * reverse / pingpong — compiling to ordinary retimed tracks so evaluate() stays
 * a pure function of time and the result is golden-stable.
 */

import { describe, expect, it } from 'vitest';
import { key, sampleTrack, track, TrackValidationError } from '../src/index.js';
import { retime } from '../src/clips.js'; // relocated off the base index (0.40 budget review)

const move = () => track('box/position.x', 'number', [key(0, 0), key(1, 100, 'easeInCubic')]);

describe('retime — speed & shift', () => {
  it('speed 2 halves the key times (twice as fast)', () => {
    const [r] = retime([move()], { speed: 2 });
    expect(r!.keys.map((k) => k.t)).toEqual([0, 0.5]);
    // same eased value at proportional time
    expect(sampleTrack(r!, 0.25)).toBeCloseTo(sampleTrack(move(), 0.5), 6);
  });

  it('speed 0.5 doubles the key times (slow-mo)', () => {
    const [r] = retime([move()], { speed: 0.5 });
    expect(r!.keys.map((k) => k.t)).toEqual([0, 2]);
  });

  it('shift delays every key (applied after speed)', () => {
    const [r] = retime([move()], { speed: 2, shift: 1 });
    expect(r!.keys.map((k) => k.t)).toEqual([1, 1.5]);
  });

  it('rejects a non-positive or non-finite speed', () => {
    expect(() => retime([move()], { speed: 0 })).toThrow(TrackValidationError);
    expect(() => retime([move()], { speed: -1 })).toThrow(TrackValidationError);
    expect(() => retime([move()], { speed: Infinity })).toThrow(TrackValidationError);
  });

  it('leaves the input tracks untouched (pure)', () => {
    const src = move();
    const snapshot = JSON.stringify(src);
    retime([src], { speed: 3, reverse: true });
    expect(JSON.stringify(src)).toBe(snapshot);
  });
});

describe('retime — reverse', () => {
  it('mirrors values and the span, and time-mirrors the ease exactly', () => {
    const fwd = move();
    const [rev] = retime([fwd], { reverse: true });
    expect(rev!.keys[0]!.value).toBe(100); // starts where forward ended
    expect(rev!.keys[1]!.value).toBe(0);
    expect(rev!.keys.map((k) => k.t)).toEqual([0, 1]); // span preserved
    expect(rev!.keys[1]!.ease).toBe('easeOutCubic'); // easeInCubic mirrored
    // reversed(t) === forward(1 - t) for every sample
    for (const t of [0, 0.2, 0.5, 0.75, 1]) {
      expect(sampleTrack(rev!, t)).toBeCloseTo(sampleTrack(fwd, 1 - t), 6);
    }
  });

  it('mirrors a cubicBezier ease by point reflection', () => {
    const t = track('box/position.x', 'number', [key(0, 0), key(1, 10, { kind: 'cubicBezier', pts: [0.2, 0, 0.8, 1] })]);
    const [rev] = retime([t], { reverse: true });
    const ease = rev!.keys[1]!.ease as { kind: 'cubicBezier'; pts: [number, number, number, number] };
    expect(ease.kind).toBe('cubicBezier');
    // point reflection [x1,y1,x2,y2] → [1−x2,1−y2,1−x1,1−y1] (self-symmetric here, modulo float)
    expect(ease.pts[0]).toBeCloseTo(0.2, 9);
    expect(ease.pts[1]).toBeCloseTo(0, 9);
    expect(ease.pts[2]).toBeCloseTo(0.8, 9);
    expect(ease.pts[3]).toBeCloseTo(1, 9);
  });

  it('fails loud on a hold segment (asymmetric in time)', () => {
    const held = track('box/opacity', 'number', [key(0, 0), key(1, 1, { interp: 'hold' })]);
    expect(() => retime([held], { reverse: true })).toThrow(TrackValidationError);
  });

  it('fails loud on a spring ease (causal)', () => {
    const sprung = track('box/position.x', 'number', [
      key(0, 0),
      key(1, 100, { kind: 'spring', stiffness: 120, damping: 12, mass: 1 }),
    ]);
    expect(() => retime([sprung], { reverse: true })).toThrow(/spring/);
  });
});

describe('retime — pingpong', () => {
  it('plays forward then back as one track (there-and-back)', () => {
    const [pp] = retime([move()], { pingpong: true });
    expect(pp!.keys.map((k) => k.t)).toEqual([0, 1, 2]);
    expect(pp!.keys.map((k) => k.value)).toEqual([0, 100, 0]);
    expect(sampleTrack(pp!, 0)).toBe(0);
    expect(sampleTrack(pp!, 1)).toBe(100);
    expect(sampleTrack(pp!, 2)).toBe(0);
  });

  it('rejects reverse AND pingpong together', () => {
    expect(() => retime([move()], { reverse: true, pingpong: true })).toThrow(TrackValidationError);
  });
});
