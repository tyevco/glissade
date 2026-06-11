/**
 * Showcase: loaders. Top — a determinate progress bar (fill grows via scale.x
 * with position.x co-animated to keep the left edge anchored) plus a stepped
 * percentage readout on hold keys. Bottom — a skeleton screen with a shimmer
 * sweep (blend 'screen') that crossfades to revealed mock content when the
 * bar hits 100%, then drains back so the loop is seamless.
 */

import { key, timeline, track, type Vec2 } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const BAR_W = 440;
const BAR_LEFT = 180; // left edge of the progress track
const px = (p: number) => BAR_LEFT + (BAR_W / 2) * p; // center x for fill at progress p

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 800, h: 450 },
      children: [
        new Rect({ id: 'bg', width: 800, height: 450, position: [400, 225], fill: '#15161a' }),

        // ---- TOP: determinate progress bar ----
        new Text({
          id: 'caption',
          text: 'Loading assets…',
          fill: '#9aa0ab',
          fontSize: 20,
          position: [180, 108],
        }),
        new Rect({
          id: 'barTrack',
          width: BAR_W,
          height: 16,
          position: [400, 140],
          fill: '#272a33',
        }),
        new Rect({
          id: 'barFill',
          width: BAR_W,
          height: 16,
          position: [px(0.002), 140],
          scale: [0.002, 1],
          fill: '#4ea1ff',
        }),
        new Text({
          id: 'pct',
          text: '0%',
          fill: '#e8e8ea',
          fontSize: 18,
          position: [636, 147],
        }),

        // ---- BOTTOM: skeleton screen + revealed content ----
        new Rect({ id: 'card', width: 520, height: 170, position: [400, 315], fill: '#1d2026' }),
        new Group({
          id: 'skeleton',
          position: [0, 0],
          children: [
            new Circle({ id: 'avatarSkel', radius: 30, position: [205, 282], fill: '#2c2f38' }),
            new Rect({ id: 'skel1', width: 190, height: 14, position: [350, 272], fill: '#2c2f38' }),
            new Rect({ id: 'skel2', width: 120, height: 10, position: [315, 298], fill: '#2c2f38' }),
            new Rect({ id: 'skel3', width: 460, height: 12, position: [400, 345], fill: '#2c2f38' }),
            new Rect({ id: 'skel4', width: 360, height: 12, position: [350, 372], fill: '#2c2f38' }),
            new Rect({
              id: 'shimmer',
              width: 56,
              height: 168,
              position: [190, 315],
              rotation: 10,
              fill: '#ffffff',
              blend: 'screen',
              opacity: 0,
            }),
          ],
        }),
        new Group({
          id: 'content',
          position: [0, 0],
          opacity: 0,
          children: [
            new Circle({ id: 'avatarReal', radius: 30, position: [205, 282], fill: '#7c4dff' }),
            new Text({
              id: 'nameText',
              text: 'Otter Coders',
              fill: '#e8e8ea',
              fontSize: 18,
              position: [255, 278],
            }),
            new Text({
              id: 'subText',
              text: '@ottercoders · just now',
              fill: '#8a8f9a',
              fontSize: 12,
              position: [255, 302],
            }),
            new Rect({ id: 'real1', width: 460, height: 12, position: [400, 345], fill: '#e6a700' }),
            new Rect({ id: 'real2', width: 300, height: 12, position: [320, 372], fill: '#ff5d73' }),
          ],
        }),
      ],
    }),

  timeline: timeline({
    duration: 5,
    fps: 60,
    tracks: [
      // Progress fill: scale.x and position.x share key times + eases, so the
      // left edge stays pinned at BAR_LEFT throughout (x = left + halfW * p).
      track('barFill/scale.x', 'number', [
        key(0, 0.002),
        key(0.8, 0.27, 'easeOutQuad'),
        key(1.6, 0.53, 'easeInOutQuad'),
        key(2.4, 0.81, 'easeInOutQuad'),
        key(3.2, 1, 'easeOutQuad'),
        key(4.4, 1, { interp: 'hold' }),
        key(4.95, 0.002, 'easeInOutCubic'), // drain back for the loop
      ]),
      track('barFill/position.x', 'number', [
        key(0, px(0.002)),
        key(0.8, px(0.27), 'easeOutQuad'),
        key(1.6, px(0.53), 'easeInOutQuad'),
        key(2.4, px(0.81), 'easeInOutQuad'),
        key(3.2, px(1), 'easeOutQuad'),
        key(4.4, px(1), { interp: 'hold' }),
        key(4.95, px(0.002), 'easeInOutCubic'),
      ]),
      track('barFill/fill', 'color', [
        key(2.9, '#4ea1ff'),
        key(3.2, '#39d98a', 'easeOutQuad'),
        key(4.4, '#39d98a', { interp: 'hold' }),
        key(4.9, '#4ea1ff', 'easeInOutSine'),
      ]),

      // Stepped percentage readout (string tracks are hold-only).
      track('pct/text', 'string', [
        key(0, '0%'),
        key(0.8, '27%'),
        key(1.6, '53%'),
        key(2.4, '81%'),
        key(3.2, '100%'),
        key(4.5, '81%'),
        key(4.62, '53%'),
        key(4.75, '27%'),
        key(4.9, '0%'),
      ]),
      track('caption/text', 'string', [
        key(0, 'Loading assets…'),
        key(3.25, 'Ready'),
        key(4.4, 'Loading assets…'),
      ]),

      // Shimmer sweeps the card twice, then a third pass that ends as the
      // reveal begins; snaps home while the skeleton group is invisible.
      track('shimmer/position.x', 'number', [
        key(0, 190),
        key(1.05, 610, 'linear'),
        key(1.051, 190, { interp: 'hold' }),
        key(2.1, 610, 'linear'),
        key(2.101, 190, { interp: 'hold' }),
        key(3.1, 610, 'linear'),
        key(4.0, 190, { interp: 'hold' }),
      ]),
      // Shimmer fades in at the start of each pass window and is fully out
      // before the content reveal; back to 0 at t=duration to match t=0.
      track('shimmer/opacity', 'number', [
        key(0, 0),
        key(0.15, 0.09, 'easeOutQuad'),
        key(2.95, 0.09, { interp: 'hold' }),
        key(3.15, 0, 'easeOutQuad'),
      ]),

      // Crossfade skeleton -> revealed content at 100%, then back for the loop.
      track('skeleton/opacity', 'number', [
        key(3.2, 1),
        key(3.6, 0, 'easeInOutQuad'),
        key(4.4, 0, { interp: 'hold' }),
        key(4.8, 1, 'easeInOutQuad'),
      ]),
      track('content/opacity', 'number', [
        key(3.2, 0),
        key(3.6, 1, 'easeInOutQuad'),
        key(4.4, 1, { interp: 'hold' }),
        key(4.8, 0, 'easeInOutQuad'),
      ]),
    ],
  }),
};

export default mod;
