/**
 * Golden corpus: narration-anchored captions, 16:9 (§narrate). The committed
 * timing manifest (fake provider — deterministic on any machine) drives both
 * the caption track and the visual beats: each panel slides in when its
 * narration segment STARTS, so re-narrating with different durations re-flows
 * the animation without touching this file. Byte-compared on Skia in CI.
 */

import { key, timeline, track } from '@glissade/core';
import { captionNode, captionTrack, narration, type NarrationTiming } from '@glissade/narrate';
import { Circle, Rect, createScene, type SceneModule } from '@glissade/scene';
import timingJson from './golden-captions.narration.timing.json';

const timing = timingJson as NarrationTiming;
const beats = narration(timing);
const SIZE = { w: 640, h: 360 };

const PANELS = [
  { seg: 'intro', color: '#e6a700', x: 160 },
  { seg: 'data', color: '#4ea1ff', x: 320 },
  { seg: 'outro', color: '#3ddc97', x: 480 },
];

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [
        new Rect({ id: 'bg', width: SIZE.w, height: SIZE.h, position: [320, 180], fill: '#10131a' }),
        ...PANELS.map(
          (p) =>
            new Circle({ id: `panel-${p.seg}`, radius: 42, position: [p.x, 140], fill: p.color, opacity: 0 }),
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
      // each panel pops at its segment's start — narration-derived, not hand-timed
      ...PANELS.flatMap((p) => [
        track(`panel-${p.seg}/opacity`, 'number', [
          key(beats.start(p.seg), 0),
          key(beats.start(p.seg) + 0.3, 1, 'easeOutCubic'),
        ]),
        track(`panel-${p.seg}/position`, 'vec2', [
          key(beats.start(p.seg), [p.x, 170]),
          key(beats.start(p.seg) + 0.3, [p.x, 140], 'easeOutCubic'),
        ]),
      ]),
    ],
    audio: beats.clips('./golden-captions.narration-cache'),
    // asset id IS the family name (§3.6) — gs render registers it standalone
    assets: { 'DejaVu Sans': { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
  }),
};

export default mod;
