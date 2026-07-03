/** 0.41 incremental e2e fixture — baseline. `slider` moves the whole time (shared
 * with sceneB); `mover` is STATIC, so the first-half frames are byte-identical to
 * sceneB and the dirty-beat splice keeps them from the intermediate. */
import { key, timeline, track } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';
const mod: SceneModule = {
  createScene: () => createScene({
    size: { w: 320, h: 180 },
    children: [
      new Rect({ id: 'bg', width: 320, height: 180, position: [160, 90], fill: '#10131a' }),
      new Rect({ id: 'slider', width: 40, height: 40, position: [40, 90], fill: '#e6a700' }),
      new Rect({ id: 'mover', width: 30, height: 30, position: [100, 140], fill: '#4ea1ff' }),
    ],
  }),
  timeline: timeline({
    duration: 2,
    tracks: [track('slider/position.x', 'number', [key(0, 40), key(2, 280)])],
  }),
};
export default mod;
