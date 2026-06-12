/**
 * Golden scene: the 'path' value type + Path node (Lottie S0). A star↔blob
 * morph driven by an ordinary track (matched vertex counts — pairwise lerp,
 * the lottie-web-faithful §2.2 path), a two-contour ring whose reversed inner
 * contour cuts a nonzero-winding hole, and a stroked open path.
 */

import { key, timeline, track, type PathContour, type PathValue } from '@glissade/core';
import { createScene, Path, Rect, type SceneModule } from '@glissade/scene';

/** n-armed star / rounded blob with the SAME vertex count, so the morph is a pure lerp. */
function radial(points: number, radii: (i: number) => number, tangent: number): PathContour {
  const v: [number, number][] = [];
  const tin: [number, number][] = [];
  const tout: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2;
    const r = radii(i);
    v.push([Math.cos(a) * r, Math.sin(a) * r]);
    // tangents perpendicular to the radius, scaled — 0 for a spiky star
    const tx = -Math.sin(a) * tangent;
    const ty = Math.cos(a) * tangent;
    tin.push([-tx, -ty]);
    tout.push([tx, ty]);
  }
  return { closed: true, v, in: tin, out: tout };
}

const star: PathValue = [radial(10, (i) => (i % 2 === 0 ? 80 : 34), 0)];
const blob: PathValue = [radial(10, (i) => 64 + (i % 3) * 8, 16)];

const ring: PathValue = [
  // outer contour, then the inner one REVERSED — nonzero winding cuts the hole
  radial(10, () => 70, 24),
  (() => {
    const inner = radial(10, () => 38, -13);
    inner.v.reverse();
    inner.in.reverse();
    inner.out.reverse();
    const swap = inner.in;
    inner.in = inner.out;
    inner.out = swap;
    return inner;
  })(),
];

const wave: PathValue = [
  {
    closed: false,
    v: [
      [-90, 0],
      [-30, -40],
      [30, 40],
      [90, 0],
    ],
    in: [
      [0, 0],
      [-25, 0],
      [-25, 0],
      [-25, -25],
    ],
    out: [
      [25, -25],
      [25, 0],
      [25, 0],
      [0, 0],
    ],
  },
];

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Path({ id: 'morph', data: star, fill: '#e6a700', position: [140, 180] }),
        new Path({ id: 'ring', data: ring, fill: '#4ea1ff', position: [330, 180] }),
        new Path({ id: 'wave', data: wave, stroke: '#3ddc97', strokeWidth: 6, position: [520, 180] }),
      ],
    }),
  timeline: timeline({
    duration: 3,
    fps: 60,
    tracks: [
      track<PathValue>('morph/d', 'path', [
        key(0, star),
        key(1.5, blob, 'easeInOutSine'),
        key(3, star, 'easeInOutSine'),
      ]),
      track('ring/rotation', 'number', [key(0, 0), key(3, 72, 'easeInOutSine')]),
      track('wave/strokeWidth', 'number', [key(0, 3), key(1.5, 10, 'easeInOutSine'), key(3, 3, 'easeInOutSine')]),
    ],
  }),
};

export default mod;
