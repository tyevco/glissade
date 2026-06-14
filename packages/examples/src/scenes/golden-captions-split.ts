/**
 * Golden corpus: caption split-cues. One long narration segment with per-word
 * timings + a committed `captionSplit` budget splits into timed sub-cues that
 * advance over the segment window — the burned track and the .srt/.vtt sidecars
 * split identically by construction. Byte-compared on Skia.
 */

import { timeline } from '@glissade/core';
import { captionNode, captionTrack, type NarrationTiming } from '@glissade/narrate';
import { Rect, createScene, type SceneModule } from '@glissade/scene';

const SIZE = { w: 360, h: 640 };
const TEXT = 'A pure function of time so every frame is addressable and replayable';
const START = 0.3;
const DUR = 3.6;
const tokens = TEXT.split(' ');
const words = tokens.map((word, i) => ({
  word,
  start: START + (i / tokens.length) * DUR,
  end: START + ((i + 1) / tokens.length) * DUR,
}));

const timing: NarrationTiming = {
  timingVersion: 1,
  provider: 'fake',
  providerVersion: 'f',
  totalDuration: 4,
  captionSplit: { maxChars: 24 },
  segments: [{ id: 's', text: TEXT, start: START, duration: DUR, file: 's.wav', words }],
};

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [
        new Rect({ id: 'bg', width: SIZE.w, height: SIZE.h, position: [SIZE.w / 2, SIZE.h / 2], fill: '#1b2330' }),
        captionNode(SIZE, { fontFamily: 'DejaVu Sans' }),
      ],
    }),
  timeline: timeline({ fps: 60, duration: 4, tracks: [captionTrack(timing)] }),
};

export default mod;
