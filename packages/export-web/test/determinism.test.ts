/**
 * Export determinism backfill (F2IP, §5 M4 / §5.1) — pure assertions that run
 * offline in the default suite (no real WebCodecs/browser). We mock mediabunny
 * with recording fakes so the per-frame contract is observable:
 *
 *  1. Frame-index timestamps: the timestamp handed to the encoder for frame f
 *     is exactly f/fps, and NO clock (Date.now / performance.now) is read on
 *     the per-frame path.
 *  2. Backpressure is delegated to Mediabunny by AWAITING CanvasSource.add
 *     (DESIGN §5.1 amendment) — exportVideo never reads encodeQueueSize.
 *  6. Evaluate isolation: the §M4 determinism property — frame N rendered in
 *     isolation equals frame N rendered in-sequence, at the evaluate layer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Recording state shared with the hoisted vi.mock factory. add() records every
// (timestamp, duration) and proves it is AWAITED (backpressure delegation):
// add() resolves only after microtasks, and `pendingResolved` is observed true
// at finalize iff the caller waited for each add. encodeQueueSize must never be
// read — reading it flips `everReadQueueSize`.
const rec = vi.hoisted(() => ({
  added: [] as { timestamp: number; duration: number }[],
  pendingResolved: true,
  everReadQueueSize: false,
  lastVideoOpts: undefined as unknown,
}));

vi.mock('mediabunny', () => ({
  Output: class {
    target = { buffer: new ArrayBuffer(8) };
    constructor(public cfg: unknown) {}
    addVideoTrack(_src: unknown, opts: unknown): void {
      rec.lastVideoOpts = opts;
    }
    addAudioTrack(): void {}
    async start(): Promise<void> {}
    async finalize(): Promise<void> {}
  },
  Mp4OutputFormat: class {},
  WebMOutputFormat: class {},
  BufferTarget: class {},
  CanvasSource: class {
    constructor(
      public canvas: unknown,
      public opts: unknown,
    ) {}
    get encodeQueueSize(): number {
      rec.everReadQueueSize = true;
      return 0;
    }
    async add(timestamp: number, duration: number): Promise<void> {
      rec.pendingResolved = false;
      await Promise.resolve();
      await Promise.resolve();
      rec.added.push({ timestamp, duration });
      rec.pendingResolved = true;
    }
    close(): void {}
  },
  AudioBufferSource: class {},
  AudioSample: class {},
  AudioSampleSource: class {},
  getFirstEncodableVideoCodec: async () => 'avc',
  getFirstEncodableAudioCodec: async () => 'aac',
}));

import { key, timeline, track } from '@glissade/core';
import { Rect, createScene, evaluate, type Scene } from '@glissade/scene';
import { exportVideo } from '../src/index.js';

/** Empty-scene render needs only resetTransform()+clearRect() (raster2d ~308). */
class FakeCtx {
  font = '';
  fillStyle: unknown = '';
  resetTransform(): void {}
  clearRect(): void {}
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

// exportVideo runs through the stub OffscreenCanvas, so keep its scene empty
// (clear-only render path). The evaluate-isolation test below uses its own
// animated scene against the REAL evaluate(), needing no canvas.
const makeScene = (): Scene => createScene({ size: { w: 8, h: 8 }, children: [] });

beforeEach(() => {
  rec.added.length = 0;
  rec.pendingResolved = true;
  rec.everReadQueueSize = false;
  rec.lastVideoOpts = undefined;
  saved = { OffscreenCanvas: g.OffscreenCanvas, FontFace: g.FontFace, document: g.document };
  g.OffscreenCanvas = FakeOffscreenCanvas;
});

afterEach(() => {
  Object.assign(g, saved);
  vi.restoreAllMocks();
});

describe('exportVideo per-frame timestamp contract (§5.1)', () => {
  it('hands the encoder timestamp = f/fps for every frame, with no clock reads', async () => {
    const fps = 25;
    const doc = timeline({ duration: 0.4, fps }); // 10 frames

    // any per-frame clock read is a determinism violation — make them throw.
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now() read on the per-frame export path');
    });
    const perfSpy =
      typeof performance !== 'undefined'
        ? vi.spyOn(performance, 'now').mockImplementation(() => {
            throw new Error('performance.now() read on the per-frame export path');
          })
        : null;

    const res = await exportVideo(makeScene(), doc, { fps });

    expect(res.frames).toBe(10);
    expect(rec.added).toHaveLength(10);
    // exact frame-index timestamps and per-frame durations
    rec.added.forEach((a, f) => {
      expect(a.timestamp).toBe(f / fps);
      expect(a.duration).toBe(1 / fps);
    });
    // frameRate metadata also flows from fps (not a clock)
    expect(rec.lastVideoOpts).toEqual({ frameRate: fps });

    dateSpy.mockRestore();
    perfSpy?.mockRestore();
  });

  it('delegates backpressure by AWAITING CanvasSource.add — never reads encodeQueueSize', async () => {
    const fps = 30;
    const doc = timeline({ duration: 0.1, fps }); // 3 frames
    await exportVideo(makeScene(), doc, { fps });
    // if exportVideo did not await add(), pendingResolved would be observed
    // false at finalize time; every recorded add resolved before the next.
    expect(rec.pendingResolved).toBe(true);
    expect(rec.added).toHaveLength(3);
    expect(rec.everReadQueueSize).toBe(false);
  });
});

describe('evaluate isolation (§M4 determinism property)', () => {
  it('frame N in isolation === frame N in sequence at the evaluate layer', () => {
    const scene = createScene({
      size: { w: 8, h: 8 },
      children: [new Rect({ id: 'r', width: 4, height: 4, position: [4, 4], fill: '#abcdef' })],
    });
    const doc = timeline({
      duration: 1,
      fps: 30,
      tracks: [
        track('r/position.x', 'number', [key(0, 4), key(1, 200, 'easeInOutCubic')]),
        track('r/opacity', 'number', [key(0, 1), key(1, 0.25)]),
      ],
    });

    const fps = 30;
    const total = 30;
    const json = (t: number) => JSON.stringify(evaluate(scene, doc, t));

    // 1) forward in sequence
    const sequence: string[] = [];
    for (let f = 0; f < total; f++) sequence.push(json(f / fps));

    // 2) each frame fresh, in shuffled order (out-of-order re-evaluation)
    const order = [17, 3, 29, 0, 11, 28, 5, 22, 9, 1];
    for (const f of order) {
      expect(json(f / fps)).toBe(sequence[f]); // isolated == in-sequence
    }

    // 3) backward scrub yields byte-identical DisplayLists to the forward pass
    for (let f = total - 1; f >= 0; f--) expect(json(f / fps)).toBe(sequence[f]);
  });
});
