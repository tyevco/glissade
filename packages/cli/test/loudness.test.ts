import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  computeGainDb,
  floorGain2,
  peakClampBinds,
  resolveProfile,
  PUBLISH_PROFILES,
  computeMixHash,
  loudnessPathFor,
  readLoudness,
  parseLoudnormJson,
  LoudnessError,
  measureLoudnessCommand,
  LOUDNESS_SCHEMA_VERSION,
} from '../src/loudness.js';
import { applyMixGainDb, planAudioMix, AudioMixError } from '../src/audioMix.js';
import { ffmpegAvailable, render, resolveLoudnessGainDb, collectMixAudioInputs } from '../src/render.js';

// ---- the peak-clamped gain formula ----

describe('computeGainDb (peak-clamped publish gain)', () => {
  const youtube = PUBLISH_PROFILES.youtube!;

  it('raises a quiet, low-peak source to the loudness target (LUFS gain binds)', () => {
    // -24.85 LUFS / -21.16 dBTP, target -14 → +10.85 dB; clamp = -1 - (-21.16) = +20.16; min = +10.85
    expect(computeGainDb(youtube, -24.85, -21.16)).toBeCloseTo(10.85, 2);
    expect(peakClampBinds(youtube, -24.85, -21.16)).toBe(false);
  });

  it('clamps the gain so the output never exceeds -1 dBTP (peak clamp binds)', () => {
    // -17.25 LUFS / +0.01 dBTP, target -14: LUFS gain would be +3.25 (raises),
    // peak clamp = -1 - 0.01 = -1.01 → min = -1.01 (clamp wins → ≤ -1 dBTP)
    const gain = computeGainDb(youtube, -17.25, 0.01);
    expect(gain).toBeCloseTo(-1.01, 2);
    expect(peakClampBinds(youtube, -17.25, 0.01)).toBe(true);
    // applying the gain lands the true-peak at exactly the ceiling
    expect(0.01 + gain).toBeCloseTo(-1.0, 2);
  });

  it('attenuates a hot source (LUFS gain is a reduction; clamp never binds on a reduction)', () => {
    // -3.96 LUFS / 0.00 dBTP, target -14 → -10.04 dB; clamp = -1; min(-10.04,-1) = -10.04
    const gain = computeGainDb(youtube, -3.96, 0.0);
    expect(gain).toBeCloseTo(-10.04, 2);
    expect(peakClampBinds(youtube, -3.96, 0.0)).toBe(false);
    expect(0.0 + gain).toBeLessThanOrEqual(-1.0);
  });

  it('the published true-peak is always ≤ -1 dBTP across profiles (the publish guarantee)', () => {
    for (const profile of Object.values(PUBLISH_PROFILES)) {
      for (const inputI of [-30, -23, -16, -14, -8, -3]) {
        for (const inputTp of [-25, -10, -3, -0.5, 0, 0.5]) {
          const gain = computeGainDb(profile, inputI, inputTp);
          // output true-peak = measured peak + the scalar gain
          expect(inputTp + gain).toBeLessThanOrEqual(profile.truePeakDb + 1e-9);
        }
      }
    }
  });

  it('the COMMITTED (2-decimal) gain still honors the ceiling — floor, not round-to-nearest', () => {
    // A quiet-but-peaky source where the peak clamp binds and the exact gain has a
    // 3rd decimal of 0.005: inputI = -15 (quiet, LUFS gain would raise +1), inputTp
    // = 0.005 (peaky) → peak clamp = -1 - 0.005 = -1.005, min(+1, -1.005) = -1.005
    // is the committed gain pre-round. round-to-nearest → -1.00 (ABOVE ceiling,
    // inputTp+gain = +0.005 over -1 dBTP); floorGain2 → -1.01 (safely under).
    const youtube = PUBLISH_PROFILES.youtube!;
    const inputI = -15;
    const inputTp = 0.005;
    expect(peakClampBinds(youtube, inputI, inputTp)).toBe(true);
    const exactGain = computeGainDb(youtube, inputI, inputTp);
    expect(exactGain).toBeCloseTo(-1.005, 6);
    // round-to-nearest would overshoot the ceiling by ~0.005:
    const roundGain = Math.round(exactGain * 100) / 100; // -1.00
    expect(inputTp + roundGain).toBeGreaterThan(youtube.truePeakDb); // BUG: +0.005 over
    // floor keeps the committed gain ≤ the computed gain, so the ceiling holds:
    const committedGain = floorGain2(exactGain); // -1.01
    expect(committedGain).toBeLessThanOrEqual(exactGain);
    expect(inputTp + committedGain).toBeLessThanOrEqual(youtube.truePeakDb + 1e-9);
  });
});

describe('resolveProfile', () => {
  it('resolves the publish profiles case-insensitively', () => {
    expect(resolveProfile('youtube').targetLufs).toBe(-14);
    expect(resolveProfile('SHORTS').targetLufs).toBe(-14);
    expect(resolveProfile('Podcast').targetLufs).toBe(-16);
    expect(resolveProfile('ebu').targetLufs).toBe(-23);
    expect(resolveProfile('broadcast').targetLufs).toBe(-23);
  });
  it('throws on an unknown profile, naming the valid set', () => {
    expect(() => resolveProfile('tiktok')).toThrow(LoudnessError);
    expect(() => resolveProfile('tiktok')).toThrow(/youtube/);
  });
});

// ---- the in-graph scalar gain (the only render-time DSP) ----

describe('applyMixGainDb', () => {
  it('renames the terminal [aout] and feeds it through a single volume scalar', () => {
    const plan = planAudioMix([{ asset: { kind: 'audio', url: 't.wav' }, at: 0 }], '/x/m.ts', 3)!;
    const gained = applyMixGainDb(plan.filterComplex, -3.2);
    expect(gained).toContain('[apreg]volume=-3.2dB[aout]');
    // exactly one terminal [aout] remains
    expect(gained.match(/\[aout\]/g)!.length).toBe(1);
  });

  it('a 0 dB gain is a no-op (byte-preserving for an at-target source)', () => {
    const plan = planAudioMix([{ asset: { kind: 'audio', url: 't.wav' }, at: 0 }], '/x/m.ts', 3)!;
    expect(applyMixGainDb(plan.filterComplex, 0)).toBe(plan.filterComplex);
  });

  it('throws when there is no [aout] to gain', () => {
    expect(() => applyMixGainDb('[1:a]volume=1[x]', -3)).toThrow(AudioMixError);
  });
});

// ---- parsing the ffmpeg loudnorm JSON ----

describe('parseLoudnormJson', () => {
  it('reads input_i / input_tp / input_lra from the last JSON block', () => {
    const stderr = [
      'noise...',
      '[Parsed_loudnorm_0 @ 0x] ',
      '{',
      '\t"input_i" : "-24.85",',
      '\t"input_tp" : "-21.16",',
      '\t"input_lra" : "0.00",',
      '\t"output_i" : "-24.05"',
      '}',
    ].join('\n');
    expect(parseLoudnormJson(stderr)).toEqual({ inputI: -24.85, inputTp: -21.16, inputLra: 0 });
  });
  it('throws when there is no JSON', () => {
    expect(() => parseLoudnormJson('no json here')).toThrow(LoudnessError);
  });
});

// ---- the mixHash binding (measurement ↔ mix content) ----

describe('computeMixHash (binds measurement to mix CONTENT, not mtime)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'glissade-mixhash-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const mod = join(tmp, 'scene.ts');

  it('is stable for identical content and changes when a manifest changes', () => {
    const narr = join(tmp, 'scene.narration.timing.json');
    writeFileSync(narr, '{"segments":[]}');
    const a = computeMixHash(mod);
    const b = computeMixHash(mod);
    expect(a).toBe(b); // pure function of bytes
    writeFileSync(narr, '{"segments":[{"id":"x"}]}'); // a re-narrate
    expect(computeMixHash(mod)).not.toBe(a); // invalidates loudly
  });

  it('changes when a previously-absent manifest appears', () => {
    const fresh = join(tmp, 'other.ts');
    const before = computeMixHash(fresh);
    writeFileSync(join(tmp, 'other.sfx.timing.json'), '{"clips":[]}');
    expect(computeMixHash(fresh)).not.toBe(before);
  });

  it('folds the BYTES of the resolved mix audio inputs (music stem), not just manifests', async () => {
    // A music-bed manifest + its stem audio file. Editing the STEM bytes in place
    // (same path, same manifest) must change the mixHash — the manifest-only hash
    // missed this, silently applying a stale publish gain.
    const stemMod = join(tmp, 'stemscene.ts');
    const stemPath = join(tmp, 'bed.wav');
    writeFileSync(
      join(tmp, 'stemscene.music.timing.json'),
      JSON.stringify({ musicVersion: 1, bpm: 120, beatsPerCycle: 4, durationSec: 4, stem: 'bed.wav' }),
    );
    writeFileSync(stemPath, Buffer.from('STEM-CONTENT-A'));

    const extraA = await collectMixAudioInputs({ modulePath: stemMod });
    expect(extraA).toContain(stemPath); // the stem is resolved as a real mix input
    const hashA = computeMixHash(stemMod, extraA);

    // edit the stem bytes in place (same path)
    writeFileSync(stemPath, Buffer.from('STEM-CONTENT-B-different-length'));
    const extraB = await collectMixAudioInputs({ modulePath: stemMod });
    const hashB = computeMixHash(stemMod, extraB);

    expect(hashB).not.toBe(hashA); // the edited stem invalidates the measurement
  });

  it('render-time gate HARD-THROWS when a music-stem byte edit invalidates the mixHash', async () => {
    const stemMod = join(tmp, 'gatescene.ts');
    const stemPath = join(tmp, 'gate-bed.wav');
    writeFileSync(
      join(tmp, 'gatescene.music.timing.json'),
      JSON.stringify({ musicVersion: 1, bpm: 120, beatsPerCycle: 4, durationSec: 4, stem: 'gate-bed.wav' }),
    );
    writeFileSync(stemPath, Buffer.from('ORIGINAL-STEM'));

    // commit a measurement bound to the ORIGINAL stem bytes
    const extra = await collectMixAudioInputs({ modulePath: stemMod });
    writeFileSync(
      loudnessPathFor(stemMod),
      JSON.stringify({
        loudnessVersion: LOUDNESS_SCHEMA_VERSION,
        profileId: 'youtube',
        inputI: -24,
        inputTp: -21,
        inputLra: 0,
        gain: 7,
        mixHash: computeMixHash(stemMod, extra),
      }),
    );
    // sanity: the gate passes against the unmodified stem
    expect(await resolveLoudnessGainDb({ modulePath: stemMod })).toBe(7);

    // now EDIT the stem bytes in place → the render-time gate must hard-throw
    writeFileSync(stemPath, Buffer.from('EDITED-STEM-bytes'));
    await expect(resolveLoudnessGainDb({ modulePath: stemMod })).rejects.toThrow(/stale|measure-loudness/);
  });
});

// ---- resolveLoudnessGainDb: stale/missing/off semantics ----

describe('resolveLoudnessGainDb (render-time read + mixHash gate)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'glissade-loud-read-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const mod = join(tmp, 'scene.ts');
  writeFileSync(join(tmp, 'scene.narration.timing.json'), '{"segments":[{"id":"a"}]}');

  const commit = (mixHash: string): void => {
    writeFileSync(
      loudnessPathFor(mod),
      JSON.stringify({
        loudnessVersion: LOUDNESS_SCHEMA_VERSION,
        profileId: 'youtube',
        inputI: -24,
        inputTp: -21,
        inputLra: 0,
        gain: 10,
        mixHash,
      }),
    );
  };

  it('returns null when no measurement is committed', async () => {
    const fresh = join(tmp, 'unmeasured.ts');
    expect(await resolveLoudnessGainDb({ modulePath: fresh })).toBeNull();
  });

  it('returns the committed gain when the mixHash matches', async () => {
    // commit the hash exactly as render computes it (manifests + the resolved mix
    // AUDIO inputs), so the render-time gate matches.
    const extra = await collectMixAudioInputs({ modulePath: mod });
    commit(computeMixHash(mod, extra));
    expect(await resolveLoudnessGainDb({ modulePath: mod })).toBe(10);
  });

  it('HARD-THROWS when the mixHash is stale (mix inputs changed)', async () => {
    commit('sha256:deadbeef'); // a hash from a different mix content
    await expect(resolveLoudnessGainDb({ modulePath: mod })).rejects.toThrow(/stale|measure-loudness/);
  });

  it('--loudness off ignores even a stale measurement', async () => {
    commit('sha256:deadbeef');
    expect(await resolveLoudnessGainDb({ modulePath: mod, loudness: 'off' })).toBeNull();
  });

  it('rejects an unsupported schema version (re-measure prompt)', () => {
    writeFileSync(loudnessPathFor(mod), JSON.stringify({ loudnessVersion: 999 }));
    expect(() => readLoudness(mod)).toThrow(/loudnessVersion/);
  });
});

// ---- FIX 2 (0.15 canary): localized loudness — per-locale path + dead-end ----

describe('resolveLoudnessGainDb: localized loudness (FIX 2)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'glissade-loud-locale-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const mod = join(tmp, 'scene.ts');

  // a narration timing references a wav under <stem>.narration-cache/; the cache
  // base derives from the timing FILENAME, so the base and zh siblings reference
  // DISTINCT wavs → distinct mixHashes (the whole point of a per-locale measurement).
  const writeNarration = (timingName: string, wavName: string): void => {
    writeFileSync(join(tmp, `${wavName}`), Buffer.from(`WAV-${wavName}`));
    writeFileSync(
      join(tmp, timingName),
      JSON.stringify({
        narrationVersion: 1,
        segments: [{ id: 'a', text: 'hi', start: 0, duration: 1, file: wavName }],
      }),
    );
  };
  it('base render is UNCHANGED by the locale plumbing (no per-locale read, no throw)', async () => {
    // base narration + a committed BASE measurement gates exactly as before.
    writeNarration('scene.narration.timing.json', 'base.wav');
    const extra = await collectMixAudioInputs({ modulePath: mod });
    writeFileSync(
      loudnessPathFor(mod),
      JSON.stringify({
        loudnessVersion: LOUDNESS_SCHEMA_VERSION,
        profileId: 'youtube',
        inputI: -24,
        inputTp: -21,
        inputLra: 0,
        gain: 5,
        mixHash: computeMixHash(mod, extra),
      }),
    );
    expect(await resolveLoudnessGainDb({ modulePath: mod })).toBe(5);
    // loudnessPathFor with no locale is byte-identical to before
    expect(loudnessPathFor(mod)).toBe(join(tmp, 'scene.loudness.json'));
    expect(loudnessPathFor(mod, 'zh')).toBe(join(tmp, 'scene.zh.loudness.json'));
  });

  it('--locale zh with only a BASE measurement → actionable per-locale dead-end error', async () => {
    // a zh narration sibling exists (so the localized render has assets), and a
    // BASE measurement is committed — but NO per-locale measurement. Render must
    // throw the actionable "no <stem>.zh.loudness.json … --locale zh" error, NOT
    // the generic stale-mixHash message and NOT silently apply the base gain.
    writeNarration('scene.zh.narration.timing.json', 'zh.wav');
    const err = await resolveLoudnessGainDb({ modulePath: mod, locale: 'zh' }).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toMatch(/no .*scene\.zh\.loudness\.json/);
    expect(err!.message).toMatch(/--locale zh/);
    expect(err!.message).not.toMatch(/is stale/); // distinct from the generic message
  });

  it('--locale zh PASSES once the per-locale measurement is committed', async () => {
    // commit a per-locale measurement bound to the per-locale (zh) mix inputs.
    const extraZh = await collectMixAudioInputs({ modulePath: mod, locale: 'zh' });
    writeFileSync(
      loudnessPathFor(mod, 'zh'),
      JSON.stringify({
        loudnessVersion: LOUDNESS_SCHEMA_VERSION,
        profileId: 'youtube',
        inputI: -20,
        inputTp: -18,
        inputLra: 0,
        gain: 3,
        mixHash: computeMixHash(mod, extraZh),
      }),
    );
    expect(await resolveLoudnessGainDb({ modulePath: mod, locale: 'zh' })).toBe(3);
    // the base render still reads the BASE measurement — untouched by the per-locale one
    expect(await resolveLoudnessGainDb({ modulePath: mod })).toBe(5);
  });

  it('a scene with NO base measurement and a --locale renders without normalization (no dead-end)', async () => {
    // a locale render where the scene opts out of loudness ENTIRELY (no base file)
    // must NOT be a dead-end — there is simply no gain to apply.
    const other = join(tmp, 'noloud.ts');
    writeNarration('noloud.zh.narration.timing.json', 'noloud-zh.wav');
    expect(await resolveLoudnessGainDb({ modulePath: other, locale: 'zh' })).toBeNull();
  });
});

// ---- end-to-end measure → render determinism (ffmpeg-gated) ----

describe.runIf(ffmpegAvailable())('measure → render determinism + publish guarantee', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'glissade-loudness-e2e-'));
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  // the with-audio example: a real timeline-audio mix (no narration siblings),
  // so mixHash is over absent manifests + the measurement is reproducible.
  const modulePath = fileURLToPath(new URL('../../examples/src/scenes/with-audio.ts', import.meta.url));

  const measuredTruePeak = (file: string): number => {
    const r = spawnSync(
      'ffmpeg',
      ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
      { encoding: 'utf8' },
    );
    return parseLoudnormJson(r.stderr).inputTp;
  };

  afterAll(() => {
    // don't leave a committed measurement next to the shared example
    rmSync(loudnessPathFor(modulePath), { force: true });
  });

  it('measure-loudness commits a deterministic measurement (same mix → same gain)', async () => {
    const a = await measureLoudnessCommand({ modulePath, profile: 'youtube' });
    const committedA = readFileSync(loudnessPathFor(modulePath), 'utf8');
    const b = await measureLoudnessCommand({ modulePath, profile: 'youtube' });
    const committedB = readFileSync(loudnessPathFor(modulePath), 'utf8');
    // the measurement is reproducible (quarantined non-determinism is stable here)
    expect(committedB).toBe(committedA);
    expect(b.measurement.gain).toBe(a.measurement.gain);
    expect(a.measurement.profileId).toBe('youtube');
    expect(a.measurement.mixHash).toMatch(/^sha256:/);
  }, 60_000);

  it('a normalized render hits ≤ -1 dBTP and is byte-identical run-to-run', async () => {
    await measureLoudnessCommand({ modulePath, profile: 'youtube' });
    const out1 = join(outDir, 'norm1.mp4');
    const out2 = join(outDir, 'norm2.mp4');
    await render({ modulePath, out: out1, fps: 30 });
    await render({ modulePath, out: out2, fps: 30 });
    // the render-time gain is a pure scalar multiply → byte-identical mp4s
    expect(readFileSync(out1).equals(readFileSync(out2))).toBe(true);
    // the publish guarantee: output true-peak ≤ -1 dBTP
    expect(measuredTruePeak(out1)).toBeLessThanOrEqual(-1 + 0.2); // small ffmpeg measure tolerance
  }, 120_000);

  it('a stale mixHash HARD-THROWS at render (a re-narrate must invalidate loudly)', async () => {
    await measureLoudnessCommand({ modulePath, profile: 'youtube' });
    // corrupt the committed mixHash to simulate changed mix inputs
    const committed = JSON.parse(readFileSync(loudnessPathFor(modulePath), 'utf8'));
    committed.mixHash = 'sha256:0000';
    writeFileSync(loudnessPathFor(modulePath), JSON.stringify(committed));
    await expect(render({ modulePath, out: join(outDir, 'stale.mp4'), fps: 30 })).rejects.toThrow(
      /stale|measure-loudness/,
    );
  }, 60_000);

  it('--loudness off renders the un-gained mix even with a committed measurement', async () => {
    await measureLoudnessCommand({ modulePath, profile: 'youtube' });
    const gained = join(outDir, 'gained.mp4');
    const ungained = join(outDir, 'ungained.mp4');
    await render({ modulePath, out: gained, fps: 30 });
    await render({ modulePath, out: ungained, fps: 30, loudness: 'off' });
    // the gain is non-zero for this quiet source, so the bytes must differ
    expect(readFileSync(gained).equals(readFileSync(ungained))).toBe(false);
  }, 120_000);
});

// guard the shared example isn't left dirty if the e2e block is skipped
afterAll(() => {
  const modulePath = fileURLToPath(new URL('../../examples/src/scenes/with-audio.ts', import.meta.url));
  const p = loudnessPathFor(modulePath);
  if (existsSync(p)) rmSync(p, { force: true });
});
