/**
 * Source generation for the write-back affordances (DESIGN.md §6.2 rules 4 & 7).
 *
 * Both "copy as code" (non-editable prop preview) and "extract edits to code"
 * (editable sidecar track) are CLIPBOARD-ONLY by locked decision — these helpers
 * emit `key(...)` / `track(...)` source the user pastes themselves. Source is
 * never auto-edited; codegen-merge against arbitrary user code is out of scope.
 */

import { type Key, type Track } from '@glissade/core';

/** A JS literal for a keyframe value: numbers verbatim, vec2 as a tuple, strings quoted. */
export function valueLiteral(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(4)));
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(valueLiteral).join(', ')}]`;
  return JSON.stringify(String(v));
}

function easeLiteral(ease: Key['ease']): string | null {
  if (ease === undefined) return null;
  if (typeof ease === 'string') return JSON.stringify(ease);
  // a spring or cubic-bezier object — emit it structurally
  return JSON.stringify(ease);
}

/** One `key(t, value[, ease])` call. Stable-id and `derived` metadata are intentionally dropped. */
export function keyCall(k: Key): string {
  const ease = easeLiteral(k.ease);
  const t = Number.isInteger(k.t) ? String(k.t) : String(parseFloat(k.t.toFixed(4)));
  return ease !== null
    ? `key(${t}, ${valueLiteral(k.value)}, ${ease})`
    : `key(${t}, ${valueLiteral(k.value)})`;
}

/**
 * A whole track as a `track('<target>', '<type>', [ key(...), … ])` literal —
 * the "extract edits to code" output (§6.2 rule 7). Paste this into a timeline's
 * `tracks` to replace the deleted sidecar entry with code.
 */
export function trackSource(track: Pick<Track, 'target' | 'type' | 'keys'>): string {
  const keys = track.keys.map((k) => `  ${keyCall(k)}`).join(',\n');
  return `track(${JSON.stringify(track.target)}, ${JSON.stringify(track.type)}, [\n${keys},\n])`;
}

/**
 * A single value-at-time as `key(...)` — the "copy as code" output for a
 * non-editable prop's session-transient preview (§6.2 rule 4). Carries a
 * comment naming the target so the paste is self-documenting.
 */
export function previewSource(target: string, t: number, value: unknown): string {
  return `// ${target} @ t=${parseFloat(t.toFixed(4))}\n${keyCall({ t, value })}`;
}
