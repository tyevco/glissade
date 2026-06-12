import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTimeline } from '@glissade/core';
import { importCommand } from '../src/import.js';
import { loadSceneModule } from '../src/render.js';

// generated modules import '@glissade/scene'; a tempdir INSIDE the package
// keeps node-modules resolution working for jiti
const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = mkdtempSync(join(here, '.tmp-import-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const gatin = fileURLToPath(new URL('../../lottie/test/fixtures/gatin.json', import.meta.url));
const docsText = fileURLToPath(new URL('../../lottie/test/fixtures/docs_text.json', import.meta.url));

describe('gs import', () => {
  it('writes a scene module that loadSceneModule (the gs render loader) accepts', async () => {
    const result = await importCommand({ input: gatin, out: outDir });
    expect(result.out).toBe(join(outDir, 'gatin.ts'));
    expect(result.warnings).toEqual([]);
    expect(readFileSync(result.out, 'utf8')).toContain('satisfies SceneModule');

    const mod = await loadSceneModule(result.out);
    const scene = mod.createScene();
    expect(scene.size).toEqual({ w: 800, h: 800 });
    expect(scene.nodes.size).toBeGreaterThan(0);
    expect(scene.resolveTarget('movCabza/position')).toBeDefined();
    const compiled = compileTimeline(mod.timeline);
    expect(compiled.duration).toBeCloseTo(3.2, 10);
  });

  it('fails fast on rejected documents, listing the problems', async () => {
    await expect(importCommand({ input: docsText, out: outDir })).rejects.toThrow(
      /unsupported-layer-type/,
    );
  });
});
