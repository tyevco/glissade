/**
 * Scene font bridge (§3.6): collectTextUsages walks nested Text nodes and reads
 * the FULL text (not the reveal-masked prefix); validateSceneFonts wires the
 * node-walk to core's pure validation through a caller-supplied cmap loader,
 * strict-throwing / dev-warning. Plus: fontStyle:'italic' threads into FontSpec
 * and resolves the italic face.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFontRegistry, setDevWarning, timeline, FontValidationError } from '@glissade/core';
import { Group, Text } from '../src/nodes.js';
import { createScene } from '../src/scene.js';
import { collectTextUsages, validateSceneFonts } from '../src/fontUsage.js';
import type { DisplayListBuilder, FontSpec } from '../src/displayList.js';
import type { EvalContext } from '../src/node.js';
import type { TextMeasurer } from '../src/text.js';

afterEach(() => setDevWarning(() => {}));

const fixed: TextMeasurer = {
  measureText: (text, font) => ({ width: text.length * 10, ascent: font.size, descent: 0 }),
};

function emitFonts(node: Text): FontSpec[] {
  const fonts: FontSpec[] = [];
  const out = {
    push: (c: { op: string; font?: FontSpec }) => {
      if (c.op === 'fillText' && c.font) fonts.push(c.font);
    },
    resource: () => 0,
  } as unknown as DisplayListBuilder;
  const ctx: EvalContext = { time: 0, frame: -1, measurer: fixed };
  node.emit(out, ctx);
  return fonts;
}

describe('collectTextUsages', () => {
  it('walks nested Text and reads full text (reveal does not mask coverage)', () => {
    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [
        new Text({ text: 'Hello', fontFamily: 'Brand' }),
        new Group({ children: [new Text({ text: 'héllo 👋', fontFamily: 'Latin', reveal: 1 })] }),
      ],
    });
    const usages = collectTextUsages(scene);
    expect(usages).toEqual([
      { family: 'Brand', text: 'Hello' },
      { family: 'Latin', text: 'héllo 👋' }, // full text despite reveal:1
    ]);
  });

  it('skips empty Text nodes', () => {
    const scene = createScene({ size: { w: 10, h: 10 }, children: [new Text({ text: '' })] });
    expect(collectTextUsages(scene)).toEqual([]);
  });
});

describe('validateSceneFonts', () => {
  // a loader whose "bytes" we round-trip through parseCmap won't yield real
  // coverage, so instead we register a real font for the happy path and an
  // unregistered family for the strict-throw path.
  const noBytes = async (): Promise<ArrayBuffer | undefined> => undefined;

  it('strict throws on an unregistered non-generic family', async () => {
    const scene = createScene({
      size: { w: 10, h: 10 },
      children: [new Text({ text: 'Hi', fontFamily: 'Brand Sans' })],
    });
    const doc = timeline({});
    await expect(validateSceneFonts(scene, doc, noBytes, { mode: 'strict' })).rejects.toThrow(FontValidationError);
  });

  it('dev warns (does not throw) on an unregistered family and returns the report', async () => {
    const warn = vi.fn();
    setDevWarning(warn);
    const scene = createScene({
      size: { w: 10, h: 10 },
      children: [new Text({ text: 'Hi', fontFamily: 'Brand Sans' })],
    });
    const report = await validateSceneFonts(scene, timeline({}), noBytes, { mode: 'dev' });
    expect(report.unregistered).toEqual(['Brand Sans']);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('exempts an osFamilies (GlobalFonts/system) family — no unregistered warn', async () => {
    // mirrors render.ts: a family registered via GlobalFonts.registerFromPath or
    // OS-installed is passed in osFamilies (lower-cased) and must NOT warn, while
    // a genuinely-unregistered family in the SAME scene still does.
    const warn = vi.fn();
    setDevWarning(warn);
    const scene = createScene({
      size: { w: 10, h: 10 },
      children: [
        new Text({ text: 'Hi', fontFamily: 'DejaVu Sans' }), // exempt via osFamilies
        new Text({ text: 'Yo', fontFamily: 'Brand Sans' }), // genuinely unregistered
      ],
    });
    const report = await validateSceneFonts(scene, timeline({}), noBytes, {
      mode: 'dev',
      osFamilies: new Set(['dejavu sans']),
    });
    expect(report.unregistered).toEqual(['Brand Sans']); // DejaVu Sans exempted
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).not.toContain('DejaVu Sans');
  });

  it('default mode is dev (no throw) when option omitted', async () => {
    const scene = createScene({
      size: { w: 10, h: 10 },
      children: [new Text({ text: 'Hi', fontFamily: 'Brand Sans' })],
    });
    await expect(validateSceneFonts(scene, timeline({}), noBytes)).resolves.toBeDefined();
  });

  it('generic default-font Text never errors in strict', async () => {
    const scene = createScene({ size: { w: 10, h: 10 }, children: [new Text({ text: 'Hi' })] }); // sans-serif
    await expect(validateSceneFonts(scene, timeline({}), noBytes, { mode: 'strict' })).resolves.toBeDefined();
  });

  it('reports missing glyphs from a registered family via a stub cmap loader', async () => {
    // map url → covered code points; the loader hands parseCmap bytes encoding
    // ONLY a real font would parse, so we instead validate the pure path with a
    // fully-covered TTF in the export/cli integration. Here we assert the wiring
    // surfaces the registry + loader: a registered family with a loader that
    // returns malformed bytes yields empty coverage → every glyph missing.
    const doc = timeline({ assets: { Latin: { kind: 'font', url: 'latin.ttf' } } });
    const scene = createScene({
      size: { w: 10, h: 10 },
      children: [new Text({ text: 'Hi', fontFamily: 'Latin' })],
    });
    const loader = vi.fn(async (_url: string): Promise<ArrayBuffer | undefined> => new ArrayBuffer(4));
    const report = await validateSceneFonts(scene, doc, loader, { mode: 'dev' });
    expect(loader).toHaveBeenCalledWith('latin.ttf');
    expect(report.missingGlyphs[0]?.family).toBe('Latin');
    expect(report.missingGlyphs[0]?.codePoints).toEqual(['H'.codePointAt(0)!, 'i'.codePointAt(0)!]);
  });

  it('does not load fonts no Text references', async () => {
    const doc = timeline({ assets: { Unused: { kind: 'font', url: 'unused.ttf' } } });
    const scene = createScene({ size: { w: 10, h: 10 }, children: [new Text({ text: 'Hi' })] });
    const loader = vi.fn(async (): Promise<ArrayBuffer | undefined> => new ArrayBuffer(4));
    await validateSceneFonts(scene, doc, loader, { mode: 'dev' });
    expect(loader).not.toHaveBeenCalled();
  });
});

describe('fontStyle threads into FontSpec', () => {
  it('italic Text emits a fillText with style:italic', () => {
    const fonts = emitFonts(new Text({ text: 'x', fontStyle: 'italic', fontFamily: 'Brand' }));
    expect(fonts).toHaveLength(1);
    expect(fonts[0]!.style).toBe('italic');
  });

  it('default (normal) Text OMITS style — keeps existing goldens byte-identical', () => {
    const fonts = emitFonts(new Text({ text: 'x', fontFamily: 'Brand' }));
    expect(fonts).toHaveLength(1);
    expect('style' in fonts[0]!).toBe(false);
  });

  it('an italic face resolves through the registry for an italic usage', () => {
    const reg = buildFontRegistry({
      Brand: {
        kind: 'font',
        url: 'x',
        faces: [
          { url: 'reg.ttf', style: 'normal' },
          { url: 'ital.ttf', style: 'italic' },
        ],
      },
    });
    expect(reg.resolveFace('Brand', 400, 'italic')?.url).toBe('ital.ttf');
  });
});
