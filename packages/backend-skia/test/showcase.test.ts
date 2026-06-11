/**
 * Showcase smoke suite: every gallery scene compiles, renders non-empty
 * frames headlessly, and honors the purity contract. Not golden-tested —
 * showcase scenes are expected to evolve freely; this catches breakage.
 */

import { describe, expect, it } from 'vitest';
import { compileTimeline } from '@glissade/core';
import { evaluate, type SceneModule } from '@glissade/scene';
import { SkiaBackend } from '../src/index.js';
import spinners from '../../examples/src/scenes/showcase/spinners.js';
import loaders from '../../examples/src/scenes/showcase/loaders.js';
import dashboard from '../../examples/src/scenes/showcase/dashboard.js';
import transitions from '../../examples/src/scenes/showcase/transitions.js';
import micro from '../../examples/src/scenes/showcase/micro.js';

const GALLERY: Record<string, SceneModule> = { spinners, loaders, dashboard, transitions, micro };

describe('showcase gallery', () => {
  for (const [name, mod] of Object.entries(GALLERY)) {
    it(`'${name}' renders non-empty frames across its duration, purely`, () => {
      const scene = mod.createScene();
      const compiled = compileTimeline(mod.timeline);
      expect(compiled.duration).toBeGreaterThanOrEqual(2);
      expect(compiled.duration).toBeLessThanOrEqual(10);

      const backend = new SkiaBackend(scene.size.w, scene.size.h);
      // skip t=0/t=end: loop-closing scenes legitimately start from black
      for (const f of [0.18, 0.42, 0.66, 0.9]) {
        const t = f * compiled.duration;
        backend.render(evaluate(scene, mod.timeline, t));
        const px = backend.readPixels();
        let nonBackground = 0;
        for (let i = 0; i < px.length; i += 4 * 97) {
          // sample sparsely: anything not near-black counts as content
          if (px[i]! + px[i + 1]! + px[i + 2]! > 90) nonBackground++;
        }
        expect(nonBackground, `${name} @ ${t.toFixed(2)}s looks empty`).toBeGreaterThan(10);
      }

      // purity: random-access ≡ repeat
      const a = evaluate(scene, mod.timeline, compiled.duration * 0.5);
      const b = evaluate(scene, mod.timeline, compiled.duration * 0.5);
      expect(a).toEqual(b);
    });
  }
});
