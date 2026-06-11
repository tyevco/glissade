/**
 * The Timeline document (DESIGN.md §2.3) — the serializable animation source
 * of truth — and its compiler: child flattening (add/sync), same-target
 * coalescing (last-insertion-wins, §2.2), duration computation, validation.
 */

import { emitDevWarning as devWarn } from './devWarning.js';
import { spring as springFactory } from './spring.js';
import { validateTrack, type Key, type Track } from './track.js';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface Marker {
  t: number;
  name: string;
  data?: Json;
}

export interface AssetRef {
  kind: 'font' | 'image' | 'audio' | 'video' | 'timeline';
  url: string;
}

/** Audio is timeline metadata, never a render product (§5.3). */
export interface AudioClip {
  asset: AssetRef; // kind 'audio'
  /** timeline seconds (frame-quantized at export via sample-position arithmetic) */
  at: number;
  /** seconds within the source asset */
  trim?: { start: number; end: number };
  /** gain envelope: a Track whose keys are linear gain multipliers */
  gain?: Track;
  playbackRate?: number;
}

export interface ChildEntry {
  timeline: Timeline;
  /** Offset on the parent time axis. */
  at: number;
  /**
   * 'add': flattened at compile time into the parent's track space.
   * 'sync': opaque sub-timeline with its own clock (parent t maps through
   * at/timeScale); never coalesced against parent tracks.
   */
  mode: 'add' | 'sync';
  /** sync-mode only: child plays at this rate. */
  timeScale?: number;
}

export interface Timeline {
  version: 1;
  duration?: number;
  fps?: number;
  posterTime?: number;
  tracks: Track[];
  labels?: Record<string, number>;
  markers?: Marker[];
  children?: ChildEntry[];
  audio?: AudioClip[];
  assets?: Record<string, AssetRef>;
}

export interface TimelineInit {
  tracks?: Track[];
  duration?: number;
  fps?: number;
  posterTime?: number;
  labels?: Record<string, number>;
  markers?: Marker[];
  children?: ChildEntry[];
  audio?: AudioClip[];
  assets?: Record<string, AssetRef>;
}

export function timeline(init: TimelineInit): Timeline {
  const doc: Timeline = { version: 1, tracks: init.tracks ?? [] };
  if (init.duration !== undefined) doc.duration = init.duration;
  if (init.fps !== undefined) doc.fps = init.fps;
  if (init.posterTime !== undefined) doc.posterTime = init.posterTime;
  if (init.labels !== undefined) doc.labels = init.labels;
  if (init.markers !== undefined) doc.markers = init.markers;
  if (init.children !== undefined) doc.children = init.children;
  if (init.audio !== undefined) doc.audio = init.audio;
  if (init.assets !== undefined) doc.assets = init.assets;
  return doc;
}

export class TimelineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimelineValidationError';
  }
}

/** Spring key rule (§2.7): a spring-eased key's t must equal prev.t + spring.duration(cfg). */
function validateSpringKeys(tr: Track): void {
  for (let i = 1; i < tr.keys.length; i++) {
    const k = tr.keys[i]!;
    if (k.ease && typeof k.ease === 'object' && k.ease.kind === 'spring') {
      const expected = tr.keys[i - 1]!.t + springFactory.duration(k.ease);
      if (Math.abs(k.t - expected) > 1e-6) {
        throw new TimelineValidationError(
          `track '${tr.target}': spring-eased key at t=${k.t} must sit at prev.t + spring.duration ` +
            `(${expected.toFixed(6)}); the builder computes this automatically`,
        );
      }
    }
  }
}

export interface CompiledTimeline {
  duration: number;
  labels: Record<string, number>;
  markers: Marker[];
  /** One track per target (§2.2), keys rebased to the root time axis. */
  tracks: Map<string, Track>;
  /** Audio clips rebased to the root time axis (§5.3); sync timeScale scales playbackRate. */
  audio: AudioClip[];
}

export { setDevWarning, emitDevWarning, type DevWarning } from './devWarning.js';

function rebaseKeys(keys: Key[], at: number, timeScale: number): Key[] {
  return keys.map((k) => ({ ...k, t: at + k.t / timeScale }));
}

interface FlatEntry {
  track: Track;
  /** true = sync-child unit: coalesces as a block, last-wins still applies. */
  opaque: boolean;
}

function flatten(doc: Timeline, at: number, timeScale: number, opaque: boolean, out: FlatEntry[]): void {
  for (const tr of doc.tracks) {
    validateTrack(tr);
    validateSpringKeys(tr);
    out.push({ track: { ...tr, keys: rebaseKeys(tr.keys, at, timeScale) }, opaque });
  }
  for (const child of doc.children ?? []) {
    const scale = child.mode === 'sync' ? (child.timeScale ?? 1) : 1;
    if (child.mode === 'add' && child.timeScale !== undefined) {
      throw new TimelineValidationError("timeScale is only valid on mode:'sync' children (§2.3)");
    }
    if (scale <= 0) throw new TimelineValidationError('sync timeScale must be > 0');
    // child.at is parent-local time; map to the root axis through the parent's scale
    flatten(child.timeline, at + child.at / timeScale, timeScale * scale, opaque || child.mode === 'sync', out);
  }
}

/**
 * Coalesce same-target tracks: later insertion wins where key ranges overlap
 * (§2.2/§2.6 decided rule), with a dev warning. Earlier keys inside the later
 * track's [first.t, last.t] span are dropped.
 */
function coalesce(entries: FlatEntry[]): Map<string, Track> {
  const byTarget = new Map<string, Track>();
  for (const { track: tr } of entries) {
    const existing = byTarget.get(tr.target);
    if (!existing) {
      byTarget.set(tr.target, { ...tr, keys: [...tr.keys] });
      continue;
    }
    if (existing.type !== tr.type) {
      throw new TimelineValidationError(
        `target '${tr.target}' has conflicting value types '${existing.type}' and '${tr.type}'`,
      );
    }
    const start = tr.keys[0]!.t;
    const end = tr.keys[tr.keys.length - 1]!.t;
    const existingStart = existing.keys[0]!.t;
    const existingEnd = existing.keys[existing.keys.length - 1]!.t;
    const kept = existing.keys.filter((k) => k.t < start || k.t > end);
    if (existingStart <= end && start <= existingEnd) {
      devWarn(
        `overlapping tracks for '${tr.target}' in [${start}, ${end}]: later insertion wins ` +
          `(${existing.keys.length - kept.length} earlier key(s) dropped)`,
      );
    }
    existing.keys = [...kept, ...tr.keys].sort((a, b) => a.t - b.t);
  }
  return byTarget;
}

function childExtent(child: ChildEntry): number {
  const scale = child.mode === 'sync' ? (child.timeScale ?? 1) : 1;
  return child.at + computeDuration(child.timeline) / scale;
}

function computeDuration(doc: Timeline): number {
  if (doc.duration !== undefined) return doc.duration;
  let max = 0;
  for (const tr of doc.tracks) {
    const last = tr.keys[tr.keys.length - 1];
    if (last) max = Math.max(max, last.t);
  }
  for (const m of doc.markers ?? []) max = Math.max(max, m.t);
  for (const child of doc.children ?? []) max = Math.max(max, childExtent(child));
  return max;
}

export function compileTimeline(doc: Timeline): CompiledTimeline {
  if (doc.version !== 1) {
    throw new TimelineValidationError(`unsupported timeline document version ${String(doc.version)}`);
  }
  const flat: FlatEntry[] = [];
  flatten(doc, 0, 1, false, flat);
  const tracks = coalesce(flat);
  const labels: Record<string, number> = { ...doc.labels };
  const markers: Marker[] = [...(doc.markers ?? [])];
  const audio: AudioClip[] = [...(doc.audio ?? [])];
  // Child labels/markers/audio surface rebased; parent wins label-name collisions.
  const visitChildren = (children: ChildEntry[] | undefined, at: number, scale: number) => {
    for (const child of children ?? []) {
      const base = at + child.at / scale;
      const childScale = scale * (child.mode === 'sync' ? (child.timeScale ?? 1) : 1);
      for (const [name, t] of Object.entries(child.timeline.labels ?? {})) {
        if (!(name in labels)) labels[name] = base + t / childScale;
      }
      for (const m of child.timeline.markers ?? []) {
        markers.push({ ...m, t: base + m.t / childScale });
      }
      for (const clip of child.timeline.audio ?? []) {
        // a time-scaled sync child speeds the clip itself up
        audio.push({
          ...clip,
          at: base + clip.at / childScale,
          ...(childScale !== 1 ? { playbackRate: (clip.playbackRate ?? 1) * childScale } : {}),
        });
      }
      visitChildren(child.timeline.children, base, childScale);
    }
  };
  visitChildren(doc.children, 0, 1);
  markers.sort((a, b) => a.t - b.t);
  audio.sort((a, b) => a.at - b.at);
  return { duration: computeDuration(doc), labels, markers, tracks, audio };
}
