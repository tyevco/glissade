import { afterEach, describe, expect, it } from 'vitest';
import { parseEncoderList, pickEncoder, NoEncoderError, _setEncoderCacheForTest } from '../src/encoders.js';

afterEach(() => _setEncoderCacheForTest(null));

const FULL = ` V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC
 V....D libvpx-vp9           libvpx VP9
 V..... mpeg4                MPEG-4 part 2
 A....D aac                  AAC (Advanced Audio Coding)
 A....D libopus              libopus Opus`;

const FREE_BUILD = ` V..... mpeg4                MPEG-4 part 2
 V....D libopenh264          OpenH264 H.264 / AVC / MPEG-4 AVC
 V....D libvpx-vp9           libvpx VP9
 A....D aac                  AAC (Advanced Audio Coding)
 A....D libvorbis            libvorbis`;

describe('encoder detection (§5.2 on the CLI path)', () => {
  it('parses encoder names out of ffmpeg -encoders output', () => {
    const names = parseEncoderList(FULL);
    expect(names.has('libx264')).toBe(true);
    expect(names.has('aac')).toBe(true);
    expect(names.has('H.264')).toBe(false); // descriptions are not names
  });

  it('prefers libx264 when present, silently', () => {
    expect(pickEncoder('video', 'mp4', parseEncoderList(FULL))).toEqual({ name: 'libx264' });
  });

  it('falls back on free builds with a note (the missing-libx264 case)', () => {
    const choice = pickEncoder('video', 'mp4', parseEncoderList(FREE_BUILD));
    expect(choice.name).toBe('libopenh264');
    expect(choice.note).toContain('libx264');
  });

  it('mpeg4 is the last resort and says so', () => {
    const minimal = parseEncoderList(' V..... mpeg4                MPEG-4 part 2');
    const choice = pickEncoder('video', 'mp4', minimal);
    expect(choice.name).toBe('mpeg4');
    expect(choice.note).toContain('mpeg4');
  });

  it('audio falls back along the webm chain', () => {
    expect(pickEncoder('audio', 'webm', parseEncoderList(FREE_BUILD)).name).toBe('libvorbis');
    expect(pickEncoder('audio', 'mp4', parseEncoderList(FREE_BUILD)).name).toBe('aac');
  });

  it('throws an actionable error when a container has no encoder at all', () => {
    expect(() => pickEncoder('video', 'mp4', new Set())).toThrow(NoEncoderError);
    expect(() => pickEncoder('video', 'mp4', new Set())).toThrow(/PNG sequence/);
  });
});
