/**
 * splitText() measurer parity (o_aLYFFPjFDf): splitText snapshots part geometry
 * at BUILD time. WITH the real Skia backend as the measurer, the split parts
 * land where the un-split Text's glyphs sit, so an un-split `Text(props)` and
 * `splitText(props, { measurer: backend }).node` rasterize to ~the same pixels.
 * WITHOUT a real measurer it falls back to a rough per-character estimate whose
 * error accumulates left-to-right (the consumer-visible drift) — and now warns.
 *
 * This pins the fix: the real-measurer split is near-pixel-equal to the source,
 * the estimate split visibly drifts, and the estimate path emits the warning.
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GlobalFonts } from '@napi-rs/canvas';
import { createScene, evaluate, Text, estimatingMeasurer } from '@glissade/scene';
import { splitText } from '@glissade/scene/type';
import { SkiaBackend } from '../src/index.js';

GlobalFonts.registerFromPath(
  fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)),
  'DejaVu Sans',
);

const W = 640;
const H = 360;
const FAMILY = 'DejaVu Sans';

// A long-ish phrase so the per-character estimate's cumulative drift is large.
const props = {
  id: 'title',
  text: 'split the text now',
  fill: '#ffffff',
  fontFamily: FAMILY,
  fontSize: 40,
  align: 'center' as const,
  position: [W / 2, H / 2] as [number, number],
};

/** Mean absolute per-channel pixel difference between two equal-size frames. */
function meanAbsDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

/** Render a single node into a fresh scene and return its raw RGBA pixels. */
async function pixels(node: Text | ReturnType<typeof splitText>['node']): Promise<Uint8ClampedArray> {
  const scene = createScene({ size: { w: W, h: H }, children: [node] });
  const backend = new SkiaBackend(W, H);
  scene.setTextMeasurer(backend);
  backend.render(evaluate(scene));
  return new Uint8ClampedArray(await backend.readPixels());
}

describe('splitText() real-measurer parity vs the un-split source', () => {
  it('a split with the real Skia measurer is near-pixel-equal to the un-split Text', async () => {
    const skiaMeasurer = new SkiaBackend(8, 8);
    const source = await pixels(new Text(props));
    const split = await pixels(splitText(props, { by: 'word', measurer: skiaMeasurer }).node);
    const diff = meanAbsDiff(source, split);
    // Per-part Texts re-emit each word at its measured x; only sub-pixel AA at
    // word seams differs. A tiny mean-abs floor (~<1.0/255) — never the wholesale
    // drift the estimate produces (asserted to be far larger below).
    expect(diff).toBeLessThan(1.0);
  });

  it('the per-character ESTIMATE split drifts far more than the real-measurer split', async () => {
    const skiaMeasurer = new SkiaBackend(8, 8);
    const source = await pixels(new Text(props));
    const real = await pixels(splitText(props, { by: 'word', measurer: skiaMeasurer }).node);
    // measurer-fail-loud: the estimate is deliberate here, so opt in with { estimate: true }.
    const estimate = await pixels(splitText(props, { by: 'word', measurer: estimatingMeasurer, estimate: true }).node);
    const realDiff = meanAbsDiff(source, real);
    const estimateDiff = meanAbsDiff(source, estimate);
    // the estimate accumulates left-to-right → materially worse than the real one
    expect(estimateDiff).toBeGreaterThan(realDiff);
    expect(estimateDiff).toBeGreaterThan(2.0);
  });
});

describe('splitText() fails loud on the estimate fallback (Skia present but not threaded in)', () => {
  it('THROWS when the measurer resolves to the estimate (explicit estimatingMeasurer, no opt-out)', () => {
    // measurer-fail-loud: explicitly passing the estimating singleton (the
    // no-measurer resolution result) is fail-loud by default — the B contract.
    expect(() =>
      splitText({ id: 'drift', text: 'split the text now', fontFamily: FAMILY, fontSize: 40 }, {
        measurer: estimatingMeasurer,
      }),
    ).toThrow(/splitText: text geometry needs a real measurer/);
  });

  it('{ estimate: true } opts into the estimate — degrades, no throw', () => {
    expect(() =>
      splitText({ id: 'drift2', text: 'split the text now', fontFamily: FAMILY, fontSize: 40 }, {
        measurer: estimatingMeasurer,
        estimate: true,
      }),
    ).not.toThrow();
  });
});
