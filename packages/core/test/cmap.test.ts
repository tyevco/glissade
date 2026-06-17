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
});
