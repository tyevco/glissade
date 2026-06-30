---
'@glissade/browser': minor
---

browser: `window.glissade.describe({ examples: true })` surfaces the runnable example corpus

The no-build IIFE now registers the `@glissade/scene/examples` corpus, so a no-build agent gets a copy-pasteable, **doctest-verified** snippet per node / builder method / helper straight off `window.glissade`:

```js
const m = window.glissade.describe({ examples: true });
m.nodes.Rect.examples;   // → ["import { Rect } from '@glissade/scene';\nnew Rect({ … })"]
```

This is the cold-agent onboarding fix — the canonical example can't go stale (it's run in CI). `describe()` (zero-arg) is byte-identical; the corpus rides only the convenience bundle (the budget was raised 50→53), never the base embed.
