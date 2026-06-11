/**
 * Showcase: "spinner zoo" — a 3x2 grid of six distinct loading spinners,
 * each labeled with a caption. Everything is built from Rect/Circle/Text:
 * orbits are parent-group rotations with children offset at a radius, and
 * wavy staggers are dense sine-sampled keyframes whose period divides the
 * scene duration, so the whole thing loops seamlessly.
 */

import { key, timeline, track, type Key, type Vec2 } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const W = 800;
const H = 450;
const DUR = 4;

// Grid: 3 columns x 2 rows.
const COLS = [133, 400, 667] as const;
const ROW_SPINNER = [112, 318] as const;
const ROW_CAPTION = [188, 394] as const;

const CAPTION_COLOR = '#8b93a3';
const FONT_SIZE = 15;

/** Text is left-aligned at its position; nudge x to roughly center it. */
function caption(id: string, label: string, col: number, row: number): Text {
  const approxWidth = label.length * FONT_SIZE * 0.52;
  return new Text({
    id,
    text: label,
    fill: CAPTION_COLOR,
    fontSize: FONT_SIZE,
    position: [COLS[col]! - approxWidth / 2, ROW_CAPTION[row]!],
  });
}

/** Dense linear keys sampling mid + amp * sin(2π (t - phase) / period). */
function sineKeys(
  mid: number,
  amp: number,
  period: number,
  phase: number,
  map: (v: number) => number | Vec2,
): Key[] {
  const keys: Key[] = [];
  const step = 1 / 12;
  for (let t = 0; t <= DUR + 1e-9; t += step) {
    const v = mid + amp * Math.sin((2 * Math.PI * (t - phase)) / period);
    keys.push(key(Math.min(t, DUR), map(v)));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// (1) orbit — 8 dots orbiting a center; static opacity gradient on the
// children makes a trail as the parent group spins.
const orbitDots = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return new Circle({
    id: `orbit-dot-${i}`,
    radius: 6,
    fill: '#4ea1ff',
    position: [Math.cos(a) * 34, Math.sin(a) * 34],
    opacity: 1 - i * 0.105,
  });
});

// (2) pulse — 3 dots scaling up/down in a stagger.
const pulseDots = Array.from({ length: 3 }, (_, i) =>
  new Circle({
    id: `pulse-dot-${i}`,
    radius: 9,
    fill: '#e6a700',
    position: [(i - 1) * 30, 0],
  }),
);

// (4) dual orbit — two dots, opposite directions, different radii.
const dualOuter = new Group({
  id: 'dual-outer',
  position: [COLS[0], ROW_SPINNER[1]],
  children: [new Circle({ id: 'dual-dot-a', radius: 7, fill: '#ff5d73', position: [38, 0] })],
});
const dualInner = new Group({
  id: 'dual-inner',
  position: [COLS[0], ROW_SPINNER[1]],
  children: [new Circle({ id: 'dual-dot-b', radius: 5, fill: '#4ade80', position: [20, 0] })],
});

// (5) bars — 5 thin bars bouncing height in a wave stagger.
const bars = Array.from({ length: 5 }, (_, i) =>
  new Rect({
    id: `bar-${i}`,
    width: 8,
    height: 44,
    fill: '#34d2c8',
    position: [(i - 2) * 16, 0],
  }),
);

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: W, h: H },
      children: [
        new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: '#15161a' }),

        // (1) orbit
        new Group({ id: 'orbit', position: [COLS[0], ROW_SPINNER[0]], children: orbitDots }),
        caption('cap-orbit', 'orbit', 0, 0),

        // (2) pulse
        new Group({ id: 'pulse', position: [COLS[1], ROW_SPINNER[0]], children: pulseDots }),
        caption('cap-pulse', 'pulse', 1, 0),

        // (3) flip square
        new Rect({
          id: 'flip',
          width: 46,
          height: 46,
          fill: '#7c4dff',
          position: [COLS[2], ROW_SPINNER[0]],
        }),
        caption('cap-flip', 'flip square', 2, 0),

        // (4) dual orbit
        dualOuter,
        dualInner,
        caption('cap-dual', 'dual orbit', 0, 1),

        // (5) bars
        new Group({ id: 'bars', position: [COLS[1], ROW_SPINNER[1]], children: bars }),
        caption('cap-bars', 'bars', 1, 1),

        // (6) breathe
        new Circle({
          id: 'breathe',
          radius: 26,
          fill: '#f472b6',
          position: [COLS[2], ROW_SPINNER[1]],
        }),
        caption('cap-breathe', 'breathe', 2, 1),
      ],
    }),

  timeline: timeline({
    duration: DUR,
    fps: 60,
    tracks: [
      // (1) orbit: two full revolutions, linear, loops seamlessly.
      track('orbit/rotation', 'number', [key(0, 0), key(DUR, 720, 'linear')]),

      // (2) pulse: sine-staggered scale, period 1s (divides DUR → clean loop).
      ...pulseDots.map((d, i) =>
        track(
          `${d.id}/scale`,
          'vec2',
          sineKeys(1.25, 0.55, 1, i / 3, (v) => [v, v] as Vec2),
        ),
      ),

      // (3) flip square: ease into each quarter turn, hold, repeat.
      track('flip/rotation', 'number', [
        key(0, 0),
        key(0.6, 90, 'easeInOutCubic'),
        key(1, 90, { interp: 'hold' }),
        key(1.6, 180, 'easeInOutCubic'),
        key(2, 180, { interp: 'hold' }),
        key(2.6, 270, 'easeInOutCubic'),
        key(3, 270, { interp: 'hold' }),
        key(3.6, 360, 'easeInOutCubic'),
        key(DUR, 360, { interp: 'hold' }),
      ]),

      // (4) dual orbit: opposite directions, different speeds, both whole turns.
      track('dual-outer/rotation', 'number', [key(0, 0), key(DUR, 720, 'linear')]),
      track('dual-inner/rotation', 'number', [key(0, 0), key(DUR, -1080, 'linear')]),

      // (5) bars: wave stagger on scale.y, period 1s, phase step = period / 5.
      ...bars.map((b, i) =>
        track(
          `${b.id}/scale`,
          'vec2',
          sineKeys(0.7, 0.45, 1, i / 5, (v) => [1, v] as Vec2),
        ),
      ),

      // (6) breathe: one slow scale+fade cycle across the whole duration.
      track('breathe/scale', 'vec2', [
        key<Vec2>(0, [1, 1]),
        key<Vec2>(DUR / 2, [1.55, 1.55], 'easeInOutSine'),
        key<Vec2>(DUR, [1, 1], 'easeInOutSine'),
      ]),
      track('breathe/opacity', 'number', [
        key(0, 1),
        key(DUR / 2, 0.45, 'easeInOutSine'),
        key(DUR, 1, 'easeInOutSine'),
      ]),
    ],
  }),
};

export default mod;
