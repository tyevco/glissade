/**
 * Real-browser studio coverage (DESIGN.md §6.2/§6.3): the studio loads in
 * Chromium and a single keyframe-edit round-trip is driven — select a key, edit
 * its value through the KeyEditor, assert it both PERSISTED (a sidecar POST with
 * the new value) and RE-RENDERED (the editor reflects the committed value). The
 * dev server reuses the studio's OWN vite.config (React + glissade plugin +
 * examples-asset middleware) via configFile — never re-declared here. State is
 * read via testids + waitForFunction/Playwright auto-waiting; no sleeps.
 *
 * Gated behind STUDIO=1 (needs a Playwright chromium):
 *   STUDIO=1 pnpm vitest run packages/studio/test/studio-e2e.test.ts
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ENABLED = process.env['STUDIO'] === '1';

const STUDIO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCENES_DIR = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));

/** Sidecars the edit may write next to the corpus — removed in afterAll. */
function listSidecars(): string[] {
  return readdirSync(SCENES_DIR)
    .filter((f) => f.endsWith('.edits.json'))
    .map((f) => join(SCENES_DIR, f));
}

describe.runIf(ENABLED)('studio e2e: keyframe-edit round-trip in Chromium', () => {
  let server: import('vite').ViteDevServer;
  let browser: import('playwright-core').Browser;
  let page: import('playwright-core').Page;
  const preexisting = new Set(ENABLED ? listSidecars() : []);

  beforeAll(async () => {
    const { createServer } = await import('vite');
    // reuse the studio's own config (React plugin + glissade vite-plugin +
    // examples-asset middleware) — do NOT re-declare it
    server = await createServer({
      root: STUDIO_ROOT,
      configFile: join(STUDIO_ROOT, 'vite.config.ts'),
      server: { port: 0 },
      logLevel: 'silent',
    });
    await server.listen();
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
    page = await browser.newPage();
    const addrInfo = server.httpServer!.address();
    const port = typeof addrInfo === 'object' && addrInfo ? addrInfo.port : 0;
    await page.goto(`http://localhost:${port}/`);
    await page.locator('[data-testid="studio-root"]').waitFor();
    await page.locator('[data-testid="transport"]').waitFor();
    // the timeline keys render once the scene mounts
    await page.locator('[data-testid="timeline-key"]').first().waitFor();
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    // remove any sidecar this edit wrote, leaving pre-existing files alone
    if (ENABLED) {
      for (const f of listSidecars()) {
        if (!preexisting.has(f) && existsSync(f)) rmSync(f, { force: true });
      }
    }
  });

  it('editing a selected key persists a sidecar POST and re-renders the editor', async () => {
    // capture the sidecar POST the commit triggers (§6.2 debounced persistence)
    const posted = new Promise<string>((resolve) => {
      page.on('request', (req) => {
        if (req.method() === 'POST' && req.url().includes('/__glissade/sidecar')) {
          resolve(req.postData() ?? '');
        }
      });
    });

    // select a key → the KeyEditor strip appears with the value field
    await page.locator('[data-testid="timeline-key"]').first().click();
    const valueField = page.locator('[data-testid="keyeditor-value"]');
    await valueField.waitFor();

    // edit the value: focus, replace, blur → commit (Enter blurs the field)
    await valueField.click();
    await valueField.fill('123.5');
    await valueField.press('Enter');

    // PERSISTED: a sidecar POST fired carrying the new value
    const body = await posted;
    expect(body).toContain('123.5');

    // RE-RENDERED: re-selecting the edited key shows the committed value
    await page.locator('[data-testid="timeline-key"]').first().click();
    expect(await page.locator('[data-testid="keyeditor-value"]').inputValue()).toBe('123.5');
  }, 60_000);
});

describe.runIf(!ENABLED)('studio e2e (skipped)', () => {
  it('set STUDIO=1 with a Playwright chromium to run the studio browser suite', () => {
    expect(true).toBe(true);
  });
});
