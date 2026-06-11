import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { dev, type DevServer } from '../src/dev.js';

// the real examples module: its directory resolves @glissade/* through the workspace
const MODULE = fileURLToPath(new URL('../../examples/src/scenes/interactive-button.ts', import.meta.url));
const SIDE_CAR = fileURLToPath(new URL('../../examples/src/scenes/interactive-button.button.take1.trace.json', import.meta.url));

let server: DevServer | null = null;
afterAll(async () => {
  await server?.close();
  rmSync(SIDE_CAR, { force: true });
});

describe('gs dev (§C.5): the walkable capture path', () => {
  it('serves the page, a bundled harness, and writes trace sidecars on POST', { timeout: 60_000 }, async () => {
    server = await dev({ modulePath: MODULE, record: true });
    const base = `http://localhost:${server.port}`;

    const html = await (await fetch(base)).text();
    expect(html).toContain('<canvas id="stage">');
    expect(html).toContain('id="rec"'); // --record: the Record button exists

    const js = await (await fetch(`${base}/bundle.js`)).text();
    expect(js).toContain('createMachine'); // interact bundled in
    expect(js).toContain('recordTrace');
    expect(js.length).toBeGreaterThan(10_000); // really bundled, not the raw harness

    const trace = { version: 1, machineHash: 'abc', fps: 60, initialInputs: {}, events: [] };
    const res = await fetch(`${base}/__trace`, {
      method: 'POST',
      body: JSON.stringify([{ id: 'button', trace }]),
    });
    const body = (await res.json()) as { saved: string[] };
    expect(body.saved).toEqual(['interactive-button.button.take1.trace.json']);
    expect(existsSync(SIDE_CAR)).toBe(true);
    expect(JSON.parse(readFileSync(SIDE_CAR, 'utf8'))).toEqual(trace);
  });
});
