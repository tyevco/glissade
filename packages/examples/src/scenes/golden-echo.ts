/**
 * Golden corpus (0.26): Echo motion trails. A bright dot orbits a ring (its
 * position owned by followPath) wrapped in an Echo, so it leaves a fading comet
 * trail — six ghost copies at earlier playhead offsets, each dimmer by `decay`.
 * The trail is a PURE function of the current time (Echo re-addresses the scene
 * playhead per copy and restores it), so it byte-compares on Skia in CI.
 */

import { key, timeline, track, type PathValue } from '@glissade/core';
import { Circle, Path, Rect, createScene, echo, type SceneModule } from '@glissade/scene';
import { followPath } from '@glissade/scene/motion';

// a circular ring track, centered, radius 120 (kappa cubic tangents)
const K = 0.5523;
const R = 120;
const CX = 320;
const CY = 180;
const ring: PathValue = [
  {
    closed: true,
    v: [
      [CX + R, CY],
      [CX, CY + R],
      [CX - R, CY],
      [CX, CY - R],
    ],
    in: [
      [0, -R * K],
      [R * K, 0],
      [0, R * K],
      [-R * K, 0],
    ],
    out: [
      [0, R * K],
      [-R * K, 0],
      [0, -R * K],
      [R * K, 0],
    ],
  },
];

const mod: SceneModule = {
  createScene: () => {
    const dot = new Circle({ id: 'dot', radius: 13, fill: '#39e0ff' });
    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0a0e17' }),
        new Path({ id: 'ring', data: ring, stroke: '#1b2740', strokeWidth: 2 }),
        // the dot leaves a 6-ghost fading trail; its position is owned by followPath
        echo(dot, { id: 'trail', count: 7, spacing: 0.07, decay: 0.68 }),
        followPath(dot, ring, { id: 'orbit' }),
      ],
    });
  },
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [track('orbit/progress', 'number', [key(0, 0), key(3, 1)])],
  }),
};

export default mod;
