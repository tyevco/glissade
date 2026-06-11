import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { createScene, evaluate, Video, ColdAssetError } from '../src/index.js';

const clip = () =>
  new Video({
    id: 'clip',
    assetId: 'vid',
    at: 1,
    trimStart: 0.5,
    playbackRate: 2,
    clipDuration: 2,
    sourceFps: 30,
    width: 320,
    height: 180,
    position: [320, 180],
  });

describe('Video node (§3.8): pure media-time arithmetic', () => {
  it('maps timeline t through at/trim/rate, quantized to the source grid', () => {
    const v = clip();
    expect(v.mediaTime(0.5)).toBeNull(); // before the clip
    expect(v.mediaTime(1)).toBeCloseTo(0.5, 9);
    // t=1.7 → local 0.7*2 = 1.4 → media 1.9 → grid floor at 30fps = 57/30 = 1.9 exactly
    expect(v.mediaTime(1.7)).toBeCloseTo(1.9, 9);
    // quantization: t=1.701 → media 1.902 → floor(57.06)/30 = 1.9
    expect(v.mediaTime(1.701)).toBeCloseTo(1.9, 9);
    expect(v.mediaTime(3.2)).toBeNull(); // past clipDuration
  });

  it('emits a videoFrame resource with the exact grid time; nothing outside the clip', () => {
    const scene = createScene({ size: { w: 640, h: 360 }, children: [clip()] });
    const doc = timeline({ duration: 4 });
    const inside = evaluate(scene, doc, 1.701);
    const frameRes = inside.resources.find((r) => r.kind === 'videoFrame');
    expect(frameRes).toMatchObject({ kind: 'videoFrame', assetId: 'vid', mediaT: 1.9 });
    const outside = evaluate(scene, doc, 0.2);
    expect(outside.resources.find((r) => r.kind === 'videoFrame')).toBeUndefined();
  });

  it('equal-grid-frame times emit identical DisplayLists (IR-level quantization)', () => {
    const scene = createScene({ size: { w: 640, h: 360 }, children: [clip()] });
    const doc = timeline({ duration: 4 });
    expect(evaluate(scene, doc, 1.7)).toEqual(evaluate(scene, doc, 1.71));
  });

  it('ColdAssetError carries the readiness-precondition message', () => {
    const err = new ColdAssetError('vid', 'test');
    expect(err.message).toContain('warm assets');
  });
});
