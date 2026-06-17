/**
 * Font registration on the export path (§3.6): exportVideo must register AND
 * await EVERY declared face (not one-per-asset) before frame 0. We stub the
 * browser surface (FontFace / OffscreenCanvas / fetch) and short-circuit
 * mediabunny right after the font loop with a sentinel, then assert each face
 * was constructed with its weight/style and load()-awaited in order.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// mediabunny's Output constructor runs AFTER the font loop — throw a sentinel
// there so we never touch real WebCodecs/muxing, yet exercise the font loading.
class Sentinel extends Error {}
vi.mock('mediabunny', () => ({
  Output: class {
    constructor() {
      throw new Sentinel('reached mediabunny — fonts already loaded');
    }
  },
  Mp4OutputFormat: class {},
  WebMOutputFormat: class {},
  BufferTarget: class {},
  CanvasSource: class {},
  AudioBufferSource: class {},
  AudioSample: class {},
  AudioSampleSource: class {},
  getFirstEncodableVideoCodec: async () => 'avc',
  getFirstEncodableAudioCodec: async () => 'aac',
}));

import { setDevWarning, timeline } from '@glissade/core';
import { Text, createScene } from '@glissade/scene';
import { exportVideo } from '../src/index.js';

const loadOrder: { family: string; weight: string; style: string; loaded: boolean }[] = [];

class FakeFontFace {
  loaded = false;
  constructor(
    public family: string,
    public source: string,
    public descriptors: { weight: string; style: string },
  ) {
    loadOrder.push({ family, weight: descriptors.weight, style: descriptors.style, loaded: false });
  }
  async load(): Promise<this> {
    this.loaded = true;
    loadOrder[loadOrder.length - 1]!.loaded = true; // not robust to interleave, but loads are sequential/awaited
    return this;
  }
}

class FakeCtx {
  font = '';
  save(): void {}
  restore(): void {}
  measureText(t: string) {
    return { width: t.length, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  }
}
class FakeOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): FakeCtx {
    return new FakeCtx();
  }
}

const g = globalThis as unknown as Record<string, unknown>;
let saved: Record<string, unknown> = {};

beforeEach(() => {
  loadOrder.length = 0;
  saved = { FontFace: g.FontFace, OffscreenCanvas: g.OffscreenCanvas, fetch: g.fetch, document: g.document };
  g.FontFace = FakeFontFace;
  g.OffscreenCanvas = FakeOffscreenCanvas;
  g.document = { fonts: { add() {} } };
  g.fetch = async () => ({ ok: true, async arrayBuffer() {
    return new ArrayBuffer(4);
  } });
});

afterEach(() => {
  Object.assign(g, saved);
  setDevWarning(() => {});
});

describe('exportVideo font registration (§3.6)', () => {
  it('registers and awaits EVERY declared face before frame 0', async () => {
    const scene = createScene({
      size: { w: 4, h: 4 },
      children: [new Text({ text: 'x', fontFamily: 'Brand' })],
    });
    const doc = timeline({
      duration: 1,
      assets: {
        Brand: {
          kind: 'font',
          url: 'brand.ttf',
          faces: [
            { url: 'reg.woff2', weight: 400, style: 'normal' },
            { url: 'bold.woff2', weight: 700, style: 'normal' },
            { url: 'ital.woff2', weight: 400, style: 'italic' },
          ],
        },
      },
    });

    // sentinel proves we ran the font loop AND reached the post-font path
    await expect(exportVideo(scene, doc)).rejects.toThrow(/reached mediabunny/);

    expect(loadOrder).toHaveLength(3); // every face, not one-per-asset
    expect(loadOrder.every((f) => f.loaded)).toBe(true); // each awaited
    expect(loadOrder.map((f) => `${f.weight}/${f.style}`)).toEqual(['400/normal', '700/normal', '400/italic']);
  });

  it('a bare font asset registers exactly one 400/normal face', async () => {
    const scene = createScene({ size: { w: 4, h: 4 }, children: [new Text({ text: 'x', fontFamily: 'Mono' })] });
    const doc = timeline({ duration: 1, assets: { Mono: { kind: 'font', url: 'mono.ttf' } } });
    await expect(exportVideo(scene, doc)).rejects.toThrow(/reached mediabunny/);
    expect(loadOrder).toEqual([{ family: 'Mono', weight: '400', style: 'normal', loaded: true }]);
  });
});
