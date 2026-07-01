/**
 * Golden corpus (0.26): orientation drivers. A rocket laps an elliptical track —
 * its POSITION is owned by followPath, its ROTATION by a separate orientToPath
 * (banking to the tangent), proving the two compose independently. A turret
 * pinned at center uses lookAt to pivot and always face the rocket as it orbits.
 * Pure data — arc-length tangent + a world-space aim angle, both functions of
 * one 'ride/progress' style track — byte-compared on Skia in CI.
 */

import { key, timeline, track, type PathValue } from '@glissade/core';
import { Circle, Path, Rect, createScene, type SceneModule } from '@glissade/scene';
import { followPath, orientToPath, lookAt } from '@glissade/scene/motion';

// a smooth ellipse racetrack: right → bottom → left → top (closed), kappa tangents
const K = 0.5523;
const RX = 220;
const RY = 110;
const loop: PathValue = [
  {
    closed: true,
    v: [
      [540, 180],
      [320, 290],
      [100, 180],
      [320, 70],
    ],
    in: [
      [0, -RY * K],
      [RX * K, 0],
      [0, RY * K],
      [-RX * K, 0],
    ],
    out: [
      [0, RY * K],
      [-RX * K, 0],
      [0, -RY * K],
      [RX * K, 0],
    ],
  },
];

// a small arrow/rocket pointing +x at rest, so orient aligns it to travel
const rocketShape: PathValue = [
  {
    closed: true,
    v: [
      [14, 0],
      [-8, -8],
      [-4, 0],
      [-8, 8],
    ],
    in: [[0, 0], [0, 0], [0, 0], [0, 0]],
    out: [[0, 0], [0, 0], [0, 0], [0, 0]],
  },
];

// a turret barrel pointing +x at rest, pivoting about the muzzle base at origin
const turretShape: PathValue = [
  {
    closed: true,
    v: [
      [46, -5],
      [46, 5],
      [0, 12],
      [0, -12],
    ],
    in: [[0, 0], [0, 0], [0, 0], [0, 0]],
    out: [[0, 0], [0, 0], [0, 0], [0, 0]],
  },
];

const mod: SceneModule = {
  createScene: () => {
    const rocket = new Path({ id: 'rocket', data: rocketShape, fill: '#ff5d73' });
    const turret = new Path({ id: 'turret', data: turretShape, fill: '#4ea1ff', position: [320, 180] });
    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Path({ id: 'track', data: loop, stroke: '#2a3550', strokeWidth: 3 }),
        // turret hub
        new Circle({ id: 'hub', radius: 9, position: [320, 180], fill: '#1b2740' }),
        turret,
        rocket,
        // position along the loop (no orient) …
        followPath(rocket, loop, { id: 'ride' }),
        // … rotation from a SEPARATE orientToPath sharing the same progress track
        orientToPath(rocket, loop, { id: 'bank' }),
        // the turret always faces the rocket as it orbits
        lookAt(turret, rocket),
      ],
    });
  },
  timeline: timeline({
    fps: 60,
    duration: 4,
    tracks: [
      track('ride/progress', 'number', [key(0, 0), key(4, 1)]),
      track('bank/progress', 'number', [key(0, 0), key(4, 1)]),
    ],
  }),
};

export default mod;
