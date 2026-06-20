/**
 * woff2 DECODE coverage (0.13, DsW-aD_OUMoV item 1) — the named Fontsource pain.
 *
 * Before this, no woff2 bytes existed in the repo, so the font-ingest woff2
 * subpath (`fontIngest.ts`: sniff woff2 magic → fontverter decode to sfnt →
 * parseCmap) was UNexercised. This wires the committed `Inconsolata-wght600.woff2`
 * fixture (a woff2 of the in-repo OFL `Inconsolata-wght600.ttf`) through
 * `registerFont`/`ingestFont` and asserts the decode-correctness gate:
 *
 *   - the covered code-point SET equals the round-trip-validated fixture
 *     (`Inconsolata-wght600.parseCmap.json`: 882 codepoints / 128 ranges) incl.
 *     the spot-checks (U+0020 / U+0041 / U+0061 / U+0030), and
 *   - the decoded sfnt is BYTE-STABLE run-to-run (decode-once-at-ingest, never
 *     in evaluate) — the determinism contract for the decode path.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ingestFont, registerFont, sniffFontFormat } from '../src/font-ingest.js';

const FONT_DIR = new URL('../../examples/assets/fonts/', import.meta.url);
const readFont = (name: string) => readFile(fileURLToPath(new URL(name, FONT_DIR)));
const fontPath = (name: string) => fileURLToPath(new URL(name, FONT_DIR));

const WOFF2 = 'Inconsolata-wght600.woff2';

/** The committed, fonttools+brotli round-trip-validated coverage expectation. */
interface CmapFixture {
  covered: number;
  rangeCount: number;
  ranges: [string, string][];
  spotChecks: Record<string, boolean>;
}

async function loadFixture(): Promise<CmapFixture> {
  const raw = await readFile(fileURLToPath(new URL('Inconsolata-wght600.parseCmap.json', FONT_DIR)), 'utf8');
  return JSON.parse(raw) as CmapFixture;
}

/** `U+1F44B` → 0x1f44b. */
function parseCodePoint(s: string): number {
  return parseInt(s.replace(/^U\+/, ''), 16);
}

/** Collapse a sorted code-point set into the fixture's `["U+XXXX","U+YYYY"]` ranges. */
function toRanges(coverage: ReadonlySet<number>): [number, number][] {
  const cps = [...coverage].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  if (cps.length === 0) return ranges;
  let start = cps[0]!;
  let prev = cps[0]!;
  for (let i = 1; i < cps.length; i++) {
    const cp = cps[i]!;
    if (cp === prev + 1) {
      prev = cp;
    } else {
      ranges.push([start, prev]);
      start = cp;
      prev = cp;
    }
  }
  ranges.push([start, prev]);
  return ranges;
}

describe('woff2 decode — magic sniff', () => {
  it('sniffs the committed woff2 fixture as woff2', async () => {
    expect(sniffFontFormat(await readFont(WOFF2))).toBe('woff2');
  });
});

describe('woff2 decode — coverage matches the validated fixture', () => {
  it('ingestFont(woff2) decodes to sfnt and parseCmap equals the fixture covered SET', async () => {
    const fixture = await loadFixture();
    const res = await ingestFont({ family: 'Inconsolata WOFF2', src: fontPath(WOFF2) });

    // the woff2 subpath actually ran (sniff → fontverter decode → parseCmap).
    expect(res.sourceFormat).toBe('woff2');

    // exact covered-count match (882) — a stripped cmap would be ~0 (the bug).
    expect(res.coverage.size).toBe(fixture.covered);

    // the collapsed coverage ranges equal the round-trip-validated fixture,
    // range-for-range (128 ranges). This is the decode-correctness gate.
    const expectedRanges = fixture.ranges.map(([a, b]) => [parseCodePoint(a), parseCodePoint(b)] as [number, number]);
    expect(toRanges(res.coverage)).toEqual(expectedRanges);
    expect(expectedRanges).toHaveLength(fixture.rangeCount);

    // and as a literal set membership check across every range (belt + braces).
    for (const [lo, hi] of expectedRanges) {
      for (let cp = lo; cp <= hi; cp++) expect(res.coverage.has(cp)).toBe(true);
    }
  });

  it('covers the fixture spot-checks (U+0020 / U+0041 A / U+0061 a / U+0030 0)', async () => {
    const fixture = await loadFixture();
    const res = await ingestFont({ family: 'Inconsolata WOFF2', src: fontPath(WOFF2) });
    for (const [label, expected] of Object.entries(fixture.spotChecks)) {
      // the label is "U+0041 A" etc — the code point is the first token.
      const cp = parseCodePoint(label.split(/\s+/)[0]!);
      expect(res.coverage.has(cp)).toBe(expected);
    }
    // the same coverage flows through covers()/missing() (the build-time predicate).
    expect(res.covers(' Aa0')).toBe(true);
    // an astral emoji is not in this monospace text face.
    expect(res.covers('👋')).toBe(false);
  });

  it('registerFont(woff2) records the decoded face with non-empty coverage', async () => {
    const fixture = await loadFixture();
    const face = await registerFont({ family: 'Inconsolata WOFF2', src: fontPath(WOFF2) });
    expect(face.sourceFormat).toBe('woff2');
    expect(face.coverage.size).toBe(fixture.covered);
    // the decoded bytes are an sfnt (0x00010000), NOT woff2 (wOF2) — the decode
    // happened, so Skia/GlobalFonts can consume `face.bytes` directly.
    expect([...face.bytes.slice(0, 4)]).toEqual([0x00, 0x01, 0x00, 0x00]);
  });
});

describe('woff2 decode — the public registerFont({ src }) byte contract (ai-training)', () => {
  // The path form (above) hands fontverter a node Buffer (readFile), which masked
  // the bug: `registerFont({ src })` normalizes src to a PLAIN Uint8Array (asUint8),
  // and fontverter@2.x sniffs the magic via Buffer.toString — which a plain
  // Uint8Array doesn't honor → 'Unrecognized font signature' on EVERY real consumer
  // (a Fontsource Inter woff2 AND our own fixture). These feed the broken shapes.
  it('decodes a plain Uint8Array src (not a Buffer) to the full coverage', async () => {
    const fixture = await loadFixture();
    const bytes = new Uint8Array(await readFont(WOFF2)); // a PLAIN Uint8Array, not a Buffer
    expect(bytes.constructor).toBe(Uint8Array);
    const res = await ingestFont({ family: 'Inconsolata WOFF2 (u8)', src: bytes });
    expect(res.sourceFormat).toBe('woff2');
    expect(res.coverage.size).toBe(fixture.covered); // was 0 (throw) before the Buffer.from fix
    expect([...res.bytes.slice(0, 4)]).toEqual([0x00, 0x01, 0x00, 0x00]); // decoded sfnt
  });

  it('decodes an ArrayBuffer src to the full coverage', async () => {
    const fixture = await loadFixture();
    const buf = await readFont(WOFF2);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); // a real ArrayBuffer
    const res = await registerFont({ family: 'Inconsolata WOFF2 (ab)', src: ab });
    expect(res.coverage.size).toBe(fixture.covered);
  });
});

describe('woff2 decode — byte-stable sfnt (determinism contract)', () => {
  it('decoding the same woff2 twice yields byte-identical sfnt bytes (sha256)', async () => {
    const a = await ingestFont({ family: 'F', src: fontPath(WOFF2) });
    const b = await ingestFont({ family: 'F', src: fontPath(WOFF2) });
    // decode-once-at-ingest must be a pure function of the input bytes.
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
    const ha = createHash('sha256').update(a.bytes).digest('hex');
    const hb = createHash('sha256').update(b.bytes).digest('hex');
    expect(ha).toBe(hb);
    // the FNV content hash (the cache/identity key) is stable for equal input too.
    expect(a.hash).toBe(b.hash);
  });
});
