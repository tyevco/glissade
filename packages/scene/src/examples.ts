/**
 * `@glissade/scene/examples` — the runnable example corpus (§0.24 onboarding,
 * card `8jQ9rNqStGDL`). The single highest agent-onboarding cost is STALE
 * examples: prose that drifts from the runtime, which a cold agent can't
 * glance-test. The fix is to make canonical examples EXECUTABLE and surfaced from
 * the same place the doctest harness runs them, so they can't go stale.
 *
 * Each {@link ApiExample} carries a copy-pasteable `code` string (what
 * `describe({ examples: true })` surfaces) AND an executable `run` thunk against
 * the REAL API (what `examples.test.ts` asserts never throws). The two sit
 * adjacent and are kept in lockstep; the `run` guard is what fails CI the moment
 * an example's API drifts (a renamed export, a changed shape).
 *
 * Tree-shaking: this module is OFF the base scene index (its own subpath entry),
 * so a scene that never imports it pays zero bytes. Importing it REGISTERS the
 * corpus with `describe()` via {@link registerExamples} (the value-type-registry
 * pattern) — describe never imports examples, so the base embed + IIFE stay lean.
 */

import { key, timeline, track } from '@glissade/core';
import { retime } from '@glissade/core/clips'; // relocated off the base index (0.40 budget review)
import { registerExamples } from './describe.js';
import { type Node } from './node.js';
import { Circle, Group, ImageNode, Path, Rect, Text } from './nodes.js';
import { createScene, evaluate } from './scene.js';
import { Grid } from './grid.js';
import { Stack } from './layoutCtors.js';
import { splitText } from './type.js';
import { motionPath } from './motionPath.js';
import { orientToPath, lookAt } from './orient.js';
import { echo } from './echo.js';
import { motionBlur } from './motionBlur.js';
import { pathFromSvg } from './path.js';

/** One runnable example, attached to its describe-key (node type / builder method
 *  / helper name). `code` is surfaced; `run` is the executed drift guard. */
export interface ApiExample {
  /** The describe-key this attaches to: a node type ('Rect'), builder method
   *  ('to'), or helper name ('splitText'). */
  key: string;
  /** The copy-pasteable snippet `describe({ examples: true })` surfaces. */
  code: string;
  /** Executes the SAME call against the real API — the doctest harness asserts it
   *  never throws, so the surfaced `code` can't reference a drifted API. */
  run: () => void;
}

/** A throwaway scene+evaluate so a node example proves it renders end-to-end, not
 *  just constructs (the estimating measurer suffices — no backend needed). */
function renders(...children: Node[]): void {
  evaluate(createScene({ size: { w: 320, h: 200 }, children }), timeline(() => {}), 0);
}

export const EXAMPLES: readonly ApiExample[] = [
  // ---- nodes ----
  {
    key: 'Rect',
    code: "import { Rect } from '@glissade/scene';\nnew Rect({ position: [160, 100], width: 200, height: 100, fill: '#3b82f6', cornerRadius: 12 });",
    run: () => renders(new Rect({ position: [160, 100], width: 200, height: 100, fill: '#3b82f6', cornerRadius: 12 })),
  },
  {
    key: 'Circle',
    code: "import { Circle } from '@glissade/scene';\nnew Circle({ position: [160, 100], radius: 48, fill: '#ef4444' });",
    run: () => renders(new Circle({ position: [160, 100], radius: 48, fill: '#ef4444' })),
  },
  {
    key: 'Text',
    code: "import { Text } from '@glissade/scene';\n// position anchors at the baseline-left by default; set `anchor` to share a corner with a shape\nnew Text({ position: [40, 60], text: 'Hello', fontSize: 32, fill: '#111827' });",
    run: () => renders(new Text({ position: [40, 60], text: 'Hello', fontSize: 32, fill: '#111827' })),
  },
  {
    key: 'Path',
    code: "import { Path } from '@glissade/scene';\nimport { pathFromSvg } from '@glissade/scene/path';\n// Path.data wants a PathValue — parse an SVG `d` string with pathFromSvg (NOT a raw string)\nnew Path({ data: pathFromSvg('M0 0 L100 0 L50 80 Z'), fill: '#10b981' });",
    run: () => renders(new Path({ data: pathFromSvg('M0 0 L100 0 L50 80 Z'), fill: '#10b981' })),
  },
  {
    key: 'Group',
    code: "import { Group, Rect, Text } from '@glissade/scene';\n// a Group nests its children as one unit (and renders as a wrapper <div> on the DOM tier)\nnew Group({ id: 'card', children: [\n  new Rect({ anchor: 'top-left', position: [0, 0], width: 240, height: 96, fill: '#0f172a', cornerRadius: 16 }),\n  new Text({ anchor: 'top-left', position: [16, 16], text: 'Title', fontSize: 24, fill: '#f8fafc' }),\n] });",
    run: () =>
      renders(
        new Group({
          id: 'card',
          children: [
            new Rect({ anchor: 'top-left', position: [0, 0], width: 240, height: 96, fill: '#0f172a', cornerRadius: 16 }),
            new Text({ anchor: 'top-left', position: [16, 16], text: 'Title', fontSize: 24, fill: '#f8fafc' }),
          ],
        }),
      ),
  },
  {
    key: 'Image',
    code: "import { Image } from '@glissade/scene';\n// `assetId` names a media entry declared on the Timeline: timeline({ assets: { hero: { kind: 'image', url } } })\nnew Image({ assetId: 'hero', position: [160, 100], width: 200, height: 120 });",
    run: () => renders(new ImageNode({ assetId: 'hero', position: [160, 100], width: 200, height: 120 })),
  },

  // ---- timeline builder ----
  {
    key: 'to',
    code: "import { timeline } from '@glissade/core';\n// `from` anchors the start; the per-target cursor advances by `duration`\ntimeline((tl) => tl.to('card/position', [200, 100], { duration: 1, from: [0, 0] }));",
    run: () => void timeline((tl) => tl.to('card/position', [200, 100], { duration: 1, from: [0, 0] })),
  },
  {
    key: 'fromTo',
    code: "import { timeline } from '@glissade/core';\ntimeline((tl) => tl.fromTo('card/opacity', 0, 1, { duration: 0.5 }));",
    run: () => void timeline((tl) => tl.fromTo('card/opacity', 0, 1, { duration: 0.5 })),
  },
  {
    key: 'stagger',
    code: "import { timeline } from '@glissade/core';\n// one tween per target, cascaded by `each`; `anchor` picks where the cascade ranks from\ntimeline((tl) => tl.stagger(['a/opacity', 'b/opacity', 'c/opacity'], { to: 1, from: 0, duration: 0.4 }, { each: 0.1 }));",
    run: () =>
      void timeline((tl) => tl.stagger(['a/opacity', 'b/opacity', 'c/opacity'], { to: 1, from: 0, duration: 0.4 }, { each: 0.1 })),
  },
  {
    key: 'set',
    code: "import { timeline } from '@glissade/core';\n// a hold key — the value snaps at the resolved position\ntimeline((tl) => tl.set('card/fill', '#ef4444', { at: 0.5 }));",
    run: () => void timeline((tl) => tl.set('card/fill', '#ef4444', { at: 0.5 })),
  },
  {
    key: 'tracks',
    code: "import { timeline, track, key } from '@glissade/core';\n// attach raw keyframe tracks (the value type is the 2nd arg)\ntimeline((tl) => tl.tracks([track('card/x', 'number', [key(0, 0), key(1, 100)])]));",
    run: () => void timeline((tl) => tl.tracks([track('card/x', 'number', [key(0, 0), key(1, 100)])])),
  },

  // ---- scene helpers ----
  {
    key: 'splitText',
    code: "import { splitText } from '@glissade/scene/type';\n// the source needs an `id` — parts bind tracks against `<id>/<i>`. sp.targets('opacity') gives the reveal-recipe targets\nconst sp = splitText({ id: 'title', text: 'Hello', fontSize: 40 }, { by: 'grapheme' });",
    run: () => void splitText({ id: 'title', text: 'Hello', fontSize: 40 }, { by: 'grapheme' }),
  },
  {
    key: 'measureWrappedText',
    code: "import { createScene } from '@glissade/scene';\n// size a bubble/card to wrapped text WITHOUT a Text node (the FontSpec field is `size`, not `fontSize`)\nconst scene = createScene({ size: { w: 400, h: 200 }, children: [] });\nconst { width, lines, height } = scene.measureWrappedText('a long string that wraps across the box', { family: 'sans-serif', size: 24 }, 280);",
    run: () => {
      const scene = createScene({ size: { w: 400, h: 200 }, children: [] });
      scene.measureWrappedText('a long string that wraps across the box', { family: 'sans-serif', size: 24 }, 280);
    },
  },
  {
    key: 'Grid',
    code: "import { Rect } from '@glissade/scene';\nimport { Grid } from '@glissade/scene/grid';\n// build-time fan-out into a column grid (no Yoga) — children move to cell centers.\n// fr columns (`columns: 3`) need a `width` to resolve against; `cellHeight` is the row pitch\nGrid({ columns: 3, width: 360, gap: 16, cellHeight: 80, children: [new Rect({ width: 80, height: 60 }), new Rect({ width: 80, height: 60 })] });",
    run: () =>
      void Grid({
        columns: 3,
        width: 360,
        gap: 16,
        cellHeight: 80,
        children: [new Rect({ width: 80, height: 60 }), new Rect({ width: 80, height: 60 })],
      }),
  },
  {
    key: 'Stack',
    code: "import { Rect } from '@glissade/scene';\nimport { Stack, loadYogaLayoutEngine } from '@glissade/scene/layout';\n// flexbox via Yoga — load the engine ONCE before evaluating any layout scene:\n// await loadYogaLayoutEngine();\nStack({ direction: 'row', gap: 16, children: [new Rect({ width: 80, height: 80 }), new Rect({ width: 80, height: 80 })] });",
    run: () => void Stack({ direction: 'row', gap: 16, children: [new Rect({ width: 80, height: 80 }), new Rect({ width: 80, height: 80 })] }),
  },
  {
    key: 'motionPath',
    code: "import { motionPath } from '@glissade/scene/motion';\nimport { pathFromSvg } from '@glissade/scene/path';\nconst mp = motionPath(pathFromSvg('M0 0 C50 0 50 100 100 100'));\nconst pointHalfway = mp.atProgress(0.5); // { x, y }",
    run: () => void motionPath(pathFromSvg('M0 0 C50 0 50 100 100 100')).atProgress(0.5),
  },
  {
    key: 'orientToPath',
    code: "import { Rect } from '@glissade/scene';\nimport { orientToPath } from '@glissade/scene/motion';\nimport { pathFromSvg } from '@glissade/scene/path';\n// rotation-only sibling of followPath: banks the target to the path tangent while its\n// POSITION comes from elsewhere. Drive '<id>/progress' with a track; `offset` if it rests facing up.\nconst sprite = new Rect({ id: 'sprite', width: 12, height: 12 });\norientToPath(sprite, pathFromSvg('M0 0 L100 0 L100 100'), { id: 'bank', progress: 0.5 });",
    run: () => {
      const sprite = new Rect({ id: 'sprite', width: 12, height: 12 });
      orientToPath(sprite, pathFromSvg('M0 0 L100 0 L100 100'), { id: 'bank', progress: 0.5 });
    },
  },
  {
    key: 'lookAt',
    code: "import { Rect, Circle } from '@glissade/scene';\nimport { lookAt } from '@glissade/scene/motion';\n// aim the target's local +x axis at another node's world origin (a turret tracking a mover)\nconst turret = new Rect({ id: 'turret', width: 12, height: 12, position: [0, 0] });\nconst mover = new Circle({ id: 'mover', radius: 6, position: [40, 20] });\nlookAt(turret, mover);",
    run: () => {
      const turret = new Rect({ id: 'turret', width: 12, height: 12, position: [0, 0] });
      const mover = new Circle({ id: 'mover', radius: 6, position: [40, 20] });
      lookAt(turret, mover);
    },
  },
  {
    key: 'retime',
    code: "import { retime } from '@glissade/core/clips';\nimport { track, key } from '@glissade/core';\n// pure key-time transform → ordinary retimed tracks (speed / shift / reverse / pingpong)\nconst move = [track('box/position.x', 'number', [key(0, 0), key(1, 100, 'easeInCubic')])];\nconst slow = retime(move, { speed: 0.5 });    // half speed\nconst back = retime(move, { reverse: true }); // play it backward",
    run: () => {
      const move = [track('box/position.x', 'number', [key(0, 0), key(1, 100, 'easeInCubic')])];
      void retime(move, { speed: 0.5 });
      void retime(move, { reverse: true });
    },
  },
  {
    key: 'echo',
    code: "import { Circle, echo } from '@glissade/scene';\n// motion trail / onion-skin: renders the child at K past playhead offsets, each fading by `decay`.\n// Add the returned Echo to the scene; drive the child however you like (its ghosts re-derive at each offset).\nconst dot = new Circle({ id: 'dot', radius: 8, fill: '#39e0ff' });\nconst trail = echo(dot, { count: 6, spacing: 0.05, decay: 0.7 });",
    run: () => void echo(new Circle({ id: 'dot', radius: 8, fill: '#39e0ff' }), { count: 6, spacing: 0.05, decay: 0.7 }),
  },
  {
    key: 'motionBlur',
    code: "import { Circle, motionBlur } from '@glissade/scene';\n// real sampled motion blur: renders the child at N sub-frame times across `shutter` (seconds) and averages them.\n// Wrap the MOVING content; its background stays crisp. Byte-exact on Skia, perceptual browser↔Skia.\nconst dot = new Circle({ id: 'dot', radius: 16, fill: '#ffcf3f' });\nconst blurred = motionBlur(dot, { shutter: 0.06, samples: 16 });",
    run: () => void motionBlur(new Circle({ id: 'dot', radius: 16, fill: '#ffcf3f' }), { shutter: 0.06, samples: 16 }),
  },
];

/**
 * Rewrite an npm `import`-form snippet to the no-build IIFE form: every export is
 * `window.glissade.<name>`, so `import { Rect, timeline } from '@glissade/scene'`
 * becomes `const { Rect, timeline } = window.glissade`. The body is unchanged, so
 * the snippet runs verbatim in a no-build `<script src>` page (§0.24 follow-up,
 * card 7eC7Pb4wTbHj). Derived from the single npm-form source — no duplicate to
 * maintain.
 */
export function toIifeForm(code: string): string {
  return code.replace(/import\s+\{([^}]*)\}\s+from\s+'[^']*';?/g, (_m, names) => `const {${names}} = window.glissade;`);
}

/** Group the corpus by describe-key → the surfaced code snippets. `iife: true`
 *  rewrites each snippet to the no-build `window.glissade` form. */
export function examplesByKey(opts: { iife?: boolean } = {}): { readonly [key: string]: readonly string[] } {
  const byKey: { [key: string]: string[] } = {};
  for (const ex of EXAMPLES) (byKey[ex.key] ??= []).push(opts.iife ? toIifeForm(ex.code) : ex.code);
  return byKey;
}

// Side-effect on import: register the corpus so describe({ examples: true }) can
// attach it. NOT a static import in describe — keeps the base index + IIFE lean.
registerExamples(examplesByKey());
