/**
 * Golden corpus (0.57): the Particles/Emitters stack — a seeded, BAKED emitter
 * composing each() (fixed slot nodes) + bake() (seeded physics → ordinary tracks).
 *
 * Side by side:
 *  - RIGHT: a `sparks` radial impact burst fired at t=0 from a point — short-life
 *    amber dots thrown outward, shrinking + fading under a touch of gravity.
 *  - LEFT: an ambient `drift` field — low-opacity blue motes floating gently up,
 *    continuously emitted into a small ring-buffer slot pool (count = max-concurrent,
 *    NOT total emitted), so the exported layer count stays proportional.
 *
 * Both presets compile to ordinary position/opacity/scale tracks on stable slot
 * ids (there is NO render-only / custom-draw path), so the frames are a pure
 * function of time and byte-stable on Skia by construction. The seed is fixed
 * (hashStr(id)) — byte-identical run-to-run. Byte-compared on Skia in CI.
 */

import { timeline } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';
import { sparks, drift } from '@glissade/scene/motion';

const W = 640;
const H = 360;
const FPS = 60;
const DURATION = 3;

// Build each preset fresh — once for createScene() (the nodes), once for the
// timeline (the tracks). Both reconstruct the identical stable slot-id set + tracks
// (particles() is deterministic: bake reseeds from the fixed seed each call), so the
// timeline binds against the same ids the scene draws. Same idiom as golden-kinetic.
const buildBurst = (): ReturnType<typeof sparks> =>
  sparks([0.72, 0.5], {
    box: { w: W, h: H },
    duration: DURATION,
    fps: FPS,
    count: 28,
    color: '#ffcf7a',
    radius: 3,
    seed: 41,
  });

const buildDrift = (): ReturnType<typeof drift> =>
  drift({
    box: { w: W, h: H },
    duration: DURATION,
    fps: FPS,
    id: 'motes',
    origin: [0.28, 0.72],
    area: { kind: 'box', w: 180, h: 120 },
    count: 20,
    rate: 7,
    color: '#9ec4ff',
    radius: 2.6,
    seed: 17,
  });

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: W, h: H },
      children: [
        new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: '#0b0e16' }),
        buildDrift().node,
        buildBurst().node,
      ],
    }),
  timeline: timeline({
    fps: FPS,
    duration: DURATION,
    tracks: [...buildDrift().tracks, ...buildBurst().tracks],
  }),
};

export default mod;
