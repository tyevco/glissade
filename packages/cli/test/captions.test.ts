/**
 * gs render --captions: the document-override hide, sidecar emission, and the
 * end-to-end offline contract — render after narrate touches no provider and
 * is byte-stable across runs.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { compileTimeline, key, sampleTrack, timeline, track, type Track } from '@glissade/core';
import { toSrt, toVtt, type NarrationTiming } from '@glissade/narrate';
import { hideCaptionsDoc, parseCaptionsMode, timingPathFor } from '../src/captions.js';
import { ffmpegAvailable, render } from '../src/render.js';
import { spawnSync } from 'node:child_process';

const MODULE = fileURLToPath(new URL('../../examples/src/scenes/golden-captions.ts', import.meta.url));

describe('parseCaptionsMode', () => {
  it('defaults to burn; rejects junk', () => {
    expect(parseCaptionsMode(undefined)).toBe('burn');
    expect(parseCaptionsMode('')).toBe('burn'); // bare --captions
    expect(parseCaptionsMode('sidecar')).toBe('sidecar');
    expect(parseCaptionsMode('off')).toBe('off');
    expect(() => parseCaptionsMode('subtitles')).toThrow(/burn, sidecar, or off/);
  });
});

describe('timingPathFor', () => {
  it('finds the committed manifest next to a narrated scene, null otherwise', () => {
    expect(timingPathFor(MODULE)).toMatch(/golden-captions\.narration\.timing\.json$/);
    expect(timingPathFor('/nowhere/scene.ts')).toBeNull();
  });
});

describe('hideCaptionsDoc', () => {
  it('zeroes captions/opacity across the whole duration', () => {
    const doc = timeline({
      duration: 4,
      tracks: [track('captions/text', 'string', [key(0, 'hi', { interp: 'hold' as const })])],
    });
    const compiled = compileTimeline(hideCaptionsDoc(doc));
    expect(compiled.duration).toBe(4);
    const opacity = compiled.tracks.get('captions/opacity')!;
    for (const t of [0, 1.7, 4]) expect(sampleTrack(opacity as Track, t)).toBe(0);
    // the caption text track itself is untouched — hiding is presentation only
    expect(sampleTrack(compiled.tracks.get('captions/text')! as Track, 1)).toBe('hi');
  });

  it('wins over an AUTHORED captions/opacity track (coalescing is span-scoped)', () => {
    const doc = timeline({
      duration: 4,
      tracks: [track('captions/opacity', 'number', [key(0, 1), key(4, 0.5)])],
    });
    const compiled = compileTimeline(hideCaptionsDoc(doc));
    const opacity = compiled.tracks.get('captions/opacity')!;
    for (const t of [0, 2, 4]) expect(sampleTrack(opacity as Track, t)).toBe(0);
  });
});

describe('gs render --captions: end-to-end, offline', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'glissade-captions-test-'));
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  const frameHash = (dir: string, frame: string): string =>
    createHash('sha256').update(readFileSync(join(dir, frame))).digest('hex');
  // t=0.5s at fps 30 → frame 15: 'Welcome to glissade.' is on screen
  const FRAME = 'frame-00015.png';
  const renderTo = (sub: string, captions: 'burn' | 'sidecar' | 'off') =>
    render({ modulePath: MODULE, out: join(outDir, sub), fps: 30, range: [0, 1], captions });

  it('burn renders captions; off hides them via the document override', async () => {
    await renderTo('burn', 'burn');
    await renderTo('off', 'off');
    expect(frameHash(join(outDir, 'burn'), FRAME)).not.toBe(frameHash(join(outDir, 'off'), FRAME));
    // off emits no sidecars
    expect(existsSync(join(outDir, 'off', 'captions.srt'))).toBe(false);
  }, 60_000);

  it('two renders are byte-stable (the offline determinism contract)', async () => {
    await renderTo('stable-a', 'burn');
    await renderTo('stable-b', 'burn');
    expect(frameHash(join(outDir, 'stable-a'), FRAME)).toBe(frameHash(join(outDir, 'stable-b'), FRAME));
  }, 60_000);

  it('sidecar mode hides burned captions and writes .srt/.vtt matching the manifest', async () => {
    await renderTo('sidecar', 'sidecar');
    expect(frameHash(join(outDir, 'sidecar'), FRAME)).toBe(frameHash(join(outDir, 'off'), FRAME));
    const timing = JSON.parse(readFileSync(timingPathFor(MODULE)!, 'utf8')) as NarrationTiming;
    expect(readFileSync(join(outDir, 'sidecar', 'captions.srt'), 'utf8')).toBe(toSrt(timing));
    expect(readFileSync(join(outDir, 'sidecar', 'captions.vtt'), 'utf8')).toBe(toVtt(timing));
  }, 60_000);

  it.runIf(ffmpegAvailable())(
    'the acceptance shape: mp4 with mixed narration audio + sidecars named after it',
    async () => {
      const out = join(outDir, 'narrated.mp4');
      await render({ modulePath: MODULE, out, fps: 30, captions: 'burn' });
      const probe = spawnSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'stream=codec_type',
        '-of', 'json', out,
      ]);
      const info = JSON.parse(probe.stdout.toString()) as { streams: { codec_type: string }[] };
      expect(info.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
      expect(existsSync(join(outDir, 'narrated.srt'))).toBe(true);
      expect(existsSync(join(outDir, 'narrated.vtt'))).toBe(true);
    },
    120_000,
  );
});
