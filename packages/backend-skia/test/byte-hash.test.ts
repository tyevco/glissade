/**
 * The per-path byte-exact guarantee (§5.5 pt.6 / M2), as an explicit committed
 * value. The golden suite byte-compares against PNG files; this asserts the
 * positive guarantee directly — frame 120 of golden-shapes, rendered on the
 * pinned @napi-rs/canvas + bundled font (the CLI's rasterizer), hashes to a
 * committed sha256. A change here means the deterministic render changed:
 * investigate before updating the literal (it equals sha256 of the committed
 * golden/shapes-f0120.png, so the two checks move together).
 */

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GlobalFonts } from '@napi-rs/canvas';
import { evaluate } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';
import goldenShapes from '../../examples/src/scenes/golden-shapes.js';

GlobalFonts.registerFromPath(
  fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)),
  'DejaVu Sans',
);

const SHAPES_F120_SHA256 = '08da5b895f5e8aadeb8b8adb2b94029f304d9ad41916d349a835cc9477ed022f';

describe('per-path byte-exact render (pinned toolchain, default CI)', () => {
  it('golden-shapes frame 120 hashes to the committed value', () => {
    const scene = goldenShapes.createScene();
    const backend = new SkiaBackend(scene.size.w, scene.size.h);
    scene.setTextMeasurer(backend);
    backend.render(evaluate(scene, goldenShapes.timeline, 120 / 60));
    const hash = createHash('sha256').update(backend.encodePng()).digest('hex');
    expect(hash).toBe(SHAPES_F120_SHA256);
  });
});
