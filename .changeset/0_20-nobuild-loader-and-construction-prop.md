---
'@glissade/scene': patch
'@glissade/browser': patch
---

0.20: two no-build (IIFE) fixes the design-agent canary found on `0.20.0-pre.6`

- **`loadYogaLayoutEngine()` couldn't self-load in the no-build bundle.** Its dynamic `import('yoga-layout/load')` is a bare specifier a browser can't resolve with no bundler/import map, so the headline no-build layout feature (`Stack`/`Row`/`Column`) threw *"Module name, 'yoga-layout/load' does not resolve to a valid URL."* It now accepts an optional `{ url }` to point the loader at a CDN ESM build — `loadYogaLayoutEngine({ url: 'https://esm.sh/yoga-layout@3.2.1/load' })` — resolving it without an import map. The default (bare specifier) is unchanged and still byte-identical under npm/a bundler; `docs/layout.md` documents both the `{ url }` arg and the import-map approach.

- **The construction-prop bind error fell back to the generic message in the minified IIFE.** `node.describeType` defaulted to `constructor.name`, which the bundle mangles, so `isConstructionProp(describeType, …)` missed for every node but `Image` — binding `card/fontFamily` looked identical to a typo. Every built-in node (Group/Rect/Circle/Path/Text/Video/Layout) now pins its taxonomy name as a string literal, so the specific *"'X' is a construction prop — set it at construction"* message fires in the bundle too. Render-neutral: all 262 goldens byte-identical.
