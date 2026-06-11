/**
 * Golden-frame harness (DESIGN.md §7.3 tier 2): frame N is a pure function of
 * the document, so rasterized PNGs byte-compare on a pinned toolchain.
 * Update goldens intentionally with: GOLDEN_UPDATE=1 pnpm vitest run
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluate } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';
import goldenShapes from '../../examples/src/scenes/golden-shapes.js';

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');
const UPDATE = process.env['GOLDEN_UPDATE'] === '1';

const FRAMES = [0, 30, 60, 90, 120, 150, 179];
const FPS = 60;

describe('golden frames: golden-shapes', () => {
  const scene = goldenShapes.createScene();
  const backend = new SkiaBackend(640, 360);

  for (const frame of FRAMES) {
    it(`frame ${frame} matches the committed golden PNG byte-for-byte`, () => {
      backend.render(evaluate(scene, goldenShapes.timeline, frame / FPS));
      const actual = backend.encodePng();
      const goldenPath = join(GOLDEN_DIR, `shapes-f${String(frame).padStart(4, '0')}.png`);
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
    backend.render(evaluate(scene, goldenShapes.timeline, 1.234));
    const a = backend.encodePng();
    backend.render(evaluate(scene, goldenShapes.timeline, 1.234));
    const b = backend.encodePng();
    expect(a.equals(b)).toBe(true);
  });

  it('a fresh scene + random-order evaluation produces the same pixels (purity, §2.5)', () => {
    const sceneB = goldenShapes.createScene();
    const backendB = new SkiaBackend(640, 360);
    const ts = [2.9, 0.4, 1.5, 2.0, 0.0];
    for (const t of ts) {
      backend.render(evaluate(scene, goldenShapes.timeline, t));
      backendB.render(evaluate(sceneB, goldenShapes.timeline, t));
      expect(backend.encodePng().equals(backendB.encodePng())).toBe(true);
    }
  });
});
