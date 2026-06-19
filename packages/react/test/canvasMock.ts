/**
 * jsdom canvas stubs (mirrors packages/studio/test/helpers.ts): jsdom has no 2D
 * canvas, so install a no-op context + OffscreenCanvas/Path2D so mount() can
 * construct the real Canvas2DBackend and render without throwing. The
 * <ScenePlayer> tests assert wiring, not pixels.
 */

/** A DOMMatrix-ish identity transform the raster can read back and re-apply. */
function fakeMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, multiply: fakeMatrix, inverse: fakeMatrix };
}

/** A catch-all 2D context: every method a no-op, the value-returning reads stubbed. */
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
      return (t[prop] = () => undefined);
    },
    set(t, prop: string, value) {
      t[prop] = value;
      return true;
    },
  });
}

/** Install jsdom canvas stubs. Returns a teardown. */
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
