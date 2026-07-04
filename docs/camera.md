# Camera rig

`camera(layers, props)` (0.55) is a cinematic camera rig for cuts, push-ins, pans,
rolls, and parallax over a layered scene. The pose is ordinary keyframe tracks, so
a push-in scrubs backward for free and renders byte-identical in CI.

```ts
import { camera } from '@glissade/scene/motion';
import { key, track } from '@glissade/core';

const cam = camera(
  [
    { content: backdrop, depth: 0.3 }, // far layer — pans LESS (parallax)
    { content: subject,  depth: 1 },   // the focal plane
  ],
  { id: 'cam' },
);

// scene children: [cam, caption]      — caption is a SIBLING (see below)
track('cam/zoom', 'number', [key(0, 1), key(3, 1.6)]);              // push in
track('cam/center.x', 'number', [key(0, 0.5), key(3, 0.6)]);        // pan right
```

It lives on the tree-shakeable **`@glissade/scene/motion`** subpath (off the base
embed), and `camera(...)` is a lowercase factory over the `Camera` node — a
`Group` subclass.

## The composition contract: the camera transforms the *world*

`Camera` applies the **inverse** camera pose as a parent transform on each of its
layers. The whole world moves under a fixed screen while every node stays
**node-local** — its anchor lives in its own local matrix, so there is no
double-apply with the node anchor. The per-layer transform is

```
T(screenCenter) · scale(zoom) · rotate(roll) · T(−effectiveCenter)
```

where a layer's `effectiveCenter` scales the **pan** by its `depth`: far layers
(`depth < 1`) translate less, near layers (`depth > 1`) more. That depth-scaled
pan *is* the parallax (v1 is pan-only; depth-of-field from depth is deferred).

## Pose — the keyframeable pose

All four are set at construction (a value or a `PropInit` bind) and animated by
track:

| Pose | Track target | Meaning |
| --- | --- | --- |
| `center` | `cam/center` (or `cam/center.x` / `.y`) | Focal / pan target in **relative** viewport coords (`[0.5, 0.5]` = screen center) — never px, so it stays responsive across landscape↔portrait. |
| `zoom` | `cam/zoom` | Scale about the focal point — a push-in when animated up. |
| `roll` | `cam/roll` | Camera rotation, degrees. |
| `shake` | *(construction-only)* | An optional whole-frame [`ShakeSpec`](#shake-standalone-pose-jitter) folded into the pose. |

`center` is fail-loud: a non-finite value, or one that leaves the safe area
`[0,1]²` (looking off-canvas), **throws** rather than silently rendering an
off-screen frame — `center` is relative viewport coords, so keep the pan target
on-screen.

## Layers & depth

Each layer is `{ content: Node, depth?: number }`. `depth` lives on the *wrapper*
(not a per-node prop, so the base Node/golden contract is untouched): `1` = the
focal plane (the default), `<1` = farther (pans less), `>1` = nearer (pans more).
A rig needs at least one layer; a missing `content` Node or a negative depth
throws.

## Caption-pin is structural, not a flag

To keep a lower-third pinned while the camera moves, make it a **sibling** of the
`Camera` (outside the rig) rather than a layer. The camera transform never touches
its siblings, so an anchored caption stays put *by construction* — there is no
"pin this" flag to forget:

```ts
createScene({
  size: { w: 640, h: 360 },
  children: [
    camera([{ content: bg, depth: 0.3 }, { content: fg }], { id: 'cam' }),
    caption, // a SIBLING — untouched by the camera move, stays pinned
  ],
});
```

## `shake()` — standalone pose jitter

`shake(node, spec)` (0.55) is a standalone driver that wobbles **any** node's pose
with deterministic value noise — it subsumes the hand-rolled per-element jitters
(desk cursor, glitch, typewriter) behind one primitive with separate translate /
rotate / frequency amplitudes:

```ts
import { shake } from '@glissade/scene/motion';

// the cursor wobbles ±3px around wherever else it is (its position track, a followPath, …)
createScene({ children: [shake(cursor, { seed: 7, translate: 3 })] });
```

| `ShakeSpec` | Meaning |
| --- | --- |
| `seed` | Seed for the deterministic noise — same seed ⇒ same wobble, every run. |
| `translate` | Peak translation amplitude, px (±); default 0. |
| `rotate` | Peak rotation amplitude, degrees (±); default 0. |
| `frequency` | Noise cycles per second (higher = twitchier); default 8. |

Pass at least one nonzero amplitude (both zero throws). The jitter is realized at
emit (the `Echo`/`motionBlur` idiom): `shake` wraps the node's `emit` in a
save → shake-transform → emit → restore, where the transform is a pure function of
`ctx.time` via `valueNoise`. So it **composes** on top of whatever already drives
the node (keyframes, layout, `followPath`) as a parent-space offset, with no
cross-frame state. A rotational jitter spins the node about its own origin. The
`Camera`'s whole-frame `shake` prop reuses the same offset directly on its pose.

## Worked example: a parallax push-in under shake

The [`golden-camera`](https://github.com/tyevco/glissade/blob/main/packages/examples/src/scenes/golden-camera.ts)
scene pushes a 2-depth stack in (`cam/zoom` 1→1.6 while `cam/center` pans
off-center) under a fixed-seed whole-frame shake, with a pinned caption sibling:

```ts
import { key, timeline, track } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';
import { camera } from '@glissade/scene/motion';

const far = new Group({ id: 'far', children: [/* dim backdrop + scattered dots */] });
const focal = new Group({
  id: 'focal',
  children: [
    new Circle({ id: 'subject', radius: 46, position: [320, 170], fill: '#39e0ff' }),
    // anchor:'left' — the push-in keeps this camera-transformed but not double-shifted
    new Rect({ id: 'leftbar', anchor: 'left', position: [190, 260], width: 200, height: 22, fill: '#f5a623' }),
  ],
});

const cam = camera(
  [{ content: far, depth: 0.3 }, { content: focal, depth: 1 }],
  { id: 'cam', shake: { seed: 7, translate: 2.5, rotate: 0.5, frequency: 6 } },
);

const caption = new Text({ id: 'caption', text: 'PUSH IN', position: [320, 338],
  fontSize: 20, fontFamily: 'DejaVu Sans', fill: '#ffffff', align: 'center' });

const mod: SceneModule = {
  createScene: () => createScene({ size: { w: 640, h: 360 }, children: [cam, caption] }),
  timeline: timeline({
    fps: 60, duration: 3,
    tracks: [
      track('cam/zoom', 'number', [key(0, 1), key(3, 1.6)]),
      track('cam/center.x', 'number', [key(0, 0.5), key(3, 0.6)]),
      track('cam/center.y', 'number', [key(0, 0.5), key(3, 0.54)]),
    ],
  }),
};
```

The `anchor:'left'` bar on the focal plane is the composition-contract proof: the
camera transforms the world as a parent transform while the bar's anchor stays
node-local, so the push-in never double-shifts it. The far layer pans less than
the focal plane — that's the parallax.

## Determinism & interchange

The pose (`center` / `zoom` / `roll`) is keyframed tracks and `shake` is a pure
closed-form function of the playhead (seeded value noise, no `Date`/`Math.random`,
no cross-frame state), so the whole frame byte-compares on Skia in CI. One caveat
for export: like `Echo` and `motionBlur`, the `shake` offset is realized at emit
rather than as a Timeline track, so it is a render-only effect — a `gs export` to
Lottie **warns** and does not bake the jitter into keyframes (never a silent
drop). The camera's `center`/`zoom`/`roll` tracks themselves export normally.
