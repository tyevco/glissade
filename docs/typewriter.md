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

## `revealFraction` — the typewriter as a fraction

`reveal` counts graphemes; sometimes you'd rather think in **progress 0→1** without knowing the grapheme count up front. `revealFraction` is pure count-rounding sugar over `reveal`: it resolves against the *same* laid-out grapheme stream to `count = round(fraction * graphemeCount)` and feeds the identical masked-emit path.

```ts
const body = new Text({ id: 'body', text: 'revealed by fraction', fontSize: 24 });

// type the whole line in over 1.2s — no need to count graphemes
track('body/revealFraction', 'number', [key(0, 0), key(1.2, 1, 'linear')]);
```

- `1` = fully shown, `0` = hidden, `0.5` on a 10-grapheme string is exactly `reveal: 5`.
- It is **whole-grapheme** (the count rounds to a grapheme boundary) — there is no sub-grapheme clip-wipe or softness.
- When set it **overrides** `reveal`; left unset (the default) a `Text` is byte-identical to one without it, so existing scenes and goldens never shift.
- Out-of-range values clamp to `[0, 1]`.

Reach for `revealFraction` when a clip or a normalized progress signal already speaks in 0→1; reach for `reveal` (or the per-keystroke staircase above) when you want a specific keystroke count or hand-felt timing.

## `splitText` — per-part sub-targets

To animate **each word, line, or grapheme independently** — stagger a word-by-word entrance, scatter graphemes, color one token — split the Text into addressable parts. `splitText` is a **build-time** helper (like `each()`): it snapshots the source's laid-out part geometry once and expands it into a `Group` of positioned child `Text` nodes, ids `${id}/${i}`. Nothing runs at play time, so `evaluate()` stays pure and the result is golden-stable by construction.

It ships on its own tree-shaken subpath — **`@glissade/scene/type`** — so the base embed never pays for it (mirroring `@glissade/scene/layout`).

```ts
import { Text, createScene } from '@glissade/scene';
import { splitText } from '@glissade/scene/type';
import { timeline } from '@glissade/core';

const split = splitText(
  new Text({ id: 'title', text: 'split the text', fontSize: 40, align: 'center', position: [320, 110] }),
  { by: 'word', measurer: backend }, // 'word' | 'line' | 'grapheme' (default 'word'); { measurer } = exact layout
);

createScene({ children: [split.node] }); // REPLACES the source — don't also add it

// each word pops in, cascaded — split.targets(prop) hands you the bind-ready ids
timeline((tl) => {
  tl.stagger(
    split.targets('opacity'), // === ['title/0/opacity', 'title/1/opacity', …] in reading order
    { from: 0, to: 1, duration: 0.4, ease: 'easeOutCubic' },
    { each: 0.18 },
  );
});

// a word-by-word typewriter: stagger revealFraction 0→1 across the parts
timeline((tl) => {
  tl.stagger(split.targets('revealFraction'), { from: 0, to: 1 }, { each: 0.1 });
});
```

`split.targets(prop)` returns `[`${id}/0/${prop}`, `${id}/1/${prop}`, …]` in reading order — the one-line path. If you need the ids individually, each part carries its own: `split.parts[i].id` (the child node's registered id, e.g. `'title/0'`) — so `split.parts.map((p) => `${p.id}/revealFraction`)` is equivalent. For imperative drive, `split.parts[i].node` is the settable `Text` handle (`split.parts[i].node.revealFraction.set(0.5)`).

Two authoring semantics worth pinning:

- **Static snapshot.** Part boxes are captured at build time from the source's measurer. Animating the *source's* `width`/`fontSize` afterward will **not** reflow the parts — the same tradeoff `each()` makes. Re-`splitText()` if you need a different layout. (Each part is a normal `Text`, so the *parts* still animate position/scale/opacity/etc. freely.)
- **Replace the source.** `splitText` returns the `Group` (`split.node`) to draw *instead of* the original Text — add only the group, or the original double-draws.

The result also exposes `split.children` (the part nodes in reading order) and `split.parts` (per-part `{ id, text, node, line, box }` — `id` is the child node's registered `${id}/${i}`, `node` the settable `Text` handle, `box` its geometry in the source's draw space). Splitting by grapheme uses `Text.graphemeBoxes()` — the per-grapheme analogue of `wordBoxes()`, boxing the same units `reveal`/`graphemes()` count, so a grapheme split lines up with what the unsplit Text draws.

### `splitText` needs the backend text measurer

`splitText` snapshots part geometry **at build time**, so it needs a real text measurer to place each part where the unsplit Text would draw it. The backend (`SkiaBackend` on the CLI/export, `Canvas2DBackend` in the browser) implements the `TextMeasurer` interface — pass it in:

```ts
import { splitText } from '@glissade/scene/type';

// pass the backend as the measurer for exact part geometry
const split = splitText(titleProps, { by: 'word', measurer: backend });
```

If you don't pass one, `splitText` falls back through the source's injected measurer and the process default (`setDefaultMeasurer`). Only when **none** is available does it use a rough per-character estimate whose error accumulates left-to-right — the parts drift out of alignment. You have three ways to get exact layout:

- pass `{ measurer: backend }` to `splitText` (the backend is a `TextMeasurer`), or
- call `splitText` **after** the scene's `setTextMeasurer()` runs (the source's `measurerSource` then resolves the real measurer), or
- register a process-wide measurer up front with `setDefaultMeasurer(createMeasurer({ fonts }))` (`@glissade/backend-skia`) — the Node factory-time pattern.

When `splitText` does fall back to the estimate, it emits a one-shot dev-warning (`splitText: no text measurer available …`) so the drift is never silent.

Compose `splitText` with `revealFraction` and `tl.stagger` for richer kinetic typography — e.g. a word-staggered entrance over the top line and a fraction-driven typewriter on the body.

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

A complete cold-open — text node, blinking caret, and the edit track wired together:

```ts
import { Text, textCursor, typewriter, createScene } from '@glissade/scene';
import { timeline } from '@glissade/core';

const prompt = new Text({ id: 'prompt', fontFamily: 'DejaVu Sans', fontSize: 28 });
// NOTE: don't set `reveal` — leaving it at Infinity shows the whole current
// string, so the caret sits at the end of whatever `tw.track` last typed.

const tw = typewriter('prompt/text', [
  { type: 'make it pop' },
  { hold: 0.4 },
  { delete: 3 },          // backspace 'pop'
  { type: 'sing' },
]);

createScene({
  children: [prompt, textCursor(prompt, { id: 'caret', blinkPeriod: 0.8 })],
});

timeline({ tracks: [tw.track] }); // the only track the cold-open needs
```

`textCursor` reads `prompt.revealHead()` each frame; with `reveal` at Infinity that's the end of the current string, so the caret follows the typing **and** the deletes for free.

To drive **sibling UI off the same edit script** — an attempts counter, a step dot — use `tw.steps`: one `{ index, start, end, value }` per edit step, so you key off `steps[i].end` instead of recomputing wall-clock spans:

```ts
// a chip that counts the cold-open's drafts as each attempt completes
track('counter/text', 'string', tw.steps
  .filter((s) => s.value === '')                 // each retype begins after an empty
  .map((s, i) => key(s.end, String(i + 1), { interp: 'hold' })));
```

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
