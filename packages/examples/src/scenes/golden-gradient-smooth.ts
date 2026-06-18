/**
 * Golden corpus scene (DESIGN.md §7.3 tier 2): gradient stop interpolation modes
 * (0.10.1). Three identical 2-stop radial soft-light discs, side by side, with
 * `interpolation` = linear | smooth | gaussian — the smooth/gaussian ramps melt
 * like a wide blur (oklab-eased, densified at raster) with no Mach-banding, no
 * filter. Static; the bytes pin the densified ramp on Skia.
 */

import { timeline } from '@glissade/core';
import { Circle, createScene, type SceneModule } from '@glissade/scene';

const stops = [{ offset: 0, color: '#ffd86b' }, { offset: 1, color: '#0a0a12' }];

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Circle({ id: 'bg', radius: 800, position: [320, 180], fill: '#0a0a12' }),
        new Circle({ id: 'linear', radius: 95, position: [120, 180], fill: { kind: 'radial', stops, radius: 95, interpolation: 'linear' } }),
        new Circle({ id: 'smooth', radius: 95, position: [320, 180], fill: { kind: 'radial', stops, radius: 95, interpolation: 'smooth' } }),
        new Circle({ id: 'gaussian', radius: 95, position: [520, 180], fill: { kind: 'radial', stops, radius: 95, interpolation: 'gaussian' } }),
      ],
    }),
  timeline: timeline({ duration: 1, fps: 60 }),
};

export default mod;
