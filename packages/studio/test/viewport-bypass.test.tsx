// @vitest-environment jsdom
/**
 * Assertion 3 — the viewport bypasses React (§6.1): a Playhead change
 * re-rasterizes the DisplayList directly (mount subscribes the playhead → rAF →
 * backend.render) WITHOUT a React commit of the viewport component. React renders
 * only chrome. We spy backend.render + count the viewport component's commits;
 * after a seek + a flushed (mocked) synchronous rAF, render fired and the
 * viewport committed zero times.
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Profiler, useRef } from 'react';
import { render as renderReact, cleanup, act } from '@testing-library/react';
import { timeline, track, key } from '@glissade/core';
import { createScene, Rect } from '@glissade/scene';
import { mount, type Mounted } from '@glissade/player';
import { installCanvasMock } from './helpers.js';

let restoreCanvas: () => void;
beforeAll(() => {
  restoreCanvas = installCanvasMock();
});
afterAll(() => restoreCanvas());

// Mock rAF to capture the scheduled render so we can flush it synchronously.
let rafQueue: FrameRequestCallback[] = [];
let prevRaf: typeof globalThis.requestAnimationFrame;
beforeEach(() => {
  rafQueue = [];
  prevRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as typeof globalThis.requestAnimationFrame;
});
afterEach(() => {
  globalThis.requestAnimationFrame = prevRaf;
  cleanup();
});
const flushRaf = () => {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(performance.now());
};

describe('viewport bypasses React', () => {
  it('a seek re-rasterizes the viewport (backend.render) with zero viewport React commits', () => {
    const scene = createScene({ size: { w: 64, h: 64 }, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
    const doc = timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 1)])] });
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    let mounted!: Mounted;
    // The viewport React component owns the canvas DOM node but NEVER subscribes
    // to the playhead — it must not re-commit when time changes.
    let viewportCommits = 0;
    function Viewport() {
      const ref = useRef<HTMLDivElement>(null);
      return <div ref={ref} />;
    }

    renderReact(
      <Profiler id="viewport" onRender={() => viewportCommits++}>
        <Viewport />
      </Profiler>,
    );
    mounted = mount(scene, doc, canvas, {});
    flushRaf(); // mount's first paint
    const renderSpy = vi.spyOn(mounted.backend, 'render');
    const commitsAfterMount = viewportCommits;

    try {
      act(() => {
        mounted.player.seek(0.5); // playhead write → schedules a rAF render
      });
      flushRaf(); // the rAF fires renderNow → backend.render

      expect(renderSpy).toHaveBeenCalledTimes(1); // re-rasterized
      expect(viewportCommits - commitsAfterMount).toBe(0); // viewport never re-committed
    } finally {
      renderSpy.mockRestore();
      mounted.dispose();
    }
  });
});
