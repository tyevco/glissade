/**
 * FFmpeg encoder detection (§5.2 feature-detection extended to the CLI path):
 * distro "free" FFmpeg builds ship without libx264, so the encoder is picked
 * from what the installed binary actually offers, in preference order, with
 * an actionable error when a container has no usable encoder at all.
 */

import { spawnSync } from 'node:child_process';

export class NoEncoderError extends Error {
  constructor(container: string, wanted: string[]) {
    super(
      `your ffmpeg has none of the ${container} encoders ${wanted.join(', ')}. ` +
        `Install a full ffmpeg build (with libx264/libvpx), or render a different ` +
        `container (--out file.webm) or a PNG sequence (--out <directory>).`,
    );
    this.name = 'NoEncoderError';
  }
}

const VIDEO_PREFERENCE: Record<'mp4' | 'webm', string[]> = {
  // mpeg4 (Part 2) is last-resort but universally present and widely playable
  mp4: ['libx264', 'libopenh264', 'mpeg4'],
  webm: ['libvpx-vp9', 'libvpx'],
};

const AUDIO_PREFERENCE: Record<'mp4' | 'webm', string[]> = {
  mp4: ['aac'], // ffmpeg's native AAC encoder is always built in
  webm: ['libopus', 'libvorbis', 'vorbis'],
};

let cachedEncoders: Set<string> | null = null;

/** Parse `ffmpeg -encoders` output into the set of encoder names. */
export function parseEncoderList(output: string): Set<string> {
  const names = new Set<string>();
  // lines look like: " V....D libx264              libx264 H.264 / AVC ..."
  for (const line of output.split('\n')) {
    const m = /^ [VAS][\w.]{5} (\S+)/.exec(line);
    if (m) names.add(m[1]!);
  }
  return names;
}

export function availableEncoders(): Set<string> {
  if (cachedEncoders) return cachedEncoders;
  const res = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  cachedEncoders = res.status === 0 ? parseEncoderList(res.stdout) : new Set();
  return cachedEncoders;
}

/** Test seam: override/clear the cached encoder set. */
export function _setEncoderCacheForTest(encoders: Set<string> | null): void {
  cachedEncoders = encoders;
}

export interface EncoderChoice {
  name: string;
  /** Non-preferred pick worth telling the user about. */
  note?: string;
}

export function pickEncoder(
  kind: 'video' | 'audio',
  container: 'mp4' | 'webm',
  encoders: Set<string> = availableEncoders(),
): EncoderChoice {
  const preference = (kind === 'video' ? VIDEO_PREFERENCE : AUDIO_PREFERENCE)[container];
  for (const name of preference) {
    if (encoders.has(name)) {
      if (kind === 'video' && name !== preference[0]) {
        return {
          name,
          note:
            name === 'mpeg4'
              ? `ffmpeg lacks ${preference.slice(0, -1).join('/')}; falling back to mpeg4 (larger files, older codec)`
              : `ffmpeg lacks ${preference[0]}; using ${name}`,
        };
      }
      return { name };
    }
  }
  throw new NoEncoderError(container, preference);
}
