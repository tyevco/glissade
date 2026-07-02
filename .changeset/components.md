---
"@glissade/scene": minor
---

`defineComponent()` — reusable, typed, describe()-legible animated subscenes

The missing composition unit: `defineComponent({ name, props, build })` turns a parameterized subscene into a first-class building block — the user-defined generalization of the built-in `Grid()`/`Chart()`/`splitText()` factories (all already pure "props → subtree" build-time functions).

```js
const LowerThird = defineComponent({
  name: 'LowerThird',
  props: { name: { type: 'string', required: true }, accent: { type: 'color' } },
  build: ({ name, accent }, cid) => new Group({ id: cid(), children: [
    new Rect({ id: cid('bar'), width: 6, height: 40, fill: accent }),
    new Text({ id: cid('name'), text: name, box: { valign: 'center' } }),
  ]}),
});
const lt = LowerThird({ id: 'intro', name: 'Ada', accent: '#4ea1ff' });
tl.to(lt.childId('bar') + '/height', 40, { from: 0 });
```

**Pure build-time** — `build` runs once at construction and emits ordinary nodes, so `evaluate()` stays a pure function of time and every existing golden is byte-identical. **ID-scoping is the safety story**: every instance carries a required `id` and every child is stamped through `cid(sub)` → `<id>/<sub>`, so instancing the same component N times (distinct ids) never collides track targets. The factory returns `{ node, id, childId(sub?), targets(child, prop) }`. Duplicate names and missing/empty ids fail loud.

**Machine-legible**: `describe().components` lists every component defined so far with its typed prop surface (a new optional manifest section, generated from a live registry — can't drift), so an agent or the studio sees what a component accepts. On the tree-shakeable `@glissade/scene/component` subpath (base embed unchanged), re-exported as `window.glissade.defineComponent`. New golden + showcase scene (a `LowerThird` instanced 3× — composing clip + box-valign). Docs: `docs/components.md`.
