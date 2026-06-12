/**
 * Music auto-mix (narration parity): discovery, clip building from the two
 * manifests, and the zero-config narrated-explainer-with-bed e2e.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildMusicClip, musicPathFor } from '../src/music.js';
import { ffmpegAvailable, render } from '../src/render.js';

const SCENES = fileURLToPath(new URL('../../examples/src/scenes', import.meta.url));
// the PORTRAIT scene: no other test file renders it to video, so the
// write/delete fixture lifecycle cannot race a parallel worker
const MODULE = join(SCENES, 'golden-captions-portrait.ts');
const MANIFEST = join(SCENES, 'golden-captions-portrait.music.timing.json');
const STEM = join(SCENES, 'golden-captions-portrait-bed.wav');

/** deterministic 2s 110Hz sine, 22050Hz 16-bit mono */
function writeStem(path: string): void {
  const RATE = 22050;
  const frames = RATE * 2;
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 110 * i) / RATE) * 8000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

function writeFixtures(): void {
  writeStem(STEM);
  writeFileSync(
    MANIFEST,
    JSON.stringify(
      {
        musicVersion: 1,
        bpm: 120,
        beatsPerCycle: 4,
        durationSec: 2,
        stem: 'golden-captions-portrait-bed.wav',
        gainDb: -6,
      },
      null,
      2,
    ),
  );
}

function cleanFixtures(): void {
  for (const f of [MANIFEST, STEM]) if (existsSync(f)) unlinkSync(f);
}

afterAll(cleanFixtures);

describe('musicPathFor / buildMusicClip', () => {
  it('discovers the sibling manifest; absent → null', () => {
    cleanFixtures();
    expect(musicPathFor(MODULE)).toBeNull();
    writeFixtures();
    expect(musicPathFor(MODULE)).toBe(MANIFEST);
  });

  it('builds the bed clip with gainDb; ducks when a narration manifest is present', () => {
    writeFixtures();
    const plain = buildMusicClip(MANIFEST, null)!;
    expect(plain.clip.asset.url).toBe('golden-captions-portrait-bed.wav');
    expect(plain.clip.gain!.keys[0]!.value).toBeCloseTo(Math.pow(10, -6 / 20), 12);
    expect(plain.note).toContain('-6dB');

    // the portrait scene has no narration sibling; use the landscape manifest explicitly
    const narrationPath = join(SCENES, 'golden-captions.narration.timing.json');
    const ducked = buildMusicClip(MANIFEST, narrationPath)!;
    expect(ducked.note).toContain('ducked under narration');
    const values = ducked.clip.gain!.keys.map((k) => Number(k.value));
    expect(Math.min(...values)).toBeLessThan(Math.max(...values)); // a real envelope
  });

  it('a stem-less manifest is anchors-only: nothing to mix', () => {
    writeFixtures();
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;
    delete m['stem'];
    writeFileSync(MANIFEST, JSON.stringify(m));
    expect(buildMusicClip(MANIFEST, null)).toBeNull();
  });
});

describe.runIf(ffmpegAvailable())('zero-config narrated-explainer-with-bed', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'glissade-music-test-'));
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it('gs render auto-mixes the bed into the audio stream', async () => {
    writeFixtures();
    const out = join(outDir, 'bed.mp4');
    await render({ modulePath: MODULE, out, fps: 30, range: [0, 2] });
    const probe = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type',
      '-of', 'json', out,
    ]);
    const info = JSON.parse(probe.stdout.toString()) as { streams: { codec_type: string }[] };
    expect(info.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
  }, 120_000);

  it('--music off leaves the bed out', async () => {
    writeFixtures();
    const out = join(outDir, 'nobed.mp4');
    await render({ modulePath: MODULE, out, fps: 30, range: [0, 1], music: 'off' });
    expect(existsSync(out)).toBe(true);
  }, 120_000);
});
