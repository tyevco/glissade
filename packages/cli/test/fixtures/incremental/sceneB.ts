/** 0.41 incremental e2e fixture — the EDIT. Identical to sceneA except `mover`
 * animates in the SECOND HALF (t>1), so frames t<=1 stay byte-identical to sceneA
 * and only the downstream run re-renders under --incremental. */
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
    tracks: [
      track('slider/position.x', 'number', [key(0, 40), key(2, 280)]),
      track('mover/position.x', 'number', [key(1, 100), key(2, 260)]),
    ],
  }),
};
export default mod;
