/**
 * Edit-event-aware typewriter authoring. `Text.reveal` is monotonic sugar for
 * the type-only case; real terminal cold-opens type, delete, and retype. Since
 * `Text.text` is itself a signal, the honest substrate is a hold-key STRING
 * track that carries the visible text after every keystroke — including
 * backspaces. This compiles a compact edit script into that track plus a
 * per-keystroke schedule (deletes included) for keystroke SFX.
 *
 * Drive `Text.text` with the returned track and leave `reveal` at its default
 * (Infinity): the whole current string shows, so deletion just works, and
 * `textCursor` rides the end of the live text with no extra wiring.
 */

import { key, track, type Key, type Track } from '@glissade/core';
import { segmentGraphemes } from './text.js';

/** One step of a typewriter performance. */
export interface TypeEdit {
  /** graphemes to type in, one keystroke at a time */
  type?: string;
  /** graphemes to backspace, one keystroke at a time */
  delete?: number;
  /** seconds to hold the current text before the next step (a pause beat) */
  hold?: number;
  /** seconds per keystroke for THIS step; overrides the global perChar */
  perChar?: number;
}

/** One keystroke in the compiled schedule — the keystroke-SFX contract,
 * extended with `kind` so a backspace can take a different sample. */
export interface EditMark {
  /** keystroke time, absolute timeline seconds */
  time: number;
  /** a character appeared (insert) or was removed (delete/backspace) */
  kind: 'insert' | 'delete';
  /** the grapheme inserted, or the one removed */
  grapheme: string;
  /** the full visible string AFTER this keystroke */
  value: string;
}

/** One edit step's phrase boundary — for driving sibling UI (a counter chip, a
 * progress dot) off the same source instead of recomputing wall-clock spans. */
export interface StepMark {
  /** index of the step in the edit script */
  index: number;
  /** time this step began (before its first keystroke) */
  start: number;
  /** time this step completed (after its last keystroke and its hold) */
  end: number;
  /** the full visible string after this step */
  value: string;
}

export interface TypewriterResult {
  /** hold-key string track for the Text node's `<id>/text` target */
  track: Track<string>;
  /** every keystroke (insert + delete), for keystroke SFX */
  marks: EditMark[];
  /** one entry per edit step, with its start/end times — phrase boundaries */
  steps: StepMark[];
  /** time of the last keystroke or hold — the performance's end */
  duration: number;
}

const DEFAULT_PER_CHAR = 0.06;

/**
 * Compile an edit script into a string track + keystroke schedule.
 *
 *   const tw = typewriter('prompt/text', [
 *     { type: 'make it pop' },
 *     { hold: 0.4 },
 *     { delete: 3 },            // backspace 'pop'
 *     { type: 'sing' },
 *   ]);
 *   // tracks: [tw.track, ...]; keystroke SFX: keystrokeClips(tw.marks, ...)
 */
export function typewriter(
  target: string,
  edits: readonly TypeEdit[],
  opts: { start?: number; perChar?: number } = {},
): TypewriterResult {
  const start = opts.start ?? 0;
  const globalPer = opts.perChar ?? DEFAULT_PER_CHAR;

  let t = start;
  const shown: string[] = []; // current visible graphemes
  const keys: Key<string>[] = [key(start, '', { interp: 'hold' })];
  const marks: EditMark[] = [];
  const steps: StepMark[] = [];

  for (let ei = 0; ei < edits.length; ei++) {
    const edit = edits[ei]!;
    const stepStart = t;
    const per = edit.perChar ?? globalPer;
    if (edit.type !== undefined) {
      for (const g of segmentGraphemes(edit.type)) {
        t += per;
        shown.push(g);
        const value = shown.join('');
        keys.push(key(t, value, { interp: 'hold' }));
        marks.push({ time: t, kind: 'insert', grapheme: g, value });
      }
    }
    if (edit.delete !== undefined) {
      for (let i = 0; i < edit.delete && shown.length > 0; i++) {
        t += per;
        const removed = shown.pop()!;
        const value = shown.join('');
        keys.push(key(t, value, { interp: 'hold' }));
        marks.push({ time: t, kind: 'delete', grapheme: removed, value });
      }
    }
    if (edit.hold !== undefined) t += edit.hold;
    steps.push({ index: ei, start: stepStart, end: t, value: shown.join('') });
  }

  return { track: track(target, 'string', keys), marks, steps, duration: t };
}
