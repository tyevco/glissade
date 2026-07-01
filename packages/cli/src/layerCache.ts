/**
 * §3.5 disk layer-cache (0.27.1): the fs-backed `LayerStore` the CLI injects into
 * the Skia backend. It persists a `cache:true` group's DEVICE-space raster across
 * renders, so an expensive static subtree (a blurred mesh backdrop) rasterizes
 * ONCE and re-blits on later runs — surviving a re-narration that defeats the
 * whole-frame cache (the backdrop's sub-DisplayList is unchanged; only captions /
 * timing move). Sibling of `frameCache.ts`; same on-disk discipline (deflate,
 * atomic write, content-addressed filenames).
 *
 * The compositor supplies the raw key `<sub-DisplayList fnv1a>@<deviceTransformKey>`;
 * this store SALTS it with the toolchain version ⊕ backend caps ⊕ frame size, so a
 * version / capability / resolution change can never serve a stale raster. A
 * restored RGBA composites byte-identically to a fresh raster (the compositor
 * round-trips it through putImageData) — the same contract the frame cache holds.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import type { Bounds, LayerCacheEntry, LayerStore } from '@glissade/scene';

const MAGIC = 0x47534c31; // 'GSL1'
const HEADER_BYTES = 20; // magic(4) + version(4) + w(4) + h(4) + flags(4)
const BOUNDS_BYTES = 32; // 4 × float64 (device-space, may be fractional)
const FLAG_HAS_BOUNDS = 1;
const FLAG_UNBOUNDED = 2;

export type LayerCacheMode = 'read-write' | 'read-only' | 'off';

export interface LayerCacheOptions {
  dir: string;
  mode: LayerCacheMode;
  /** folds version ⊕ capsId ⊕ `WxH` so a toolchain / caps / size change misses. */
  salt: string;
}

function encodeEntry(e: LayerCacheEntry): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32BE(MAGIC, 0);
  header.writeUInt32BE(1, 4); // format version
  header.writeUInt32BE(e.w, 8);
  header.writeUInt32BE(e.h, 12);
  header.writeUInt32BE((e.bounds ? FLAG_HAS_BOUNDS : 0) | (e.unbounded ? FLAG_UNBOUNDED : 0), 16);
  const parts: Buffer[] = [header];
  if (e.bounds) {
    const b = Buffer.alloc(BOUNDS_BYTES);
    b.writeDoubleBE(e.bounds.minX, 0);
    b.writeDoubleBE(e.bounds.minY, 8);
    b.writeDoubleBE(e.bounds.maxX, 16);
    b.writeDoubleBE(e.bounds.maxY, 24);
    parts.push(b);
  }
  parts.push(deflateSync(Buffer.from(e.rgba.buffer, e.rgba.byteOffset, e.rgba.byteLength)));
  return Buffer.concat(parts);
}

function decodeEntry(buf: Buffer): LayerCacheEntry {
  if (buf.length < HEADER_BYTES || buf.readUInt32BE(0) !== MAGIC) {
    throw new Error('corrupt .gsl layer entry (bad magic)');
  }
  const w = buf.readUInt32BE(8);
  const h = buf.readUInt32BE(12);
  const flags = buf.readUInt32BE(16);
  let off = HEADER_BYTES;
  let bounds: Bounds | null = null;
  if (flags & FLAG_HAS_BOUNDS) {
    bounds = {
      minX: buf.readDoubleBE(off),
      minY: buf.readDoubleBE(off + 8),
      maxX: buf.readDoubleBE(off + 16),
      maxY: buf.readDoubleBE(off + 24),
    };
    off += BOUNDS_BYTES;
  }
  const raw = inflateSync(buf.subarray(off));
  // A corrupted header (wrong w/h) with an intact payload would otherwise escape
  // as a "hit" carrying the wrong pixel count — make EVERY corruption a clean miss.
  if (raw.byteLength !== w * h * 4) {
    throw new Error(
      `corrupt .gsl layer entry (payload ${raw.byteLength} bytes ≠ ${w}×${h}×4)`,
    );
  }
  return {
    rgba: new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength),
    w,
    h,
    bounds,
    unbounded: (flags & FLAG_UNBOUNDED) !== 0,
  };
}

export class LayerCache implements LayerStore {
  private readonly dir: string;
  private readonly mode: LayerCacheMode;
  private readonly salt: string;
  private readonly stats = { hits: 0, misses: 0, stored: 0 };

  constructor(opts: LayerCacheOptions) {
    this.dir = opts.dir;
    this.mode = opts.mode;
    this.salt = opts.salt;
    if (this.mode !== 'off') mkdirSync(this.dir, { recursive: true });
  }

  private fileFor(key: string): string {
    const h = createHash('sha256').update(this.salt).update('\0').update(key).digest('hex');
    return join(this.dir, `${h}.gsl`);
  }

  get(key: string): LayerCacheEntry | undefined {
    if (this.mode === 'off') return undefined;
    const f = this.fileFor(key);
    if (!existsSync(f)) {
      this.stats.misses++;
      return undefined;
    }
    try {
      const e = decodeEntry(readFileSync(f));
      this.stats.hits++;
      return e;
    } catch {
      this.stats.misses++;
      return undefined; // corrupt entry → treat as a miss (the compositor re-rasters)
    }
  }

  put(key: string, entry: LayerCacheEntry): void {
    if (this.mode !== 'read-write') return;
    const f = this.fileFor(key);
    if (existsSync(f)) return; // content-addressed by (salt,key) → already persisted
    const tmp = `${f}.tmp${globalThis.process?.pid ?? 0}`;
    writeFileSync(tmp, encodeEntry(entry));
    renameSync(tmp, f);
    this.stats.stored++;
  }

  getStats(): { hits: number; misses: number; stored: number } {
    return { ...this.stats };
  }
}
