/**
 * `gs types --global` (0.47) — the SELF-CONTAINED ambient window.glissade `.d.ts`
 * generator. Structural (the global augmentation + key surface members), determinism
 * (byte-identical ×2), and a REAL tsc-compile proof: the emitted d.ts type-checks a
 * `<script>`-style `window.glissade.Rect(…)` / `glissade.timeline(…)` sample, and a
 * typo'd member (`glissade.Reet`) is a compile error.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { describe as realDescribe } from '@glissade/scene/describe';
import { generateAmbientDts } from '../src/typedSdk.js';

const manifest = realDescribe();
const src = generateAmbientDts(manifest);

describe('generateAmbientDts — structure', () => {
  it('emits a self-contained global augmentation (no imports)', () => {
    expect(src).toContain('export {};');
    expect(src).toContain('declare global {');
    expect(src).toContain('interface Window {');
    expect(src).toContain('glissade: GlissadeGlobal;');
    expect(src).toContain('const glissade: GlissadeGlobal;');
    // self-contained: no `import`/`typeof import(...)` (the no-build author has no node_modules)
    expect(src).not.toMatch(/\bimport\s*\(/);
    expect(src).not.toMatch(/^import\b/m);
  });

  it('types the headline surface members (node constructors need `new`, authoring calls have real-ish signatures)', () => {
    expect(src).toContain('"Rect": new (props?: GsRectProps) => GsNode;');
    expect(src).toContain('"Text": new (props?: GsTextProps) => GsNode;');
    expect(src).toContain('"timeline": (build: (tl: GsTimelineBuilder) => void) => GsTimeline;');
    expect(src).toContain('"createScene": (spec: { size: { w: number; h: number }; children: GsNode[] }) => GsScene;');
    expect(src).toContain('"easings": Record<string, unknown>;');
    // a factory (Stack) and a helper (motionPath) are best-effort callables, present by name
    expect(src).toContain('"Stack":');
    expect(src).toContain('"motionPath":');
  });

  it('reuses the manifest value types for node construction props (vec2→tuple, color|paint→string|GsPaint)', () => {
    expect(src).toContain('"position"?: readonly [number, number];');
    expect(src).toContain('"fill"?: string | GsPaint;');
    expect(src).toContain('"width"?: number;');
  });

  it('is deterministic — same manifest → byte-identical output', () => {
    expect(generateAmbientDts(manifest)).toBe(src);
  });
});

describe('generateAmbientDts — tsc compile proof', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gs-ambient-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const compile = (consumer: string): string[] => {
    writeFileSync(join(dir, 'glissade.d.ts'), src);
    writeFileSync(join(dir, 'consumer.ts'), consumer);
    const program = ts.createProgram([join(dir, 'glissade.d.ts'), join(dir, 'consumer.ts')], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      exactOptionalPropertyTypes: true,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      types: [],
    });
    return ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName.endsWith('consumer.ts'))
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  };

  it('a good <script>-style consumer type-checks CLEAN', () => {
    const good = compile(`/// <reference path="./glissade.d.ts" />
const r = new window.glissade.Rect({ width: 100, height: 100, fill: '#f00', position: [10, 20] });
const s = window.glissade.createScene({ size: { w: 640, h: 360 }, children: [r] });
glissade.timeline((tl) => { tl.to('rect/opacity', 1).fromTo('rect/x', 0, 1); });
glissade.track('rect/opacity', 'number', []);
new glissade.Text({ text: 'hi', fontSize: 40 });
`);
    expect(good).toEqual([]);
  });

  it('a typo\'d member is a COMPILE error', () => {
    const bad = compile(`/// <reference path="./glissade.d.ts" />
glissade.Reet({});
window.glissade.notAThing();
`);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.join('\n')).toMatch(/Reet/);
    expect(bad.join('\n')).toMatch(/notAThing/);
  });
});
