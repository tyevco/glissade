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
import goldenMesh from './scenes/golden-mesh.js';
import goldenFontInstanced from './scenes/golden-font-instanced.js';
import goldenCompositing from './scenes/golden-compositing.js';

const corpus: Record<string, SceneModule> = {
  shapes: goldenShapes,
  bounce: goldenBounce,
  filters: goldenFilters,
  paths: goldenPaths,
  mesh: goldenMesh,
  'font-instanced': goldenFontInstanced,
  // 0.34 compositing: clip is geometry-only (near-exact); the matte's anti-
  // aliased edges + luma kernel are the perceptual part the SSIM floor covers
  compositing: goldenCompositing,
};

const scenes = new Map<string, ReturnType<SceneModule['createScene']>>();
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const backend = new Canvas2DBackend(canvas);

// §3.6: register the INSTANCED static face in the browser too, so the SSIM
// parity comparison rasterizes the SAME static sfnt on both sides — the
// committed wght:600 instance (an ordinary static ttf), loaded as a FontFace
// and awaited before the harness signals ready (else frame 0 races the load).
const fontReady = (async () => {
  const url = new URL('../assets/fonts/Inconsolata-wght600.ttf', import.meta.url).href;
  const face = new FontFace('Inconsolata Semibold', `url(${url})`);
  // FontFaceSet.add is missing from this TS DOM lib; the runtime API is fine
  (document.fonts as unknown as { add(f: FontFace): void }).add(await face.load());
})();

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

void fontReady.then(() => {
  window.__parityReady = true;
});
