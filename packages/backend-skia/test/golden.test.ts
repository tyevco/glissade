/**
 * Golden-frame harness (DESIGN.md §7.3 tier 2): frame N is a pure function of
 * the document, so rasterized PNGs byte-compare on a pinned toolchain.
 * Update goldens intentionally with: GOLDEN_UPDATE=1 pnpm vitest run
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GlobalFonts } from '@napi-rs/canvas';
import { evaluate, type SceneModule } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';
import goldenShapes from '../../examples/src/scenes/golden-shapes.js';
import goldenBounce from '../../examples/src/scenes/golden-bounce.js';
import goldenTypography from '../../examples/src/scenes/golden-typography.js';
import goldenLayout from '../../examples/src/scenes/golden-layout.js';
import goldenFilters from '../../examples/src/scenes/golden-filters.js';
import goldenPaths from '../../examples/src/scenes/golden-paths.js';
import goldenCaptions from '../../examples/src/scenes/golden-captions.js';
import goldenCaptionsPortrait from '../../examples/src/scenes/golden-captions-portrait.js';
import goldenCaptionsLong from '../../examples/src/scenes/golden-captions-long.js';
import goldenMarker from '../../examples/src/scenes/golden-marker.js';
import goldenTypewriter from '../../examples/src/scenes/golden-typewriter.js';
import goldenMotionPath from '../../examples/src/scenes/golden-motionpath.js';
import goldenMotionPathMorph from '../../examples/src/scenes/golden-motionpath-morph.js';
import { loadYogaLayoutEngine } from '../../scene/src/layout.js';

await loadYogaLayoutEngine(); // flexbox scenes need the engine before evaluation

// explicit fonts (§3.6): the typography scene's face ships with the repo
GlobalFonts.registerFromPath(
  fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url)),
  'DejaVu Sans',
);

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');
const UPDATE = process.env['GOLDEN_UPDATE'] === '1';

const FRAMES = [0, 30, 60, 90, 120, 150, 179];
const FPS = 60;

const CORPUS: { name: string; mod: SceneModule }[] = [
  { name: 'shapes', mod: goldenShapes },
  { name: 'bounce', mod: goldenBounce },
  { name: 'typography', mod: goldenTypography },
  { name: 'layout', mod: goldenLayout },
  { name: 'filters', mod: goldenFilters },
  { name: 'paths', mod: goldenPaths },
  // narration-anchored captions, both safe-area aspect ratios (§narrate)
  { name: 'captions', mod: goldenCaptions },
  { name: 'captions-portrait', mod: goldenCaptionsPortrait },
  // long-caption overflow guard: auto-shrink + bottom-anchor keeps it in-frame
  { name: 'captions-long', mod: goldenCaptionsLong },
  // anchors (placement + pivot) and the marker highlight sweep
  { name: 'marker', mod: goldenMarker },
  // typewriter reveal + caret (partial-line masking, wrap, cursor blink)
  { name: 'typewriter', mod: goldenTypewriter },
  // motion along a path: arc-length follow + tangent orient
  { name: 'motionpath', mod: goldenMotionPath },
  // following a morphing path live (re-sample as 'route/d' bends)
  { name: 'motionpath-morph', mod: goldenMotionPathMorph },
];

for (const { name, mod } of CORPUS) {
  describe(`golden frames: ${name}`, () => {
    const scene = mod.createScene();
    const backend = new SkiaBackend(scene.size.w, scene.size.h);
    scene.setTextMeasurer(backend); // §3.2: break lines with the drawing rasterizer

    for (const frame of FRAMES) {
      it(`frame ${frame} matches the committed golden PNG byte-for-byte`, () => {
        backend.render(evaluate(scene, mod.timeline, frame / FPS));
        const actual = backend.encodePng();
        const goldenPath = join(GOLDEN_DIR, `${name}-f${String(frame).padStart(4, '0')}.png`);
        if (UPDATE || !existsSync(goldenPath)) {
          mkdirSync(GOLDEN_DIR, { recursive: true });
          writeFileSync(goldenPath, actual);
          if (!UPDATE) {
            // first run bootstraps; subsequent runs must match
            expect(existsSync(goldenPath)).toBe(true);
            return;
          }
        }
        const golden = readFileSync(goldenPath);
        expect(
          actual.equals(golden),
          `frame ${frame} diverged from golden (${goldenPath}); ` +
            'if intentional, re-run with GOLDEN_UPDATE=1',
        ).toBe(true);
      });
    }

    it('re-rendering the same frame is byte-stable in-process', () => {
      backend.render(evaluate(scene, mod.timeline, 1.234));
      const a = backend.encodePng();
      backend.render(evaluate(scene, mod.timeline, 1.234));
      const b = backend.encodePng();
      expect(a.equals(b)).toBe(true);
    });

    it('a fresh scene + random-order evaluation produces the same pixels (purity, §2.5)', () => {
      const sceneB = mod.createScene();
      const backendB = new SkiaBackend(sceneB.size.w, sceneB.size.h);
      sceneB.setTextMeasurer(backendB);
      const ts = [2.9, 0.4, 1.5, 2.0, 0.0];
      for (const t of ts) {
        backend.render(evaluate(scene, mod.timeline, t));
        backendB.render(evaluate(sceneB, mod.timeline, t));
        expect(backend.encodePng().equals(backendB.encodePng())).toBe(true);
      }
    });
  });
}
