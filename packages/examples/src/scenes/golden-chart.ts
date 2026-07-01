/**
 * Golden corpus (0.32): the data-motion stack. A table is bound to a bar chart
 * via `Chart()` (a pure build-time fan-out, like Grid) — each bar is a Rect
 * pinned to the axis and grown from its base. The timeline drives two beats from
 * ordinary per-bar `height` tracks: a staggered RISE-IN (0→value), then a
 * bar-chart RACE to a second dataset. Colours come from a `colorRamp` over the
 * value domain. Nothing runs at play time — byte-compared on Skia in CI.
 */

import { key, timeline, track } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';
import { Chart, colorRamp, linearScale } from '@glissade/scene/chart';

const CHART_ID = 'chart';
const CHART_W = 560;
const CHART_H = 240;

const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
const valsA = [80, 150, 60, 200, 110, 175];
const valsB = [150, 95, 195, 70, 205, 120]; // the race target dataset

// One shared scale so both datasets fit the same axis; a ramp over the domain.
const yMax = Math.max(...valsA, ...valsB);
const yScale = linearScale([0, yMax], [0, CHART_H]);
const fill = colorRamp(['#39e0ff', '#7c5cff', '#ff5ca8'], [0, yMax]);

const dataA = labels.map((m, i) => ({ m, v: valsA[i]! }));
const hA = valsA.map((v) => yScale.map(v));
const hB = valsB.map((v) => yScale.map(v));

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#0a0e17' }),
        // center the chart so its baseline (center + H/2) sits at y=300, tallest
        // bar tops out at y=60 — comfortably inside the 360-tall frame.
        Chart({
          id: CHART_ID,
          data: dataA,
          xKey: 'm',
          yKey: 'v',
          width: CHART_W,
          height: CHART_H,
          yScale,
          fill,
          position: [320, 180],
        }).node,
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: labels.map((_, i) =>
      // rise in (staggered) → hold → race to dataset B
      track(`${CHART_ID}/bars/${i}/height`, 'number', [
        key(0.08 * i, 0),
        key(0.08 * i + 0.7, hA[i]!, 'easeOutCubic'),
        key(1.8, hA[i]!),
        key(3, hB[i]!, 'easeInOutCubic'),
      ]),
    ),
  }),
};

export default mod;
