/**
 * Golden corpus: captions in 9:16 (§narrate). Same narration manifest as the
 * landscape scene; what changes is the safe area — captionNode detects
 * portrait and sits the captions higher (reels/shorts UI chrome covers the
 * bottom ~15%) with a proportionally smaller face.
 */

import { key, timeline, track } from '@glissade/core';
import { captionNode, captionTrack, narration, type NarrationTiming } from '@glissade/narrate';
import { Circle, Rect, createScene, type SceneModule } from '@glissade/scene';
import timingJson from './golden-captions.narration.timing.json';

const timing = timingJson as NarrationTiming;
const beats = narration(timing);
const SIZE = { w: 360, h: 640 };

const PANELS = [
  { seg: 'intro', color: '#e6a700', y: 140 },
  { seg: 'data', color: '#4ea1ff', y: 280 },
  { seg: 'outro', color: '#3ddc97', y: 420 },
];

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [
        new Rect({ id: 'bg', width: SIZE.w, height: SIZE.h, position: [180, 320], fill: '#10131a' }),
        ...PANELS.map(
          (p) =>
            new Circle({ id: `panel-${p.seg}`, radius: 42, position: [180, p.y], fill: p.color, opacity: 0 }),
        ),
        captionNode(SIZE, { fontFamily: 'DejaVu Sans' }),
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: beats.totalDuration + 0.5,
    labels: beats.labels(),
    tracks: [
      captionTrack(timing),
      ...PANELS.flatMap((p) => [
        track(`panel-${p.seg}/opacity`, 'number', [
          key(beats.start(p.seg), 0),
          key(beats.start(p.seg) + 0.3, 1, 'easeOutCubic'),
        ]),
        track(`panel-${p.seg}/position`, 'vec2', [
          key(beats.start(p.seg), [210, p.y]),
          key(beats.start(p.seg) + 0.3, [180, p.y], 'easeOutCubic'),
        ]),
      ]),
    ],
    audio: beats.clips('./golden-captions.narration-cache'),
    assets: { 'DejaVu Sans': { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
  }),
};

export default mod;
