// Fixture scene module for the gs mcp session tests — a single id'd Rect with one
// code track, so tests can enumerate targets, patch, undo, and render.
import { key, timeline, track } from '@glissade/core';
import { Rect, createScene, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 64, h: 64 },
      children: [new Rect({ id: 'box', width: 20, height: 20, position: [32, 32], fill: '#3366cc' })],
    }),
  timeline: timeline({
    duration: 1,
    tracks: [track('box/position.x', 'number', [key(0, 12), key(1, 52)])],
  }),
};

export default mod;
