// @vitest-environment jsdom
/**
 * Assertion 1 — backend identity (§6.1): the studio viewport renders through the
 * EXACT same Canvas2DBackend class as the embed player path, so preview is
 * pixel-true by construction. mount() into a jsdom canvas (getContext stubbed so
 * construction + first paint succeed) and assert the backend's class identity.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { timeline, track, key } from '@glissade/core';
import { createScene, Rect } from '@glissade/scene';
import { mount } from '@glissade/player';
import { Canvas2DBackend } from '@glissade/backend-canvas2d';
import { installCanvasMock } from './helpers.js';

let restore: () => void;
beforeAll(() => {
  restore = installCanvasMock();
});
afterAll(() => restore());

describe('studio viewport backend identity', () => {
  it('mount() yields a Canvas2DBackend — the same class as the embed path', () => {
    const scene = createScene({ size: { w: 64, h: 64 }, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
    const doc = timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 1)])] });
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const mounted = mount(scene, doc, canvas, { loop: true });
    try {
      expect(mounted.backend).toBeInstanceOf(Canvas2DBackend);
    } finally {
      mounted.dispose();
    }
  });
});
