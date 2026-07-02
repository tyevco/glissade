/**
 * Golden corpus (0.36): defineComponent — a reusable, typed subscene. A single
 * `LowerThird` component (accent bar wipes in, name + title slide up behind a
 * clip) is INSTANCED THREE TIMES with different props; each instance namespaces
 * its children under its own id, so the three stagger in independently from ONE
 * definition. Pure build-time fan-out — byte-compared on Skia in CI.
 */

import { key, timeline, track } from '@glissade/core';
import { Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';
import { defineComponent } from '@glissade/scene/component';

const FAMILY = 'DejaVu Sans';

const LowerThird = defineComponent<{ name: string; title: string; accent: string }>({
  name: 'LowerThird',
  props: {
    name: { type: 'string', required: true },
    title: { type: 'string', required: true },
    accent: { type: 'color' },
  },
  build: ({ name, title, accent }, cid) =>
    new Group({
      id: cid(),
      // clip the sliding text to the plate (0.34 clip — components compose it)
      children: [
        new Rect({ id: cid('plate'), width: 320, height: 64, cornerRadius: 10, position: [160, 32], fill: '#141b28' }),
        new Rect({ id: cid('bar'), anchor: 'left', position: [16, 32], width: 6, height: 40, cornerRadius: 3, fill: accent }),
        new Group({
          id: cid('textclip'),
          clip: { w: 300, h: 60, x: 168, y: 32 },
          children: [
            new Text({ id: cid('name'), text: name, fontFamily: FAMILY, fontSize: 22, fill: '#eaf1ff', box: { valign: 'center' }, position: [36, 22] }),
            new Text({ id: cid('title'), text: title, fontFamily: FAMILY, fontSize: 13, fill: accent, box: { valign: 'center' }, position: [36, 46] }),
          ],
        }),
      ],
    }),
});

const rows = [
  { id: 'a', name: 'Ada Lovelace', title: 'Analytical Engine', accent: '#4ea1ff', y: 70 },
  { id: 'b', name: 'Grace Hopper', title: 'Compiler pioneer', accent: '#3ddc97', y: 170 },
  { id: 'c', name: 'Katherine Johnson', title: 'Orbital mechanics', accent: '#ffcf3f', y: 270 },
];

const mod: SceneModule = {
  // instantiate INSIDE createScene so each scene gets fresh nodes (purity §2.5);
  // the component is defined once at module scope. Child target ids are
  // deterministic (`<id>/<sub>`), so the timeline names them directly.
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0b0f17' }),
        ...rows.map((r) =>
          new Group({
            id: `${r.id}-row`,
            position: [140, r.y],
            children: [LowerThird({ id: r.id, name: r.name, title: r.title, accent: r.accent }).node],
          }),
        ),
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: 3,
    // ONE definition, three instances — each bar grows + each name rises,
    // staggered by row, addressed through the per-instance child namespaces
    tracks: rows.flatMap((r, i) => [
      track(`${r.id}/bar/height`, 'number', [key(0.1 + i * 0.25, 0), key(0.8 + i * 0.25, 40, 'easeOutCubic')]),
      track(`${r.id}/name/position`, 'vec2', [key(0.2 + i * 0.25, [36, 46]), key(1.0 + i * 0.25, [36, 22], 'easeOutCubic')]),
    ]),
    assets: { 'DejaVu Sans': { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
  }),
};

export default mod;
