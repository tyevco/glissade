---
"@glissade/scene": patch
---

`defineComponent`: fail loud on a malformed prop spec

A no-build author (unguarded by TypeScript) passing a string shorthand like `props: { x: 'string' }` used to be silently accepted and lose the type in `describe().components` (it became `{}`). `defineComponent` now validates each prop spec is `{ type: string, required? }` and throws a `ComponentError` naming the bad prop otherwise. (edcc canary nit `NcGk24ytSkNx`.)
