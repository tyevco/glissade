/**
 * Golden corpus: following a MORPHING path live. The route bends from a flat
 * line to an arch (a 'route/d' path track) while a cursor sweeps it (a
 * 'cf/progress' track) — followPath is given the Path NODE, so it re-samples
 * the current geometry each frame and the cursor rides the bending line,
 * oriented to its tangent. Pure data, byte-compared on Skia in CI.
 */

import { key, timeline, track, type PathValue } from '@glissade/core';
import { Path, Rect, createScene, type SceneModule } from '@glissade/scene';
import { followPath } from '@glissade/scene/motion';

// same topology (3 anchors) so the path lerps cleanly: flat → arch
const flat: PathValue = [
  { closed: false, v: [[90, 290], [320, 290], [550, 290]], in: [[0, 0], [0, 0], [0, 0]], out: [[0, 0], [0, 0], [0, 0]] },
];
const arch: PathValue = [
  { closed: false, v: [[90, 290], [320, 70], [550, 290]], in: [[0, 0], [-150, 0], [0, 0]], out: [[0, 0], [150, 0], [0, 0]] },
];
const arrow: PathValue = [
  { closed: true, v: [[12, 0], [-7, -7], [-7, 7]], in: [[0, 0], [0, 0], [0, 0]], out: [[0, 0], [0, 0], [0, 0]] },
];

const mod: SceneModule = {
  createScene: () => {
    const route = new Path({ id: 'route', data: flat, stroke: '#ffb454', strokeWidth: 3 });
    const cursor = new Path({ id: 'cursor', data: arrow, fill: '#9ef0c0' });
    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        route,
        cursor,
        // the Path NODE (not a static value) → followed live as it morphs
        followPath(cursor, route, { id: 'cf', orient: true }),
      ],
    });
  },
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      track<PathValue>('route/d', 'path', [key(0, flat), key(2.2, arch, 'easeInOutCubic')]),
      track('cf/progress', 'number', [key(0, 0), key(2.6, 1, 'easeInOutCubic')]),
    ],
  }),
};

export default mod;
