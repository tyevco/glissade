/**
 * Browser side of the SSIM parity suite (DESIGN.md §3.4/§7.3 tier 3): renders
 * golden-corpus frames through Canvas2DBackend in a real browser; the test
 * compares against SkiaBackend renders with an SSIM floor (never byte-equality
 * across the seam).
 */

import { evaluate, type SceneModule } from '@glissade/scene';
import { Canvas2DBackend } from '@glissade/backend-canvas2d';
import goldenShapes from './scenes/golden-shapes.js';
import goldenBounce from './scenes/golden-bounce.js';
import goldenFilters from './scenes/golden-filters.js';
import goldenPaths from './scenes/golden-paths.js';

const corpus: Record<string, SceneModule> = {
  shapes: goldenShapes,
  bounce: goldenBounce,
  filters: goldenFilters,
  paths: goldenPaths,
};

const scenes = new Map<string, ReturnType<SceneModule['createScene']>>();
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const backend = new Canvas2DBackend(canvas);

declare global {
  interface Window {
    __parityRender(name: string, t: number): string; // PNG data URL
    __parityReady: boolean;
  }
}

window.__parityRender = (name, t) => {
  const mod = corpus[name];
  if (!mod) throw new Error(`unknown parity scene '${name}'`);
  let scene = scenes.get(name);
  if (!scene) {
    scene = mod.createScene();
    scenes.set(name, scene);
  }
  backend.render(evaluate(scene, mod.timeline, t));
  return canvas.toDataURL('image/png');
};
window.__parityReady = true;
