---
'@glissade/scene': minor
---

scene: executable examples registry + `describe({ examples: true })`

The new `@glissade/scene/examples` subpath is a curated corpus of **runnable** examples — a copy-pasteable `code` snippet plus an executable `run` thunk against the real API. Importing it registers the corpus with `describe()`:

```js
import '@glissade/scene/examples';
import { describe } from '@glissade/scene/describe';
const m = describe({ examples: true });
m.nodes.Rect.examples;     // → ["import { Rect } from '@glissade/scene';\nnew Rect({ … })"]
m.helpers.find((h) => h.name === 'splitText').examples;
```

A vitest doctest harness runs every example's `run()` and asserts it never throws — so a snippet that references a renamed export or a changed shape fails CI, and the surfaced examples **can't drift** from the API. `describe()` (zero-arg) is byte-identical to before; the corpus is tree-shaken off the base embed (describe reads a registry it never imports), so the base embed and the browser IIFE are unchanged.
