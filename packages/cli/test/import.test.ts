import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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

  it('imports the docs_text sample (ty:5 text) into a renderable scene module', async () => {
    // 0.46: text layers now import (ty:5 → Text node); docs_text is a real
    // bodymovin text sample, so it round-trips through gs import.
    const result = await importCommand({ input: docsText, out: outDir });
    expect(readFileSync(result.out, 'utf8')).toContain('new Text(');
    const mod = await loadSceneModule(result.out);
    expect(mod.createScene().nodes.size).toBeGreaterThan(0);
  });

  it('fails fast on rejected documents, listing the problems', async () => {
    // a precomp (ty:0) layer stays unsupported → the fail-fast audit rejects it
    const rejectPath = join(outDir, 'reject.json');
    writeFileSync(
      rejectPath,
      JSON.stringify({
        fr: 60,
        ip: 0,
        op: 60,
        w: 100,
        h: 100,
        layers: [{ ty: 0, nm: 'pre', ind: 0, ip: 0, op: 60, st: 0, ks: {}, refId: 'comp0' }],
      }),
    );
    await expect(importCommand({ input: rejectPath, out: outDir })).rejects.toThrow(
      /unsupported-layer-type/,
    );
  });

  it('imports a .svg into a renderable scene module, surfacing drop warnings', async () => {
    const svgPath = join(outDir, 'logo.svg');
    writeFileSync(
      svgPath,
      `<svg viewBox="0 0 120 80"><circle cx="60" cy="40" r="20" fill="#39f"/><text>x</text></svg>`,
    );
    const result = await importCommand({ input: svgPath, out: outDir });
    expect(result.out).toBe(join(outDir, 'logo.ts'));
    expect(result.warnings.some((w) => w.includes('<text>'))).toBe(true);
    expect(readFileSync(result.out, 'utf8')).toContain('importSvg');

    const mod = await loadSceneModule(result.out);
    const scene = mod.createScene();
    expect(scene.size).toEqual({ w: 120, h: 80 });
    expect(scene.nodes.size).toBeGreaterThan(0);
  });
});
