/**
 * Golden scene: group filters (§3.4). One swatch per filter kind, each
 * animated through a track-driven param via a computed filters binding —
 * filters are signals, so a blur radius tweens like any other property.
 * Byte-compared on Skia in CI; SSIM-compared across the backend seam.
 */

import { key, timeline, track } from '@glissade/core';
import { Circle, createScene, Group, Rect, type SceneModule } from '@glissade/scene';

const swatch = (id: string, x: number, color: string) =>
  new Group({
    id,
    position: [x, 0],
    children: [
      new Rect({ id: `${id}-card`, width: 84, height: 84, cornerRadius: 14, fill: color }),
      new Circle({ id: `${id}-dot`, radius: 18, position: [22, -22], fill: '#ffffff' }),
    ],
  });

const mod: SceneModule = {
  createScene: () => {
    // invisible param nodes (height 0 → nothing draws): their width signals
    // are ordinary track targets, and the filters derive from them
    const blurR = new Rect({ id: 'p-blur', width: 8, height: 0 });
    const shadowY = new Rect({ id: 'p-shadow', width: 6, height: 0 });
    const bright = new Rect({ id: 'p-bright', width: 1, height: 0 });
    const contrast = new Rect({ id: 'p-contrast', width: 1, height: 0 });
    const sat = new Rect({ id: 'p-sat', width: 1, height: 0 });

    const blurSwatch = swatch('fBlur', 80, '#e6a700');
    blurSwatch.filters.bindSource(() => [{ kind: 'blur', radius: blurR.width() }]);
    const shadowSwatch = swatch('fShadow', 200, '#4ea1ff');
    shadowSwatch.filters.bindSource(() => [
      { kind: 'drop-shadow', dx: 6, dy: shadowY.width(), blur: 10, color: '#000000' },
    ]);
    const brightSwatch = swatch('fBright', 320, '#3ddc97');
    brightSwatch.filters.bindSource(() => [{ kind: 'brightness', amount: bright.width() }]);
    const contrastSwatch = swatch('fContrast', 440, '#ff5d73');
    contrastSwatch.filters.bindSource(() => [{ kind: 'contrast', amount: contrast.width() }]);
    const satSwatch = swatch('fSat', 560, '#b07cff');
    satSwatch.filters.bindSource(() => [{ kind: 'saturate', amount: sat.width() }]);

    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        new Group({
          id: 'rowTop',
          position: [0, 130],
          children: [blurSwatch, shadowSwatch, brightSwatch, contrastSwatch, satSwatch],
        }),
        // an unfiltered control row: any filter leak would show here
        new Group({
          id: 'rowRef',
          position: [0, 260],
          children: [
            swatch('rBlur', 80, '#e6a700'),
            swatch('rShadow', 200, '#4ea1ff'),
            swatch('rBright', 320, '#3ddc97'),
            swatch('rContrast', 440, '#ff5d73'),
            swatch('rSat', 560, '#b07cff'),
          ],
        }),
        blurR,
        shadowY,
        bright,
        contrast,
        sat,
      ],
    });
  },
  timeline: timeline({
    duration: 3,
    fps: 60,
    tracks: [
      track('p-blur/width', 'number', [key(0, 0), key(1.5, 12, 'easeInOutSine'), key(3, 0, 'easeInOutSine')]),
      track('p-shadow/width', 'number', [key(0, 2), key(1.5, 14, 'easeInOutSine'), key(3, 2, 'easeInOutSine')]),
      track('p-bright/width', 'number', [key(0, 0.6), key(1.5, 1.6, 'easeInOutSine'), key(3, 0.6, 'easeInOutSine')]),
      track('p-contrast/width', 'number', [key(0, 0.5), key(1.5, 2, 'easeInOutSine'), key(3, 0.5, 'easeInOutSine')]),
      track('p-sat/width', 'number', [key(0, 0), key(1.5, 2.5, 'easeInOutSine'), key(3, 0, 'easeInOutSine')]),
    ],
  }),
};

export default mod;
