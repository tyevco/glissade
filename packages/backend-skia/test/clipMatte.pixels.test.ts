/**
 * Clip + TrackMatte pixel behavior on Skia (0.34) — the render-seat acceptance
 * criteria, as unit tests: a clip EXCLUDES out-of-bounds pixels (vs an unclipped
 * control), nested clips INTERSECT, an alpha matte keeps content only where the
 * matte is opaque while the BACKDROP stays intact (destination-in is isolated to
 * the node's own layer), luma converts brightness → alpha via the shared kernel,
 * and the whole path is byte-deterministic across independent renders.
 */

import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { Circle, Group, Rect, createScene, evaluate, trackMatte, type Node } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';

const tl = timeline({ duration: 1, tracks: [] });
const W = 200;

async function pixels(children: Node[]): Promise<Uint8ClampedArray> {
  const scene = createScene({ size: { w: W, h: W }, children });
  const b = new SkiaBackend(W, W);
  b.render(evaluate(scene, tl, 0));
  return b.readPixels();
}
const at = (d: Uint8ClampedArray, x: number, y: number): number[] => Array.from(d.slice((y * W + x) * 4, (y * W + x) * 4 + 4));

describe('Group clip — pixels (Skia)', () => {
  it('excludes out-of-bounds pixels that the unclipped control paints', async () => {
    const mk = (clip: boolean) => [
      new Group({
        id: 'g',
        position: [100, 100],
        ...(clip ? { clip: { w: 100, h: 60, r: 12 } } : {}),
        children: [new Rect({ id: 'r', width: 300, height: 300, fill: '#ff0000' })],
      }),
    ];
    const clipped = await pixels(mk(true));
    const control = await pixels(mk(false));
    expect(at(clipped, 100, 100)).toEqual([255, 0, 0, 255]); // inside survives
    expect(at(clipped, 100, 150)).toEqual([0, 0, 0, 0]); // below the region
    expect(at(clipped, 30, 100)).toEqual([0, 0, 0, 0]); // left of the region
    expect(at(control, 100, 150)).toEqual([255, 0, 0, 255]); // control proves the paint reached there
  });

  it('nested clips INTERSECT', async () => {
    const d = await pixels([
      new Group({
        id: 'outer',
        position: [100, 100],
        clip: { w: 120, h: 120 },
        children: [
          new Group({
            id: 'inner',
            clip: { w: 200, h: 40 },
            children: [new Rect({ id: 'r', width: 300, height: 300, fill: '#00ff00' })],
          }),
        ],
      }),
    ]);
    expect(at(d, 100, 100)).toEqual([0, 255, 0, 255]); // in both
    expect(at(d, 170, 100)).toEqual([0, 0, 0, 0]); // in inner band, outside outer box
    expect(at(d, 100, 140)).toEqual([0, 0, 0, 0]); // in outer box, outside inner band
  });
});

describe('TrackMatte — pixels (Skia)', () => {
  const bg = () => new Rect({ id: 'bg', width: W, height: W, position: [100, 100], fill: '#000080' });
  const content = () => new Rect({ id: 'c', width: W, height: W, position: [100, 100], fill: '#00ff00' });

  it('alpha matte keeps content only inside the matte; the BACKDROP stays intact', async () => {
    const d = await pixels([
      bg(),
      trackMatte(content(), new Circle({ id: 'm', radius: 40, position: [100, 100], fill: '#ffffff' }), { id: 'tm' }),
    ]);
    expect(at(d, 100, 100)).toEqual([0, 255, 0, 255]); // inside the circle: content
    expect(at(d, 100, 30)).toEqual([0, 0, 128, 255]); // outside: content erased, backdrop INTACT
  });

  it("luma matte: a mid-gray matte yields ~half-alpha content (brightness → alpha)", async () => {
    const d = await pixels([
      bg(),
      trackMatte(content(), new Circle({ id: 'm', radius: 40, position: [100, 100], fill: '#808080' }), { id: 'tm', mode: 'luma' }),
    ]);
    const [, g, b] = at(d, 100, 100);
    expect(g).toBeGreaterThan(100); // roughly half the green …
    expect(g).toBeLessThan(160);
    expect(b).toBeGreaterThan(40); // … blended over the navy backdrop
    expect(at(d, 100, 30)).toEqual([0, 0, 128, 255]); // outside untouched
    // a BLACK luma matte erases everything (luma 0 → alpha 0)
    const black = await pixels([
      bg(),
      trackMatte(content(), new Circle({ id: 'm', radius: 40, position: [100, 100], fill: '#000000' }), { id: 'tm', mode: 'luma' }),
    ]);
    expect(at(black, 100, 100)).toEqual([0, 0, 128, 255]); // backdrop only
  });

  it('renders byte-identically across independent scenes/backends (incl. the luma kernel)', async () => {
    const mk = () => [
      trackMatte(new Rect({ id: 'c', width: W, height: W, position: [100, 100], fill: '#00ff00' }), new Circle({ id: 'm', radius: 40, position: [100, 100], fill: '#808080' }), {
        id: 'tm',
        mode: 'luma',
      }),
    ];
    const [a, b] = [await pixels(mk()), await pixels(mk())];
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });
});
