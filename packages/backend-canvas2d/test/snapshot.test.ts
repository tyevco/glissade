/**
 * 0.19: `@glissade/backend-canvas2d/snapshot` — `snapshotCanvas()` +
 * `renderToDataURL()`, the "screenshot a rendered frame as a data URL" DX seam
 * (the AI-consumer wall: "can't screenshot a live canvas"). These live on a
 * tree-shakeable SUBPATH, off the base backend index (a no-build playback embed
 * never screenshots); a check:size guard asserts the base index excludes them.
 *
 * Browser-only by design (OffscreenCanvas.convertToBlob /
 * HTMLCanvasElement.toDataURL), so this exercises both canvas flavors — and the
 * `Canvas2DBackend` passthrough — with minimal fakes: an EMPTY scene fires no
 * draw commands, so a clear-only 2D context is enough (mirrors export-web's
 * pngFallback fake).
 *
 * Runs in the default node env: it must not throw merely on import (the
 * browser-only constraint is enforced at call time on an unsuitable canvas,
 * never at module load).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { createScene } from '@glissade/scene';
import { Canvas2DBackend } from '../src/index.js';
import { renderToDataURL, snapshotCanvas } from '../src/snapshot.js';

const W = 4;
const H = 4;

/** Just enough 2D context for an empty scene (resetTransform + clearRect). */
class FakeCtx2D {
  rgba = new Uint8Array(W * H * 4);
  font = '';
  fillStyle = '';
  resetTransform(): void {}
  clearRect(): void {
    this.rgba.fill(0);
  }
  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(this.rgba) };
  }
  save(): void {}
  restore(): void {}
  measureText(t: string) {
    return { width: t.length, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  }
}

/** OffscreenCanvas stand-in: convertToBlob → a tiny PNG-typed Blob. */
class FakeOffscreenCanvas {
  ctx = new FakeCtx2D();
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): FakeCtx2D {
    return this.ctx;
  }
  async convertToBlob(opts?: { type?: string }): Promise<Blob> {
    return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: opts?.type ?? 'image/png' });
  }
}

/** HTMLCanvasElement stand-in: toDataURL synchronously, the non-Offscreen path. */
class FakeHtmlCanvas {
  ctx = new FakeCtx2D();
  constructor(
    public width = W,
    public height = H,
  ) {}
  getContext(): FakeCtx2D {
    return this.ctx;
  }
  toDataURL(type = 'image/png'): string {
    return `data:${type};base64,iVBOR`;
  }
}

function withOffscreen<T>(fn: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = g['OffscreenCanvas'];
  g['OffscreenCanvas'] = FakeOffscreenCanvas;
  try {
    return fn();
  } finally {
    g['OffscreenCanvas'] = saved;
  }
}

const emptyScene = () => createScene({ size: { w: W, h: H }, children: [] });

afterEach(() => {
  // Ensure no global leaks between tests that toggle OffscreenCanvas.
  const g = globalThis as unknown as Record<string, unknown>;
  if (g['OffscreenCanvas'] === FakeOffscreenCanvas) delete g['OffscreenCanvas'];
});

describe('snapshotCanvas()', () => {
  it('resolves to a data: URL from an OffscreenCanvas (async, convertToBlob path)', async () => {
    await withOffscreen(async () => {
      const canvas = new FakeOffscreenCanvas(W, H);
      const url = await snapshotCanvas(canvas as unknown as OffscreenCanvas);
      expect(url).toMatch(/^data:image\/png;base64,/);
    });
  });

  it('accepts a Canvas2DBackend and snapshots its current canvas', async () => {
    await withOffscreen(async () => {
      const canvas = new FakeOffscreenCanvas(W, H);
      const backend = new Canvas2DBackend(canvas as unknown as OffscreenCanvas);
      const url = await snapshotCanvas(backend);
      expect(url).toMatch(/^data:image\/png;base64,/);
    });
  });

  it('honors a custom MIME type via convertToBlob', async () => {
    await withOffscreen(async () => {
      const canvas = new FakeOffscreenCanvas(W, H);
      const url = await snapshotCanvas(canvas as unknown as OffscreenCanvas, 'image/webp');
      expect(url.startsWith('data:image/webp;base64,')).toBe(true);
    });
  });

  it('uses HTMLCanvasElement.toDataURL when OffscreenCanvas is absent', async () => {
    // No OffscreenCanvas global ⇒ the toDataURL branch.
    const canvas = new FakeHtmlCanvas();
    const url = await snapshotCanvas(canvas as unknown as HTMLCanvasElement);
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it('throws a clear browser-only error when the canvas has no toDataURL', async () => {
    const canvas = { width: W, height: H } as unknown as HTMLCanvasElement;
    await expect(snapshotCanvas(canvas)).rejects.toThrow(/browser-only/);
  });
});

describe('renderToDataURL()', () => {
  it('evaluate → render → snapshot returns a data:image/... string', async () => {
    await withOffscreen(async () => {
      const url = await renderToDataURL(emptyScene(), timeline({ duration: 1 / 30, fps: 30 }), 0);
      expect(url).toMatch(/^data:image\/png;base64,/);
    });
  });

  it('mirrors the controlled-drive overload (no timeline)', async () => {
    await withOffscreen(async () => {
      const url = await renderToDataURL(emptyScene());
      expect(url).toMatch(/^data:image\/png;base64,/);
    });
  });

  it('forwards a custom type through opts (timeline form)', async () => {
    await withOffscreen(async () => {
      const url = await renderToDataURL(emptyScene(), timeline({ duration: 1 / 30, fps: 30 }), 0, {
        type: 'image/webp',
      });
      expect(url.startsWith('data:image/webp;base64,')).toBe(true);
    });
  });

  it('forwards opts in the controlled-drive form', async () => {
    await withOffscreen(async () => {
      const url = await renderToDataURL(emptyScene(), { type: 'image/webp' });
      expect(url.startsWith('data:image/webp;base64,')).toBe(true);
    });
  });
});

describe('browser-only DX seam (headless Node import safety)', () => {
  it('importing the subpath does not throw without a browser canvas', () => {
    // The import at the top of this file already ran in node env without error;
    // the helpers are merely defined, never invoked at load.
    expect(typeof renderToDataURL).toBe('function');
    expect(typeof snapshotCanvas).toBe('function');
  });
});
