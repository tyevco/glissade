/**
 * Golden corpus (0.65): the Camera NODE-FRAMING rig (`centerOn` + `clear`). The
 * camera focal point TRACKS the `hero` node by id in WORLD space — as the hero
 * drifts across the world, the camera pans to keep it centered (a far parallax
 * grid at depth 0.4 pans LESS). A `clear` reserved region (the bottom caption band)
 * NUDGES the focal so the tall hero's BOUNDS clear the band: the hero rides just
 * above the reserved zone instead of dead-center, its bottom pushed clear.
 *
 * The pinned caption is a SIBLING of the camera (outside the rig) sitting in the
 * cleared band. `centerOn` resolves the hero's live worldMatrix as a pure function
 * of time (the Echo/orient discipline) + a constant clear nudge, so the whole frame
 * byte-compares on Skia in CI.
 */

import { key, timeline, track } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';
import { camera } from '@glissade/scene/motion';

const SIZE = { w: 640, h: 360 };
// the reserved caption band (integer bounds — the shared Region shape): the hero's
// bounds are nudged to clear it, and the caption sibling fills it.
const CLEAR = { minX: 0, minY: 280, maxX: 640, maxY: 360 };

const mod: SceneModule = {
  createScene: () => {
    // FAR layer (depth 0.4): a static dot grid that pans LESS than the focal plane
    const dots: Circle[] = [];
    for (let gx = 0; gx < 7; gx++) {
      for (let gy = 0; gy < 4; gy++) {
        dots.push(new Circle({ radius: 5, position: [60 + gx * 90, 50 + gy * 80], fill: '#1b2740' }));
      }
    }
    const far = new Group({
      id: 'far',
      children: [new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0a0e17' }), ...dots],
    });

    // FOCAL layer (depth 1): the HERO the camera frames — a tall card drifting
    // rightward through the world, plus a bullseye dot at its center so centering is
    // visually verifiable.
    const focal = new Group({
      id: 'focal',
      children: [
        new Rect({ id: 'hero', width: 180, height: 220, position: [220, 200], fill: '#39e0ff' }),
        new Circle({ id: 'hero-pip', radius: 10, position: [220, 200], fill: '#0a2a33' }),
      ],
    });

    const cam = camera(
      [
        { content: far, depth: 0.4 },
        { content: focal, depth: 1 },
      ],
      { id: 'cam', centerOn: 'hero', clear: CLEAR },
    );

    // caption — a SIBLING of the camera (outside the rig) → pinned in the cleared band
    const caption = new Text({
      id: 'caption',
      text: 'FRAMED',
      position: [320, 330],
      fontSize: 22,
      fontFamily: 'DejaVu Sans',
      fill: '#ffffff',
      align: 'center',
    });

    return createScene({ size: SIZE, children: [cam, caption] });
  },
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      // the hero drifts across the world; centerOn tracks it, the pip rides along
      track('hero/position', 'vec2', [key(0, [180, 200]), key(3, [460, 200])]),
      track('hero-pip/position', 'vec2', [key(0, [180, 200]), key(3, [460, 200])]),
    ],
  }),
};

export default mod;
