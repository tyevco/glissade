/**
 * Golden corpus: 0.56 kinetic type presets — the one-call sugar layer over the
 * shipped primitives (typewriter / splitText / tl.stagger / Text.reveal).
 *
 * Rows, top to bottom:
 *  - revealWords: a title split BY WORD fades in, cascaded (real opacity tracks —
 *    the golden-splittext recipe, hidden behind one call).
 *  - revealLines: a two-line block split BY LINE, each line fading in.
 *  - typeOn DEFAULT: a Text typed via the STRING hold-key track on `<id>/text`
 *    (the Lottie-faithful default — round-trips as stepped text docs).
 *  - typeOn { cursor: true }: typed with a render-only caret sibling riding the head.
 *  - typeOn { mask: true }: revealed via the render-only `<id>/reveal` grapheme mask.
 *
 * Every preset compiles to ordinary nodes + tracks (or, for cursor/mask, a
 * closed-form custom draw), so the frames are a pure function of time and
 * byte-stable on Skia by construction. Byte-compared on Skia in CI.
 */

import { timeline } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule, type TextMeasurer } from '@glissade/scene';
import { revealWords, revealLines, typeOn } from '@glissade/scene/type';

const FAMILY = 'DejaVu Sans';
const W = 640;
const H = 360;

// Like golden-splittext: the presets that call splitText() snapshot part geometry
// at BUILD time — BEFORE the harness injects the scene measurer — so the harness
// threads its real Skia backend in here. typeOn needs no measurer (grapheme count
// is segmentation, not metrics).
let kineticMeasurer: TextMeasurer | undefined;
export function setKineticMeasurer(m: TextMeasurer | undefined): void {
  kineticMeasurer = m;
}
const mOpt = (): { measurer: TextMeasurer } | undefined =>
  kineticMeasurer !== undefined ? { measurer: kineticMeasurer } : undefined;

// Build EVERY preset fresh — once for createScene() (the nodes), once for the
// timeline (the tracks) — the splitText/each convention (both reconstruct the
// identical stable id set, so the timeline binds against the same ids).
//
// NOTE (mirrors golden-splittext): the timeline is built at MODULE LOAD, before
// the harness calls setKineticMeasurer(), so the reveal presets here animate only
// measurer-INDEPENDENT props — OPACITY ('fade'), whose track VALUES (0→1) and ids
// don't depend on measured geometry. (from:'below'/'above' bakes measured resting
// positions into the tracks, which would diverge from the real-measurer createScene
// nodes; that path is covered by the scene unit test with a fixed measurer on both
// sides.) The createScene nodes still snapshot with the REAL measurer for exact
// glyph positions.
const buildWords = (): ReturnType<typeof revealWords> =>
  revealWords(
    new Text({
      id: 'w',
      text: 'kinetic type',
      fill: '#9ef0c0',
      fontFamily: FAMILY,
      fontSize: 38,
      align: 'center',
      position: [W / 2, 66],
    }),
    { from: 'fade', each: 0.14, duration: 0.4, at: 0.1, ...mOpt() },
  );

const buildLines = (): ReturnType<typeof revealLines> =>
  revealLines(
    new Text({
      id: 'l',
      text: 'reveal\nby line',
      fill: '#7fd0ff',
      fontFamily: FAMILY,
      fontSize: 24,
      align: 'center',
      position: [W / 2, 128],
    }),
    { from: 'fade', each: 0.22, duration: 0.4, at: 0.5, ...mOpt() },
  );

const buildTyped = (): ReturnType<typeof typeOn> =>
  typeOn(
    new Text({
      id: 'typed',
      text: 'string track',
      fill: '#e8edf2',
      fontFamily: FAMILY,
      fontSize: 22,
      align: 'center',
      position: [W / 2, 214],
    }),
    { perChar: 0.07, start: 0.2 },
  );

const buildCursor = (): ReturnType<typeof typeOn> =>
  typeOn(
    new Text({
      id: 'cur',
      text: 'with caret',
      fill: '#ffd59e',
      fontFamily: FAMILY,
      fontSize: 22,
      align: 'center',
      position: [W / 2, 258],
    }),
    { cursor: true, perChar: 0.07, start: 0.7, blinkPeriod: 0.8, cursorWidth: 2 },
  );

const buildMasked = (): ReturnType<typeof typeOn> =>
  typeOn(
    new Text({
      id: 'msk',
      text: 'masked reveal',
      fill: '#c9b8ff',
      fontFamily: FAMILY,
      fontSize: 22,
      align: 'center',
      position: [W / 2, 306],
    }),
    { mask: true, perChar: 0.07, start: 1.1 },
  );

const mod: SceneModule = {
  createScene: () => {
    const cur = buildCursor();
    return createScene({
      size: { w: W, h: H },
      children: [
        new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: '#10131a' }),
        buildWords().node, // the split Group — REPLACES the source (draw .node, not .source)
        buildLines().node,
        buildTyped().node,
        cur.node,
        cur.cursor!, // render-only caret sibling (shares the Text's parent)
        buildMasked().node,
      ],
    });
  },
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [
      ...buildWords().tracks,
      ...buildLines().tracks,
      buildTyped().track,
      buildCursor().track,
      buildMasked().track,
    ],
  }),
};

export default mod;
