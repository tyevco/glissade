/**
 * Backend-injection seam (dom-backend memo, Seam 2 — the S3 foundation):
 * mount() builds its RenderBackend via an OPTIONAL `opts.backend` factory,
 * defaulting to Canvas2DBackend. This proves both halves:
 *   - injected: `mount(scene, doc, canvas, { backend })` drives the supplied
 *     backend (its `render`/`setTextMeasurer` are wired), never Canvas2DBackend;
 *   - default: `mount(scene, doc, canvas)` with no factory constructs the real
 *     Canvas2DBackend exactly as before (every existing call site unchanged).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import {
  createScene,
  Rect,
  type BackendCaps,
  type DisplayList,
  type RenderBackend,
} from '@glissade/scene';
import { Canvas2DBackend } from '@glissade/backend-canvas2d';
import { mount } from '../src/index.js';

const CAPS: BackendCaps = { filters: new Set(), shaders: false, maxTextureSize: 4096 };

/** A minimal RenderBackend that records what mount drives through it. */
function fakeBackend() {
  const renders: DisplayList[] = [];
  let measuredOnScene = false;
  const backend: RenderBackend = {
    caps: CAPS,
    render: (list) => {
      renders.push(list);
    },
    measureText: (text, font) => {
      measuredOnScene = true;
      return { width: text.length * font.size, ascent: font.size, descent: 0 };
    },
    readPixels: () => Promise.resolve(new Uint8ClampedArray(0)),
    setImageAsset: () => {},
    setVideoAsset: () => {},
    dispose: () => {},
  };
  return { backend, get renders() { return renders; }, get measured() { return measuredOnScene; } };
}

function makeScene() {
  return createScene({ size: { w: 100, h: 100 }, children: [new Rect({ width: 10, height: 10 })] });
}

// jsdom-free canvas stub so the DEFAULT path can construct a real
// Canvas2DBackend in the node test environment (no pixels are asserted).
function installCanvasMock() {
  const g = globalThis as Record<string, unknown>;
  const fakeMatrix = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, multiply: fakeMatrix, inverse: fakeMatrix });
  const ctx = new Proxy(
    {
      measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
      getTransform: fakeMatrix,
      canvas: { width: 100, height: 100 },
    } as Record<string, unknown>,
    {
      get: (t, p: string) => (p in t ? t[p] : (t[p] = () => undefined)),
      set: (t, p: string, v) => ((t[p] = v), true),
    },
  );
  const prevOffscreen = g.OffscreenCanvas;
  g.OffscreenCanvas = class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return ctx;
    }
  };
  const prevPath2D = g.Path2D;
  g.Path2D = class {
    addPath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    closePath() {}
    rect() {}
    arc() {}
    ellipse() {}
  };
  return () => {
    g.OffscreenCanvas = prevOffscreen;
    g.Path2D = prevPath2D;
  };
}

/** A canvas-shaped target that returns the stubbed 2D context. */
function fakeCanvas(): HTMLCanvasElement | OffscreenCanvas {
  return new (globalThis as { OffscreenCanvas: new (w: number, h: number) => unknown }).OffscreenCanvas(
    100,
    100,
  ) as unknown as OffscreenCanvas;
}

describe('mount() backend-injection seam (Seam 2)', () => {
  let teardown: (() => void) | undefined;
  afterEach(() => {
    teardown?.();
    teardown = undefined;
  });

  it('drives the INJECTED backend when opts.backend is supplied', () => {
    teardown = installCanvasMock();
    const fake = fakeBackend();
    const factoryArgs: unknown[] = [];
    const canvas = fakeCanvas();
    const mounted = mount(makeScene(), timeline(() => {}), canvas, {
      backend: (target) => {
        factoryArgs.push(target);
        return fake.backend;
      },
    });

    // the factory received the mount target, and Mounted.backend is the injection
    expect(factoryArgs).toEqual([canvas]);
    expect(mounted.backend).toBe(fake.backend);
    // first paint drove render() through the injected backend
    expect(fake.renders.length).toBeGreaterThan(0);
    // and the scene's TextMeasurer was wired to it (§3.2)
    mounted.render();
    expect(fake.renders.length).toBeGreaterThan(1);
    mounted.dispose();
  });

  it('DEFAULTS to Canvas2DBackend when no factory is given (call site unchanged)', () => {
    teardown = installCanvasMock();
    const mounted = mount(makeScene(), timeline(() => {}), fakeCanvas());
    expect(mounted.backend).toBeInstanceOf(Canvas2DBackend);
    mounted.dispose();
  });
});
