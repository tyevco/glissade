/**
 * Golden corpus: motion along a path. An arrow cursor traces an arch route by
 * arc length (constant speed) and orients to the path tangent, so it points
 * where it's heading. The route is a stroked Path; the cursor's position and
 * rotation are owned by followPath, driven by one 'cf/progress' track. Pure
 * data, byte-compared on Skia in CI.
 */

import { key, timeline, track, type PathValue } from '@glissade/core';
import { Path, Rect, followPath, createScene, type SceneModule } from '@glissade/scene';

// an arch: bottom-left → peak (horizontal tangents = smooth top) → bottom-right
const route: PathValue = [
  {
    closed: false,
    v: [
      [90, 290],
      [320, 70],
      [550, 290],
    ],
    in: [
      [0, 0],
      [-150, 0],
      [0, 0],
    ],
    out: [
      [0, 0],
      [150, 0],
      [0, 0],
    ],
  },
];

// a small arrow pointing +x at rest, so orient aligns it to the tangent
const arrow: PathValue = [
  {
    closed: true,
    v: [
      [12, 0],
      [-7, -7],
      [-7, 7],
    ],
    in: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    out: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  },
];

const mod: SceneModule = {
  createScene: () => {
    const cursor = new Path({ id: 'cursor', data: arrow, fill: '#ff5d73' });
    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Path({ id: 'route', data: route, stroke: '#4ea1ff', strokeWidth: 3 }),
        cursor,
        followPath(cursor, route, { id: 'cf', orient: true }),
      ],
    });
  },
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [track('cf/progress', 'number', [key(0, 0), key(2.6, 1, 'easeInOutCubic')])],
  }),
};

export default mod;
