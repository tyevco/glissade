---
'@glissade/scene': patch
---

Lock the closed §3.1 node taxonomy and add the named `Custom` extension point.

- Add `export abstract class Custom extends Node {}` — the documented base authors subclass to emit IR commands (the ninth taxonomy member).
- Add the frozen `NODE_TAXONOMY` tuple (`['Group','Rect','Circle','Path','Text','Image','Video','Layout','Custom']`) and the `NodeTypeName` type — an enumerable lock on the "small, closed set" guarantee.
- Export `Image` as an alias of `ImageNode` so the public name matches DESIGN §3.1 (`ImageNode` remains exported for back-compat).

Additive only — no node behavior changes; goldens are byte-identical.
