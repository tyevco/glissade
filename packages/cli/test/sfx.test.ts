/**
 * gs sfx: the prepare step (anchor resolution, deduped cache render, baked
 * jitter, validation), the auto-mix clip reader, and a zero-config render e2e.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildSfxClipsFromTiming,
  prepareSfx,
  sfxScriptPathFor,
  sfxTimingPathFor,
  type SfxScript,
  type SfxTiming,
} from '../src/sfx.js';
import { ffmpegAvailable, render } from '../src/render.js';

const dir = mkdtempSync(join(tmpdir(), 'glissade-sfx-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const NARRATION_TIMING = {
  timingVersion: 1,
  provider: 'fake',
  providerVersion: 'fake-1',
  totalDuration: 4,
  segments: [{ id: 'intro', text: 'Hi.', start: 0.5, duration: 1.0, file: 'intro.wav' }],
  pauses: [{ id: 'beat', start: 1.5, duration: 1.0, bed: 'hold' }],
};

function writeScene(name: string, script: SfxScript, withNarration = true): string {
  const base = join(dir, name);
  writeFileSync(`${base}.sfx.json`, JSON.stringify(script, null, 2));
  if (withNarration) writeFileSync(`${base}.narration.timing.json`, JSON.stringify(NARRATION_TIMING, null, 2));
  return `${base}.sfx.json`;
}

describe('prepareSfx', () => {
  it('resolves anchored + absolute hits, renders a deduped cache, and commits the manifest', () => {
    const scriptPath = writeScene('basic', {
      sfxVersion: 1,
      source: 'sfxr',
      hits: [
        { voice: 'pop', anchor: 'intro' }, // → 0.5
        { voice: 'success', anchor: 'beat', offset: 0.2 }, // → 1.7
        { voice: 'pop', at: 3.0, gain: 0.5 }, // absolute, dup voice
      ],
    });
    const r = prepareSfx(scriptPath);

    const timing = JSON.parse(readFileSync(r.timingPath, 'utf8')) as SfxTiming;
    expect(timing.sfxTimingVersion).toBe(1);
    expect(timing.source).toBe('sfxr');
    expect(timing.clips.map((c) => [c.voice, c.at])).toEqual([
      ['pop', 0.5],
      ['success', 1.7],
      ['pop', 3.0],
    ]);
    expect(timing.clips[2]!.gain).toBe(0.5);

    // deduped cache: two distinct voices (pop, success) → two WAVs
    const wavs = readdirSync(r.cacheDir).filter((f) => f.endsWith('.wav'));
    expect(wavs.sort()).toEqual(['sfxr-pop.wav', 'sfxr-success.wav']);
    expect(readFileSync(join(r.cacheDir, 'sfxr-pop.wav')).length).toBeGreaterThan(44);

    // the resolved hit list is returned for a --verbose echo (voice → time)
    expect(r.clips.map((c) => [c.voice, c.at])).toEqual([
      ['pop', 0.5],
      ['success', 1.7],
      ['pop', 3.0],
    ]);
  });

  it('bakes deterministic jitter into the committed manifest', () => {
    const script: SfxScript = {
      sfxVersion: 1,
      seed: 7,
      jitterRate: 0.06,
      hits: [
        { voice: 'click', at: 1.0 },
        { voice: 'click', at: 2.0 },
      ],
    };
    const a = JSON.parse(readFileSync(prepareSfx(writeScene('jit-a', script, false)).timingPath, 'utf8')) as SfxTiming;
    const b = JSON.parse(readFileSync(prepareSfx(writeScene('jit-b', script, false)).timingPath, 'utf8')) as SfxTiming;
    // same seed → identical playbackRate; two identical-voice hits differ (index)
    expect(a.clips.map((c) => c.playbackRate)).toEqual(b.clips.map((c) => c.playbackRate));
    expect(a.clips[0]!.playbackRate).not.toBe(a.clips[1]!.playbackRate);
  });

  it('an anchored hit with no narration timing fails loudly', () => {
    const scriptPath = writeScene('no-narr', { sfxVersion: 1, hits: [{ voice: 'pop', anchor: 'intro' }] }, false);
    expect(() => prepareSfx(scriptPath)).toThrow(/run gs narrate first/);
  });

  it('rejects an unknown voice and a hit without exactly one of anchor/at', () => {
    expect(() => prepareSfx(writeScene('bad-voice', { sfxVersion: 1, hits: [{ voice: 'boom', at: 1 }] }, false))).toThrow(
      /unknown voice 'boom'/,
    );
    expect(() =>
      prepareSfx(writeScene('both', { sfxVersion: 1, hits: [{ voice: 'pop', at: 1, anchor: 'intro' }] })),
    ).toThrow(/exactly one of 'anchor' or 'at'/);
    expect(() => prepareSfx(writeScene('neither', { sfxVersion: 1, hits: [{ voice: 'pop' }] }, false))).toThrow(
      /exactly one of 'anchor' or 'at'/,
    );
  });

  it('rejects a non-sfxr source in v1 and a bad version', () => {
    const bad = join(dir, 'badsrc.sfx.json');
    writeFileSync(bad, JSON.stringify({ sfxVersion: 1, source: 'samples', hits: [] }));
    expect(() => prepareSfx(bad)).toThrow(/supports source 'sfxr' only/);
    const badv = join(dir, 'badver.sfx.json');
    writeFileSync(badv, JSON.stringify({ sfxVersion: 2, hits: [] }));
    expect(() => prepareSfx(badv)).toThrow(/unsupported sfxVersion 2/);
  });
});

describe('path helpers', () => {
  it('sfxScriptPathFor resolves a module sibling or passes a script path through', () => {
    const scriptPath = writeScene('resolve', { sfxVersion: 1, hits: [{ voice: 'pop', at: 0 }] }, false);
    expect(sfxScriptPathFor(scriptPath)).toBe(scriptPath); // already a script
    expect(sfxScriptPathFor(join(dir, 'resolve.ts'))).toBe(scriptPath); // module → sibling
    expect(() => sfxScriptPathFor(join(dir, 'missing.ts'))).toThrow(/no sfx script/);
  });

  it('sfxTimingPathFor finds a committed manifest, else null', () => {
    const scriptPath = writeScene('timing', { sfxVersion: 1, hits: [{ voice: 'pop', at: 0 }] }, false);
    prepareSfx(scriptPath);
    expect(sfxTimingPathFor(join(dir, 'timing.ts'))).toBe(join(dir, 'timing.sfx.timing.json'));
    expect(sfxTimingPathFor(join(dir, 'timing-none.ts'))).toBeNull();
  });
});

describe('buildSfxClipsFromTiming (the auto-mix reader)', () => {
  it('reads the manifest into AudioClips with cache-relative urls', () => {
    const scriptPath = writeScene('read', {
      sfxVersion: 1,
      hits: [
        { voice: 'pop', at: 1.0 },
        { voice: 'click', at: 2.0, gain: 0.5 },
      ],
    }, false);
    const { timingPath } = prepareSfx(scriptPath);
    const built = buildSfxClipsFromTiming(timingPath)!;
    expect(built.note).toBe('sfx (2 hits)');
    expect(built.clips[0]!.asset).toEqual({ kind: 'audio', url: 'read.sfx-cache/sfxr-pop.wav' });
    expect(built.clips[0]!.at).toBe(1.0);
    expect(built.clips[1]!.gain).toEqual({ keys: [{ t: 0, value: 0.5 }] });
  });

  it('an empty clip list yields null (nothing to mix)', () => {
    const p = join(dir, 'empty.sfx.timing.json');
    writeFileSync(p, JSON.stringify({ sfxTimingVersion: 1, source: 'sfxr', clips: [] }));
    expect(buildSfxClipsFromTiming(p)).toBeNull();
  });
});

// e2e: a sibling sfx manifest joins the render mix with zero config. golden-
// shapes is not rendered to video by any other test, so the fixture lifecycle
// can't race a parallel worker.
const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
const FXMODULE = join(SCENES, 'golden-shapes.ts');
const FXSCRIPT = join(SCENES, 'golden-shapes.sfx.json');
const FXTIMING = join(SCENES, 'golden-shapes.sfx.timing.json');
const FXCACHE = join(SCENES, 'golden-shapes.sfx-cache');

function cleanFx(): void {
  for (const f of [FXSCRIPT, FXTIMING]) if (existsSync(f)) unlinkSync(f);
  if (existsSync(FXCACHE)) rmSync(FXCACHE, { recursive: true, force: true });
}

describe.runIf(ffmpegAvailable())('sfx auto-mix e2e (scene + sfx manifest → audio, zero-config)', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'glissade-sfxmix-test-'));
  afterAll(() => {
    cleanFx();
    rmSync(outDir, { recursive: true, force: true });
  });

  it('gs sfx then gs render mixes the effects into the audio stream', async () => {
    writeFileSync(FXSCRIPT, JSON.stringify({ sfxVersion: 1, hits: [{ voice: 'pop', at: 0.2 }, { voice: 'coin', at: 0.6 }] }));
    prepareSfx(FXSCRIPT);
    const out = join(outDir, 'fx.mp4');
    await render({ modulePath: FXMODULE, out, fps: 30, range: [0, 1] });
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', out]);
    expect(probe.stdout.toString()).toContain('audio');
  });

  it('--sfx off omits the effects (golden-shapes has no other audio → video only)', async () => {
    const out = join(outDir, 'fx-off.mp4');
    await render({ modulePath: FXMODULE, out, fps: 30, range: [0, 1], sfx: 'off' });
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', out]);
    expect(probe.stdout.toString()).not.toContain('audio');
  });
});
