/**
 * Text → Lottie (ty:5) export: structural mapping, deterministic output, and the
 * warn-and-drop discipline for the MVP's out-of-scope text features. The end-to-end
 * render fidelity (SSIM) lives in roundtrip.test.ts; this file pins the JSON shape.
 */

import { describe, expect, it } from 'vitest';
import { key, track, type Timeline } from '@glissade/core';
import { createScene, Group, Text, type Node, type SceneModule } from '@glissade/scene';
import { TokenHighlight } from '@glissade/scene/tokens';
import { exportLottie } from '../src/export.js';
import type { LottieLayer, LottieTextData } from '../src/types.js';

const W = 320;
const H = 240;

function mod(children: Node[], timeline?: Timeline): SceneModule {
  return {
    createScene: () => createScene({ size: { w: W, h: H }, children }),
    timeline: timeline ?? { version: 1, duration: 1, fps: 60, tracks: [] },
  };
}

const textLayer = (layers: LottieLayer[]): LottieLayer => layers.find((l) => l.ty === 5)!;

describe('Text → Lottie export (structural)', () => {
  it('maps a static Text to a ty:5 layer with a font reference and one document', () => {
    const doc = exportLottie(
      mod([new Text({ id: 'title', text: 'Hello', fill: '#ff0000', fontSize: 48, fontFamily: 'DejaVu Sans', align: 'center', position: [160, 120] })]),
      { width: W, height: H, fps: 60 },
    );
    const layer = textLayer(doc.layers);
    expect(layer.ty).toBe(5);
    const t = layer.t as LottieTextData;
    expect(t.a).toEqual([]);
    expect(t.d.k).toHaveLength(1);
    const s = t.d.k[0]!.s;
    expect(s.t).toBe('Hello');
    expect(s.s).toBe(48);
    expect(s.j).toBe(2); // center
    expect(s.fc).toEqual([1, 0, 0]); // #ff0000, alpha 1 → 3-component
    // transform channels present + centered position mapped onto ks.p
    expect((layer.ks!.p as { k: number[] }).k).toEqual([160, 120]);
    // font reference emitted + linked by fName
    expect(doc.fonts?.list).toHaveLength(1);
    const font = doc.fonts!.list[0]!;
    expect(font.fName).toBe(s.f);
    expect(font.fFamily).toBe('DejaVu Sans');
    expect(font.fStyle).toBe('Regular');
  });

  it('omits tr/lh at glissade defaults; emits them when set', () => {
    const bare = textLayer(exportLottie(mod([new Text({ id: 't', text: 'x', fontFamily: 'DejaVu Sans' })]), { width: W, height: H }).layers);
    const bareDoc = (bare.t as LottieTextData).d.k[0]!.s;
    expect(bareDoc.tr).toBeUndefined();
    expect(bareDoc.lh).toBeUndefined();

    const styled = textLayer(
      exportLottie(mod([new Text({ id: 't', text: 'x', fontSize: 20, fontFamily: 'DejaVu Sans', letterSpacing: 3, lineHeight: 1.5 })]), {
        width: W,
        height: H,
      }).layers,
    );
    const styledDoc = (styled.t as LottieTextData).d.k[0]!.s;
    expect(styledDoc.tr).toBe(3);
    expect(styledDoc.lh).toBe(30); // size * lineHeight
  });

  it('de-dupes fonts.list across Text nodes sharing a face, keeps distinct faces', () => {
    const doc = exportLottie(
      mod([
        new Text({ id: 'a', text: 'A', fontFamily: 'DejaVu Sans', fontWeight: 400 }),
        new Text({ id: 'b', text: 'B', fontFamily: 'DejaVu Sans', fontWeight: 400 }), // same face → shared
        new Text({ id: 'c', text: 'C', fontFamily: 'DejaVu Sans', fontWeight: 700 }), // bold → distinct
        new Text({ id: 'd', text: 'D', fontFamily: 'DejaVu Sans', fontWeight: 700, fontStyle: 'italic' }),
      ]),
      { width: W, height: H },
    );
    const list = doc.fonts!.list;
    expect(list).toHaveLength(3);
    expect(list.map((f) => f.fStyle).sort()).toEqual(['Bold', 'Bold Italic', 'Regular']);
  });

  it('samples an animated fill/fontSize into stepped documents on the frame grid', () => {
    const timeline: Timeline = {
      version: 1,
      duration: 1,
      fps: 60,
      tracks: [
        track('t/fill', 'color', [key(0, '#00ff00'), key(0.5, '#ff0000')]),
        track('t/fontSize', 'number', [key(0, 20), key(0.5, 40)]),
      ],
    };
    const doc = exportLottie(mod([new Text({ id: 't', text: 'Hi', fill: '#00ff00', fontSize: 20, fontFamily: 'DejaVu Sans' })], timeline), {
      width: W,
      height: H,
      fps: 60,
    });
    const dk = (textLayer(doc.layers).t as LottieTextData).d.k;
    expect(dk.length).toBeGreaterThan(2); // multiple stepped documents over the span
    expect(dk[0]!.s.fc).toEqual([0, 1, 0]); // starts green
    expect(dk[0]!.s.s).toBe(20);
    const last = dk[dk.length - 1]!.s;
    expect(last.fc[0]).toBeCloseTo(1); // ends red
    expect(last.s).toBeCloseTo(40);
  });

  it('is deterministic — two exports are byte-identical JSON', () => {
    const build = (): SceneModule =>
      mod(
        [new Text({ id: 't', text: 'Repeat', fill: '#123456', fontSize: 24, fontFamily: 'DejaVu Sans', position: [10, 20] })],
        {
          version: 1,
          duration: 1,
          fps: 60,
          tracks: [track('t/fill', 'color', [key(0, '#123456'), key(0.5, '#654321')])],
        },
      );
    const a = JSON.stringify(exportLottie(build(), { width: W, height: H, fps: 60 }));
    const b = JSON.stringify(exportLottie(build(), { width: W, height: H, fps: 60 }));
    expect(a).toBe(b);
  });
});

describe('Text → Lottie export (warn + drop, never silent)', () => {
  const collect = (m: SceneModule): string[] => {
    const warnings: string[] = [];
    exportLottie(m, { width: W, height: H, onWarn: (w) => warnings.push(w) });
    return warnings;
  };

  it('warns and drops a typewriter reveal track', () => {
    const timeline: Timeline = {
      version: 1,
      duration: 1,
      fps: 60,
      tracks: [track('t/reveal', 'number', [key(0, 0), key(1, 5)])],
    };
    const warnings = collect(mod([new Text({ id: 't', text: 'Hello', fontFamily: 'DejaVu Sans' })], timeline));
    expect(warnings.some((w) => w.includes('reveal'))).toBe(true);
  });

  it('warns and drops variable-font axes (fontVariationSettings)', () => {
    const warnings = collect(mod([new Text({ id: 't', text: 'x', fontFamily: 'DejaVu Sans', fontVariationSettings: '"wght" 700' })]));
    expect(warnings.some((w) => w.includes('variable-font axes'))).toBe(true);
  });

  it('warns and drops a TokenHighlight node', () => {
    const title = new Text({ id: 'title', text: 'red green', fontFamily: 'DejaVu Sans' });
    const th = new TokenHighlight({ id: 'hl', text: title, ranges: [{ match: 'red' }] });
    const warnings = collect(mod([new Group({ id: 'g', children: [title, th] })]));
    expect(warnings.some((w) => w.includes('TokenHighlight'))).toBe(true);
  });
});
