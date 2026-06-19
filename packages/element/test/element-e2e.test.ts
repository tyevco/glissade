/**
 * Real-browser <gs-player> coverage (DESIGN.md §4.3 / §8, UWKP's FINAL DOM):
 * Chromium drives the element's controls — clicks play/pause, sets the scrubber,
 * reads the time readout — and asserts that an element WITHOUT `controls` renders
 * zero controls DOM (the lazy-construct behavior). State is read off the
 * element's `.player` via window hooks + page.waitForFunction; no sleeps.
 *
 * Assertions stay on vitest `expect` over values read from the page (locator
 * getters / page.evaluate), matching the existing browser-suite convention
 * (parity / export / interact) rather than @playwright/test matchers.
 *
 * Gated behind ELEMENT=1 (needs a Playwright chromium):
 *   ELEMENT=1 pnpm vitest run packages/element/test/element-e2e.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env['ELEMENT'] === '1';

interface ElementHooks {
  __elementReady?: boolean;
  __elTime(): number;
  __elPlaying(): boolean;
  __elDuration(): number;
}

describe.runIf(ENABLED)('<gs-player> e2e: controls in Chromium', () => {
  let server: import('vite').ViteDevServer;
  let browser: import('playwright-core').Browser;
  let page: import('playwright-core').Page;

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
    const addrInfo = server.httpServer!.address();
    const port = typeof addrInfo === 'object' && addrInfo ? addrInfo.port : 0;
    await page.goto(`http://localhost:${port}/element-e2e.html`);
    await page.waitForFunction(() => (window as unknown as ElementHooks).__elementReady === true);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  // Playwright locators pierce open shadow roots, so the part-attributed
  // controls in the element's shadow DOM are reachable by their final selectors.
  const button = () => page.locator('#withControls').locator('button[part="button"]');
  const scrubber = () => page.locator('#withControls').locator('input[part="scrubber"]');

  it('renders the FINAL controls DOM: button / scrubber / time with the locked a11y', async () => {
    expect(await button().getAttribute('aria-label')).toBe('Play or pause');
    expect(await scrubber().getAttribute('type')).toBe('range');
    expect(await scrubber().getAttribute('aria-label')).toBe('Seek');
    expect(await page.locator('#withControls').locator('span[part="time"]').count()).toBe(1);
  }, 30_000);

  it('click play/pause toggles playback and the button label', async () => {
    expect(await button().textContent()).toBe('Play');
    await button().click();
    await page.waitForFunction(() => (window as unknown as ElementHooks).__elPlaying() === true);
    expect(await button().textContent()).toBe('Pause');
    // advance under real rAF, then pause
    await page.waitForFunction(() => (window as unknown as ElementHooks).__elTime() > 0.1, undefined, {
      timeout: 5_000,
    });
    await button().click();
    await page.waitForFunction(() => (window as unknown as ElementHooks).__elPlaying() === false);
    expect(await button().textContent()).toBe('Play');
  }, 30_000);

  it('the scrubber seeks: setting it to 0.5 moves the playhead to half the duration', async () => {
    // setting a range input's value + dispatching input mirrors a user drag for
    // the element's onInput handler (which seeks to value * duration)
    await scrubber().fill('0.5');
    await scrubber().dispatchEvent('input');
    const dur = await page.evaluate(() => (window as unknown as ElementHooks).__elDuration());
    await page.waitForFunction(
      (d: number) => Math.abs((window as unknown as ElementHooks).__elTime() - d * 0.5) < 1e-3,
      dur,
      { timeout: 5_000 },
    );
    const t = await page.evaluate(() => (window as unknown as ElementHooks).__elTime());
    expect(t).toBeCloseTo(dur * 0.5, 2);
  }, 30_000);

  it('an element WITHOUT `controls` renders zero controls DOM (UWKP lazy behavior)', async () => {
    // no .controls subtree, no button/scrubber/time anywhere in its shadow root
    expect(await page.locator('#noControls').locator('div[part="controls"]').count()).toBe(0);
    expect(await page.locator('#noControls').locator('button[part="button"]').count()).toBe(0);
    expect(await page.locator('#noControls').locator('input[part="scrubber"]').count()).toBe(0);
    // but it still mounted a player (the canvas part is always present)
    expect(await page.locator('#noControls').locator('canvas[part="canvas"]').count()).toBe(1);
  }, 30_000);
});

describe.runIf(!ENABLED)('<gs-player> e2e (skipped)', () => {
  it('set ELEMENT=1 with a Playwright chromium to run the element browser suite', () => {
    expect(true).toBe(true);
  });
});
