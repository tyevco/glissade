# Fitting & anchoring text

Three authoring helpers (0.35) for the text-geometry an author would otherwise
hand-roll: **word-level narration anchors**, **`box` vertical anchoring**, and
**`fitText`** shrink-to-fit. All are pure — no runtime state, no determinism
impact — and the measurer-driven ones want a real measurer for exact results.

## Land a visual on the spoken word

`narration(timing)` exposes segment anchors (`.start`/`.end`/`.at`). When the
provider supplied per-word timestamps (`words[]` in the timing manifest), you can
anchor to a **word**:

```ts
import { narration } from '@glissade/narrate';
const n = narration(timing);

tl.set('chip/opacity', 1, { at: n.word('seg-3', 'busy') });   // pop ON "busy"
n.wordEnd('seg-3', 'busy');                                    // its end second
n.word('seg-3', 'go', 1);                                      // the 2nd "go" (nth, 0-based)
```

The word is matched case- and punctuation-insensitively (`'busy'` finds
`'busy.'`). It fails loud if the segment has no word timings or the word/occurrence
isn't found — so a stale reference can't silently drift to the segment start.

## Center text in a box — `box: { valign }`

`Text` is baseline-anchored by default. To optically center a label in a box
(the pill/chip/row case), set `box: { valign: 'center' }` — it centers the text's
**real ink** (ascent + descent from the measurer, single- *and* multi-line) on
the node position, replacing the `fontSize * 0.35` fudge:

```ts
new Text({ text: 'Save', position: [cx, cy], align: 'center', box: { valign: 'center' } });
```

`valign: 'top'` / `'bottom'` frame the ink at the top/bottom of an `h`-tall box
centered on the position (pass `h`). Because it centers by font *metrics*, a
label stays put whether or not its string has descenders — the whole point.
Omitting `box` is the byte-identical baseline default; highlights and reveals
follow the shifted text.

## Shrink text to fit — `fitText`

`fitText(text, { maxW, maxLines?, maxH?, minPx? })` sets a `Text`'s `fontSize` to
the largest that wraps within the box (a build-time binary search over the
measurer, like `Grid`/`splitText`) and returns the node. It fails loud if the
text can't fit even at `minPx` (or pass `onOverflow: 'clamp'`):

```ts
import { fitText, fitTextGroup } from '@glissade/scene/type';

fitText(title, { maxW: 280, maxLines: 2, measurer: backend });   // shrink to fit
```

`fitTextGroup([labels], { maxW })` fits several texts to **one shared size** — the
largest at which every one fits — so a row of labels renders uniformly (killing
the "same list, three sizes" ragged-headers bug). `fitTextSize(...)` returns just
the number if you'd rather apply it yourself.

Pass `{ measurer }` (or call `setTextMeasurer` first) for exact fit — without one,
the estimating fallback is used with a one-time warning, the same footgun as
`splitText`.
