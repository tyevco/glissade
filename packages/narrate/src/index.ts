/**
 * @glissade/narrate — narration + captions, the PURE side. TTS happens only
 * in the explicit prepare step (`gs narrate`, the './providers' entry);
 * everything here consumes the committed timing manifest, so render stays
 * offline and deterministic. Captions are a plain string track driving a
 * Text node — they live in the timeline JSON and golden-frame CI covers them.
 */

import { key, track, type AssetRef, type AudioClip, type Key, type Track } from '@glissade/core';
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

/** What the music bed does across a pause window. */
export type BedMode =
  /** hold the current (ducked) level across the pause — no swell, the default */
  | 'hold'
  /** cut the bed to a floor for the window (a dramatic silence) */
  | 'silence'
  /** let the bed breathe back up to base while the voice rests */
  | 'swell';

/**
 * An explicit silence beat between segments — an addressable WINDOW, not just
 * dead air. It shifts every later segment's start (re-flows on re-narrate) and
 * gives you anchors (`beats.start/end/duration('id')`) to hang visuals and SFX
 * on, plus a per-pause `bed` mode for the music. A pause supplies its own
 * silence, so it suppresses the default inter-segment gap around it.
 */
export interface NarrationPause {
  id: string;
  /** the silence length in seconds */
  pause: number;
  /** what the music bed does across this window; default 'hold' */
  bed?: BedMode;
}

/** A script element: a spoken segment or an explicit pause beat. */
export type NarrationElement = NarrationSegment | NarrationPause;

/** A pause element is the one carrying a numeric `pause` field. */
export function isPause(el: NarrationElement): el is NarrationPause {
  return typeof (el as NarrationPause).pause === 'number';
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
  /**
   * Word-timing aligner for providers that don't emit word timestamps
   * (espeak / openai / piper). 'heuristic' (default) estimates from text;
   * 'vosk' derives real timings from the audio (offline ASR); 'none' leaves
   * segments word-less. Providers that supply their own words ignore this.
   */
  align?: string;
  /** spoken segments and explicit pause beats, in playback order */
  segments: NarrationElement[];
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

/** A resolved pause window in the committed manifest. */
export interface TimedPause {
  id: string;
  start: number;
  duration: number;
  bed: BedMode;
}

export interface NarrationTiming {
  timingVersion: 1;
  provider: string;
  providerVersion: string;
  totalDuration: number;
  segments: TimedSegment[];
  /** explicit pause windows, addressable like segments; omitted when none */
  pauses?: TimedPause[];
}

export class NarrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrationError';
  }
}

// ---- anchors: visual beats addressed by narration, not hand-timed seconds ----

export interface NarrationAnchors {
  /** segment OR pause start, absolute timeline seconds */
  start(id: string): number;
  /** segment OR pause end (start + duration) */
  end(id: string): number;
  duration(id: string): number;
  /** start + offset — a sub-beat inside a segment or pause window */
  at(id: string, offset?: number): number;
  /**
   * Assert every id exists in the manifest — a build-time fast-fail that lists
   * ALL unknown ids at once (vs. discovering stale refs one render at a time
   * after rewiring). Returns the anchors, so chain it: `narration(t).require([...])`.
   */
  require(ids: readonly string[]): NarrationAnchors;
  readonly totalDuration: number;
  /** '<id>.start' / '<id>.end' labels (segments + pauses) — merge into the timeline for studio visibility */
  labels(): Record<string, number>;
  /** narration clips on the existing AudioClip machinery; baseUrl prefixes each file */
  clips(baseUrl: string): AudioClip[];
  /** audio asset manifest entries keyed 'narration-<id>' */
  assets(baseUrl: string): Record<string, AssetRef>;
}

export function narration(timing: NarrationTiming): NarrationAnchors {
  // segments and pauses share one id namespace — both are addressable beats
  const byId = new Map<string, { start: number; duration: number }>();
  for (const s of timing.segments) {
    if (byId.has(s.id)) throw new NarrationError(`duplicate narration id '${s.id}'`);
    byId.set(s.id, { start: s.start, duration: s.duration });
  }
  for (const p of timing.pauses ?? []) {
    if (byId.has(p.id)) throw new NarrationError(`duplicate narration id '${p.id}' (segment and pause collide)`);
    byId.set(p.id, { start: p.start, duration: p.duration });
  }
  const beat = (id: string): { start: number; duration: number } => {
    const b = byId.get(id);
    if (!b) throw new NarrationError(`no narration beat '${id}' (have: ${[...byId.keys()].join(', ')})`);
    return b;
  };
  const anchors: NarrationAnchors = {
    start: (id) => beat(id).start,
    end: (id) => beat(id).start + beat(id).duration,
    duration: (id) => beat(id).duration,
    at: (id, offset = 0) => beat(id).start + offset,
    require: (ids) => {
      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        throw new NarrationError(
          `narration references unknown id${missing.length > 1 ? 's' : ''} ${missing
            .map((m) => `'${m}'`)
            .join(', ')} — have: ${[...byId.keys()].join(', ')}`,
        );
      }
      return anchors;
    },
    totalDuration: timing.totalDuration,
    labels: () => {
      const out: Record<string, number> = {};
      for (const [id, b] of byId) {
        out[`${id}.start`] = b.start;
        out[`${id}.end`] = b.start + b.duration;
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
  return anchors;
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

// ---- ducking: a music-bed gain envelope derived from the narration ----

export interface DuckOptions {
  /** gain while narration speaks; default 0.25 */
  duck?: number;
  /** gain elsewhere; default 1 */
  base?: number;
  /** ramp-down seconds before a segment starts; default 0.15 */
  attack?: number;
  /** ramp-up seconds after a segment ends; default 0.4 */
  release?: number;
  /**
   * Windows whose gap (after attack/release) is smaller than this stay
   * ducked through — no pumping between close segments. Default 0.5.
   */
  mergeGap?: number;
  /** the music clip's `at` on the timeline; gain keys are CLIP-local. Default 0. */
  clipAt?: number;
  /** gain a 'silence' pause ducks the bed to; default 0 (a true cut). */
  silence?: number;
}

/**
 * The bed-ducking envelope every narrated video needs: duck windows are the
 * narration segments, with attack/release ramps and near-window merging. Pause
 * beats join in by their `bed` mode — `hold` (default) keeps the bed ducked
 * across the pause, `silence` cuts it to a floor, `swell` lets it breathe back
 * to base. Pure function of the committed manifest — re-narrate and the ducking
 * re-flows. Returns a keys-only gain envelope for AudioClip.gain.
 */
export function duckEnvelope(timing: NarrationTiming, opts: DuckOptions = {}): { keys: Key<number>[] } {
  const duck = opts.duck ?? 0.25;
  const base = opts.base ?? 1;
  const attack = opts.attack ?? 0.15;
  const release = opts.release ?? 0.4;
  const mergeGap = opts.mergeGap ?? 0.5;
  const clipAt = opts.clipAt ?? 0;
  const silence = opts.silence ?? 0;

  // every speaking segment ducks; a pause carries the level of its bed mode —
  // 'hold' ducks like a segment (so close speech+pause+speech stays low),
  // 'silence' dips to the floor, 'swell' sits at base (a barrier that keeps
  // flanking ducks from merging across it, so the bed breathes up)
  const levelOf = (bed: BedMode): number => (bed === 'silence' ? silence : bed === 'swell' ? base : duck);
  const raw: { start: number; end: number; level: number }[] = [
    ...timing.segments.map((s) => ({ start: s.start, end: s.start + s.duration, level: duck })),
    ...(timing.pauses ?? []).map((p) => ({ start: p.start, end: p.start + p.duration, level: levelOf(p.bed) })),
  ].sort((a, b) => a.start - b.start);

  // merge adjacent windows of the SAME level whose silence would be shorter
  // than ramps + mergeGap (no pumping between close beats)
  const merged: { start: number; end: number; level: number }[] = [];
  for (const w of raw) {
    const last = merged[merged.length - 1];
    if (last && last.level === w.level && w.start - last.end < attack + release + mergeGap) {
      last.end = Math.max(last.end, w.end);
    } else {
      merged.push({ ...w });
    }
  }

  // base-level (swell) windows leave a base gap that produces the breath — they
  // only had to split same-level merges, which they've now done
  const active = merged.filter((w) => w.level !== base);
  if (active.length === 0) return { keys: [key(0, base)] };

  // a base-filled step function: each active window is a region at its level,
  // with an implicit base region in every gap between them
  const regions: { start: number; end: number; level: number }[] = [];
  for (const w of active) {
    const prev = regions[regions.length - 1];
    if (prev && w.start > prev.end) regions.push({ start: prev.end, end: w.start, level: base });
    regions.push({ ...w });
  }

  // each step transition becomes a ramp: DOWN (more ducking) completes at the
  // boundary (anticipatory, over `attack`); UP (less ducking) starts at it
  // (over `release`). Contiguous regions of different level ramp directly
  // between their levels — no spurious return to base.
  const transitions: { t: number; from: number; to: number }[] = [{ t: regions[0]!.start, from: base, to: regions[0]!.level }];
  for (let i = 0; i < regions.length - 1; i++) {
    if (regions[i]!.level !== regions[i + 1]!.level) {
      transitions.push({ t: regions[i]!.end, from: regions[i]!.level, to: regions[i + 1]!.level });
    }
  }
  const lastRegion = regions[regions.length - 1]!;
  transitions.push({ t: lastRegion.end, from: lastRegion.level, to: base });

  let keys: Key<number>[] = [];
  for (const tr of transitions) {
    if (tr.to === tr.from) continue;
    if (tr.to < tr.from) {
      keys.push(key(tr.t - attack, tr.from), key(tr.t, tr.to));
    } else {
      keys.push(key(tr.t, tr.from), key(tr.t + release, tr.to));
    }
  }

  // make the keys clip-local, then keep them strictly time-ordered (a no-op for
  // the pause-free path, whose windows never interleave)
  keys = keys.map((k) => ({ t: k.t - clipAt, value: k.value })).sort((a, b) => a.t - b.t);
  const ordered: Key<number>[] = [];
  for (const k of keys) {
    const prev = ordered[ordered.length - 1];
    if (prev && k.t <= prev.t) prev.value = k.value;
    else ordered.push(k);
  }

  // clamp the head to t >= 0: pre-clip keys collapse to the bed's level at 0
  const out: Key<number>[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const k = ordered[i]!;
    if (k.t < 0) {
      const next = ordered[i + 1];
      if (!next || next.t >= 0) {
        const v = next && next.t > k.t ? k.value + (next.value - k.value) * ((0 - k.t) / (next.t - k.t)) : k.value;
        out.push(key(0, v));
      }
      continue;
    }
    out.push(k);
  }
  if (out.length === 0) out.push(key(0, base));
  // a leading base key so the bed starts at full level before the first ramp
  if (out[0]!.t > 0) out.unshift(key(0, base));
  return { keys: out };
}

// ---- music: the tempo sibling of the narration manifest ----

/**
 * `<name>.music.timing.json` — committed next to its stem. The load-bearing
 * invariant: BEAT 0 IS SAMPLE 0 of the stem (the prepare step trims the
 * recording to the downbeat); `offsetSec` exists for stems that can't be
 * trimmed (count-ins). Everything derives from bpm/beatsPerCycle — no
 * per-beat marker arrays. Shape blessed from downstream production
 * (TidalCycles render step), where `cps` is the native unit: when present it
 * must agree with bpm/beatsPerCycle.
 */
export interface MusicTiming {
  musicVersion: 1;
  name?: string;
  bpm: number;
  beatsPerCycle: number;
  cycles?: number;
  /** cycles per second — TidalCycles-native; must equal bpm / (60 · beatsPerCycle) */
  cps?: number;
  durationSec: number;
  /** seconds into the stem where beat 0 sits; default 0 (trimmed-to-downbeat) */
  offsetSec?: number;
  /** stem audio file, relative to the manifest — required for render auto-mix */
  stem?: string;
  /** bed level in dB applied to the clip gain (auto-mix and clip()); default 0 */
  gainDb?: number;
  /** provenance (e.g. the .tidal pattern source) */
  source?: string;
}

export interface MusicClipOptions {
  /** bed level in dB; overrides the manifest's gainDb */
  gainDb?: number;
  /** auto-duck under this narration (windows from its segments) */
  duckUnder?: NarrationTiming;
  duckOpts?: Omit<DuckOptions, 'clipAt'>;
}

export interface MusicAnchors {
  /** timeline second of beat n (beat 0 = clip at + offsetSec) */
  beat(n: number): number;
  /** timeline second of cycle n (beatsPerCycle beats each) */
  cycle(n: number): number;
  /** quantize t to the closest beat */
  nearestBeat(t: number): number;
  /** quantize t forward to the next beat (what choreography reaches for) */
  nextBeat(t: number): number;
  readonly beatLen: number;
  readonly durationSec: number;
  /** the grid parameters, for external quantizers */
  grid(): { bpm: number; offsetSec: number };
  /** the stem as an AudioClip, with bed gain and optional narration ducking composed */
  clip(url?: string, opts?: MusicClipOptions): AudioClip;
}

export function validateMusicTiming(timing: MusicTiming): void {
  if (timing.musicVersion !== 1) {
    throw new NarrationError(`unsupported musicVersion ${String(timing.musicVersion)}`);
  }
  if (!(timing.bpm > 0) || !(timing.beatsPerCycle > 0)) {
    throw new NarrationError('music timing needs bpm > 0 and beatsPerCycle > 0');
  }
  if (timing.cps !== undefined) {
    const expected = timing.bpm / (60 * timing.beatsPerCycle);
    if (Math.abs(timing.cps - expected) > 1e-9) {
      throw new NarrationError(
        `music timing cps (${timing.cps}) disagrees with bpm/beatsPerCycle (expected ${expected})`,
      );
    }
  }
}

/** Beat-grid anchors over a music manifest; `at` places the clip on the timeline. */
export function music(timing: MusicTiming, at = 0): MusicAnchors {
  validateMusicTiming(timing);
  const beatLen = 60 / timing.bpm;
  const beat0 = at + (timing.offsetSec ?? 0);
  return {
    beat: (n) => beat0 + n * beatLen,
    cycle: (n) => beat0 + n * timing.beatsPerCycle * beatLen,
    nearestBeat: (t) => beat0 + Math.round((t - beat0) / beatLen) * beatLen,
    nextBeat: (t) => beat0 + Math.ceil((t - beat0 - 1e-9) / beatLen) * beatLen,
    beatLen,
    durationSec: timing.durationSec,
    grid: () => ({ bpm: timing.bpm, offsetSec: beat0 }),
    clip: (url, opts = {}) => {
      const src = url ?? timing.stem;
      if (!src) throw new NarrationError('music clip needs a url (or a stem field in the manifest)');
      const gainDb = opts.gainDb ?? timing.gainDb ?? 0;
      const scale = Math.pow(10, gainDb / 20);
      let keys: Key<number>[] | null = null;
      if (opts.duckUnder) {
        keys = duckEnvelope(opts.duckUnder, { ...opts.duckOpts, clipAt: at }).keys;
      } else if (gainDb !== 0) {
        keys = [key(0, 1)];
      }
      return {
        asset: { kind: 'audio', url: src },
        at,
        ...(keys !== null
          ? { gain: { keys: keys.map((k) => ({ ...k, value: k.value * scale })) } }
          : {}),
      };
    },
  };
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
