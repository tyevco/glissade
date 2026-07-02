# Reusable components

`defineComponent()` (0.36) turns a parameterized subscene into a first-class,
typed, `describe()`-legible building block — the user-defined generalization of
the built-in `Grid()` / `Chart()` / `splitText()` factories. Build a component
library instead of one-off scenes.

```ts
import { Group, Rect, Text } from '@glissade/scene';
import { defineComponent } from '@glissade/scene/component';

const LowerThird = defineComponent<{ name: string; title: string; accent: string }>({
  name: 'LowerThird',
  props: {
    name: { type: 'string', required: true },
    title: { type: 'string', required: true },
    accent: { type: 'color' },
  },
  build: ({ name, title, accent }, cid) =>
    new Group({
      id: cid(),                                   // the instance root
      children: [
        new Rect({ id: cid('bar'), width: 6, height: 40, fill: accent }),
        new Text({ id: cid('name'), text: name, box: { valign: 'center' }, /* … */ }),
        new Text({ id: cid('title'), text: title, fill: accent, /* … */ }),
      ],
    }),
});

const lt = LowerThird({ id: 'intro', name: 'Ada', title: 'Engineer', accent: '#4ea1ff' });
// scene children: [lt.node]
// animate a child by its namespaced target:
tl.to(lt.childId('bar') + '/height', 40, { from: 0, duration: 0.6 });
```

## Pure, and safely instanced

`build` runs **once at construction** and emits ordinary nodes, so `evaluate()`
stays a pure function of time and every golden holds by construction — nothing
runs at play time. A component may compose anything (clip, box-valign, other
components, tracks bound by the parent).

The **id-scoping** is the whole safety story. Every instance carries a required
`id`, and every internal node is stamped through `cid(sub)` → `<id>/<sub>`. So the
same component instanced N times (with distinct ids) never collides track
targets — `LowerThird({ id: 'a' })` and `LowerThird({ id: 'b' })` address
`a/bar` and `b/bar`. (Two instances built with the *same* id do collide — give
each a unique id, the same rule `Grid`/`Chart` follow.)

The factory returns:

- `node` — the built `Group` (its id is the instance id).
- `childId(sub?)` — namespace a child target: `childId('bar')` → `'<id>/bar'`.
- `targets(child, prop)` — ready-to-bind ids: `['<id>/<child>/<prop>']`.

## Machine-legible

`describe().components` lists every component defined so far with its typed prop
surface — so an agent or the studio sees what a component accepts, exactly like
it sees a node's props:

```ts
describe().components
// → [{ name: 'LowerThird', props: { name: { type: 'string', required: true }, … } }]
```

A duplicate component name throws (a library can't silently shadow), and a
missing/empty `id` fails loud at instantiation. On the tree-shakeable
`@glissade/scene/component` subpath (off the base embed), re-exported on the
browser bundle as `window.glissade.defineComponent`.
