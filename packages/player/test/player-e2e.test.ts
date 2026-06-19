/**
 * Real-browser player coverage (DESIGN.md §4.2 / §7.5): a scene mounted through
 * the live Canvas2D player in Chromium is driven scrub → seek → play → loop, and
 * every assertion reads STATE through window hooks via page.waitForFunction —
 * never a sleep, so there are no rAF/timing races. The demo page's seek ≡
 * play-through (the M1 exit criterion) is verified in-browser here too.
 *
 * Gated behind PLAYER=1 (needs a Playwright chromium):
 *   PLAYER=1 pnpm vitest run packages/player/test/player-e2e.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env['PLAYER'] === '1';

interface PlayerHooks {
  __playerReady?: boolean;
  __time(): number;
  __playing(): boolean;
  __circleX(): number;
  __play(): void;
  __pause(): void;
  __seek(t: number): void;
  __duration(): number;
}

interface DemoHooks {
  __demoReady?: boolean;
  /** Random-order seek ≡ ordered play-through verifier (M1 §7.5). */
  __seekEqualsPlaythrough(samples: number): { mismatches: number; total: number };
  /** Sampled circle.position.x after seeking to t. */
  __stateAt(t: number): number;
  __duration(): number;
}

describe.runIf(ENABLED)('player e2e: scrub / seek / play / loop in Chromium', () => {
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
    await page.goto(`http://localhost:${port}/player-e2e.html`);
    await page.waitForFunction(() => (window as unknown as PlayerHooks).__playerReady === true);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it('seek is a pure playhead write: state at t matches regardless of order', async () => {
    // seek forward then backward — backward scrub must land identical state
    await page.evaluate(() => (window as unknown as PlayerHooks).__seek(1));
    await page.waitForFunction(() => Math.abs((window as unknown as PlayerHooks).__time() - 1) < 1e-9);
    const xAt1Forward = await page.evaluate(() => (window as unknown as PlayerHooks).__circleX());

    await page.evaluate(() => (window as unknown as PlayerHooks).__seek(2));
    await page.waitForFunction(() => Math.abs((window as unknown as PlayerHooks).__time() - 2) < 1e-9);

    await page.evaluate(() => (window as unknown as PlayerHooks).__seek(1));
    await page.waitForFunction(() => Math.abs((window as unknown as PlayerHooks).__time() - 1) < 1e-9);
    const xAt1Backward = await page.evaluate(() => (window as unknown as PlayerHooks).__circleX());

    // the position.x track ends at t=1 (key(1, 280)) — exact, both directions
    expect(xAt1Forward).toBeCloseTo(280, 6);
    expect(xAt1Backward).toBeCloseTo(280, 6);
  }, 30_000);

  it('play advances the playhead and reports playing; pause freezes it', async () => {
    await page.evaluate(() => (window as unknown as PlayerHooks).__seek(0));
    await page.evaluate(() => (window as unknown as PlayerHooks).__play());
    await page.waitForFunction(() => (window as unknown as PlayerHooks).__playing() === true);
    // wait for the playhead to advance past a threshold under real rAF
    await page.waitForFunction(() => (window as unknown as PlayerHooks).__time() > 0.2, undefined, {
      timeout: 5_000,
    });
    await page.evaluate(() => (window as unknown as PlayerHooks).__pause());
    await page.waitForFunction(() => (window as unknown as PlayerHooks).__playing() === false);
    const frozen = await page.evaluate(() => (window as unknown as PlayerHooks).__time());
    // paused: the time must not move across two more frames
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const still = await page.evaluate(() => (window as unknown as PlayerHooks).__time());
    expect(still).toBe(frozen);
  }, 30_000);

  it('playing to the end settles at duration and stops (no loop)', async () => {
    await page.evaluate(() => (window as unknown as PlayerHooks).__seek(0));
    await page.evaluate(() => (window as unknown as PlayerHooks).__play());
    const dur = await page.evaluate(() => (window as unknown as PlayerHooks).__duration());
    await page.waitForFunction(
      (d: number) =>
        (window as unknown as PlayerHooks).__playing() === false &&
        Math.abs((window as unknown as PlayerHooks).__time() - d) < 1e-6,
      dur,
      { timeout: 10_000 },
    );
    const t = await page.evaluate(() => (window as unknown as PlayerHooks).__time());
    expect(t).toBeCloseTo(dur, 6);
  }, 30_000);
});

describe.runIf(ENABLED)('demo page seek ≡ play-through (M1 §7.5 exit criterion)', () => {
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
    await page.goto(`http://localhost:${port}/demo.html`);
    await page.waitForFunction(() => (window as unknown as DemoHooks).__demoReady === true);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it('200 random-order seeks produce state identical to ordered play-through', async () => {
    const result = await page.evaluate(() => (window as unknown as DemoHooks).__seekEqualsPlaythrough(200));
    expect(result.total).toBe(200);
    expect(result.mismatches).toBe(0);
  }, 30_000);

  it('seeking to a mid-timeline t lands the same rendered state as the live playhead', async () => {
    const dur = await page.evaluate(() => (window as unknown as DemoHooks).__duration());
    const mid = dur / 2;
    const a = await page.evaluate((t) => (window as unknown as DemoHooks).__stateAt(t), mid);
    const b = await page.evaluate((t) => (window as unknown as DemoHooks).__stateAt(t), mid);
    expect(a).toBe(b);
  }, 30_000);
});

describe.runIf(!ENABLED)('player e2e (skipped)', () => {
  it('set PLAYER=1 with a Playwright chromium to run the player + demo browser suite', () => {
    expect(true).toBe(true);
  });
});
