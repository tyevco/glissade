# Radial gauges (`Gauge` / `Meter`)

`Gauge()` (0.38) is the radial data-viz companion to [`Chart()`](/charts) — a pure
build-time fan-out that turns a spec into arc **zones**, boundary **ticks**, a
**needle**, and **labels**, and returns an ordinary `Group`. Nothing runs at play
time, so it's byte-exact on Skia and every part is independently animatable.

```ts
import { Gauge } from '@glissade/scene/gauge';

const g = Gauge({
  id: 'trust',
  radius: 120,
  gap: 2.5,
  zones: [
    { extent: [-90, -30], color: '#e6a700', label: 'BLIND' },
    { extent: [-30,  30], color: '#3ddc97', label: 'CALIBRATED' },
    { extent: [ 30,  90], color: '#ff5d73', label: 'RAGE' },
  ],
});
// scene children: [g.node]
```

**Angle convention:** degrees, `0` = straight up (12 o'clock), `+` = clockwise /
right, `−` = counter-clockwise / left — the same convention as a node's
`rotation`, so the needle's rotation *is* its gauge angle.

## Two needle modes

**Scripted** — the needle takes authored angle keyframes. This is the teaching-
device / annotation use: overshoot, whip, settle.

```ts
tl.to(g.targets('needle', 'rotation'), -70, { from: 0, duration: 0.6 }); // into BLIND
tl.to(g.targets('needle', 'rotation'), 0, { duration: 1 });              // settle center
```

**Meter (value → angle)** — pass a `value` (or a `() => value` signal) and a
`domain`; it maps linearly across the sweep to the needle angle. A function binds
live, so the needle follows the signal:

```ts
import { Meter } from '@glissade/scene/gauge';

Meter({ id: 'cpu', radius: 100, value: () => load(), domain: [0, 100],
        zones: [{ extent: [-90, 30], color: '#3ddc97' }, { extent: [30, 90], color: '#ff5d73' }] });
```

## Independent channels (why labels don't dim with their zones)

Every part is its **own addressable node** with a stable sub-id, and **labels are
drawn last (z-above the zone decoration)**. That's deliberate: it lets you dim or
tint a zone *without* crushing its label's contrast — zone opacity and label
opacity are separate channels.

```ts
// dim the extreme zones once the needle has passed — labels stay full-brightness
tl.to(g.targets('zone-0', 'opacity'), 0.35);
tl.to(g.targets('zone-2', 'opacity'), 0.35);
// g.targets('label-0','opacity') is a *different* node — untouched, still crisp
```

Stable sub-ids: `zone-{i}`, `tick-{i}`, `needle`, `label-{i}`, `glow`. Address any
of them with `g.targets(sub, prop)` → `['<id>/<sub>/<prop>']` or
`g.childId(sub)`.

## Spec reference

| field | meaning |
|---|---|
| `id` | stable id; every child is namespaced under it (required) |
| `radius` | arc radius to the zone-band centerline (required) |
| `zones` | `{ extent: [start,end], color, label? }[]` — categorical arc zones, `start < end` (required) |
| `thickness` | zone-arc stroke width (default `radius * 0.14`) |
| `gap` | degrees trimmed off each zone boundary (default 0) |
| `needle` | `false` to omit, or `{ length, width, color }` |
| `needleAngle` | authored initial angle (deg); ignored when `value` is set |
| `value` / `domain` / `sweep` | Meter mode: value (or signal) → angle across the sweep |
| `ticks` | boundary ticks at each distinct edge (default true) |
| `labelSize` / `labelFill` / `fontFamily` | label styling; the apex zone's label is a size up + bold |
| `glow` | add a center `glow` Circle (opacity 0 — you animate it). Hard-edged by default; pass `{ blur }` for a soft Gaussian falloff (a real center-glow) |
| `position` | where to place the gauge center in the parent |

The zones don't need to be a continuous domain — they're **categorical**, each its
own colored arc, so a labeled trust/quality/status dial is a spec, not hand-rolled
arc geometry. On the tree-shakeable `@glissade/scene/gauge` subpath (off the base
embed), re-exported on the browser bundle as `window.glissade.Gauge` / `Meter`.
