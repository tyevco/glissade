/**
 * @glissade/narrate — narration + captions, the PURE side. TTS happens only
 * in the explicit prepare step (`gs narrate`, the './providers' entry);
 * everything here consumes the committed timing manifest, so render stays
 * offline and deterministic. Captions are a plain string track driving a
 * Text node — they live in the timeline JSON and golden-frame CI covers them.
 */

import { key, track, type AssetRef, type AudioClip, type Track } from '@glissade/core';
import { glow, Text, type FilterSpec } from '@glissade/scene';

// ---- the authored script (committed next to the scene module) ----

export interface NarrationSegment {
  id: string;
  text: string;
  voice?: string;
  /** speaking rate multiplier; 1 = provider default */
  rate?: number;
  /** silence after THIS segment (s); overrides the script default */
  gapAfter?: number;
}

export interface NarrationScript {
  narrationVersion: 1;
  provider?: string;
  voice?: string;
  rate?: number;
  /** silence between segments (s); default 0.35 */
  gap?: number;
  /** silence before the first segment (s); default 0 */
  leadIn?: number;
  segments: NarrationSegment[];
}

// ---- the generated timing manifest (committed; the render-time input) ----

export interface TimedWord {
  word: string;
  /** absolute timeline seconds */
  start: number;
  end: number;
}

export interface TimedSegment {
  id: string;
  text: string;
  start: number;
  duration: number;
  /** audio file, relative to the cache dir */
  file: string;
  /** present only when the provider supplies word timestamps */
  words?: TimedWord[];
}

export interface NarrationTiming {
  timingVersion: 1;
  provider: string;
  providerVersion: string;
  totalDuration: number;
  segments: TimedSegment[];
}

export class NarrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrationError';
  }
}

// ---- anchors: visual beats addressed by narration, not hand-timed seconds ----

export interface NarrationAnchors {
  /** segment start, absolute timeline seconds */
  start(id: string): number;
  /** segment end (start + duration) */
  end(id: string): number;
  duration(id: string): number;
  readonly totalDuration: number;
  /** '<id>.start' / '<id>.end' labels — merge into the timeline for studio visibility */
  labels(): Record<string, number>;
  /** narration clips on the existing AudioClip machinery; baseUrl prefixes each file */
  clips(baseUrl: string): AudioClip[];
  /** audio asset manifest entries keyed 'narration-<id>' */
  assets(baseUrl: string): Record<string, AssetRef>;
}

export function narration(timing: NarrationTiming): NarrationAnchors {
  const byId = new Map(timing.segments.map((s) => [s.id, s]));
  const seg = (id: string): TimedSegment => {
    const s = byId.get(id);
    if (!s) throw new NarrationError(`no narration segment '${id}' (have: ${[...byId.keys()].join(', ')})`);
    return s;
  };
  return {
    start: (id) => seg(id).start,
    end: (id) => seg(id).start + seg(id).duration,
    duration: (id) => seg(id).duration,
    totalDuration: timing.totalDuration,
    labels: () => {
      const out: Record<string, number> = {};
      for (const s of timing.segments) {
        out[`${s.id}.start`] = s.start;
        out[`${s.id}.end`] = s.start + s.duration;
      }
      return out;
    },
    clips: (baseUrl) =>
      timing.segments.map((s) => ({
        asset: { kind: 'audio' as const, url: `${baseUrl}/${s.file}` },
        at: s.start,
      })),
    assets: (baseUrl) => {
      const out: Record<string, AssetRef> = {};
      for (const s of timing.segments) {
        out[`narration-${s.id}`] = { kind: 'audio', url: `${baseUrl}/${s.file}` };
      }
      return out;
    },
  };
}

// ---- the caption track: hold keys in the document, golden-coverable ----

export interface CaptionTrackOptions {
  /** track target; pair with captionNode's default id */
  target?: string;
  /** v1 granularity is per segment; 'word' is reserved (karaoke highlight, later) */
  granularity?: 'segment';
}

export function captionTrack(timing: NarrationTiming, opts: CaptionTrackOptions = {}): Track<string> {
  const target = opts.target ?? 'captions/text';
  const keys = [key(0, '', { interp: 'hold' as const })];
  let cursor = 0;
  for (const s of timing.segments) {
    if (s.start > cursor + 1e-9) {
      // a gap precedes this segment: clear the caption during it (unless the
      // previous segment already ended exactly here)
      if (keys[keys.length - 1]!.value !== '') keys.push(key(cursor, '', { interp: 'hold' as const }));
    }
    if (s.start <= 1e-9) {
      keys[0] = key(0, s.text, { interp: 'hold' as const });
    } else {
      keys.push(key(s.start, s.text, { interp: 'hold' as const }));
    }
    cursor = s.start + s.duration;
  }
  // clear after the final segment
  keys.push(key(cursor, '', { interp: 'hold' as const }));
  return track(target, 'string', keys);
}

// ---- the caption node: styled Text with safe-area placement ----

export interface CaptionStyle {
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  /** readable-over-anything shadow; pass [] to disable */
  filters?: FilterSpec[];
  /** caption box width as a fraction of scene width; default 0.82 */
  widthFrac?: number;
  /** bottom inset as a fraction of scene height; defaults 0.10 (landscape) / 0.18 (portrait) */
  bottomInsetFrac?: number;
  lineHeight?: number;
}

/**
 * Bottom-centered captions inside the platform-safe area: portrait scenes
 * (9:16 cutdowns live under reels/shorts UI chrome) sit higher than
 * landscape. Same node id pairs with captionTrack's default target.
 */
export function captionNode(size: { w: number; h: number }, style: CaptionStyle = {}): Text {
  const portrait = size.h > size.w;
  const inset = style.bottomInsetFrac ?? (portrait ? 0.18 : 0.1);
  const fontSize = style.fontSize ?? Math.round(Math.min(size.w, size.h) * (portrait ? 0.052 : 0.06));
  return new Text({
    id: 'captions',
    text: '',
    align: 'center',
    fontSize,
    ...(style.fontFamily !== undefined ? { fontFamily: style.fontFamily } : {}),
    fill: style.fill ?? '#ffffff',
    width: Math.round(size.w * (style.widthFrac ?? 0.82)),
    lineHeight: style.lineHeight ?? 1.3,
    position: [size.w / 2, Math.round(size.h * (1 - inset))],
    filters: style.filters ?? glow('#000000cc', 3, 1),
  });
}

// ---- sidecar exports: cues match the burned-in track by construction ----

function srtTime(t: number, sep: ',' | '.'): string {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const f = ms % 1000;
  const p = (n: number, w: number) => String(n).padStart(w, '0');
  return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)}${sep}${p(f, 3)}`;
}

export function toSrt(timing: NarrationTiming): string {
  return (
    timing.segments
      .map(
        (s, i) =>
          `${i + 1}\n${srtTime(s.start, ',')} --> ${srtTime(s.start + s.duration, ',')}\n${s.text}`,
      )
      .join('\n\n') + '\n'
  );
}

export function toVtt(timing: NarrationTiming): string {
  return (
    'WEBVTT\n\n' +
    timing.segments
      .map((s) => `${srtTime(s.start, '.')} --> ${srtTime(s.start + s.duration, '.')}\n${s.text}`)
      .join('\n\n') +
    '\n'
  );
}
