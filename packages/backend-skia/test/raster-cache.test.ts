/**
 * §3.5 raster-cache determinism gate (the NON-NEGOTIABLE AC). The cross-frame
 * bitmap LRU is a pure performance layer: cache-ENABLED output must be
 * byte-for-byte identical to cache-DISABLED output, on every frame. We render
 * golden-cache.ts both ways and compare the PNG bytes — a HIT that blits a
 * stale-CTM or otherwise perturbed bitmap fails here, before any golden update.
 *
 * SkiaBackend always enables the cache; to render with it disabled we drive a
 * bare Raster2D constructed with cacheEnabled:false (the same path the
 * RASTER_CACHE=0 env exposes), through the same @napi-rs canvas flavor.
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCanvas, GlobalFonts, Path2D, type Canvas, type Image } from '@napi-rs/canvas';
import { evaluate, Raster2D, type Ctx2DLike, type DisplayList } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';
import goldenCache from '../../examples/src/scenes/golden-cache.js';

GlobalFonts.registerFromPath(
  fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)),
  'DejaVu Sans',
);

type Drawable = Canvas | Image;

/** A minimal @napi-rs raster with the cache forced OFF — the uncached oracle. */
function uncachedRaster(): { render(list: DisplayList): Buffer } {
  const canvas = createCanvas(goldenCache.createScene().size.w, goldenCache.createScene().size.h);
  const raster = new Raster2D<Canvas, Path2D, Drawable>(
    {
      context: (c) => c.getContext('2d') as unknown as Ctx2DLike<Path2D, Drawable>,
      createCanvas: (w, h) => createCanvas(w, h),
      newPath: () => new Path2D(),
    },
    'warn',
    false, // cacheEnabled = false
  );
  return {
    render(list) {
      raster.render(canvas, list);
      return canvas.toBuffer('image/png');
    },
  };
}

describe('§3.5 raster cache: enabled output == disabled output, byte-for-byte', () => {
  const FPS = 60;
  // a dense frame sweep so the badge is cache-cold at frame 0, then HITs every
  // subsequent frame while the mover keeps changing the destination
  const FRAMES = [0, 1, 2, 5, 15, 30, 45, 60, 90, 120, 150, 179];

  it('every frame of golden-cache matches between the cached and uncached raster', () => {
    const cachedScene = goldenCache.createScene();
    const cached = new SkiaBackend(cachedScene.size.w, cachedScene.size.h);
    cachedScene.setTextMeasurer(cached);

    const uncachedScene = goldenCache.createScene();
    const uncachedBackend = new SkiaBackend(uncachedScene.size.w, uncachedScene.size.h);
    uncachedScene.setTextMeasurer(uncachedBackend);
    const uncached = uncachedRaster();

    for (const f of FRAMES) {
      const tlCached = evaluate(cachedScene, goldenCache.timeline, f / FPS);
      cached.render(tlCached);
      const withCache = cached.encodePng();

      const tlUncached = evaluate(uncachedScene, goldenCache.timeline, f / FPS);
      const withoutCache = uncached.render(tlUncached);

      expect(
        withCache.equals(withoutCache),
        `frame ${f}: cached render diverged from the uncached oracle`,
      ).toBe(true);
    }
  });

  it('a re-blit on a later frame is byte-identical to the first (cold) raster of the same badge', () => {
    // Render frame 0 (cold), then re-render frame 0 after intervening frames
    // have churned the LRU — the cached badge must reproduce its cold pixels.
    const scene = goldenCache.createScene();
    const backend = new SkiaBackend(scene.size.w, scene.size.h);
    scene.setTextMeasurer(backend);

    backend.render(evaluate(scene, goldenCache.timeline, 0));
    const cold = backend.encodePng();

    for (const f of [10, 20, 40, 80]) backend.render(evaluate(scene, goldenCache.timeline, f / FPS));

    backend.render(evaluate(scene, goldenCache.timeline, 0));
    const reblit = backend.encodePng();

    expect(reblit.equals(cold)).toBe(true);
  });
});
