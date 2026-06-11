/**
 * Showcase: "flexboard" — a settings-panel UI built entirely from nested
 * Layouts (DESIGN.md §3.2). The structure itself animates: the panel's
 * padding and gap breathe, rows restack as a sidebar grows, and wrapped
 * description text reflows inside the flex column — all pure tracks, so it
 * scrubs anywhere.
 */

import { timeline } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';
import { Layout } from '@glissade/scene/layout';

const FAMILY = 'DejaVu Sans';
const INK = '#cdd3de';
const MUTED = '#8b93a3';

const settingRow = (id: string, label: string, on: boolean) =>
  new Layout({
    id,
    width: 420,
    height: 44,
    direction: 'row',
    gap: 12,
    padding: 8,
    justify: 'space-between',
    align: 'center',
    children: [
      new Text({ id: `${id}-label`, text: label, fill: INK, fontFamily: FAMILY, fontSize: 15 }),
      new Layout({
        id: `${id}-toggle`,
        width: 44,
        height: 24,
        direction: 'row',
        justify: on ? 'end' : 'start',
        align: 'center',
        padding: 3,
        children: [
          // Group = non-flowable: emits absolutely at the toggle's center,
          // under the flow — the pill track behind the knob
          new Group({
            id: `${id}-pill`,
            children: [
              new Rect({
                id: `${id}-pill-rect`,
                width: 44,
                height: 24,
                cornerRadius: 12,
                fill: on ? '#2f6b4f' : '#2a2f3a',
              }),
            ],
          }),
          new Circle({ id: `${id}-knob`, radius: 9, fill: '#ffffff' }),
        ],
      }),
    ],
  });

const mod: SceneModule = {
  createScene: () => {
    const rows = [
      settingRow('row1', 'Deterministic rendering', true),
      settingRow('row2', 'Golden-frame CI', true),
      settingRow('row3', 'Generator functions', false),
    ];
    return createScene({
      size: { w: 800, h: 450 },
      children: [
        new Rect({ id: 'bg', width: 800, height: 450, position: [400, 225], fill: '#0f1014' }),
        new Rect({ id: 'panelBg', width: 480, height: 360, cornerRadius: 18, position: [330, 225], fill: '#181b22' }),
        new Layout({
          id: 'panel',
          width: 480,
          height: 360,
          direction: 'column',
          gap: 10,
          padding: 24,
          justify: 'start',
          align: 'center',
          position: [330, 225],
          children: [
            new Text({ id: 'title', text: 'Settings', fill: INK, fontFamily: FAMILY, fontSize: 22 }),
            new Text({
              id: 'blurb',
              text: 'Every box on this screen is a Yoga flex item; the gaps, paddings, and row heights below are ordinary animated tracks.',
              fill: MUTED,
              fontFamily: FAMILY,
              fontSize: 13,
              lineHeight: 1.45,
              width: 400,
            }),
            ...rows,
          ],
        }),
        new Layout({
          id: 'rail',
          width: 120,
          height: 360,
          direction: 'column',
          gap: 14,
          padding: 16,
          justify: 'start',
          align: 'center',
          position: [680, 225],
          children: [
            new Circle({ id: 'railDot1', radius: 16, fill: '#e6a700' }),
            new Circle({ id: 'railDot2', radius: 16, fill: '#4ea1ff' }),
            new Circle({ id: 'railDot3', radius: 16, fill: '#3ddc97' }),
            new Circle({ id: 'railDot4', radius: 16, fill: '#ff5d73' }),
          ],
        }),
        new Rect({ id: 'railBg', width: 120, height: 360, cornerRadius: 18, position: [680, 225], fill: '#181b22', zIndex: -1 }),
      ],
    });
  },
  timeline: timeline(
    (tl) => {
      // the panel grows to contain its busiest moment (content peaks ~420px:
      // grown row + reflowed blurb + widened gaps) and shrinks back to close
      // the loop — the background tracks the layout with identical keys
      tl.to('panel/height', 432, { duration: 1.0, ease: 'easeInOutSine', at: 0.5, from: 360 })
        .to('panel/height', 360, { duration: 0.9, ease: 'easeInOutSine', at: 3.5 })
        .to('panelBg/height', 432, { duration: 1.0, ease: 'easeInOutSine', at: 0.5, from: 360 })
        .to('panelBg/height', 360, { duration: 0.9, ease: 'easeInOutSine', at: 3.5 })
        // the panel breathes: padding and gap are layout inputs, so the whole
        // column restacks as they tween
        .to('panel/gap', 26, { duration: 1.6, ease: 'easeInOutSine', at: 0.4, from: 10 })
        .to('panel/gap', 10, { duration: 1.6, ease: 'easeInOutSine', at: '>' })
        // a row grows and pushes its siblings down
        .to('row2/height', 78, { duration: 1.2, ease: 'easeInOutCubic', at: 0.8, from: 44 })
        .to('row2/height', 44, { duration: 1.2, ease: 'easeInOutCubic', at: '+=0.4' })
        // the description reflows as its wrap width tweens
        .to('blurb/width', 240, { duration: 1.5, ease: 'easeInOutCubic', at: 1.0, from: 400 })
        .to('blurb/width', 400, { duration: 1.5, ease: 'easeInOutCubic', at: '>' })
        // the rail's gap pulses, sliding the dots apart
        .to('rail/gap', 44, { duration: 1.8, ease: 'easeInOutSine', at: 0.2, from: 14 })
        .to('rail/gap', 14, { duration: 1.8, ease: 'easeInOutSine', at: '>' });
    },
    {
      fps: 60,
      duration: 4.4,
      assets: { 'DejaVu Sans': { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
    },
  ),
};

export default mod;
