/**
 * 0.56 kinetic type presets → Lottie interchange verification (the 0.55
 * never-silent rule, per preset):
 *  ✅ ROUND-TRIPS via REAL tracks: typeOn DEFAULT (string hold-key track → stepped
 *     text docs) and revealWords (per-word opacity/position tracks → ty:5 layers).
 *  ❌ RENDER-ONLY, MUST WARN (verified to fire FROM the preset path):
 *       typeOn { cursor: true } → the TextCursor sibling is dropped+warned.
 *       typeOn { mask: true }   → the `<id>/reveal` grapheme mask is dropped+warned.
 */

import { describe, expect, it } from 'vitest';
import type { Timeline } from '@glissade/core';
import { createScene, Text, type Node, type SceneModule, type TextMeasurer } from '@glissade/scene';
import { typeOn, revealWords } from '@glissade/scene/type';
import { exportLottie } from '../src/export.js';
import type { LottieLayer, LottieTextData } from '../src/types.js';

const W = 320;
const H = 240;
const FAMILY = 'DejaVu Sans';

/** 10px per char — a real (non-estimating) measurer so splitText is silent. */
const fixed: TextMeasurer = {
  measureText: (text, font) => ({ width: text.length * 10, ascent: font.size, descent: 0 }),
};

function mod(children: Node[], timeline: Timeline): SceneModule {
  return { createScene: () => createScene({ size: { w: W, h: H }, children }), timeline };
}

function exportWith(children: Node[], tracks: Timeline['tracks']): { doc: ReturnType<typeof exportLottie>; warnings: string[] } {
  const warnings: string[] = [];
  const doc = exportLottie(mod(children, { version: 1, duration: 3, fps: 60, tracks }), {
    width: W,
    height: H,
    fps: 60,
    onWarn: (m) => warnings.push(m),
  });
  return { doc, warnings };
}

const textLayers = (layers: LottieLayer[]): LottieLayer[] => layers.filter((l) => l.ty === 5);

describe('typeOn interchange', () => {
  it('DEFAULT (string track) ROUND-TRIPS as stepped text documents — no reveal warn', () => {
    const r = typeOn(new Text({ id: 'typed', text: 'hello', fill: '#fff', fontFamily: FAMILY, fontSize: 24, position: [40, 60] }), {
      perChar: 0.1,
    });
    const { doc, warnings } = exportWith([r.node], [r.track]);
    const layer = textLayers(doc.layers)[0]!;
    const keys = (layer.t as LottieTextData).d.k;
    // stepped docs: the string grows keystroke-by-keystroke, ending on the full text
    expect(keys.length).toBeGreaterThan(1);
    expect(keys.at(-1)!.s.t).toBe('hello');
    // the honest stepped-doc degrade warns; the render-only reveal warn does NOT fire
    expect(warnings.some((w) => /sampled at 60 fps into stepped text documents/.test(w))).toBe(true);
    expect(warnings.some((w) => /reveal.*not exported/i.test(w))).toBe(false);
  });

  it('{ mask: true } DROPS+WARNS — the render-only <id>/reveal grapheme mask (never silent)', () => {
    const r = typeOn(new Text({ id: 'msk', text: 'masked', fill: '#fff', fontFamily: FAMILY, fontSize: 24, position: [40, 60] }), {
      mask: true,
    });
    const { warnings } = exportWith([r.node], [r.track]);
    expect(warnings.some((w) => /typewriter 'reveal' is not exported/.test(w))).toBe(true);
  });

  it('{ cursor: true } DROPS+WARNS the render-only caret node (never silent)', () => {
    const r = typeOn(new Text({ id: 'cur', text: 'caret', fill: '#fff', fontFamily: FAMILY, fontSize: 24, position: [40, 60] }), {
      cursor: true,
    });
    const { warnings } = exportWith([r.node, r.cursor!], [r.track]);
    // the TextCursor is not a Group/Rect/Circle/Path/Text → dropped + warned
    expect(warnings.some((w) => /not exportable.*dropped/i.test(w))).toBe(true);
    // the Text itself still round-trips (string track) — no reveal warn
    expect(warnings.some((w) => /reveal.*not exported/i.test(w))).toBe(false);
  });
});

describe('revealWords interchange', () => {
  it('ROUND-TRIPS: each word is its own ty:5 text layer with real opacity/position tracks — no render-only warn', () => {
    const r = revealWords(new Text({ id: 'w', text: 'one two three', fill: '#fff', fontFamily: FAMILY, fontSize: 24, position: [40, 60] }), {
      from: 'below',
      measurer: fixed,
    });
    const { doc, warnings } = exportWith([r.node], r.tracks);
    // 3 words → 3 text layers
    expect(textLayers(doc.layers)).toHaveLength(3);
    // no render-only drop/reveal/cursor warn — it is faithful by construction
    expect(warnings.some((w) => /reveal.*not exported|not exportable|render-only/i.test(w))).toBe(false);
  });
});
