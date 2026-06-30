---
'@glissade/backend-dom': minor
---

backend-dom S4: accessibility + CSS-variable theming

The DOM tier exists for editing + a11y, so it now keeps the **real text** readable by assistive tech and hides the decorative geometry:

- Shape `<svg>` islands and `<img>` elements are `aria-hidden` — a screen reader reads the Text divs, not the paths.
- New `ariaLabel` option names the whole graphic (`role="figure"` + `aria-label`, which keeps the text exposed, unlike `role="img"`).
- Focus order stays the host/editor's job (every node has `data-node-id`; the backend imposes no `tabindex`).
- New `cssColorVars` option emits solid fills/text colors as `var(--gs-c-<ident>, <color>)`, so a host can re-theme (light/dark, brand) by overriding the `--gs-c-*` variables in CSS — **without a re-render**. Off by default (literal colors; byte-stable for existing consumers).

```js
new DomBackend(stage, { ariaLabel: 'Episode 1 cold open', cssColorVars: true });
```
