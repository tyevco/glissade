/**
 * Keyframe edit operations (DESIGN.md §6.2): pure functions from a merged
 * track to a new sidecar key array. Every result passes through
 * normalizeEditedKeys, so the §2.7 spring invariant (a spring key's t is
 * intrinsic) and collision nudging hold through every operation — the UI
 * can't construct an invalid track.
 */

import { getValueType, key, normalizeEditedKeys, sampleTrack, type EaseSpec, type Key, type Track } from '@glissade/core';

export interface KeyRef {
  target: string;
  t: number;
}

/** Same-key tolerance: edits within 1 ms address the same key (matches the nudge step). */
const EPS = 0.001;

export function closestIndex(keys: readonly Key[], t: number): number {
  let best = 0;
  let dist = Infinity;
  keys.forEach((k, i) => {
    const d = Math.abs(k.t - t);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

/** Add a key at t with the value sampled from the current curve; null within 1 ms of an existing key. */
export function addKeyAt(track: Track, t: number): Key[] | null {
  if (t < 0 || track.keys.some((k) => Math.abs(k.t - t) < EPS)) return null;
  return normalizeEditedKeys([...track.keys, key(t, sampleTrack(track, t))]);
}

/** Delete the key nearest t; null when it is the track's last key (a track needs ≥ 1). */
export function deleteKeyAt(track: Track, t: number): Key[] | null {
  if (track.keys.length <= 1) return null;
  const i = closestIndex(track.keys, t);
  return normalizeEditedKeys(track.keys.filter((_, j) => j !== i));
}

/** Move the key nearest fromT to toT (drag retiming). */
export function retimeKeyAt(track: Track, fromT: number, toT: number): Key[] {
  const i = closestIndex(track.keys, fromT);
  return normalizeEditedKeys(track.keys.map((k, j) => (j === i ? { ...k, t: Math.max(0, toT) } : k)));
}

/** Replace the value of the key nearest t. */
export function setValueAt(track: Track, t: number, value: unknown): Key[] {
  const i = closestIndex(track.keys, t);
  return normalizeEditedKeys(track.keys.map((k, j) => (j === i ? { ...k, value } : k)));
}

/** Set (or clear, with undefined) the arriving ease of the key nearest t; hold = step interpolation. */
export function setEaseAt(track: Track, t: number, ease: EaseSpec | undefined, hold = false): Key[] {
  const i = closestIndex(track.keys, t);
  return normalizeEditedKeys(
    track.keys.map((k, j) => {
      if (j !== i) return k;
      const { ease: _ease, interp: _interp, ...rest } = k;
      return {
        ...rest,
        ...(ease !== undefined ? { ease } : {}),
        ...(hold ? { interp: 'hold' as const } : {}),
      };
    }),
  );
}

/** Update the key at exactly t (±1 ms) or insert one — the inspector's write-at-playhead. */
export function upsertKeyAt(track: Track, t: number, value: unknown): Key[] {
  const i = track.keys.findIndex((k) => Math.abs(k.t - t) < EPS);
  const keys =
    i >= 0 ? track.keys.map((k, j) => (j === i ? { ...k, value } : k)) : [...track.keys, key(Math.max(0, t), value)];
  return normalizeEditedKeys(keys);
}

/** Parse user input per value type; null = reject (leave the document untouched). */
export function parseValue(type: string, raw: string): unknown | null {
  const s = raw.trim();
  switch (type) {
    case 'number': {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    }
    case 'vec2': {
      const parts = s
        .replace(/^\[|\]$/g, '')
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(parseFloat);
      return parts.length === 2 && parts.every(Number.isFinite) ? ([parts[0]!, parts[1]!] as const) : null;
    }
    case 'color': {
      try {
        getValueType<string>('color').lerp(s, s, 0); // parse check via the registry
        return s;
      } catch {
        return null;
      }
    }
    case 'boolean':
      return s === 'true' ? true : s === 'false' ? false : null;
    default:
      return s; // string and custom types pass through
  }
}

/** Display formatting, the inverse of parseValue's accepted shapes. */
export function formatValue(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(4)));
  if (Array.isArray(v)) return v.map((n) => (typeof n === 'number' ? parseFloat(n.toFixed(4)) : n)).join(', ');
  return String(v);
}
