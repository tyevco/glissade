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

/**
 * One concrete font face within a family — a (weight, style) variant at a URL.
 * `weight`/`style` default to 400/'normal' (the CSS regular face). Lives on
 * AssetRef.faces; a bare `{ kind: 'font', url }` is exactly the 400/normal face
 * with no extra variants (so existing documents stay byte-identical, §3.6).
 */
export interface FontFaceRef {
  url: string;
  weight?: number | undefined;
  style?: 'normal' | 'italic' | undefined;
}

export interface AssetRef {
  kind: 'font' | 'image' | 'audio' | 'video' | 'timeline';
  url: string;
  /**
   * Font only (§3.6): the explicit face set for this family. When present, the
   * loaders register EVERY face (not the single `url`); the family-level `url`
   * is the implicit 400/normal face. Omitted = the bare single-face form.
   */
  faces?: FontFaceRef[] | undefined;
  /**
   * Font only (§3.6): the explicit fallback family chain, in order. The
   * registry resolves `[family, ...fallback]` for glyph coverage. Omitted = no
   * declared fallback (system fallback still applies in the rasterizer).
   */
  fallback?: string[] | undefined;
}

/**
 * A gain envelope: keys of linear gain multipliers on the clip's local time
 * axis. A full Track satisfies it structurally, but its target/type carry no
 * meaning here — `{ keys: [...] }` is all a clip needs.
 */
export interface GainEnvelope {
  keys: Key[];
}

/** Audio is timeline metadata, never a render product (§5.3). */
export interface AudioClip {
  asset: AssetRef; // kind 'audio'
  /** timeline seconds (frame-quantized at export via sample-position arithmetic) */
  at: number;
  /** seconds within the source asset */
  trim?: { start: number; end: number };
  gain?: GainEnvelope;
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
  /**
   * Studio opt-in (§6.2 rule 4): the timeline duration is code-owned and
   * read-only in the editor UNLESS this flag is set (via `editableDuration()`
   * on the builder, or directly). Mirrors `track.editable` for tracks.
   */
  editableDuration?: boolean;
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
  /** Studio opt-in: expose the duration to editor editing (§6.2 rule 4). */
  editableDuration?: boolean;
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
  if (init.editableDuration !== undefined) doc.editableDuration = init.editableDuration;
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

/**
 * Sample-indexed clip offset — the single A/V-sync source of truth (§5.3),
 * `round(at * sampleRate)`. Both the CLI (FFmpeg) and the browser
 * (OfflineAudioContext) mixers derive their delay from this, so A/V offsets
 * agree across paths by construction rather than one rounding to milliseconds
 * and the other to raw float seconds. Default rate is the canonical mix grid.
 */
export function audioOffsetSamples(at: number, sampleRate = 48000): number {
  return Math.round(at * sampleRate);
}

function rebaseKeys(keys: Key[], at: number, timeScale: number): Key[] {
  return keys.map((k) => ({ ...k, t: at + k.t / timeScale }));
}

/**
 * `.call()` markers carry an auto-assigned `call:N` name whose counter resets
 * per document, so two sibling sub-timelines that each define a `.call()` would
 * collide on `call:0` when rebased into one parent (one callback dropped, the
 * other double-firing). We namespace a child's `call:*` markers by the child's
 * position PATH in the parent (`c<index>/…`), and the builder's `add()` applies
 * the EXACT same prefix when forwarding the child's name→fn map — so the rebased
 * marker name and the registered callback key agree by construction. Only
 * `call:*` names are rewritten; author-named cues keep their names. Both surfaces
 * call these so the convention lives in one place.
 */
export function callMarkerPrefix(childIndex: number): string {
  return `c${childIndex}/`;
}

const CALL = /(^|\/)call:\d+$/;

export function namespaceCallName(name: string, prefix: string): string {
  return prefix !== '' && CALL.test(name) ? prefix + name : name;
}

interface FlatEntry {
  track: Track;
  /**
   * Opaque-unit id. Unit 0 = the root plus every `add`-descendant flattened into
   * it (these coalesce together, last-wins). Each `sync` subtree gets a fresh
   * unit id: sync children are opaque (§2.3), so their targets must be disjoint
   * from every other unit — a collision is an error, never silent last-wins.
   */
  unit: number;
}

function flatten(
  doc: Timeline,
  at: number,
  timeScale: number,
  unit: number,
  out: FlatEntry[],
  counter: { n: number },
): void {
  for (const tr of doc.tracks) {
    validateTrack(tr);
    validateSpringKeys(tr);
    out.push({ track: { ...tr, keys: rebaseKeys(tr.keys, at, timeScale) }, unit });
  }
  for (const child of doc.children ?? []) {
    const scale = child.mode === 'sync' ? (child.timeScale ?? 1) : 1;
    if (child.mode === 'add' && child.timeScale !== undefined) {
      throw new TimelineValidationError("timeScale is only valid on mode:'sync' children (§2.3)");
    }
    if (scale <= 0) throw new TimelineValidationError('sync timeScale must be > 0');
    // a sync child opens a fresh opaque unit; add children stay in the parent's unit
    const childUnit = child.mode === 'sync' ? ++counter.n : unit;
    // child.at is parent-local time; map to the root axis through the parent's scale
    flatten(child.timeline, at + child.at / timeScale, timeScale * scale, childUnit, out, counter);
  }
}

/**
 * Coalesce same-target tracks: later insertion wins where key ranges overlap
 * (§2.2/§2.6 decided rule), with a dev warning. Earlier keys inside the later
 * track's [first.t, last.t] span are dropped.
 */
function coalesce(entries: FlatEntry[]): Map<string, Track> {
  const byTarget = new Map<string, { track: Track; unit: number }>();
  for (const { track: tr, unit } of entries) {
    const existing = byTarget.get(tr.target);
    if (!existing) {
      byTarget.set(tr.target, { track: { ...tr, keys: [...tr.keys] }, unit });
      continue;
    }
    if (existing.unit !== unit) {
      // a sync (opaque) child shares a target with another unit — sync children
      // are black boxes (§2.3), so this is an error, never silent last-wins
      throw new TimelineValidationError(
        `target '${tr.target}' is animated by a sync (opaque) child and another timeline unit; ` +
          'sync children must own disjoint targets (no last-writer-wins across the sync boundary, §2.3)',
      );
    }
    if (existing.track.type !== tr.type) {
      throw new TimelineValidationError(
        `target '${tr.target}' has conflicting value types '${existing.track.type}' and '${tr.type}'`,
      );
    }
    const start = tr.keys[0]!.t;
    const end = tr.keys[tr.keys.length - 1]!.t;
    const existingStart = existing.track.keys[0]!.t;
    const existingEnd = existing.track.keys[existing.track.keys.length - 1]!.t;
    const kept = existing.track.keys.filter((k) => k.t < start || k.t > end);
    if (existingStart <= end && start <= existingEnd) {
      devWarn(
        `overlapping tracks for '${tr.target}' in [${start}, ${end}]: later insertion wins ` +
          `(${existing.track.keys.length - kept.length} earlier key(s) dropped)`,
      );
    }
    existing.track.keys = [...kept, ...tr.keys].sort((a, b) => a.t - b.t);
  }
  const result = new Map<string, Track>();
  for (const [target, { track }] of byTarget) result.set(target, track);
  return result;
}

/**
 * Studio reader (§6.2 rule 4): is this timeline's duration opted into editor
 * editing? Code-owned and read-only by default; `editableDuration()` flips it.
 */
export function isDurationEditable(doc: Timeline): boolean {
  return doc.editableDuration === true;
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
  flatten(doc, 0, 1, 0, flat, { n: 0 });
  const tracks = coalesce(flat);
  const labels: Record<string, number> = { ...doc.labels };
  const markers: Marker[] = [...(doc.markers ?? [])];
  const audio: AudioClip[] = [...(doc.audio ?? [])];
  // Child labels/markers/audio surface rebased; parent wins label-name collisions.
  const visitChildren = (children: ChildEntry[] | undefined, at: number, scale: number, prefix: string) => {
    (children ?? []).forEach((child, index) => {
      const base = at + child.at / scale;
      const childScale = scale * (child.mode === 'sync' ? (child.timeScale ?? 1) : 1);
      // namespace this child's auto-named call:* markers by its position path so
      // sibling .call()s land under distinct keys (matches add()'s merge prefix)
      const childPrefix = prefix + callMarkerPrefix(index);
      for (const [name, t] of Object.entries(child.timeline.labels ?? {})) {
        if (!(name in labels)) labels[name] = base + t / childScale;
      }
      for (const m of child.timeline.markers ?? []) {
        markers.push({ ...m, name: namespaceCallName(m.name, childPrefix), t: base + m.t / childScale });
      }
      for (const clip of child.timeline.audio ?? []) {
        // a time-scaled sync child speeds the clip itself up
        audio.push({
          ...clip,
          at: base + clip.at / childScale,
          ...(childScale !== 1 ? { playbackRate: (clip.playbackRate ?? 1) * childScale } : {}),
        });
      }
      visitChildren(child.timeline.children, base, childScale, childPrefix);
    });
  };
  visitChildren(doc.children, 0, 1, '');
  markers.sort((a, b) => a.t - b.t);
  audio.sort((a, b) => a.at - b.at);
  return { duration: computeDuration(doc), labels, markers, tracks, audio };
}
