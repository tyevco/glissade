// Fixture scene for the gs parity tests — a solid-fill Rect animated on position
// (cubicBezier), rotation, and opacity, plus a hold tail. Uses only the exactly-
// invertible Lottie subset (cubicBezier/hold + solid fill), so the skia↔lottie
// round-trip is faithful by construction and clears the SSIM floor. Mirrors the
// @glissade/lottie round-trip gate's mappableScene.
import { key, track, type Timeline } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';

const timeline: Timeline = {
  version: 1,
  duration: 2,
  fps: 60,
  tracks: [
    track('box/position', 'vec2', [
      key(0, [60, 70]),
      key(1, [180, 160], { kind: 'cubicBezier', pts: [0.42, 0, 0.58, 1] }),
      key(2, [120, 120], { interp: 'hold' }),
    ]),
    track('box/rotation', 'number', [key(0, 0), key(2, 90, { kind: 'cubicBezier', pts: [0.4, 0.1, 0.6, 0.9] })]),
    track('box/opacity', 'number', [key(0, 1), key(1.5, 0.4)]),
  ],
};

const mod: SceneModule = {
  createScene: () =>
    createScene({ size: { w: 240, h: 240 }, children: [new Rect({ id: 'box', width: 70, height: 50, fill: '#3366cc' })] }),
  timeline,
};

export default mod;
