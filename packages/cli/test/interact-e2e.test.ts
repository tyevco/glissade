/**
 * The §C.5 loop, end to end: a real pointer session in Chromium is recorded,
 * the trace bakes BIT-IDENTICALLY in the browser and in Node (engine-pinned
 * determinism, §B.5), and `gs render --trace` consumes the same take through
 * the full Skia pipeline. Gated behind INTERACT=1 (needs Playwright chromium).
 */

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bakeTrace, createMachine, type InputTrace } from '@glissade/interact';

const ENABLED = process.env['INTERACT'] === '1';
const MODULE = fileURLToPath(new URL('../../examples/src/scenes/interactive-button.ts', import.meta.url));

interface Hooks {
  __interactReady?: boolean;
  __state(): string;
  __stopTrace(): InputTrace;
  __bakeHere(trace: InputTrace): string;
}

describe.runIf(ENABLED)('interact e2e: record in Chromium → bake → gs render --trace', () => {
  let server: import('vite').ViteDevServer;
  let browser: import('playwright-core').Browser;
  let page: import('playwright-core').Page;
  const outDir = mkdtempSync(join(tmpdir(), 'glissade-interact-e2e-'));

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
    await page.goto(`http://localhost:${port}/interact.html`);
    await page.waitForFunction(() => (window as unknown as Hooks).__interactReady === true);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    rmSync(outDir, { recursive: true, force: true });
  });

  it('a real hover/press session drives the machine through its states', async () => {
    // the harness canvas sits at (0,0) at 1:1, so client coords are scene coords;
    // the button is a radius-30 circle at (160, 90)
    await page.mouse.move(300, 20);
    await page.mouse.move(160, 90, { steps: 5 });
    await page.waitForFunction(() => (window as unknown as Hooks).__state() === 'hover');
    await page.mouse.down();
    await page.mouse.up(); // release over the button → click → fire('press')
    await page.waitForFunction(() => (window as unknown as Hooks).__state() === 'tap');
    await page.mouse.move(300, 20, { steps: 3 }); // leave before tap finishes
    await page.waitForFunction(() => (window as unknown as Hooks).__state() === 'idle', undefined, {
      timeout: 5_000,
    });
  }, 30_000);

  it('the trace bakes bit-identically in Chromium and Node, and gs render consumes it', async () => {
    const trace = await page.evaluate(() => (window as unknown as Hooks).__stopTrace());
    expect(trace.version).toBe(1);
    expect(trace.events.some((e) => 'input' in e && e.input === 'hovered' && e.value === true)).toBe(true);
    expect(trace.events.some((e) => 'fire' in e && e.fire === 'press')).toBe(true);

    // golden-compare: the live page bakes its own replay; Node bakes the same
    // trace through a fresh machine — same engine family, bit-identical floats
    const pageBaked = await page.evaluate((tr) => (window as unknown as Hooks).__bakeHere(tr), trace);
    const mod = (await import('../../examples/src/scenes/interactive-button.js')).default;
    const scene = mod.createScene();
    const machine = createMachine(mod.machines[0]!.doc, { resolve: (t) => scene.resolveTarget(t) });
    const nodeBaked = JSON.stringify(bakeTrace(machine, trace));
    expect(nodeBaked).toBe(pageBaked);

    // and the CLI route: gs render --trace on the SAME module + take
    const tracePath = join(outDir, 'take.trace.json');
    writeFileSync(tracePath, JSON.stringify(trace));
    const { render } = await import('../src/render.js');
    const framesDir = join(outDir, 'frames');
    const result = await render({
      modulePath: MODULE,
      out: framesDir,
      fps: 30,
      range: [0, 0.5],
      trace: tracePath,
    });
    expect(result.frames).toBe(15);
    expect(readdirSync(framesDir).filter((f) => f.endsWith('.png')).length).toBe(15);
  }, 120_000);
});
