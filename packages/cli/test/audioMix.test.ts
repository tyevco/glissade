import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { key } from '@glissade/core';
import { atempoChain, gainExpression, planAudioMix, resolveAssetPath, AudioMixError } from '../src/audioMix.js';
import { ffmpegAvailable, render } from '../src/render.js';

describe('gainExpression', () => {
  it('single key → constant', () => {
    expect(gainExpression([key(0, 0.5)])).toBe('0.5');
  });

  it('piecewise linear between keys, held outside', () => {
    const expr = gainExpression([key(0, 1), key(2, 0)]);
    expect(expr).toBe('if(lt(t,0),1,if(lt(t,2),1+(-1)*(t-0)/(2),0))');
  });
});

describe('atempoChain', () => {
  it('passes through in-range rates and chains out-of-range ones', () => {
    expect(atempoChain(1.5)).toEqual(['atempo=1.5']);
    expect(atempoChain(4)).toEqual(['atempo=2', 'atempo=2']);
    expect(atempoChain(0.2)).toEqual(['atempo=0.5', 'atempo=0.5', 'atempo=0.8']);
    expect(() => atempoChain(0)).toThrow(AudioMixError);
  });
});

describe('planAudioMix', () => {
  const clip = (at: number) => ({
    asset: { kind: 'audio' as const, url: 'tone.wav' },
    at,
  });

  it('returns null with no active clips', () => {
    expect(planAudioMix([], '/x/mod.ts', 3)).toBeNull();
    expect(planAudioMix([clip(5)], '/x/mod.ts', 3)).toBeNull(); // starts past the end
  });

  it('builds delay + mix chains with module-relative paths', () => {
    const plan = planAudioMix([clip(0), clip(1.5)], '/proj/scenes/mod.ts', 3)!;
    expect(plan.inputs).toEqual(['/proj/scenes/tone.wav', '/proj/scenes/tone.wav']);
    expect(plan.filterComplex).toContain('adelay=1500:all=1');
    expect(plan.filterComplex).toContain('amix=inputs=2:normalize=0');
    expect(plan.filterComplex).toContain('[aout]');
  });

  it('rejects remote URLs for now', () => {
    expect(() => resolveAssetPath('https://x/y.wav', '/m.ts')).toThrow(AudioMixError);
  });
});

describe.runIf(ffmpegAvailable())('end-to-end audio mux', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'glissade-audio-test-'));
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it('gs render with timeline audio produces an mp4 with a synced AAC stream', async () => {
    const modulePath = fileURLToPath(
      new URL('../../examples/src/scenes/with-audio.ts', import.meta.url),
    );
    const out = join(outDir, 'with-audio.mp4');
    const result = await render({ modulePath, out, fps: 30 });
    expect(result.frames).toBe(90);

    const probe = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name:format=duration',
      '-of', 'json', out,
    ]);
    const info = JSON.parse(probe.stdout.toString()) as {
      streams: { codec_type: string; codec_name: string }[];
      format: { duration: string };
    };
    const types = info.streams.map((s) => s.codec_type).sort();
    expect(types).toEqual(['audio', 'video']);
    expect(info.streams.find((s) => s.codec_type === 'audio')!.codec_name).toBe('aac');
    expect(parseFloat(info.format.duration)).toBeCloseTo(3, 0);
  }, 60_000);
});
