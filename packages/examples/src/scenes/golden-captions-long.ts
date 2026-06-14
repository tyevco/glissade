/**
 * Golden corpus: the long-caption overflow guard. A long narration segment in
 * a 9:16 frame would wrap to many lines and run off the bottom; captionNode
 * auto-shrinks it to the line budget and bottom-anchors the block, so it stays
 * inside the safe area (load-bearing for muted social cutdowns). Byte-compared
 * on Skia in CI.
 */

import { timeline } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';
import { captionNode, captionTrack, type NarrationTiming } from '@glissade/narrate';

const SIZE = { w: 360, h: 640 };
const LONG =
  'Render is a pure function of time, so every frame is addressable and renders byte-identical in continuous integration.';

const timing: NarrationTiming = {
  timingVersion: 1,
  provider: 'fake',
  providerVersion: 'fake-1',
  totalDuration: 4,
  segments: [{ id: 'long', text: LONG, start: 0.3, duration: 3.4, file: 'long.wav' }],
};

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [
        new Rect({ id: 'bg', width: SIZE.w, height: SIZE.h, position: [SIZE.w / 2, SIZE.h / 2], fill: '#1b2330' }),
        // a marker at the bottom inset, so the golden shows the caption staying ABOVE it
        new Rect({ id: 'safeline', width: SIZE.w, height: 2, position: [SIZE.w / 2, Math.round(SIZE.h * 0.82)], fill: '#3a4660' }),
        captionNode(SIZE, { fontFamily: 'DejaVu Sans', autoFit: true, maxLines: 3 }),
      ],
    }),
  timeline: timeline({ fps: 60, duration: 4, tracks: [captionTrack(timing)] }),
};

export default mod;
