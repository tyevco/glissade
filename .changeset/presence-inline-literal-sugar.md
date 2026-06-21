---
'@glissade/core': minor
---

feat(core): presence inline-literal sugar — terse enter/exit literals over `presence()`

`presence()`'s `enter`/`exit` now accept an inline `PresenceTransition` literal in
addition to a `Clip`, plus a `window:[t0,t1]` alias for `{ show, hide }`:

```js
presence('card', { window: [1, 5],
  enter: { opacity: [0, 1], offset: 16, dur: 0.5, ease: 'easeOutCubic' },
  exit:  { opacity: [1, 0], offset: 16, dur: 0.4 } });
```

PURE build-time sugar. A new `transitionToClip(t, dir)` compiles the literal
(`{opacity, offset, edge, scale, dur, ease}`) to the SAME `clip({channels})` an
author writes by hand — an opacity channel (only when `opacity` is given), a
position channel from `offset`+`edge` (clipStdlib `slideIn` convention; default
`edge:'bottom'` = slide up from below; scalar `offset` slides that magnitude along
the edge; enter goes displaced→origin, exit origin→displaced; explicit `[Vec2,Vec2]`
endpoints used verbatim), and a scale channel (scalar pair broadcast to Vec2, popIn
convention). `presence()` then runs UNCHANGED on the resulting `Clip`, so the inline
spelling is byte-INDISTINGUISHABLE from the hand-built form and the default
`presence({show,hide})` bytes are untouched (all 262 goldens stay byte-identical).

OMITTING `opacity` emits NO opacity channel, relying on `presence()`'s synthesized
rise/fall — matching the Clip path exactly. `PresenceTransition` and
`transitionToClip` are re-exported from `@glissade/core/clips` (and ride the
`@glissade/browser` convenience bundle).
