/**
 * 0.20 STATIC variable-font axis passthrough (§3.6): `Text.fontVariationSettings`
 * → `FontSpec.fontVariationSettings` → `ctx.fontVariationSettings` on the Skia
 * (@napi-rs/canvas) rasterizer. The golden-variable-font corpus is the visual
 * proof; this is the focused unit proof — the axis genuinely shifts the glyphs,
 * the default render is untouched, and the (sticky) property does not leak.
 */

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
import { GlobalFonts } from '@napi-rs/canvas';
import { createScene, evaluate, Text, type SceneModule } from '@glissade/scene';
import { timeline } from '@glissade/core';
import { SkiaBackend } from '../src/index.js';

const VAR = fileURLToPath(new URL('../../examples/assets/fonts/Inconsolata-Variable.ttf', import.meta.url));
const FAMILY = 'Inconsolata Variable Test';

beforeAll(() => {
  GlobalFonts.registerFromPath(VAR, FAMILY);
});

const empty = timeline(() => {}, { fps: 60, duration: 1 });

function frameHash(axis: string | undefined): string {
  const scene: SceneModule['createScene'] = () =>
    createScene({
      size: { w: 200, h: 80 },
      children: [
        new Text({
          id: 't',
          text: 'Hgla',
          fill: '#000000',
          fontFamily: FAMILY,
          fontSize: 48,
          position: [10, 60],
          ...(axis !== undefined ? { fontVariationSettings: axis } : {}),
        }),
      ],
    });
  const s = scene();
  const backend = new SkiaBackend(s.size.w, s.size.h);
  s.setTextMeasurer(backend);
  backend.render(evaluate(s, empty, 0));
  return createHash('sha256').update(backend.encodePng()).digest('hex');
}

describe('Skia variable-font axis passthrough', () => {
  it('a heavy wght axis renders DISTINCTLY from the default weight', () => {
    const def = frameHash(undefined);
    const heavy = frameHash('"wght" 900');
    expect(heavy).not.toBe(def); // the axis reached the glyphs (not dropped)
  });

  it('distinct axis values render distinctly from each other', () => {
    expect(frameHash('"wght" 900')).not.toBe(frameHash('"wght" 300'));
  });

  it('default (no axes) is byte-stable across renders — the property does not leak', () => {
    // render an axed frame between two default frames; the default frames must
    // be byte-identical (the sticky ctx.fontVariationSettings is reset to normal)
    const a = frameHash(undefined);
    frameHash('"wght" 900');
    const b = frameHash(undefined);
    expect(a).toBe(b);
  });

  it('the FontSpec carries the axis the node was given', () => {
    const t = new Text({ id: 't', text: 'x', fontFamily: FAMILY, fontVariationSettings: '"wght" 700' });
    const scene = createScene({ size: { w: 50, h: 50 }, children: [t] });
    const backend = new SkiaBackend(50, 50);
    scene.setTextMeasurer(backend);
    const dl = evaluate(scene, empty, 0);
    const fillText = dl.commands.find((c) => c.op === 'fillText');
    expect(fillText && 'font' in fillText && fillText.font.fontVariationSettings).toBe('"wght" 700');
  });
});
