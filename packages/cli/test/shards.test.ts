/**
 * Sharded export (§5.6, §8.1): frame-range splitting, GPU-scene refusal, and the
 * determinism gate — an N-worker render of a range is byte-identical to a
 * single-worker render of the same range. The byte-identity is asserted at the
 * PNG-frame level (no ffmpeg needed): each shard re-runs the scene module from
 * scratch, so shard sub-range frames must equal the corresponding single-process
 * frames exactly. The heavy ffmpeg concat/join path is exercised under EXPORT=1.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { compileTimeline, timeline } from '@glissade/core';
import { createScene, Circle, Rect, ShaderEffect } from '@glissade/scene';
import { render } from '../src/render.js';
import { renderSharded, sceneHasGpuNodes, splitFrameRange, ShardError } from '../src/shards.js';
import { ffmpegAvailable } from '../src/render.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const MODULE = join(SCENES, 'golden-shapes.ts');
const outDir = mkdtempSync(join(tmpdir(), 'glissade-shards-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const pngBytes = (dir: string): Map<string, Buffer> => {
  const m = new Map<string, Buffer>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.png'))) {
    m.set(f, readFileSync(join(dir, f)));
  }
  return m;
};

describe('splitFrameRange', () => {
  it('produces contiguous, covering, balanced sub-ranges', () => {
    const ranges = splitFrameRange(0, 31, 8); // 32 frames / 8 = 4 each
    expect(ranges).toHaveLength(8);
    expect(ranges[0]).toEqual({ first: 0, last: 3 });
    expect(ranges[7]).toEqual({ first: 28, last: 31 });
    // contiguous + covering
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]!.first).toBe(ranges[i - 1]!.last + 1);
    }
    const totalFrames = ranges.reduce((s, r) => s + (r.last - r.first + 1), 0);
    expect(totalFrames).toBe(32);
  });

  it('front-loads the remainder (earlier shards at most one frame larger)', () => {
    const ranges = splitFrameRange(0, 9, 4); // 10 / 4 → 3,3,2,2
    expect(ranges.map((r) => r.last - r.first + 1)).toEqual([3, 3, 2, 2]);
  });

  it('never returns more ranges than frames', () => {
    const ranges = splitFrameRange(5, 7, 8); // only 3 frames
    expect(ranges).toHaveLength(3);
    expect(ranges).toEqual([
      { first: 5, last: 5 },
      { first: 6, last: 6 },
      { first: 7, last: 7 },
    ]);
  });

  it('clamps a 1-frame range to a single shard', () => {
    expect(splitFrameRange(12, 12, 8)).toEqual([{ first: 12, last: 12 }]);
  });
});

describe('sceneHasGpuNodes (§3.7 shard exclusion)', () => {
  it('is false for a plain scene', () => {
    const scene = createScene({
      size: { w: 64, h: 64 },
      children: [new Rect({ id: 'r', width: 10, height: 10, position: [32, 32], fill: '#fff' })],
    });
    expect(sceneHasGpuNodes(scene)).toBe(false);
  });

  it('is true when a ShaderEffect is present', () => {
    const scene = createScene({
      size: { w: 64, h: 64 },
      children: [
        new ShaderEffect({
          id: 'fx',
          wgsl: '@fragment fn effect(@location(0) uv: vec2f) -> @location(0) vec4f { return vec4f(uv, 0, 1); }',
          children: [new Circle({ id: 'c', radius: 8, position: [32, 32], fill: '#0ff' })],
        }),
      ],
    });
    expect(sceneHasGpuNodes(scene)).toBe(true);
  });
});

describe('renderSharded GPU refusal', () => {
  const gpuScene = createScene({
    size: { w: 64, h: 64 },
    children: [
      new ShaderEffect({
        id: 'fx',
        wgsl: '@fragment fn effect(@location(0) uv: vec2f) -> @location(0) vec4f { return vec4f(uv, 0, 1); }',
        children: [new Circle({ id: 'c', radius: 8, position: [32, 32], fill: '#0ff' })],
      }),
    ],
  });
  const compiled = compileTimeline(timeline({ duration: 1, fps: 8 }));
  const baseArgs = {
    scene: gpuScene,
    compiled,
    fps: 8,
    duration: 1,
    firstFrame: 0,
    lastFrame: 7,
    container: 'mp4' as const,
    workers: 4,
    timingPathFor: () => null,
    writeCaptionSidecars: () => ({ srt: '', vtt: '' }),
    writeCueSidecars: () => [],
  };

  it('refuses to shard a GPU scene without --allow-gpu-shards', async () => {
    await expect(
      renderSharded({ ...baseArgs, opts: { modulePath: MODULE, out: join(outDir, 'gpu.mp4') } }),
    ).rejects.toThrow(ShardError);
    await expect(
      renderSharded({ ...baseArgs, opts: { modulePath: MODULE, out: join(outDir, 'gpu.mp4') } }),
    ).rejects.toThrow(/--allow-gpu-shards/);
  });
});

describe('determinism gate: shard sub-ranges are byte-identical to a single render', () => {
  it('8 contiguous sub-range renders reproduce the single-process frames byte-for-byte', async () => {
    // single-process full range 0..23 (24 frames)
    const full = join(outDir, 'full');
    await render({ modulePath: MODULE, out: full, frameRange: [0, 23], format: 'png-seq' });
    const fullBytes = pngBytes(full);
    expect(fullBytes.size).toBe(24);

    // 8 workers' worth of sub-ranges, each rendered independently (this is what a
    // shard child does: re-run the module, render its sub-range as PNGs)
    const ranges = splitFrameRange(0, 23, 8);
    const merged = new Map<string, Buffer>();
    for (let i = 0; i < ranges.length; i++) {
      const { first, last } = ranges[i]!;
      const shardDir = join(outDir, `shard-${i}`);
      await render({ modulePath: MODULE, out: shardDir, frameRange: [first, last], format: 'png-seq' });
      for (const [name, buf] of pngBytes(shardDir)) merged.set(name, buf);
    }

    expect(merged.size).toBe(24);
    for (const [name, buf] of fullBytes) {
      expect(merged.has(name), `frame ${name} present in shard output`).toBe(true);
      expect(Buffer.compare(buf, merged.get(name)!), `frame ${name} byte-identical`).toBe(0);
    }
  });
});

// Heavy: the full orchestrator (child spawn + ffmpeg encode + concat join + decode).
// Gated like the other ffmpeg suites; needs the built dist/cli.js for child spawns.
const ffprobeFrames = (file: string): number => {
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=nb_read_frames', '-of', 'default=nokey=1:noprint_wrappers=1', file,
  ], { encoding: 'utf8' });
  return Number(probe.stdout.trim());
};

describe.runIf(process.env.EXPORT === '1' && ffmpegAvailable())('sharded join (EXPORT=1)', () => {
  it('lossless-intermediate 4-worker render decodes to byte-identical frames vs single-worker', async () => {
    const decodeToPngs = (video: string, dir: string): Map<string, Buffer> => {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      spawnSync('ffmpeg', ['-y', '-i', video, join(dir, 'd-%05d.png')], { stdio: 'ignore' });
      return pngBytes(dir);
    };

    // single-worker reference
    const single = join(outDir, 'single.mp4');
    await render({ modulePath: MODULE, out: single, fps: 24, frameRange: [0, 23] });

    // 4-worker lossless-intermediate (FFV1 shards → identical RGB into the final
    // encode, so the decoded frames match the single-process path bit-for-bit)
    const sharded = join(outDir, 'sharded.mp4');
    await render({
      modulePath: MODULE, out: sharded, fps: 24, frameRange: [0, 23],
      workers: 4, losslessIntermediate: true,
    });

    const a = decodeToPngs(single, join(outDir, 'dec-single'));
    const b = decodeToPngs(sharded, join(outDir, 'dec-sharded'));
    expect(a.size).toBe(24);
    expect(b.size).toBe(24);
    for (const [name, buf] of a) {
      expect(b.has(name)).toBe(true);
      expect(Buffer.compare(buf, b.get(name)!), `decoded frame ${name}`).toBe(0);
    }
  }, 180_000);

  it('GOP-aligned concat 8-worker render yields the full frame count', async () => {
    const out = join(outDir, 'gop8.mp4');
    const res = await render({ modulePath: MODULE, out, fps: 24, frameRange: [0, 31], workers: 8 });
    expect(res.frames).toBe(32);
    expect(ffprobeFrames(out)).toBe(32);
  }, 180_000);

  it('an OVER-RANGE render caps to the timeline identically with and without --workers (canary blocker)', async () => {
    // golden-shapes is ~3s; --fps 24 --range 0..119 requests 120 frames but the
    // -t <duration> cap trims the output to the timeline length. The sharded path
    // must apply the SAME cap (it omitted it before — a frame-count divergence).
    const single = join(outDir, 'over-single.mp4');
    await render({ modulePath: MODULE, out: single, fps: 24, frameRange: [0, 119] });
    const sharded = join(outDir, 'over-sharded.mp4');
    await render({ modulePath: MODULE, out: sharded, fps: 24, frameRange: [0, 119], workers: 4 });

    const sFrames = ffprobeFrames(single);
    expect(sFrames).toBeLessThan(120); // the -t cap engaged (didn't emit all 120 requested)
    expect(ffprobeFrames(sharded)).toBe(sFrames); // N-worker == 1-worker (the contract)
  }, 180_000);
});
