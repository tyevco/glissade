/**
 * @glissade/core/font-ingest — the font INGESTION front door (DESIGN.md §3.6).
 *
 * Exercises the byte work that runs ONCE at ingest/prepare time (never inside
 * evaluate()): magic-byte sniffing across the sfnt/woff families, woff2 → sfnt
 * decode, STATIC variable-axis instancing → a content-hashed static face,
 * cmap coverage + `covers(text)`, and the fluent `font()` builder.
 *
 * The Inconsolata fixtures live in @glissade/examples/assets/fonts: the variable
 * source and its committed wght:600 instance — the SAME static sfnt the golden
 * corpus rasterizes, so the determinism contract is asserted end to end here.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ingestFont,
  registerFont,
  buildFontPlan,
  sniffFontFormat,
  font,
  FontStore,
  FontIngestError,
} from '../src/font-ingest.js';

const FONT_DIR = new URL('../../examples/assets/fonts/', import.meta.url);
const readFont = (name: string) => readFile(fileURLToPath(new URL(name, FONT_DIR)));

// Build a 4-byte buffer carrying a given big-endian magic tag, for sniff tests.
function magic(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

describe('sniffFontFormat (magic bytes)', () => {
  it('recognizes the sfnt + woff families', () => {
    expect(sniffFontFormat(magic(0x00, 0x01, 0x00, 0x00))).toBe('truetype'); // 0x00010000
    expect(sniffFontFormat(magic(0x74, 0x72, 0x75, 0x65))).toBe('truetype'); // 'true'
    expect(sniffFontFormat(magic(0x4f, 0x54, 0x54, 0x4f))).toBe('opentype'); // 'OTTO'
    expect(sniffFontFormat(magic(0x74, 0x74, 0x63, 0x66))).toBe('collection'); // 'ttcf'
    expect(sniffFontFormat(magic(0x77, 0x4f, 0x46, 0x46))).toBe('woff'); // 'wOFF'
    expect(sniffFontFormat(magic(0x77, 0x4f, 0x46, 0x32))).toBe('woff2'); // 'wOF2'
  });

  it('throws on a non-font and on too-short input', () => {
    expect(() => sniffFontFormat(magic(0x89, 0x50, 0x4e, 0x47))).toThrow(FontIngestError); // PNG
    expect(() => sniffFontFormat(magic(0x00, 0x01))).toThrow(/too short/);
  });

  it('sniffs the real variable ttf fixture as truetype', async () => {
    expect(sniffFontFormat(await readFont('Inconsolata-Variable.ttf'))).toBe('truetype');
  });
});

describe('ingestFont — plain ttf fast path (no wasm)', () => {
  it('passes a plain ttf straight through and parses its coverage', async () => {
    const src = await readFont('Inconsolata-wght600.ttf');
    const res = await ingestFont({ family: 'Inconsolata Semibold', src });
    expect(res.sourceFormat).toBe('truetype');
    // a plain ttf with no axes is used as-is: bytes are the source verbatim.
    expect(Buffer.from(res.bytes).equals(src)).toBe(true);
    expect(res.coverage.size).toBeGreaterThan(200);
    expect(res.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('covers()/missing() reflect the parsed cmap', async () => {
    const res = await ingestFont({ family: 'F', src: await readFont('Inconsolata-wght600.ttf') });
    expect(res.covers('wght 600 instanced 0123')).toBe(true);
    // an astral emoji is not in a monospace text face → reported missing.
    expect(res.covers('👋')).toBe(false);
    expect(res.missing('A👋B')).toEqual([0x1f44b]);
  });
});

describe('ingestFont — static variable-axis instancing', () => {
  it('instances the variable source to the committed static sfnt, byte-for-byte', async () => {
    const variable = await readFont('Inconsolata-Variable.ttf');
    const committed = await readFont('Inconsolata-wght600.ttf');
    const res = await ingestFont({
      family: 'Inconsolata Semibold',
      src: variable,
      axes: { wght: 600, wdth: 100 },
    });
    // the front door's determinism contract: the same source + axis tuple yields
    // a byte-identical static sfnt — exactly the committed golden fixture.
    expect(res.sourceFormat).toBe('truetype');
    expect(Buffer.from(res.bytes).equals(committed)).toBe(true);
    expect(res.covers('wght 600 instanced 0123')).toBe(true);
  });

  it('is reproducible: two ingests of the same input hash identically', async () => {
    const variable = await readFont('Inconsolata-Variable.ttf');
    const a = await ingestFont({ family: 'F', src: variable, axes: { wght: 600 } });
    const b = await ingestFont({ family: 'F', src: variable, axes: { wght: 600 } });
    expect(a.hash).toBe(b.hash);
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });
});

describe('registerFont + FontStore', () => {
  it('records the ingested face under its family with weight/style/fallback', async () => {
    const store = new FontStore();
    const face = await registerFont(
      {
        family: 'Inconsolata Semibold',
        src: await readFont('Inconsolata-wght600.ttf'),
        weight: 600,
        fallback: ['monospace'],
      },
      store,
    );
    expect(face.weight).toBe(600);
    expect(store.families()).toEqual(['Inconsolata Semibold']);
    expect(store.facesOf('Inconsolata Semibold')).toHaveLength(1);
    expect(store.fallbackOf('Inconsolata Semibold')).toEqual(['monospace']);
    expect(store.all()).toHaveLength(1);
    // faceRef() bridges back into a serializable Timeline AssetRef face.
    expect(face.faceRef('fonts/x.ttf')).toEqual({ url: 'fonts/x.ttf', weight: 600 });
  });
});

describe('font() builder', () => {
  it('assembles a pure plan; .weights() fans one src into per-weight entries', () => {
    const plan = font('Inter').src('Inter.ttf').weights([400, 600, 700]).fallback(['Arial']).build();
    expect(plan.family).toBe('Inter');
    expect(plan.fallback).toEqual(['Arial']);
    expect(plan.variable).toBe(false);
    expect(plan.sources).toEqual([
      { path: 'Inter.ttf', weight: 400 },
      { path: 'Inter.ttf', weight: 600 },
      { path: 'Inter.ttf', weight: 700 },
    ]);
  });

  it('marks a variable plan and pins axes; explicit per-src weights survive .weights()', () => {
    const plan = font('InterVar').src('InterVar.woff2').variable().axis('wght', 600).build();
    expect(plan.variable).toBe(true);
    expect(plan.axes).toEqual({ wght: 600 });
    expect(plan.sources).toEqual([{ path: 'InterVar.woff2' }]);

    const explicit = font('F').src('a.ttf', { weight: 400 }).weights([700]).build();
    expect(explicit.sources).toEqual([{ path: 'a.ttf', weight: 400 }]);
  });
});

describe('buildFontPlan', () => {
  it('ingests every source via the plan, attaching family fallback once', async () => {
    const plan = font('Inconsolata Semibold')
      .src('Inconsolata-Variable.ttf')
      .variable()
      .axis('wght', 600)
      .axis('wdth', 100)
      .fallback(['monospace'])
      .build();
    const store = new FontStore();
    const faces = await buildFontPlan(plan, (p) => readFont(p), store);
    expect(faces).toHaveLength(1);
    // the instanced face equals the committed golden sfnt.
    expect(Buffer.from(faces[0]!.bytes).equals(await readFont('Inconsolata-wght600.ttf'))).toBe(true);
    expect(store.fallbackOf('Inconsolata Semibold')).toEqual(['monospace']);
  });

  it('throws when a source has neither a path nor bytes', async () => {
    const plan = font('F').build();
    plan.sources.push({});
    await expect(buildFontPlan(plan, async () => new Uint8Array())).rejects.toThrow(FontIngestError);
  });
});
