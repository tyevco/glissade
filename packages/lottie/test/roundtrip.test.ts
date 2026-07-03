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
import { createScene, evaluate, Group, Rect, Text, type SceneModule } from '@glissade/scene';
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
createMeasurer({ fonts: { [FAMILY]: fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)) } });

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
