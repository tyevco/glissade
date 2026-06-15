/**
 * Codec selection + fallbacks (§5.2) — the pure logic, tested without WebCodecs
 * by injecting fake encodability probes (the real ones need a browser).
 */

import { describe, expect, it } from 'vitest';
import { setDevWarning } from '@glissade/core';
import { pickCodecs, ExportUnsupportedError, type VideoProbe, type AudioProbe } from '../src/index.js';

const vid =
  (ret: 'avc' | 'vp9' | null): VideoProbe =>
  async (codecs) =>
    ret && codecs.includes(ret) ? ret : null;
const aud =
  (ret: 'aac' | 'opus' | null): AudioProbe =>
  async (codecs) =>
    ret && codecs.includes(ret) ? ret : null;

describe('pickCodecs (§5.2)', () => {
  it('returns video + audio when both encode', async () => {
    expect(await pickCodecs('mp4', true, vid('avc'), aud('aac'))).toEqual({ format: 'mp4', video: 'avc', audio: 'aac' });
  });

  it('video-only request never asks for audio', async () => {
    expect(await pickCodecs('mp4', false, vid('avc'), aud(null))).toEqual({ format: 'mp4', video: 'avc', audio: null });
  });

  it('falls back to video-only (with a warning) when audio is unencodable — never fails the whole format', async () => {
    const warnings: string[] = [];
    setDevWarning((m) => warnings.push(m));
    const r = await pickCodecs('mp4', true, vid('avc'), aud(null));
    expect(r).toEqual({ format: 'mp4', video: 'avc', audio: null });
    expect(warnings.some((w) => /video-only/.test(w))).toBe(true);
    setDevWarning(() => {});
  });

  it("auto tries mp4 then webm; falls through to webm's video codec", async () => {
    // mp4 video unencodable, webm vp9 ok
    expect(await pickCodecs('auto', false, vid('vp9'), aud(null))).toEqual({ format: 'webm', video: 'vp9', audio: null });
  });

  it('throws ExportUnsupportedError only when no video codec encodes at all', async () => {
    await expect(pickCodecs('mp4', false, vid(null), aud(null))).rejects.toThrow(ExportUnsupportedError);
  });
});
