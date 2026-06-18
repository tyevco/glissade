/**
 * PNG-sequence fallback (F2IP, §5.2) — the unconditional fallback that works
 * "wherever canvas does", with NO WebCodecs/mediabunny. We stub OffscreenCanvas
 * with a fake that encodes a real RGBA PNG (preserving the alpha channel) and
 * assert:
 *   - exportPngFrames emits one PNG blob per frame WITHOUT ever touching
 *     mediabunny/WebCodecs (codec support absent);
 *   - a transparent frame ROUND-TRIPS: the emitted PNG decodes to a non-opaque
 *     alpha channel (alpha is not silently flattened to opaque).
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';

// The PNG fallback must not CONSTRUCT any WebCodecs/mediabunny encoder. We mock
// every export so that *invoking* one trips a flag; exportPngFrames should leave
// it false (it only touches OffscreenCanvas).
const rec = vi.hoisted(() => ({ touchedMediabunny: false }));
vi.mock('mediabunny', () => {
  const trap = (name: string) =>
    class {
      constructor() {
        rec.touchedMediabunny = true;
        throw new Error(`exportPngFrames must not construct ${name}`);
      }
    };
  return {
    Output: trap('Output'),
    Mp4OutputFormat: trap('Mp4OutputFormat'),
    WebMOutputFormat: trap('WebMOutputFormat'),
    BufferTarget: trap('BufferTarget'),
    CanvasSource: trap('CanvasSource'),
    AudioBufferSource: trap('AudioBufferSource'),
    AudioSample: trap('AudioSample'),
    AudioSampleSource: trap('AudioSampleSource'),
    getFirstEncodableVideoCodec: async () => {
      rec.touchedMediabunny = true;
      return 'avc';
    },
    getFirstEncodableAudioCodec: async () => {
      rec.touchedMediabunny = true;
      return 'aac';
    },
  };
});

import { timeline } from '@glissade/core';
import { createScene } from '@glissade/scene';
import { exportPngFrames } from '../src/index.js';

/** Minimal CRC32 + RGBA8 PNG encoder (no deps) so the round-trip is real. */
function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcBuf = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcBuf));
  return out;
}
function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // each scanline prefixed with filter byte 0
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }
  const idat = new Uint8Array(deflateSync(raw));
  const sigChunks = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = sigChunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of sigChunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Decode the alpha channel of an RGBA8 PNG (our encoder's output only). */
function decodeAlpha(png: Uint8Array, width: number, height: number): Uint8Array {
  // find IDAT
  let off = 8;
  const chunks: Uint8Array[] = [];
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (off < png.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(png[off + 4]!, png[off + 5]!, png[off + 6]!, png[off + 7]!);
    if (type === 'IDAT') chunks.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let m = 0;
  for (const c of chunks) {
    merged.set(c, m);
    m += c.length;
  }
  const raw = new Uint8Array(inflateSync(merged));
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4) + 1; // skip filter byte
    for (let x = 0; x < width; x++) alpha[y * width + x] = raw[rowStart + x * 4 + 3]!;
  }
  return alpha;
}

const W = 4;
const H = 4;

/**
 * Just enough of a 2D context for an EMPTY scene: Raster2D's clear path is
 * resetTransform() + clearRect() (raster2d.ts ~308). The backing store begins
 * fully transparent and the clear keeps it so — exactly the transparent frame
 * we want to round-trip. (No draw commands fire for an empty scene.)
 */
class FakeCtx2D {
  rgba = new Uint8Array(W * H * 4); // alpha 0 everywhere
  font = '';
  fillStyle = '';
  resetTransform(): void {}
  clearRect(): void {
    this.rgba.fill(0);
  }
  save(): void {}
  restore(): void {}
  measureText(t: string) {
    return { width: t.length, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  }
}
class FakeOffscreenCanvas {
  ctx = new FakeCtx2D();
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): FakeCtx2D {
    return this.ctx;
  }
  async convertToBlob(_opts: { type: string }): Promise<Blob> {
    const png = encodePng(this.width, this.height, this.ctx.rgba);
    const ab = new ArrayBuffer(png.byteLength);
    new Uint8Array(ab).set(png);
    return new Blob([ab], { type: 'image/png' });
  }
}

describe('exportPngFrames fallback + alpha (§5.2)', () => {
  it('emits one PNG per frame with WebCodecs unavailable', async () => {
    rec.touchedMediabunny = false;
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = g.OffscreenCanvas;
    g.OffscreenCanvas = FakeOffscreenCanvas;
    try {
      const scene = createScene({ size: { w: W, h: H }, children: [] });
      const doc = timeline({ duration: 0.1, fps: 30 }); // 3 frames
      const blobs: Blob[] = [];
      const res = await exportPngFrames(scene, doc, (_f, png) => void blobs.push(png), { fps: 30 });
      expect(res.frames).toBe(3);
      expect(blobs).toHaveLength(3);
      for (const b of blobs) expect(b.type).toBe('image/png');
      // the fallback never reached for a WebCodecs/mediabunny encoder
      expect(rec.touchedMediabunny).toBe(false);
    } finally {
      g.OffscreenCanvas = saved;
    }
  });

  it('a transparent frame round-trips with a non-opaque alpha channel', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = g.OffscreenCanvas;
    g.OffscreenCanvas = FakeOffscreenCanvas;
    try {
      // empty scene → backend clears to transparent, nothing drawn
      const scene = createScene({ size: { w: W, h: H }, children: [] });
      const doc = timeline({ duration: 1 / 30, fps: 30 }); // 1 frame
      let png: Uint8Array | null = null;
      await exportPngFrames(
        scene,
        doc,
        async (_f, blob) => {
          png = new Uint8Array(await blob.arrayBuffer());
        },
        { fps: 30 },
      );
      expect(png).not.toBeNull();
      const alpha = decodeAlpha(png!, W, H);
      // not flattened to opaque: at least one fully-transparent pixel survived
      expect(alpha.some((a) => a === 0)).toBe(true);
      expect(alpha.every((a) => a === 255)).toBe(false);
    } finally {
      g.OffscreenCanvas = saved;
    }
  });
});
