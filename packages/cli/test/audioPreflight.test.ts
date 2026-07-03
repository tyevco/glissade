/**
 * Missing-audio-input preflight (0.41.1, ai-training adopt finding). A committed
 * narration/sfx timing manifest can reference a cache WAV that isn't on disk (the
 * audio cache is usually git-ignored), and the render used to die deep in ffmpeg
 * with a bare `hook-….wav: No such file`. `planFinalAudio` now checks the resolved
 * mix inputs exist first and throws an ACTIONABLE error naming the fix.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AudioClip } from '@glissade/core';
import { planFinalAudio, type RenderOptions } from '../src/render.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gs-audiopreflight-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const opts = (): RenderOptions => ({
  modulePath: join(dir, 'scene.ts'),
  out: join(dir, 'out.mp4'),
  narration: 'off', music: 'off', sfx: 'off', loudness: 'off',
} as RenderOptions);

const clip = (url: string): AudioClip => ({ asset: { kind: 'audio', url }, at: 0 } as AudioClip);

describe('planFinalAudio — missing audio input preflight', () => {
  it('throws an actionable error (not a bare ffmpeg path) when a mix input is missing', async () => {
    await expect(planFinalAudio(opts(), [clip('missing.wav')], 2, 'mp4')).rejects.toThrow(/audio input not found/);
  });

  it('points at `gs narrate` when the missing file is a narration hook cache WAV', async () => {
    await expect(planFinalAudio(opts(), [clip('hook-seg1.wav')], 2, 'mp4')).rejects.toThrow(/gs narrate/);
  });

  it('does NOT fire the preflight when the input exists (downstream encoder availability is separate)', async () => {
    const wav = join(dir, 'tone.wav');
    writeFileSync(wav, Buffer.alloc(64)); // a real (if tiny) file — existence is all the preflight checks
    // planFinalAudio may still throw later on a minimal ffmpeg (no aac encoder — as on CI);
    // assert only that the NOT-FOUND preflight didn't trigger for a present file.
    let err: unknown;
    try { await planFinalAudio(opts(), [clip('tone.wav')], 2, 'mp4'); } catch (e) { err = e; }
    expect(String((err as Error)?.message ?? '')).not.toMatch(/audio input not found/);
  });
});
