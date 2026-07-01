/**
 * §3.5 disk layer-cache tier (0.27.1): a `cache:true` group's device-space raster
 * can be persisted through an injected LayerStore and re-blitted on a FRESH backend
 * (cold in-memory cache) — the "survives a re-narration" case. The correctness bar
 * (the one video-canary PSNR-verifies): a persisted-layer HIT is BYTE-IDENTICAL to
 * a fresh raster. Here we prove it with an in-memory stub store (no fs).
 */

import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { Group, Rect, createScene, evaluate, type LayerCacheEntry, type LayerStore } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';

const scene = () =>
  createScene({
    size: { w: 48, h: 48 },
    children: [
      // a cache:true group → its raster is layer-cached (and now persistable)
      new Group({
        id: 'card',
        cache: true,
        children: [new Rect({ id: 'r', width: 40, height: 40, position: [24, 24], fill: '#3366cc', cornerRadius: 8 })],
      }),
    ],
  });
const tl = timeline({ duration: 1 });

function stubStore() {
  const map = new Map<string, LayerCacheEntry>();
  let hits = 0;
  let puts = 0;
  const store: LayerStore = {
    get: (k) => {
      const e = map.get(k);
      if (e) hits++;
      return e;
    },
    put: (k, e) => {
      puts++;
      map.set(k, { ...e, rgba: e.rgba.slice() }); // detach from the (reused) canvas buffer
    },
  };
  return {
    store,
    get hits() {
      return hits;
    },
    get puts() {
      return puts;
    },
    size: () => map.size,
  };
}

describe('§3.5 disk layer-cache tier', () => {
  it('a persisted-layer disk HIT is byte-identical to a fresh raster', async () => {
    const s = stubStore();

    // Backend A: cold store → in-memory miss → raster → persist to the store
    const a = new SkiaBackend(48, 48, { layerStore: s.store });
    a.render(evaluate(scene(), tl, 0));
    const pixA = await a.readPixels();
    expect(s.puts, 'a cache:true layer was persisted').toBeGreaterThan(0);

    // Backend B: FRESH (in-memory cache cold) + the now-populated store → the
    // layer must come from the store (a re-render / re-narration scenario)
    const hitsBefore = s.hits;
    const b = new SkiaBackend(48, 48, { layerStore: s.store });
    b.render(evaluate(scene(), tl, 0));
    const pixB = await b.readPixels();
    expect(s.hits, 'the disk tier was HIT on the fresh backend').toBeGreaterThan(hitsBefore);

    // THE BAR: the persisted-layer HIT frame is byte-identical to the fresh raster
    expect(Buffer.from(pixB).equals(Buffer.from(pixA))).toBe(true);
  });

  it('no layerStore → byte-identical output (the tier is purely additive)', async () => {
    const withStore = new SkiaBackend(48, 48, { layerStore: stubStore().store });
    withStore.render(evaluate(scene(), tl, 0));
    const pixWith = await withStore.readPixels();

    const without = new SkiaBackend(48, 48); // no store — the shipped path
    without.render(evaluate(scene(), tl, 0));
    const pixWithout = await without.readPixels();

    expect(Buffer.from(pixWith).equals(Buffer.from(pixWithout))).toBe(true);
  });
});
