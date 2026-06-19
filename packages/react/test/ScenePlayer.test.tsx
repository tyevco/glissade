// @vitest-environment jsdom
/**
 * <ScenePlayer> (DESIGN §4.3): the canvas is sized from the scene; the controls
 * bar renders only when `controls`; and onFinished fires on NATURAL completion
 * — driven deterministically via a manual rAF clock + canvas stubs (jsdom has
 * neither a real 2D canvas nor a wall clock), so no real timers are used.
 */

import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { timeline, track, key } from '@glissade/core';
import { createScene, Rect } from '@glissade/scene';
import { installCanvasMock } from './canvasMock.js';
import { ScenePlayer } from '../src/index.js';

let restoreCanvas: () => void;

/** A controllable rAF: tests flush queued frames with explicit timestamps. */
let rafQueue: ((t: number) => void)[] = [];
const origRaf = globalThis.requestAnimationFrame;
const origCancel = globalThis.cancelAnimationFrame;

beforeAll(() => {
  restoreCanvas = installCanvasMock();
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
});

afterAll(() => {
  restoreCanvas();
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCancel;
});

afterEach(() => {
  cleanup();
  rafQueue = [];
});

/** Flush every queued rAF callback once with timestamp `nowMs`. */
function flushRaf(nowMs: number): void {
  const pending = rafQueue;
  rafQueue = [];
  for (const cb of pending) cb(nowMs);
}

/** A 1-second timeline animating a single rect's opacity. */
const makeModule = () => {
  const scene = createScene({ size: { w: 320, h: 240 }, children: [new Rect({ id: 'box', width: 10, height: 10 })] });
  const tl = timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 1)])] });
  return { scene, timeline: tl };
};

describe('<ScenePlayer>', () => {
  it('renders a canvas sized from the scene', () => {
    const { scene, timeline: tl } = makeModule();
    const { container } = render(<ScenePlayer scene={scene} timeline={tl} />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
  });

  it('renders the controls bar only when `controls`', () => {
    const a = makeModule();
    const { container, rerender } = render(<ScenePlayer scene={a.scene} timeline={a.timeline} />);
    expect(container.querySelector('.gs-controls')).toBeNull();

    const b = makeModule();
    rerender(<ScenePlayer scene={b.scene} timeline={b.timeline} controls />);
    expect(container.querySelector('.gs-controls')).not.toBeNull();
    expect(screen.getByLabelText('Seek')).toBeTruthy();
    expect(screen.getByLabelText('Play or pause')).toBeTruthy();
  });

  it('fires onFinished(true) on natural completion of an autoplay', async () => {
    const onFinished = vi.fn();
    const { scene, timeline: tl } = makeModule();
    render(<ScenePlayer scene={scene} timeline={tl} autoplay onFinished={onFinished} />);

    // first frame establishes the clock origin; a frame past the 1s duration
    // drives the playhead over the end → the player settles its .finished(true).
    await act(async () => {
      flushRaf(0);
      flushRaf(2000); // 2s elapsed ≥ 1s duration
      await Promise.resolve(); // let the .finished microtask resolve
    });

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith(true);
  });
});
