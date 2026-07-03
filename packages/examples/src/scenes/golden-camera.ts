/**
 * Golden corpus (0.55): the Camera rig. A 2-depth layer stack (a far parallax
 * backdrop at depth 0.3, a focal plane at depth 1) is pushed IN — `cam/zoom`
 * ramps 1→1.6 while `cam/center` pans off-center — under a fixed-seed whole-frame
 * shake. The focal plane carries an `anchor:'left'` bar: the camera transforms the
 * WORLD as a parent transform while the bar's anchor stays NODE-LOCAL, so the
 * push-in never double-shifts it (the composition contract). The caption is a
 * SIBLING of the camera (outside the rig), so it stays PINNED at the lower third
 * while everything else moves — the documented caption-pin pattern.
 *
 * The pose (center/zoom) is keyframed tracks and the shake is a pure closed-form
 * function of the playhead, so the whole frame byte-compares on Skia in CI.
 */

import { key, timeline, track } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';
import { camera } from '@glissade/scene/motion';

const mod: SceneModule = {
  createScene: () => {
    // FAR layer (depth 0.3): a dim backdrop + scattered dots that pan LESS
    const far = new Group({
      id: 'far',
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0a0e17' }),
        new Circle({ id: 'far-a', radius: 6, position: [120, 90], fill: '#1b2740' }),
        new Circle({ id: 'far-b', radius: 6, position: [520, 120], fill: '#1b2740' }),
        new Circle({ id: 'far-c', radius: 6, position: [430, 280], fill: '#1b2740' }),
        new Circle({ id: 'far-d', radius: 6, position: [90, 300], fill: '#1b2740' }),
      ],
    });

    // FOCAL layer (depth 1): the subject + an anchor:'left' bar (no-double-shift demo)
    const focal = new Group({
      id: 'focal',
      children: [
        new Circle({ id: 'subject', radius: 46, position: [320, 170], fill: '#39e0ff' }),
        // position is the bar's LEFT edge (anchor:'left'); the push-in must keep it
        // anchored there, camera-transformed but not double-shifted.
        new Rect({ id: 'leftbar', anchor: 'left', position: [190, 260], width: 200, height: 22, fill: '#f5a623' }),
      ],
    });

    const cam = camera(
      [
        { content: far, depth: 0.3 },
        { content: focal, depth: 1 },
      ],
      { id: 'cam', shake: { seed: 7, translate: 2.5, rotate: 0.5, frequency: 6 } },
    );

    // caption — a SIBLING of the camera (outside the rig) → pinned, untouched by the move
    const caption = new Text({
      id: 'caption',
      text: 'PUSH IN',
      position: [320, 338],
      fontSize: 20,
      fontFamily: 'DejaVu Sans',
      fill: '#ffffff',
      align: 'center',
    });

    return createScene({ size: { w: 640, h: 360 }, children: [cam, caption] });
  },
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      track('cam/zoom', 'number', [key(0, 1), key(3, 1.6)]),
      track('cam/center.x', 'number', [key(0, 0.5), key(3, 0.6)]),
      track('cam/center.y', 'number', [key(0, 0.5), key(3, 0.54)]),
    ],
  }),
};

export default mod;
