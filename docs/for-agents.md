# glissade for AI agents

You can't glance at a canvas. So the rules that keep a human productive — "eyeball
it, it looks wrong, fix it" — don't apply to you. This page is the cold-start
guide for an agent: the things that are uniquely yours to get right, in the order
they bite.

## 1. Call `describe()` first — trust it over everything, including this page

`glissade.describe()` returns a **live, machine-readable manifest** generated from
the same registries the engine runs on — so it cannot drift from the runtime the
way prose (a README, a blog post, your training prior) can. Read it before you
write a scene:

```js
const m = glissade.describe();
m.nodes;        // every node type → its props: { type, animatable, target, arity }
m.helpers;      // createPlayer / mount / motionPath / clip / splitText / Grid / Stack / … with usage + import
m.easings;      // the valid easing names
m.builder;      // timeline builder methods + their exact option keys
m.valueTypes;   // 'vec2' | 'color' | 'number' | 'path' | …
```

If a prop is `animatable: true`, its `target` string (e.g. `<id>/position`) is what
a timeline track binds to. If it's `animatable: false`, it's a **construction prop**
— pass it to the constructor, never to a track. When in doubt, `describe()` is the
ground truth; this doc is not.

## 2. The load model (no-build)

In a `<script src>` page the whole realtime surface is one global, `window.glissade`:

```html
<script src="https://unpkg.com/@glissade/browser/dist/glissade.browser.js"></script>
```

That base bundle is the **playback** tier (canvas2d). The **DOM** tier (for
editing / a11y / DOM-screenshot verification — see §5) ships as a SEPARATE optional
second script that *augments* the same global, loaded **after** the base:

```html
<script src="https://unpkg.com/@glissade/browser/dist/glissade-dom.browser.js"></script>
<!-- now window.glissade also has DomBackend + emitWithIds -->
```

Load order is fail-loud: the DOM script throws a clear error if the base is missing
or a version mismatches — never a silent `undefined`. (With an npm build, import the
same names from `@glissade/*` packages instead of the global.)

## 3. Fail-loud is on your side — read the error, don't guess

glissade deliberately **throws instead of silently swallowing** the mistakes an
agent can't otherwise see:

- An unknown timeline option (`to(t, v, { eaze })`) → `TimelineValidationError` naming the valid keys.
- An unknown construction prop (`new Rect({ size: [80, 80] })` — Rect has `width`/`height`, not `size`) → `NodeConstructionError` naming the bad key + the valid props.
- Binding a construction prop as a track target → a message telling you to set it at construction.

So when something throws, **read the message — it usually names the fix** — and
re-query `describe()`. A throw is a feature: it's the glance-test you don't have.

## 4. A minimal, correct hello-world

Written against the real runtime (these exact shapes — not the common stale
variants noted inline):

```js
const scene = glissade.createScene({
  size: { w: 640, h: 360 },
  // nodes go under `children` (NOT a `build` callback); Rect uses width/height (NOT size)
  children: [new glissade.Rect({ id: 'box', position: [80, 140], width: 80, height: 80, fill: '#89b4fa' })],
});

const tl = glissade.timeline((t) => {
  // the animatable transform target is the vec2 `box/position` (there is no scalar `box/x`);
  // the tween option is `ease` (NOT `easing`)
  t.to('box/position', [480, 140], { duration: 1, ease: 'easeOutCubic' });
});

const mounted = glissade.mount(scene, tl, document.querySelector('canvas'));
mounted.player.play();
```

## 5. Verifying output — the canvas trap

Your instinct is "screenshot it to check." **For the canvas tier that fails
silently** — `html-to-image` / DOM screenshotters cannot see inside a `<canvas>`,
so you get a blank or CSS-only frame and a false green. The honest paths:

- **`glissade.renderToDataURL(scene, tl, t)`** → a PNG data URL of frame `t` you can decode/compare. (It's `async`.)
- **Pixel-sample** the canvas: `ctx.getImageData(...)` and assert on pixels.
- **Use the DOM backend** for verification-heavy or editable work: it renders to real
  HTML/SVG elements that DOM screenshotters *can* see, with selectable text and
  `data-node-id` for click-to-edit. (See §6.)

Because `evaluate(scene, tl, t)` is a **pure function of `t`**, any frame is
reproducible — verify a specific `t`, not a live clock.

## 6. The two-tier mental model — pick per task

glissade has two render backends; they are for different jobs:

| | **canvas / Skia** | **DOM** (`@glissade/backend-dom`) |
|---|---|---|
| For | playback + **export** | **edit / preview / a11y** |
| Fidelity | byte-exact (the `gs render` master) | preview / **non-parity** |
| Output | pixels (opaque to DOM tools) | real HTML/SVG elements (selectable, screenshotter-visible) |
| Identity | — | `data-node-id` → `scene.nodes.get(id).set(…)` (click-to-edit) |

Same scene, same `DisplayList` IR, different sink. Export stays on the raster path;
reach for the DOM tier when you need to inspect, edit, or DOM-screenshot.

## 7. The timeline model in one paragraph

The fluent builder (`timeline(tl => …)`) **compiles to a serializable document** —
nothing executes at play time. Each `to`/`fromTo` advances a **per-target cursor**;
place a tween at an absolute time with the position grammar (`{ at }`, `'+=0.5'`,
`'<'`/`'>'`, a label). There are **no generators and no promise-chained
sequencing**. Compose 0-relative sub-timelines onto a parent with `add`/`sequence`/
`at`; attach clip-tier tracks (`presence`/`clip`/…) with `tl.tracks(...)`. See
[Composing timelines](./timeline) for the full grammar, and `describe().builder`
for the exact method/option signatures.

---

**The throughline:** glissade's bones are built for you — `describe()` is ground
truth, fail-loud guards turn silent landmines into caught errors, and determinism
makes verification reproducible. Query the manifest, read the errors, verify a pure
frame, and pick the right tier — and you skip the stale-blurb hour entirely.
