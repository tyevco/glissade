/**
 * Golden scene: the §3.5 cross-frame subtree raster cache. A `cache:true`
 * STATIC group (a decorated badge that never animates) sits behind a Circle
 * that sweeps across the frame. From frame 1 on, the badge's bitmap re-blits
 * from the LRU instead of re-rasterizing — but the result is byte-identical to
 * the uncached render, which is the whole point and what this golden pins.
 *
 * The badge is opacity-1 / source-over / no-filter: it would NOT normally emit
 * a group, so `cache:true` is what forces the cacheable pushGroup. Its device
 * transform is constant (a static position), so every frame after the first
 * HITs. The moving dot stays uncached (it changes every frame).
 */

import { key, timeline, track } from '@glissade/core';
import { Circle, createScene, Group, Rect, Text, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0e1116' }),
        // The cached static subtree: a layered badge that never moves or
        // changes. cache:true forces the group + a stamped cacheKey; the device
        // transform is constant, so frames 1..N re-blit the same bitmap.
        new Group({
          id: 'badge',
          position: [200, 180],
          cache: true,
          children: [
            new Rect({ id: 'badge-plate', width: 220, height: 140, cornerRadius: 18, fill: '#1f6feb' }),
            new Rect({ id: 'badge-inner', width: 188, height: 108, cornerRadius: 12, fill: '#0e1116' }),
            new Circle({ id: 'badge-dot', radius: 30, position: [0, -8], fill: '#f5a623' }),
            new Text({
              id: 'badge-label',
              text: 'CACHED',
              position: [0, 44],
              align: 'center',
              fontFamily: 'DejaVu Sans',
              fontSize: 22,
              fill: '#e6edf3',
            }),
          ],
        }),
        // An uncached moving element sweeping over/under the badge: proves the
        // cached blit composites against live, changing destination pixels.
        new Circle({ id: 'mover', radius: 26, position: [0, 90], fill: '#3ddc97' }),
      ],
    }),
  timeline: timeline({
    duration: 3,
    fps: 60,
    tracks: [
      track('mover/position.x', 'number', [
        key(0, 60),
        key(1.5, 580, 'easeInOutSine'),
        key(3, 60, 'easeInOutSine'),
      ]),
    ],
  }),
};

export default mod;
