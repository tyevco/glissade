# @glissade/element

`<gs-player>` — a shadow-DOM custom element wrapping `mount()`: controls (play/pause, scrubber, time readout) gated by an attribute, CSS-part themable, ≤ 5 kB gz on top of the base path.

```sh
npm i @glissade/element
```

```html
<gs-player controls loop autoplay></gs-player>
<script type="module">
  import '@glissade/element';
  document.querySelector('gs-player').scene = sceneModule; // { createScene, timeline }
</script>
```

## Part of glissade

*(glide & slide)* — programmatic motion graphics for TypeScript: realtime-first in any web page, deterministic headless video export from the same code, a visual studio over the same document. No generator functions.

- [Repository & full README](https://github.com/tyevco/glissade)
- [Getting started](https://github.com/tyevco/glissade/blob/main/docs/getting-started.md) · [Concepts](https://github.com/tyevco/glissade/blob/main/docs/concepts.md) · [Interactivity](https://github.com/tyevco/glissade/blob/main/docs/interactivity.md)

Apache-2.0.
