/**
 * Golden corpus scene (DESIGN.md §7.3 tier 2): mesh-gradient Paint (§3 Paint,
 * 0.12). Exercises a static `smooth` (Shepard IDW) mesh fill, a static
 * `gaussian` (pinned-sigma melt) mesh fill, and a keyframe-ANIMATED mesh whose
 * point positions + colors drift over the timeline — aurora drift driven by the
 * `paint` value type lerping matched-count mesh points (§2.2). ONE shared CPU
 * kernel rasters the mesh on both backends (no SkSL), so the Skia golden is
 * byte-exact and browser↔Skia stays SSIM-parity. No blur filter — the mesh IS
 * the soft-light look (the native replacement for "N blurred blobs").
 */

import { key, timeline, track, type Paint } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';

// keyframe endpoints: a 3-point aurora that drifts its points + recolors.
const auroraA: Paint = {
  kind: 'mesh',
  points: [
    { pos: [0.2, 0.25], color: '#7c3aed' },
    { pos: [0.75, 0.2], color: '#2dd4bf' },
    { pos: [0.5, 0.85], color: '#f472b6' },
  ],
  interpolation: 'smooth',
  bg: '#0a0a18',
};
const auroraB: Paint = {
  kind: 'mesh',
  points: [
    { pos: [0.35, 0.5], color: '#22d3ee' },
    { pos: [0.6, 0.35], color: '#a78bfa' },
    { pos: [0.45, 0.7], color: '#fb7185' },
  ],
  interpolation: 'smooth',
  bg: '#0a0a18',
};

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#05050c' }),
        // static smooth (Shepard IDW) mesh — 3 points + bg floor
        new Rect({
          id: 'sm',
          width: 150,
          height: 150,
          position: [110, 105],
          fill: {
            kind: 'mesh',
            points: [
              { pos: [0.2, 0.2], color: '#ff5d73' },
              { pos: [0.8, 0.3], color: '#6bd0ff' },
              { pos: [0.5, 0.85], color: '#ffd86b' },
            ],
            interpolation: 'smooth',
            bg: '#120308',
          },
        }),
        // static gaussian (pinned-sigma melt) mesh — same points, softer blend
        new Rect({
          id: 'gs',
          width: 150,
          height: 150,
          position: [110, 270],
          fill: {
            kind: 'mesh',
            points: [
              { pos: [0.2, 0.2], color: '#4ea1ff' },
              { pos: [0.8, 0.3], color: '#e6a700' },
              { pos: [0.5, 0.85], color: '#34d399' },
            ],
            interpolation: 'gaussian',
            bg: '#02060c',
          },
        }),
        // keyframe-animated aurora: base = auroraA; the track drifts it to auroraB
        new Rect({ id: 'anim', width: 380, height: 320, position: [430, 180], fill: auroraA }),
      ],
    }),
  timeline: timeline({
    duration: 3,
    fps: 60,
    tracks: [track('anim/fill', 'paint', [key(0, auroraA), key(3, auroraB, 'easeInOutCubic')])],
  }),
};

export default mod;
