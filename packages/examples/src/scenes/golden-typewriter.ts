/**
 * Golden corpus: the typewriter reveal primitive. A centered title and a
 * wrapped body both type in via plain per-node reveal tracks (graphemes
 * shown, left-to-right), each trailed by a TextCursor that rides the head —
 * solid while typing, then blinking once fully shown. Exercises partial-line
 * masking under center align, reveal across a wrap boundary, and the caret's
 * per-frame head tracking. Pure data, byte-compared on Skia in CI.
 */

import { key, timeline, track } from '@glissade/core';
import { Rect, Text, textCursor, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'DejaVu Sans';

const mod: SceneModule = {
  createScene: () => {
    const title = new Text({
      id: 'title',
      text: 'glissade',
      fill: '#9ef0c0',
      fontFamily: FAMILY,
      fontSize: 36,
      align: 'center',
      position: [320, 80],
    });
    const body = new Text({
      id: 'body',
      text: 'A pure function of time: every keystroke is data, replayable to the frame.',
      fill: '#e8edf2',
      fontFamily: FAMILY,
      fontSize: 19,
      lineHeight: 1.5,
      width: 420,
      position: [112, 150],
    });
    return createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        title,
        textCursor(title, { id: 'tcur', width: 3, blinkPeriod: 0.8 }),
        body,
        textCursor(body, { id: 'bcur', width: 2, blinkPeriod: 0.8 }),
      ],
    });
  },
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      // 'glissade' is 8 graphemes — typed over the first ~0.9s
      track('title/reveal', 'number', [key(0, 0), key(0.9, 8, 'linear')]),
      // the body keeps typing past its grapheme count, so it finishes and the
      // caret switches from solid to blinking before the scene ends
      track('body/reveal', 'number', [key(0.6, 0), key(2.6, 90, 'linear')]),
    ],
  }),
};

export default mod;
