/**
 * THE round-trip gate (in-process, no lottie-web / browser): a mappable scene
 * (Rect with cubicBezier position/rotation/opacity tracks) is exported to Lottie,
 * re-imported through the SHIPPED importer, and BOTH scenes are rendered on Skia.
 * The perceptual SSIM at several frames must stay ≥ 0.98 — the export↔import
 * bijection, exercised directly.
 *
 * Uses only cubicBezier + hold + linear eases and solid fills (the exactly-
 * invertible subset), so the round trip is faithful by construction.
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { key, track, type Timeline } from '@glissade/core';
import { breakLines, createScene, evaluate, Group, Rect, Text, type FontSpec, type SceneModule } from '@glissade/scene';
import { SkiaBackend, ssim, createMeasurer } from '@glissade/backend-skia';
import { exportLottie } from '../src/export.js';
import { importLottie } from '../src/index.js';

const W = 240;
const H = 240;
const FPS = 60;

// Register the golden test face process-wide (side effect) so the Text round-trip
// actually rasterizes real glyphs — otherwise both renders would draw nothing and
// the SSIM gate would pass vacuously. 'DejaVu Sans' is the golden corpus's pinned
// family (memory: sans-serif diverges byte-wise in CI; a real registered face is
// stable). Both scenes reference it, so the export→import→render loop is exercised.
const FAMILY = 'DejaVu Sans';
// Capture the Skia measurer instance (also registers the face globally) so the
// width-wrap tests can hand it to exportLottie for a faithful wrap bake.
const MEASURER = createMeasurer({ fonts: { [FAMILY]: fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)) } });

/** A Rect animated on position (cubicBezier), rotation, and opacity + a hold tail. */
function mappableScene(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 2,
    fps: FPS,
    tracks: [
      track('box/position', 'vec2', [
        key(0, [60, 70]),
        key(1, [180, 160], { kind: 'cubicBezier', pts: [0.42, 0, 0.58, 1] }),
        key(2, [120, 120], { interp: 'hold' }),
      ]),
      track('box/rotation', 'number', [key(0, 0), key(2, 90, { kind: 'cubicBezier', pts: [0.4, 0.1, 0.6, 0.9] })]),
      track('box/opacity', 'number', [key(0, 1), key(1.5, 0.4)]),
    ],
  };
  return {
    createScene: () =>
      createScene({ size: { w: W, h: H }, children: [new Rect({ id: 'box', width: 70, height: 50, fill: '#3366cc' })] }),
    timeline,
  };
}

async function renderPixels(mod: SceneModule, t: number): Promise<Uint8ClampedArray> {
  const scene = mod.createScene();
  const backend = new SkiaBackend(W, H);
  scene.setTextMeasurer(backend);
  backend.render(evaluate(scene, mod.timeline, t));
  return backend.readPixels();
}

describe('Lottie export round-trip (Skia SSIM)', () => {
  const original = mappableScene();
  const doc = exportLottie(original, { width: W, height: H, fps: FPS });
  const roundTripped = importLottie(doc).toSceneModule();

  it('re-imports without audit rejections and preserves the animated channels', () => {
    // the importer produced tracks for the mapped props (renamed node ids aside)
    const types = roundTripped.timeline.tracks.map((t) => t.type).sort();
    expect(types).toContain('vec2'); // position
    expect(types).toContain('number'); // rotation / opacity
    expect(roundTripped.timeline.tracks.length).toBeGreaterThan(0);
  });

  const FRAMES = [0, 20, 40, 60, 80, 100, 119];
  it.each(FRAMES)('frame %i matches the original perceptually (SSIM ≥ 0.98)', async (frame) => {
    const t = frame / FPS;
    const a = await renderPixels(original, t);
    const b = await renderPixels(roundTripped, t);
    const score = ssim(a, b, W, H);
    expect(score).toBeGreaterThanOrEqual(0.98);
  });
});

/** A static centered Text — one text document, no tracks. */
function staticTextScene(): SceneModule {
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Text({ id: 'label', text: 'Glissade', fill: '#e8462b', fontSize: 40, fontFamily: FAMILY, align: 'center', position: [120, 130] })],
      }),
    timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
  };
}

/** A Text animated on position (cubicBezier) and fill (color) — doc keyframes + transform. */
function animatedTextScene(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 2,
    fps: FPS,
    tracks: [
      track('label/position', 'vec2', [key(0, [70, 110]), key(2, [150, 140], { kind: 'cubicBezier', pts: [0.42, 0, 0.58, 1] })]),
      track('label/fill', 'color', [key(0, '#2b7fe8'), key(2, '#e8462b')]),
    ],
  };
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Text({ id: 'label', text: 'Motion', fill: '#2b7fe8', fontSize: 44, fontFamily: FAMILY, align: 'center' })],
      }),
    timeline,
  };
}

/**
 * Two NON-overlapping Rects inside a Group at a STATIC opacity of 0.5. Before the
 * bake-into-children fix the children exported at FULL opacity (Lottie null-parent
 * parenting inherits the matrix only, never opacity) → the re-import rendered them
 * solid and this SSIM gate failed.
 */
function staticGroupOpacityScene(): SceneModule {
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [
          new Group({
            id: 'card',
            opacity: 0.5,
            children: [
              new Rect({ id: 'a', width: 44, height: 44, fill: '#3366cc', position: [70, 70] }),
              new Rect({ id: 'b', width: 44, height: 44, fill: '#cc6633', position: [170, 170] }),
            ],
          }),
        ],
      }),
    timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
  };
}

/** The same two non-overlapping Rects under a Group whose opacity animates 0 → 1. */
function animatedGroupOpacityScene(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 2,
    fps: FPS,
    tracks: [track('card/opacity', 'number', [key(0, 0), key(2, 1)])],
  };
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [
          new Group({
            id: 'card',
            children: [
              new Rect({ id: 'a', width: 44, height: 44, fill: '#3366cc', position: [70, 70] }),
              new Rect({ id: 'b', width: 44, height: 44, fill: '#cc6633', position: [170, 170] }),
            ],
          }),
        ],
      }),
    timeline,
  };
}

/**
 * A Group whose opacity is driven by TWO separate track() calls — a fade-IN
 * (t0.5→1.0) and a fade-OUT (t1.5→2.0) — wrapping two non-overlapping Rects.
 * Before frame 0.5 the group is HIDDEN (opacity holds its first key = 0). The
 * runtime coalesces the two tracks; a raw last-write-wins export would keep ONLY
 * the fade-out (first key t1.5 = 1), so the re-imported card would LEAK — visible
 * at frame 0 while the original is empty. This scene fails the SSIM gate before
 * the coalesce fix and passes after (ai-training e04 leak regression).
 */
function multiTrackGroupOpacityScene(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 2,
    fps: FPS,
    tracks: [
      track('card/opacity', 'number', [key(0.5, 0), key(1, 1)]), // fade IN
      track('card/opacity', 'number', [key(1.5, 1), key(2, 0)]), // fade OUT
    ],
  };
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [
          new Group({
            id: 'card',
            children: [
              new Rect({ id: 'a', width: 44, height: 44, fill: '#3366cc', position: [70, 70] }),
              new Rect({ id: 'b', width: 44, height: 44, fill: '#cc6633', position: [170, 170] }),
            ],
          }),
        ],
      }),
    timeline,
  };
}

describe('Lottie multi-track coalesce export round-trip (Skia SSIM)', () => {
  it('coalesces fade-in + fade-out group opacity — a pre-fade-in frame stays HIDDEN (SSIM ≥ 0.98)', async () => {
    const original = multiTrackGroupOpacityScene();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    const roundTripped = importLottie(doc).toSceneModule();
    // frame 0 (hidden, pre fade-in), frame 45 (t=0.75, mid fade-in), frame 105 (t=1.75, mid fade-out)
    for (const frame of [0, 15, 45, 60, 105, 119]) {
      const t = frame / FPS;
      const a = await renderPixels(original, t);
      const b = await renderPixels(roundTripped, t);
      expect(ssim(a, b, W, H), `frame ${frame}`).toBeGreaterThanOrEqual(0.98);
    }
  });
});

describe('Lottie group-opacity export round-trip (Skia SSIM)', () => {
  it('static group opacity 0.5 bakes into children and matches perceptually (SSIM ≥ 0.98)', async () => {
    const original = staticGroupOpacityScene();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    const roundTripped = importLottie(doc).toSceneModule();
    const a = await renderPixels(original, 0);
    const b = await renderPixels(roundTripped, 0);
    expect(ssim(a, b, W, H)).toBeGreaterThanOrEqual(0.98);
  });

  it('animated group opacity 0→1 bakes into children at every sampled frame (SSIM ≥ 0.98)', async () => {
    const original = animatedGroupOpacityScene();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    const roundTripped = importLottie(doc).toSceneModule();
    for (const frame of [0, 30, 60, 90, 119]) {
      const t = frame / FPS;
      const a = await renderPixels(original, t);
      const b = await renderPixels(roundTripped, t);
      expect(ssim(a, b, W, H), `frame ${frame}`).toBeGreaterThanOrEqual(0.98);
    }
  });
});

/**
 * A Group fading in via a NAMED ease (the sampled bake path) whose first key sits
 * at a FRACTIONAL time (t=1.009 → frame 60.54 → rounds to 61, PAST the key),
 * wrapping a large Rect. Before the boundary-anchor fix the baked leaf's first
 * exported keyframe was the ~7% sample at frame 61, held BACKWARD to t=0 → the
 * card GHOSTED across its whole dormant window [0, ~1s]. After the fix the base 0
 * is HELD at ip → the card is hidden until the fade. Fails at dormant frames
 * before the fix; passes after (ai-training e04 hc-bg residual).
 */
function sampledDormantFadeScene(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 4,
    fps: FPS,
    tracks: [track('card/opacity', 'number', [key(1.009, 0), key(1.5, 1, 'easeOutBack')])],
  };
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Group({ id: 'card', children: [new Rect({ id: 'a', width: 160, height: 160, fill: '#3366cc', position: [120, 120] })] })],
      }),
    timeline,
  };
}

describe('Lottie sampled-fade boundary export round-trip (Skia SSIM)', () => {
  it('a sampled group fade-in starting mid-timeline stays HIDDEN in its dormant window (SSIM ≥ 0.98)', async () => {
    const original = sampledDormantFadeScene();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    const roundTripped = importLottie(doc).toSceneModule();
    // frames 15/30/55 are DORMANT (before the t=1.009 fade) → child must be absent;
    // frames 95/200 are past the fade → visible. All must match the original.
    for (const frame of [15, 30, 55, 95, 200]) {
      const t = frame / FPS;
      const a = await renderPixels(original, t);
      const b = await renderPixels(roundTripped, t);
      expect(ssim(a, b, W, H), `frame ${frame}`).toBeGreaterThanOrEqual(0.98);
    }
  });
});

/** A Rect filled with a LINEAR gradient (explicit node-local geometry). */
function linearGradientScene(): SceneModule {
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Rect({ id: 'box', width: 160, height: 120, position: [120, 120], fill: {
          kind: 'linear', from: [-80, -60], to: [80, 60],
          stops: [{ offset: 0, color: '#ff3366' }, { offset: 1, color: '#3366ff' }],
        } })],
      }),
    timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
  };
}

/** A Rect filled with a RADIAL gradient — bright core at the node origin. A Rect
 * (not Circle) so the geometry round-trips EXACTLY, isolating the gradient mapping
 * from the kappa-bezier circle-edge approximation. */
function radialGradientScene(): SceneModule {
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Rect({ id: 'orb', width: 180, height: 180, position: [120, 120], fill: {
          kind: 'radial', center: [0, 0], radius: 90,
          stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#101858' }],
        } })],
      }),
    timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
  };
}

/** A MULTI-STOP linear gradient with a translucent middle stop (opacity ramp). */
function multiStopGradientScene(): SceneModule {
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Rect({ id: 'box', width: 180, height: 180, position: [120, 120], fill: {
          kind: 'linear', from: [-90, 0], to: [90, 0],
          stops: [
            { offset: 0, color: '#ff0000' },
            { offset: 0.5, color: 'rgba(0,255,0,0.5)' },
            { offset: 1, color: '#0000ff' },
          ],
        } })],
      }),
    timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
  };
}

/** An ANIMATED radial gradient — colours drift over 2s (paint track, linear ease). */
function animatedGradientScene(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 2,
    fps: FPS,
    tracks: [track('orb/fill', 'paint', [
      key(0, { kind: 'radial', center: [0, 0], radius: 90, stops: [{ offset: 0, color: '#ffcc00' }, { offset: 1, color: '#330066' }] }),
      key(2, { kind: 'radial', center: [0, 0], radius: 90, stops: [{ offset: 0, color: '#00ffcc' }, { offset: 1, color: '#003366' }] }),
    ])],
  };
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Rect({ id: 'orb', width: 180, height: 180, position: [120, 120], fill: {
          kind: 'radial', center: [0, 0], radius: 90, stops: [{ offset: 0, color: '#ffcc00' }, { offset: 1, color: '#330066' }],
        } })],
      }),
    timeline,
  };
}

describe('Lottie gradient-fill export round-trip (Skia SSIM)', () => {
  const cases: [string, () => SceneModule, number[]][] = [
    ['linear', linearGradientScene, [0]],
    ['radial', radialGradientScene, [0]],
    ['multi-stop (translucent middle)', multiStopGradientScene, [0]],
    ['animated radial', animatedGradientScene, [0, 30, 60, 90, 119]],
  ];
  it.each(cases)('%s gradient re-imports as gf and matches perceptually (SSIM ≥ 0.98)', async (_name, make, frames) => {
    const original = make();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    // it exported a gf shape item (not a warn-dropped fill)
    expect(doc.layers.some((l) => l.shapes?.some((s) => s.ty === 'gf'))).toBe(true);
    const roundTripped = importLottie(doc).toSceneModule();
    for (const frame of frames) {
      const t = frame / FPS;
      const a = await renderPixels(original, t);
      const b = await renderPixels(roundTripped, t);
      expect(ssim(a, b, W, H), `frame ${frame}`).toBeGreaterThanOrEqual(0.98);
    }
  });
});

describe('Lottie Text export round-trip (Skia SSIM)', () => {
  it('static text re-imports as a Text node and matches perceptually (SSIM ≥ 0.98)', async () => {
    const original = staticTextScene();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    expect(doc.layers.some((l) => l.ty === 5)).toBe(true);
    const roundTripped = importLottie(doc).toSceneModule();
    const a = await renderPixels(original, 0);
    const b = await renderPixels(roundTripped, 0);
    expect(ssim(a, b, W, H)).toBeGreaterThanOrEqual(0.98);
  });

  it('animated fill+position text matches at sampled frames (SSIM ≥ 0.98)', async () => {
    const original = animatedTextScene();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    const roundTripped = importLottie(doc).toSceneModule();
    for (const frame of [0, 30, 60, 90, 119]) {
      const t = frame / FPS;
      const a = await renderPixels(original, t);
      const b = await renderPixels(roundTripped, t);
      expect(ssim(a, b, W, H), `frame ${frame}`).toBeGreaterThanOrEqual(0.98);
    }
  });
});

// --- width-wrap bake ---

const WRAP_TEXT = 'Glissade renders motion graphics deterministically from data';
const WRAP_WIDTH = 200;
const WRAP_SIZE = 26;
// Matches the FontSpec exportLottie builds for the node (weight 400 default) so a
// direct breakLines() computes the SAME wrap points the exporter bakes.
const WRAP_FONT: FontSpec = { family: FAMILY, size: WRAP_SIZE, weight: 400 };

/** A left-aligned Text with a wrap `width` (and NO explicit '\n'): the collapse case. */
function wrapTextScene(): SceneModule {
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Text({ id: 'para', text: WRAP_TEXT, fill: '#222222', fontSize: WRAP_SIZE, fontFamily: FAMILY, width: WRAP_WIDTH, position: [20, 40] })],
      }),
    timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
  };
}

/** The same paragraph whose wrap `width` animates 120 → 220 (narrow → wide). */
function animatedWrapWidthScene(): SceneModule {
  const timeline: Timeline = {
    version: 1,
    duration: 1,
    fps: FPS,
    tracks: [track('para/width', 'number', [key(0, 120), key(1, 220)])],
  };
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [new Text({ id: 'para', text: WRAP_TEXT, fill: '#222222', fontSize: WRAP_SIZE, fontFamily: FAMILY, width: 120, position: [20, 40] })],
      }),
    timeline,
  };
}

describe('Lottie width-wrap Text export bake', () => {
  it('bakes the wrapped lines into the doc `t` at the exact breakLines wrap points', () => {
    const doc = exportLottie(wrapTextScene(), { width: W, height: H, fps: FPS, measurer: MEASURER });
    const layer = doc.layers.find((l) => l.ty === 5)!;
    const bakedT = layer.t!.d.k[0]!.s.t;
    const expected = breakLines(WRAP_TEXT, WRAP_FONT, WRAP_WIDTH, MEASURER).join('\n');
    expect(expected.split('\n').length).toBeGreaterThan(1); // the width actually wraps
    expect(bakedT).toBe(expected);
  });

  it('WITHOUT a measurer keeps the raw string (byte-identical passthrough — no bake)', () => {
    const doc = exportLottie(wrapTextScene(), { width: W, height: H, fps: FPS });
    const bakedT = doc.layers.find((l) => l.ty === 5)!.t!.d.k[0]!.s.t;
    expect(bakedT).toBe(WRAP_TEXT); // unchanged, still collapses on import
    expect(bakedT).not.toContain('\n');
  });

  it('recovers the round-trip collapse: baked wrap SSIM ≥ 0.98 (> the raw-passthrough collapse)', async () => {
    const original = wrapTextScene();
    const baked = importLottie(exportLottie(original, { width: W, height: H, fps: FPS, measurer: MEASURER })).toSceneModule();
    const collapsed = importLottie(exportLottie(original, { width: W, height: H, fps: FPS })).toSceneModule();
    const ref = await renderPixels(original, 0);
    const bakedSsim = ssim(ref, await renderPixels(baked, 0), W, H);
    const collapsedSsim = ssim(ref, await renderPixels(collapsed, 0), W, H);
    expect(bakedSsim).toBeGreaterThanOrEqual(0.98); // faithful wrap
    expect(collapsedSsim).toBeLessThan(bakedSsim); // the bug: one-line collapse is worse
  });

  it('re-wraps an ANIMATED width per frame (narrow early → more lines than wide late)', () => {
    const doc = exportLottie(animatedWrapWidthScene(), { width: W, height: H, fps: FPS, measurer: MEASURER });
    const keys = doc.layers.find((l) => l.ty === 5)!.t!.d.k;
    expect(keys.length).toBeGreaterThan(1); // per-frame rewrap, not one static doc
    const firstLines = keys[0]!.s.t.split('\n').length;
    const lastLines = keys[keys.length - 1]!.s.t.split('\n').length;
    expect(firstLines).toBeGreaterThan(lastLines); // width grows → fewer lines
  });
});

// --- non-center anchor ---

/**
 * A FULL-CANVAS top-left-anchored background (position [0,0], anchor 'top-left', so
 * its box top-left sits at the canvas origin) + a small centered foreground marker.
 * Pre-fix the exporter hard-coded ks.a=[0,0], so the re-imported background centered
 * on [0,0] — shifted by half the canvas — and this SSIM collapsed to ~0.28. Honoring
 * the anchor (ks.a = drawOffset + anchor·size) recovers a faithful ≥0.98 round-trip.
 */
function topLeftBackgroundScene(): SceneModule {
  return {
    createScene: () =>
      createScene({
        size: { w: W, h: H },
        children: [
          new Rect({ id: 'bg', width: W, height: H, position: [0, 0], anchor: 'top-left', fill: '#22314f' }),
          new Rect({ id: 'marker', width: 60, height: 60, position: [120, 120], fill: '#f0a500' }),
        ],
      }),
    timeline: { version: 1, duration: 1, fps: FPS, tracks: [] },
  };
}

describe('Lottie non-center-anchor export round-trip (Skia SSIM)', () => {
  it('a top-left full-canvas background re-imports in the right place (SSIM ≥ 0.98)', async () => {
    const original = topLeftBackgroundScene();
    const doc = exportLottie(original, { width: W, height: H, fps: FPS });
    // the background layer carries the honored anchor point (−anchorShift), not [0,0].
    const bg = doc.layers.find((l) => l.nm === 'bg')!;
    expect((bg.ks!.a as { k: number[] }).k).toEqual([-W / 2, -H / 2]);
    const roundTripped = importLottie(doc).toSceneModule();
    const a = await renderPixels(original, 0);
    const b = await renderPixels(roundTripped, 0);
    // pre-fix this scored ~0.28 (half-canvas mispositioning of the bg).
    expect(ssim(a, b, W, H)).toBeGreaterThanOrEqual(0.98);
  });
});
