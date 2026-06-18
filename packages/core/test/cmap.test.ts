/**
 * cmap reader (§3.6): parse a real TTF and confirm covered/uncovered code
 * points. DejaVuSans is a broad Latin font — ASCII + accented Latin present,
 * the waving-hand emoji (U+1F44B) absent. Malformed input must yield an empty
 * set without throwing or hanging.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCmap } from '../src/index.js';

const DEJAVU = fileURLToPath(new URL('../../examples/assets/fonts/DejaVuSans.ttf', import.meta.url));

function bytesOf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('parseCmap', () => {
  const cov = parseCmap(bytesOf(DEJAVU));

  it('covers ASCII and accented Latin', () => {
    for (const ch of 'Hello héllo Wörld ¿') {
      expect(cov.has(ch.codePointAt(0)!)).toBe(true);
    }
    expect(cov.has('A'.codePointAt(0)!)).toBe(true);
    expect(cov.has('é'.codePointAt(0)!)).toBe(true); // U+00E9
  });

  it('does NOT cover the waving-hand emoji (U+1F44B) in a non-emoji font', () => {
    expect(cov.has(0x1f44b)).toBe(false);
  });

  it('returns a non-trivial coverage set', () => {
    expect(cov.size).toBeGreaterThan(100);
  });

  it('malformed bytes → empty set, never throws or hangs', () => {
    expect(parseCmap(new ArrayBuffer(0)).size).toBe(0);
    expect(parseCmap(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer).size).toBe(0);
    // garbage that claims many tables but has no real data
    const junk = new Uint8Array(64);
    junk[4] = 0xff; // numTables = high
    junk[5] = 0xff;
    expect(parseCmap(junk.buffer).size).toBe(0);
  });

  it('a truncated format-12 subtable with a huge nGroups completes instantly (§finding-2, no hang)', () => {
    // a minimal sfnt whose best subtable is format 12 declaring 2^31 groups but
    // carrying ZERO group bytes — without the clamp this loops ~2.1B times (~26s)
    const buf = new ArrayBuffer(56);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x00010000); // sfntVersion
    dv.setUint16(4, 1); // numTables
    dv.setUint32(12, 0x636d6170); // table tag 'cmap'
    dv.setUint32(20, 28); // → cmap table offset
    dv.setUint32(24, 28); // length
    dv.setUint16(28, 0); // cmap version
    dv.setUint16(30, 1); // numSubtables
    dv.setUint16(32, 3); // platform Windows
    dv.setUint16(34, 10); // encoding UCS-4 (best score → format 12 path)
    dv.setUint32(36, 12); // subtable offset relative to cmap table → 40
    dv.setUint16(40, 12); // format 12
    dv.setUint32(44, 1_000_000); // claimed length
    dv.setUint32(52, 0x7fffffff); // nGroups = ~2.1 billion, but buffer ends here
    const start = performance.now();
    expect(parseCmap(buf).size).toBe(0);
    expect(performance.now() - start).toBeLessThan(100); // clamped, not looping billions of times
  });
});
