/**
 * Audio-as-metadata example (DESIGN.md §5.3): the bounce scene with a tone on
 * each landing region and a gain envelope. `gs render ... --out x.mp4` mixes
 * the clips via the FFmpeg filter graph; PNG output ignores them.
 */

import { key, track, type AudioClip } from '@glissade/core';
import { type SceneModule } from '@glissade/scene';
import bounce from './golden-bounce.js';

const tone = (at: number, gainKeys: Parameters<typeof track>[2]): AudioClip => ({
  asset: { kind: 'audio', url: '../../assets/tone-440.wav' },
  at,
  trim: { start: 0, end: 0.6 },
  gain: track('clip/gain', 'number', gainKeys),
});

const mod: SceneModule = {
  createScene: bounce.createScene,
  timeline: {
    ...bounce.timeline,
    audio: [
      tone(0.55, [key(0, 0.9), key(0.6, 0)]), // fade out across the clip
      tone(1.35, [key(0, 0.6), key(0.6, 0)]),
      tone(1.95, [key(0, 0.35), key(0.6, 0)]),
    ],
  },
};

export default mod;
