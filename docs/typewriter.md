# Typewriter & text reveal

Typed-text and terminal-cursor effects as **pure data** — no per-frame string mutation. A `Text` node gains a `reveal` signal: how many graphemes of the laid-out text are shown, left-to-right. It animates like any other track, so it scrubs backward for free and renders byte-identical in CI.

```ts
import { Text } from '@glissade/scene';
import { key, track } from '@glissade/core';

const title = new Text({ id: 'title', text: 'glissade', fontSize: 36 });

// reveal one grapheme every 50ms
track('title/reveal', 'number', [key(0, 0), key(0.4, 8, 'linear')]);
```

`reveal` defaults to **Infinity** (fully shown), so adding it changes nothing until you animate it — existing scenes and goldens are byte-identical. Line breaking runs on the **full** text first and the reveal only masks the prefix, so a word never reflows as it completes.

## Authoring a per-keystroke staircase

For irregular, hand-felt timing, key each grapheme explicitly. `Text.graphemes()` returns the laid-out grapheme stream — emoji and combining marks count as one keystroke, and wrapped lines are flattened in reading order, so the indices line up with what's drawn:

```ts
const g = title.graphemes();
track('title/reveal', 'number',
  g.map((_, i) => key(t0 + i * 0.05, i + 1, { interp: 'hold' })));
```

`hold` keys make each grapheme pop in discretely; a `linear` ramp (above) types smoothly.

## The cursor

`textCursor(text)` is a sibling node that rides the reveal head — a thin caret at `Text.revealHead()`, the point just after the last revealed grapheme. It re-flows with wrap width, font, and align, and follows the text's own transform. Place it after the text so it paints on top:

```ts
import { textCursor } from '@glissade/scene';

createScene({
  children: [title, textCursor(title, { width: 3, blinkPeriod: 0.8 })],
});
```

By default the caret stays **solid while typing** (the reveal is still advancing) and switches to **blinking** once the text is fully shown — the familiar "types, then waits" terminal feel. Override with `solidWhileTyping: false` to blink throughout, or `blinkPeriod` / `blinkPhase` to tune the rhythm. The caret color follows the text's `fill` unless you set its own (animatable via `'<id>/fill'`).

## Deletion: type, delete, retype

`reveal` is **monotonic** — it only moves forward, so it can't express a terminal cold-open that types, backspaces, and retypes *different* text. Since `Text.text` is itself a signal, the honest substrate for that is a hold-key **string track** carrying the visible text after every keystroke. `typewriter()` compiles a compact edit script into exactly that track, plus a per-keystroke schedule (deletes included):

```ts
import { typewriter } from '@glissade/scene';

const tw = typewriter('prompt/text', [
  { type: 'make it pop' },
  { hold: 0.4 },          // a pause beat
  { delete: 3 },          // backspace 'pop'
  { type: 'sing' },       // retype — a string reveal could never reach
]);

timeline({ tracks: [tw.track, ...] });   // drives Text.text
```

Drive `Text.text` with `tw.track` and leave `reveal` at its default (Infinity): the whole current string shows, so deletion just works, and `textCursor` rides the end of the live text with no extra wiring. `{ perChar }` (global or per step) sets the keystroke cadence; `{ hold }` inserts a pause; `tw.duration` is when the performance ends.

## Keystroke sync (the SFX contract)

Both reveal paths produce a per-keystroke schedule for audio. For the monotonic case, `revealSchedule(text, revealTrack)` is the pure bridge — geometry from the text, timing from the track:

```ts
import { revealSchedule, type RevealMark } from '@glissade/scene';

const marks = revealSchedule(title, revealTrack);
// RevealMark = { charIndex, grapheme, time, x, y, line }
```

For the edit-script case, `typewriter().marks` carries `EditMark = { time, kind: 'insert' | 'delete', grapheme, value }` — so a backspace can take a different sound. Both feed `@glissade/sfx`'s `keystrokeClips(marks, source)`, which places one click per keystroke (`at: mark.time`); whitespace is skipped by default and the raw `grapheme` is carried so the audio layer owns char-class policy. Graphemes a monotonic track never reveals are omitted.

## Determinism

`reveal` is a number track and `graphemes()` / `revealHead()` / `revealSchedule()` are pure functions of the text geometry — no clock, no randomness. The same document samples identically at any `t` on both the canvas2d and Skia backends, so the typewriter is covered by the golden-frame corpus like any other pixel.
