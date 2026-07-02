/**
 * Golden corpus (0.35): Text box-valign — optical-center-in-a-box without the
 * `fontSize * 0.35` fudge. Four pill cards each hold a label: the TOP row is
 * baseline-anchored (labels ride high/low — the bug), the BOTTOM row uses
 * `box: { valign: 'center' }` so each label's real ink centers in its pill,
 * including the multi-line card and the one with descenders ('jpqy'). A fitText
 * label (shrunk to fit its pill) rides along. Byte-compared on Skia in CI.
 */

import { timeline } from '@glissade/core';
import { Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const PILL_W = 130;
const PILL_H = 56;
const FAMILY = 'DejaVu Sans';

function pill(id: string, cx: number, cy: number, label: Text): Group {
  return new Group({
    id,
    children: [
      new Rect({ id: `${id}-bg`, width: PILL_W, height: PILL_H, cornerRadius: PILL_H / 2, position: [cx, cy], fill: '#1b2333' }),
      label,
    ],
  });
}

const mod: SceneModule = {
  createScene: () => {
    const labels = ['Save', 'jpqy', 'Two\nlines', 'OK'];
    const cols = [110, 270, 430, 560];

    const top = labels.map(
      (txt, i) =>
        // baseline-anchored (the ride-high/low bug), centered horizontally
        pill(`top${i}`, cols[i]!, 90, new Text({ id: `topL${i}`, text: txt, fontFamily: FAMILY, fontSize: 22, align: 'center', fill: '#8fa3c4', position: [cols[i]!, 90] })),
    );
    const bottom = labels.map(
      (txt, i) =>
        // box-valign: real ink centered in the pill
        pill(`bot${i}`, cols[i]!, 250, new Text({ id: `botL${i}`, text: txt, fontFamily: FAMILY, fontSize: 22, align: 'center', fill: '#eaf1ff', box: { valign: 'center' }, position: [cols[i]!, 250] })),
    );

    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0c1018' }),
        new Text({ id: 'h1', text: 'baseline-anchored', fontFamily: FAMILY, fontSize: 13, align: 'center', fill: '#5a6b86', position: [320, 40] }),
        new Text({ id: 'h2', text: "box: { valign: 'center' }", fontFamily: FAMILY, fontSize: 13, align: 'center', fill: '#5a6b86', position: [320, 200] }),
        ...top,
        ...bottom,
      ],
    });
  },
  // static composition — box-valign is a layout property, shown at rest
  timeline: timeline({
    fps: 60,
    duration: 1,
    tracks: [],
    assets: { 'DejaVu Sans': { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
  }),
};

export default mod;
