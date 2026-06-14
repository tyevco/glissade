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

## Keystroke sync (the SFX contract)

`revealSchedule(text, revealTrack)` is the pure bridge to audio — geometry from the text, timing from the track:

```ts
import { revealSchedule, type RevealMark } from '@glissade/scene';

const marks = revealSchedule(title, revealTrack);
// RevealMark = { charIndex, grapheme, time, x, y, line }
```

Each `RevealMark` is one revealed grapheme with the time it appears and the caret position when it does — the direct analogue of narration's `TimedWord[]`. `@glissade/sfx` keystroke-sync consumes this to place one click per mark (`at: mark.time`); the raw `grapheme` is carried so the audio layer decides char-class policy (skip spaces and newlines, pick a different sample). Graphemes the track never reveals are omitted.

## Determinism

`reveal` is a number track and `graphemes()` / `revealHead()` / `revealSchedule()` are pure functions of the text geometry — no clock, no randomness. The same document samples identically at any `t` on both the canvas2d and Skia backends, so the typewriter is covered by the golden-frame corpus like any other pixel.
