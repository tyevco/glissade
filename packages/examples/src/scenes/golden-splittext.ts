/**
 * Golden corpus: 0.19 kinetic typography — `splitText()` sub-targets + the
 * `revealFraction` count alias.
 *
 * TOP: a title is split BY WORD into addressable `${id}/${i}` child Texts
 * (`splitText(..., { by: 'word' })`), then each word pops in — opacity 0→1
 * cascaded with `tl.stagger` over the part ids. The split is a pure build-time
 * expansion to ordinary nodes + tracks, so the staggered word-by-word reveal is
 * byte-stable by construction.
 *
 * BOTTOM: a line types in via `revealFraction` animated 0→1 — pure
 * count-rounding sugar over `reveal` (`round(fraction * graphemeCount)`), the
 * typewriter idiom expressed as a fraction. A second short word demonstrates
 * `splitText({ by: 'grapheme' })`: its grapheme parts scatter-fade in,
 * staggered over the `${id}/${i}` ids.
 *
 * Pure data, byte-compared on Skia in CI.
 */

import { timeline } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule, type TextMeasurer } from '@glissade/scene';
import { splitText } from '@glissade/scene/type';

const FAMILY = 'DejaVu Sans';
const W = 640;
const H = 360;

// splitText snapshots part geometry at BUILD time — BEFORE the harness injects
// the scene measurer via setTextMeasurer — so the parts must measure with the
// REAL Skia backend or they fall back to the rough per-character estimate
// (o_aLYFFPjFDf: the drift two consumers saw). The harness threads its backend
// in here via setSplitMeasurer(); when unset (this module's `timeline` is built
// at import, before the harness sets it, and an IR-level test never sets it) the
// chain falls to the estimate — which under measurer-fail-loud THROWS unless we
// opt in. This is the estimate-DEMO scene, so { estimate: true } is deliberate:
// the golden PNG still renders through createScene() with the REAL measurer the
// harness injects, so its bytes are unchanged; the estimate only feeds the
// measurer-independent timeline ids.
let splitMeasurer: TextMeasurer | undefined;
export function setSplitMeasurer(m: TextMeasurer | undefined): void {
  splitMeasurer = m;
}

const measurerOpt = (): { measurer: TextMeasurer } | { estimate: true } =>
  splitMeasurer !== undefined ? { measurer: splitMeasurer } : { estimate: true };

// Build-time pure expansion; call fresh per createScene() AND for the timeline
// (the each()/splitText convention — both reconstruct the identical id set).
// The part COUNT/ids are measurer-independent (segmentation, not metrics), so
// the timeline's id binding is stable whether or not a measurer is set.
const buildTitle = (): ReturnType<typeof splitText> =>
  splitText(
    new Text({
      id: 'title',
      text: 'split the text',
      fill: '#9ef0c0',
      fontFamily: FAMILY,
      fontSize: 40,
      align: 'center',
      position: [W / 2, 110],
    }),
    { by: 'word', ...measurerOpt() },
  );

const buildTag = (): ReturnType<typeof splitText> =>
  splitText(
    new Text({
      id: 'tag',
      text: 'kinetic',
      fill: '#7fd0ff',
      fontFamily: FAMILY,
      fontSize: 30,
      align: 'center',
      position: [W / 2, 300],
    }),
    { by: 'grapheme', ...measurerOpt() },
  );

const mod: SceneModule = {
  createScene: () => {
    const body = new Text({
      id: 'body',
      text: 'revealed by fraction',
      fill: '#e8edf2',
      fontFamily: FAMILY,
      fontSize: 24,
      align: 'center',
      position: [W / 2, 220],
      // 0.19: revealFraction (count alias) drives the typewriter; 0 = hidden at t0
      revealFraction: 0,
    });
    return createScene({
      size: { w: W, h: H },
      children: [
        new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: '#10131a' }),
        buildTitle().node, // REPLACES the source title (don't also add it)
        body,
        buildTag().node,
      ],
    });
  },
  timeline: timeline((tl) => {
    // word-staggered pop-in: each split word fades + rises into place
    const title = buildTitle();
    tl.stagger(
      title.children.map((c) => `${c.id!}/opacity`),
      { from: 0, to: 1, duration: 0.4, ease: 'easeOutCubic' },
      { each: 0.18, at: 0.1 },
    );

    // revealFraction typewriter: 0 → 1 reveals the whole body grapheme-by-grapheme
    tl.to('body/revealFraction', 1, { from: 0, duration: 1.2, ease: 'linear', at: 0.6 });

    // grapheme scatter: each grapheme part fades in, cascaded
    const tag = buildTag();
    tl.stagger(
      tag.children.map((c) => `${c.id!}/opacity`),
      { from: 0, to: 1, duration: 0.3, ease: 'easeOutCubic' },
      { each: 0.08, at: 1.4 },
    );
  }),
};

export default mod;
