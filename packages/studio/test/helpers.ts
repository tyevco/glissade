/**
 * Shared studio-test helpers (DESIGN.md §6). jsdom has no 2D canvas; these
 * install a no-op context + OffscreenCanvas/Path2D so mount() can construct the
 * real Canvas2DBackend and render without throwing — the test asserts wiring,
 * not pixels.
 */

import { createPlayhead, signal, type Playhead } from '@glissade/core';
import { type Player } from '@glissade/player';

/** A DOMMatrix-ish identity transform the raster can read back and re-apply. */
function fakeMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, multiply: fakeMatrix, inverse: fakeMatrix };
}

/**
 * A catch-all 2D context: every method is a no-op, with the handful of
 * value-returning calls (measureText/getTransform/getImageData) stubbed so the
 * raster's reads don't NPE. Reused for both the main canvas and the
 * OffscreenCanvas layers the raster acquires.
 */
function fakeContext(): unknown {
  const target: Record<string, unknown> = {
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    getTransform: fakeMatrix,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    canvas: { width: 0, height: 0 },
  };
  return new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      // unknown property ⇒ a settable no-op function (fillStyle etc. read back as themselves)
      return (t[prop] = () => undefined);
    },
    set(t, prop: string, value) {
      t[prop] = value;
      return true;
    },
  });
}

/**
 * Install jsdom canvas stubs. Returns a teardown. Idempotent enough for one
 * test file; call in beforeAll, restore in afterAll.
 */
export function installCanvasMock(): () => void {
  const g = globalThis as Record<string, unknown>;
  const proto = (g.HTMLCanvasElement as { prototype: Record<string, unknown> } | undefined)?.prototype;
  const prevGetContext = proto?.getContext;
  if (proto) proto.getContext = () => fakeContext();

  const prevOffscreen = g.OffscreenCanvas;
  if (typeof g.OffscreenCanvas === 'undefined') {
    g.OffscreenCanvas = class {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return fakeContext();
      }
    };
  }
  const prevPath2D = g.Path2D;
  if (typeof g.Path2D === 'undefined') {
    g.Path2D = class {
      addPath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      closePath() {}
      arc() {}
      rect() {}
      ellipse() {}
    };
  }

  return () => {
    if (proto) {
      if (prevGetContext) proto.getContext = prevGetContext;
      else delete proto.getContext;
    }
    g.OffscreenCanvas = prevOffscreen;
    g.Path2D = prevPath2D;
  };
}

/**
 * A minimal fake Player whose `playhead` is a REAL core signal (§4.3): seek()
 * writes it, so signal subscribers and useSignalValue fire exactly as with the
 * real player — the load-bearing property for the coalescing/scrub tests.
 */
export interface FakePlayer extends Player {
  readonly playhead: Playhead;
  /** Every `seek(t)` argument, in order. */
  readonly seekCalls: number[];
  /** Every `pause()` call, in order (length = pause count). */
  readonly pauseLog: true[];
}

export function makeFakePlayer(duration = 5): FakePlayer {
  const playhead = createPlayhead(0);
  const seekCalls: number[] = [];
  const pauseLog: true[] = [];
  const noop = () => undefined;
  const player: FakePlayer = {
    playhead,
    duration,
    playing: false,
    playingSignal: signal(false),
    rate: 1,
    seekCalls,
    pauseLog,
    play: () => ({ finished: Promise.resolve(true) }),
    pause: () => {
      pauseLog.push(true);
    },
    seek: (t: number) => {
      seekCalls.push(t);
      playhead.set(t);
    },
    swap: noop,
    onMarker: () => noop,
    onCue: () => noop,
    attach: () => noop,
    dispose: noop,
  };
  return player;
}
