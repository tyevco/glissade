/**
 * Motion clips (DESIGN.md §2 build-time sugar): `clip()` captures a relative-time
 * key schedule over named prop CHANNELS; `clip.apply()` compiles to ordinary keyed
 * `Track[]` at apply-time — authoring SUGAR exactly like `springTo`/`stagger`, NOT a
 * runtime concept and NOT part of the serialized Timeline document. Emitted tracks
 * are BYTE-INDISTINGUISHABLE from hand-authored `track(...)`: every channel compiles
 * through `track(target, type, keys)`, so `validateTrack` runs and the output is
 * deep-equal to the literal form.
 *
 * The binding shape locked here (the channel-spec + apply signature) is FROZEN for
 * the later 1.0 cards (presence / each / morph), which inherit it.
 */

import { key, track, type Key, type Track } from './track.js';
import { resolveTweenTarget, type TweenTarget } from './targetRef.js';
import { inferValueType, type ValueTypeId } from './valueTypes.js';
import type { EaseSpec } from './easing.js';

/**
 * One channel of a clip: a relative-time key schedule (t from 0) plus the default
 * target-suffix it binds to and an optional value type. `type` defaults via
 * `inferValueType(keys[0].value)` at apply-time.
 */
export interface ClipChannel<T = unknown> {
  /** Relative-time keys; `t` runs from 0. Strictly-increasing t enforced at apply. */
  keys: Key<T>[];
  /** Default target suffix, e.g. 'opacity', 'scale', 'position'. */
  path: string;
  /** Registered value type; defaults to inferValueType(keys[0].value). */
  type?: ValueTypeId;
}

/** A clip spec: a bag of named channels. */
export interface ClipSpec {
  channels: Record<string, ClipChannel>;
}

/**
 * Per-channel value/ease substitution. Keeps the channel's key TOPOLOGY — the
 * first key's value becomes `from`, the last key's value becomes `to`, and `ease`
 * replaces the arriving ease of the LAST segment. No keys are added or removed
 * (0.12 scope).
 */
export interface ChannelOverride<T = unknown> {
  from?: T;
  to?: T;
  ease?: EaseSpec;
}

export interface ApplyOpts {
  /** Per-channel value/ease substitution (topology-preserving). */
  overrides?: Record<string, ChannelOverride>;
  /** Divides every relative `t` (speed 2 = half-time). Must be > 0. */
  speed?: number;
}

export interface ClipResult {
  tracks: Track[];
  /** Wall-clock end second of the longest channel. */
  end: number;
}

/**
 * A per-channel target map for `apply`: each channel name maps to a `TweenTarget`
 * (string or property signal) overriding the channel's default-path resolution —
 * e.g. a `glow` channel → `'card-halo/opacity'`. The string form of `apply` is a
 * strict superset of this (it resolves every channel against ONE node id).
 */
export type ClipTarget = string | Record<string, TweenTarget>;

export class ClipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipError';
  }
}

/** A compiled clip: the spec plus `apply`/`duration`. */
export interface Clip {
  readonly spec: ClipSpec;
  /** Longest channel's last relative key time (the clip's intrinsic length). */
  readonly duration: number;
  apply(target: ClipTarget, startSec: number, opts?: ApplyOpts): ClipResult;
}

function channelDuration(ch: ClipChannel): number {
  // keys are validated strictly-increasing at apply, so the last key is the max t
  return ch.keys.length === 0 ? 0 : ch.keys[ch.keys.length - 1]!.t;
}

/**
 * Resolve a channel's canonical track target. A string `target` resolves every
 * channel against the single node id (`'<nodeId>/<channel.path>'`); a map looks
 * the channel up and resolves the supplied `TweenTarget` directly (free rejection
 * of structural / anonymous ids via `resolveTweenTarget`).
 */
function resolveChannelTarget(target: ClipTarget, channel: string, path: string): string {
  if (typeof target === 'string') {
    // resolveTweenTarget rejects structural ('~Type.ordinal') / anonymous ids
    return resolveTweenTarget(`${target}/${path}`);
  }
  const override = target[channel];
  if (override === undefined) {
    throw new ClipError(
      `clip target map is missing channel '${channel}' — provide a target for every channel, or pass a node-id string`,
    );
  }
  return resolveTweenTarget(override);
}

/**
 * Compile ONE channel into a hand-authored-equivalent `Track`. Applies the
 * override (value/ease) topology-preservingly, then scales relative `t` by
 * `1/speed` and offsets by `startSec`. Routes through `track()` so `validateTrack`
 * runs (strictly-increasing t, hold-canonicalize) and the output is byte-identical
 * to the literal `track(target, type, keys)` form.
 */
function compileChannel(
  target: string,
  ch: ClipChannel,
  startSec: number,
  speed: number,
  override: ChannelOverride | undefined,
): Track {
  if (ch.keys.length === 0) {
    throw new ClipError(`clip channel '${target}' has no keys`);
  }
  const type = ch.type ?? inferValueType(ch.keys[0]!.value);
  const lastIdx = ch.keys.length - 1;
  const keys: Key[] = ch.keys.map((k, i) => {
    // rebuild each key cleanly so we never leak relative-time fields; spread the
    // value first, then patch via override / time transform
    let value = k.value;
    if (override) {
      if (i === 0 && override.from !== undefined) value = override.from;
      if (i === lastIdx && override.to !== undefined) value = override.to;
    }
    const out: Key = { t: startSec + k.t / speed, value };
    // ease: the override replaces the LAST segment's arriving ease; otherwise
    // carry the authored ease verbatim
    const ease = override && i === lastIdx && override.ease !== undefined ? override.ease : k.ease;
    if (ease !== undefined) out.ease = ease;
    if (k.interp !== undefined) out.interp = k.interp;
    if (k.id !== undefined) out.id = k.id;
    if (k.derived !== undefined) out.derived = k.derived;
    return out;
  });
  // track() runs validateTrack: strictly-increasing t (speed/offset preserve order
  // for speed > 0), hold-canonicalize for discrete types, target-shape check.
  return track(target, type, keys);
}

/**
 * Build a clip from a spec. Pure: holds no state; `apply` returns fresh tracks.
 *
 *   const fade = clip({ channels: { fade: { keys: [key(0, 0), key(0.3, 1)], path: 'opacity' } } });
 *   const { tracks, end } = fade.apply('card', 1.0);   // → 'card/opacity' track at t∈[1.0,1.3]
 */
export function clip(spec: ClipSpec): Clip {
  const names = Object.keys(spec.channels);
  if (names.length === 0) throw new ClipError('clip() requires at least one channel');
  let duration = 0;
  for (const name of names) {
    const ch = spec.channels[name]!;
    if (ch.keys.length === 0) throw new ClipError(`clip channel '${name}' has no keys`);
    duration = Math.max(duration, channelDuration(ch));
  }

  function apply(target: ClipTarget, startSec: number, opts?: ApplyOpts): ClipResult {
    const speed = opts?.speed ?? 1;
    if (!(speed > 0)) throw new ClipError(`clip speed must be > 0 (got ${speed})`);
    const overrides = opts?.overrides;
    const tracks: Track[] = [];
    let end = startSec;
    for (const name of names) {
      const ch = spec.channels[name]!;
      const trackTarget = resolveChannelTarget(target, name, ch.path);
      tracks.push(compileChannel(trackTarget, ch, startSec, speed, overrides?.[name]));
      end = Math.max(end, startSec + channelDuration(ch) / speed);
    }
    if (overrides) {
      for (const name of Object.keys(overrides)) {
        if (!(name in spec.channels)) {
          throw new ClipError(`clip override references unknown channel '${name}'`);
        }
      }
    }
    return { tracks, end };
  }

  return { spec, duration, apply };
}

/** Per-target list fan-out delay — reuses the `stagger` shape/semantics. */
export type ClipListDelay = number | ((index: number) => number);

export interface ClipListOpts extends ApplyOpts {
  /** Per-index offset (seconds), or a function of the index. Default 0. */
  stagger?: ClipListDelay;
}

/**
 * Fan a clip out over a list of targets, offsetting child i by a `stagger`-style
 * delay (REUSES the existing `stagger` shape/semantics — number per-index gap, or
 * a function of the index). `end` is the max child end.
 *
 *   clipList(popIn(), items.map((it) => it.id), 0, { stagger: 0.08 })
 */
export function clipList(
  c: Clip,
  targets: readonly ClipTarget[],
  startSec: number,
  opts?: ClipListOpts,
): ClipResult {
  const delay = opts?.stagger ?? 0;
  const at = typeof delay === 'function' ? delay : (i: number): number => i * delay;
  const { stagger: _stagger, ...applyOpts } = opts ?? {};
  const tracks: Track[] = [];
  let end = startSec;
  targets.forEach((target, i) => {
    const r = c.apply(target, startSec + at(i), applyOpts);
    tracks.push(...r.tracks);
    if (r.end > end) end = r.end;
  });
  return { tracks, end };
}
