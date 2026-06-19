/**
 * Browser↔Skia SSIM parity (DESIGN.md §3.4/§7.3 tier 3 — the M2 exit
 * criterion). Chromium renders golden-corpus frames via Canvas2DBackend;
 * SkiaBackend renders the same DisplayLists headlessly; frames must clear an
 * SSIM floor. Never byte-equality across the seam (GPU vs CPU Skia,
 * antialiasing coverage differs).
 *
 * Gated behind PARITY=1: needs a Playwright chromium-headless-shell.
 *   PARITY=1 pnpm vitest run packages/backend-canvas2d/test/parity.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { evaluate, type SceneModule } from '@glissade/scene';
import { ssim } from './ssim.js';

const ENABLED = process.env['PARITY'] === '1';

const FRAMES = [0, 60, 120, 179];
const FPS = 60;
// Per-scene floors. Filters were expected to be the divergent case (different
// Gaussian kernels) but measured ≥ 0.9992 across all frames — Chromium and
// @napi-rs/canvas both implement canvas filters on Skia-family rasterizers.
// The shared 0.97 floor holds with wide margin; no per-filter exclusions.
// mesh Paint (§3, 0.12): the shared CPU kernel produces an IDENTICAL source
// ImageData on both backends; only the final upscale-blit AA differs, so the
// 0.97 floor holds (the determinism tentpole — one kernel, no SkSL fork).
// font-instanced (§3.6): the wght:600 INSTANCED static face is an ordinary
// static sfnt — it clears the shared 0.97 perceptual floor like any other text.
const SSIM_FLOORS: Record<string, number> = {
  shapes: 0.97,
  bounce: 0.97,
  filters: 0.97,
  paths: 0.97,
  mesh: 0.97,
  'font-instanced': 0.97,
};

describe.runIf(ENABLED)('browser↔Skia SSIM parity', () => {
  let server: import('vite').ViteDevServer;
  let browser: import('playwright-core').Browser;
  let page: import('playwright-core').Page;
  let SkiaBackend: typeof import('@glissade/backend-skia').SkiaBackend;
  let loadImage: typeof import('@napi-rs/canvas').loadImage;
  let createCanvas: typeof import('@napi-rs/canvas').createCanvas;
  let corpus: Record<string, SceneModule>;

  beforeAll(async () => {
    const { createServer } = await import('vite');
    server = await createServer({
      root: fileURLToPath(new URL('../../examples', import.meta.url)),
      server: { port: 0 },
      logLevel: 'silent',
    });
    await server.listen();

    const { chromium } = await import('playwright');
    browser = await chromium.launch();
    page = await browser.newPage();
    const port = server.config.server.port === 0 ? server.httpServer!.address() : null;
    const addr = typeof port === 'object' && port ? port.port : server.config.server.port;
    await page.goto(`http://localhost:${addr}/parity.html`);
    await page.waitForFunction(() => (window as unknown as { __parityReady?: boolean }).__parityReady);

    ({ SkiaBackend } = await import('@glissade/backend-skia'));
    ({ loadImage, createCanvas } = await import('@napi-rs/canvas'));
    // §3.6: register the INSTANCED static face on the SKIA side too, so the
    // font-instanced scene rasterizes the SAME static sfnt on both sides of the
    // seam (the browser FontFace is registered in examples/src/parity.ts). Without
    // this, Skia falls back to a system font and the SSIM collapses to ~0.92 —
    // measuring a font MISMATCH, not the perceptual AA delta the floor is about.
    const { GlobalFonts } = await import('@napi-rs/canvas');
    GlobalFonts.registerFromPath(
      fileURLToPath(new URL('../../examples/assets/fonts/Inconsolata-wght600.ttf', import.meta.url)),
      'Inconsolata Semibold',
    );
    corpus = {
      shapes: (await import('../../examples/src/scenes/golden-shapes.js')).default,
      bounce: (await import('../../examples/src/scenes/golden-bounce.js')).default,
      filters: (await import('../../examples/src/scenes/golden-filters.js')).default,
      paths: (await import('../../examples/src/scenes/golden-paths.js')).default,
      mesh: (await import('../../examples/src/scenes/golden-mesh.js')).default,
      'font-instanced': (await import('../../examples/src/scenes/golden-font-instanced.js')).default,
    };
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  async function browserPixels(name: string, t: number): Promise<Uint8ClampedArray> {
    const dataUrl = await page.evaluate(
      ([n, time]) => (window as unknown as { __parityRender(n: string, t: number): string }).__parityRender(n as string, time as number),
      [name, t] as const,
    );
    const img = await loadImage(Buffer.from(dataUrl.split(',')[1]!, 'base64'));
    const c = createCanvas(640, 360);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, 640, 360).data;
  }

  for (const [name, floor] of Object.entries(SSIM_FLOORS)) {
    it(`'${name}' clears SSIM ≥ ${floor} at ${FRAMES.length} frames`, async () => {
      const mod = corpus[name]!;
      const scene = mod.createScene();
      const skia = new SkiaBackend(640, 360);
      for (const frame of FRAMES) {
        const t = frame / FPS;
        skia.render(evaluate(scene, mod.timeline, t));
        const skiaPixels = await skia.readPixels();
        const chromePixels = await browserPixels(name, t);
        const score = ssim(chromePixels, new Uint8ClampedArray(skiaPixels), 640, 360);
        // eslint-disable-next-line no-console
        console.log(`parity ${name} f${frame}: SSIM ${score.toFixed(5)}`);
        expect(score, `${name} frame ${frame}`).toBeGreaterThanOrEqual(floor);
      }
    }, 60_000);
  }
});

describe.runIf(!ENABLED)('browser↔Skia SSIM parity (skipped)', () => {
  it('set PARITY=1 with a Playwright chromium installed to run the parity suite', () => {
    expect(true).toBe(true);
  });
});
