/**
 * Minimal sfnt `cmap` reader (DESIGN.md §3.6 glyph-coverage check) — pure,
 * byte-only, ZERO DOM / ZERO Node. Given the raw bytes of a TrueType/OpenType
 * (or the first table of a TTC) font, returns the set of Unicode code points
 * the font claims to cover. I/O (reading the file / fetching the URL) happens
 * at the call site; this function only parses bytes.
 *
 * Hand-rolled (no font-parsing dependency) to keep core zero-dep and in budget.
 * It covers the two cmap subtable formats that matter in practice:
 *   - format 4  (segment mapping to delta values — the BMP workhorse)
 *   - format 12 (segmented coverage — astral planes, e.g. emoji)
 * Malformed or unsupported input yields an empty set; it never throws or hangs.
 */

const PLATFORM_UNICODE = 0;
const PLATFORM_WINDOWS = 3;

/** Read a big-endian u16 with bounds checking (0 when out of range). */
function u16(dv: DataView, off: number): number {
  return off + 2 <= dv.byteLength ? dv.getUint16(off) : 0;
}
function u32(dv: DataView, off: number): number {
  return off + 4 <= dv.byteLength ? dv.getUint32(off) : 0;
}

/** Rank a (platform, encoding) cmap subtable: higher = better Unicode coverage. */
function encodingScore(platform: number, encoding: number): number {
  if (platform === PLATFORM_WINDOWS && encoding === 10) return 5; // UCS-4
  if (platform === PLATFORM_UNICODE && encoding >= 4) return 5; // Unicode full
  if (platform === PLATFORM_WINDOWS && encoding === 1) return 3; // BMP
  if (platform === PLATFORM_UNICODE) return 3; // Unicode BMP
  return 0;
}

function parseFormat4(dv: DataView, base: number, into: Set<number>): void {
  const segCountX2 = u16(dv, base + 6);
  const segCount = segCountX2 >> 1;
  const endOff = base + 14;
  const startOff = endOff + segCountX2 + 2; // +2 reservedPad
  const deltaOff = startOff + segCountX2;
  const rangeOff = deltaOff + segCountX2;
  for (let i = 0; i < segCount; i++) {
    const end = u16(dv, endOff + i * 2);
    const start = u16(dv, startOff + i * 2);
    if (start > end) continue;
    const idDelta = u16(dv, deltaOff + i * 2);
    const idRangeOffset = u16(dv, rangeOff + i * 2);
    for (let c = start; c <= end; c++) {
      if (c === 0xffff) continue; // segment terminator, not a real glyph
      let glyph: number;
      if (idRangeOffset === 0) {
        glyph = (c + idDelta) & 0xffff;
      } else {
        // idRangeOffset is a byte offset from its own slot into glyphIdArray
        const gOff = rangeOff + i * 2 + idRangeOffset + (c - start) * 2;
        const g = u16(dv, gOff);
        glyph = g === 0 ? 0 : (g + idDelta) & 0xffff;
      }
      if (glyph !== 0) into.add(c);
    }
  }
}

function parseFormat12(dv: DataView, base: number, into: Set<number>): void {
  // clamp the declared group count to what the buffer can actually hold — a
  // truncated/corrupt table otherwise loops billions of times (a multi-second
  // hang on the strict-font path), violating the "never hangs" contract
  const declared = u32(dv, base + 12);
  const maxGroups = Math.max(0, Math.floor((dv.byteLength - (base + 16)) / 12));
  const nGroups = Math.min(declared, maxGroups);
  let off = base + 16;
  for (let i = 0; i < nGroups; i++, off += 12) {
    const startChar = u32(dv, off);
    const endChar = u32(dv, off + 4);
    const startGlyph = u32(dv, off + 8);
    if (startChar > endChar) continue;
    // a single group can span the whole astral range; guard against absurd
    // counts so malformed tables can't make us loop forever
    if (endChar - startChar > 0x20_0000) continue;
    for (let c = startChar; c <= endChar; c++) {
      if (startGlyph + (c - startChar) !== 0) into.add(c);
    }
  }
}

export function parseCmap(bytes: ArrayBuffer): Set<number> {
  const out = new Set<number>();
  try {
    const dv = new DataView(bytes);
    if (dv.byteLength < 12) return out;
    let sfntOff = 0;
    // TTC header: 'ttcf' → use the first font's table directory
    if (u32(dv, 0) === 0x74746366 /* 'ttcf' */) {
      sfntOff = u32(dv, 12);
    }
    const numTables = u16(dv, sfntOff + 4);
    let cmapOff = 0;
    for (let i = 0; i < numTables; i++) {
      const rec = sfntOff + 12 + i * 16;
      if (u32(dv, rec) === 0x636d6170 /* 'cmap' */) {
        cmapOff = u32(dv, rec + 8);
        break;
      }
    }
    if (cmapOff === 0) return out;

    const nSub = u16(dv, cmapOff + 2);
    let bestOff = 0;
    let bestScore = -1;
    for (let i = 0; i < nSub; i++) {
      const rec = cmapOff + 4 + i * 8;
      const platform = u16(dv, rec);
      const encoding = u16(dv, rec + 2);
      const subOff = cmapOff + u32(dv, rec + 4);
      const score = encodingScore(platform, encoding);
      if (score > bestScore && subOff + 2 <= dv.byteLength) {
        bestScore = score;
        bestOff = subOff;
      }
    }
    if (bestScore < 0) return out;

    const format = u16(dv, bestOff);
    if (format === 4) parseFormat4(dv, bestOff, out);
    else if (format === 12) parseFormat12(dv, bestOff, out);
    // any other format: leave coverage empty rather than guessing
  } catch {
    return out;
  }
  return out;
}
